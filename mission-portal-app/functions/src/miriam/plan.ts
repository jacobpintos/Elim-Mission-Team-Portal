/**
 * Miriam's commands, who may use each, and turning what Claude made of a
 * request into something the app can open.
 *
 * Kept free of Firebase and the Anthropic SDK so it can be tested on its own
 * (src/lib/miriamPlan.test.ts in the app).
 *
 * Every command names the roles that may use it, and there is no way to add
 * one without saying so. A command someone may not use is never offered to
 * Claude for them, and whatever Claude answers is checked against the same
 * table again before anything is done with it. Neither check is the last
 * word: a command only ever opens a form, and saving the form goes through
 * the Firestore rules like any other save; and what a question can look up
 * is filtered by what the person may see (./data.ts).
 */

/** A command Miriam can carry out. Mirrored in the app (src/lib/miriam.ts). */
export type CommandName =
  | 'open_event_form'
  | 'edit_event'
  | 'open_task_form'
  | 'people_and_groups'
  | 'find_events'
  | 'get_event'
  | 'event_availability'
  | 'event_weather'
  | 'find_tasks'
  | 'answer'

/** Every role but a public follower's: members, and guests. */
const ANYONE_SIGNED_IN = ['admin', 'security', 'regular', 'intern', 'worship', 'guest']

/** A tool definition, in the shape the Messages API takes. */
export interface ToolDefinition {
  name: CommandName
  description: string
  /** Schema-checked by the API; the event forms are not (too large), and are checked here. */
  strict: boolean
  input_schema: Record<string, unknown>
}

const stringList = { type: 'array', items: { type: 'string' } }
const keyOnly = (description: string) => ({
  type: 'object',
  properties: { key: { type: 'string', description } },
  required: ['key'],
  additionalProperties: false,
})
const queryOnly = (description: string) => ({
  type: 'object',
  properties: { query: { type: 'string', description } },
  required: ['query'],
  additionalProperties: false,
})

const str = (description?: string) => ({ type: 'string', ...(description ? { description } : {}) })
const idsOf = (description: string) => ({ type: 'array', items: { type: 'string' }, description })
const listOf = (properties: Record<string, unknown>, description: string) => ({
  type: 'array',
  description,
  items: { type: 'object', properties, additionalProperties: false },
})
const leg = (which: string) => ({
  type: 'object',
  description: `The ${which} flight.`,
  properties: {
    date: str('YYYY-MM-DD'),
    time: str('Departure, like "7:15 AM"'),
    airport: str(),
    airline: str(),
    flight: str('The flight number'),
    confirmation: str(),
    arrival: str('Arrival time'),
  },
  additionalProperties: false,
})

/** Every field of the event form (src/features/events/EventFormModal.tsx); an edit's, as changes. */
function EVENT_FIELDS(edit = false) {
  return {
    type: 'object',
    properties: {
      ...(edit ? { event_key: str('The event’s key, from find_events.') } : {}),
      title: str('The event name, in title case.'),
      date: str(
        'YYYY-MM-DD. A date said without a year is the next one on or after today.' +
          (edit ? ' For a repeating event, moves the series start.' : '')
      ),
      start_time: str('Like "9:00 PM" or "10:30 AM".'),
      venue: str('The venue or building name.'),
      address: str('The street address.'),
      city: str(),
      state: str('Two-letter US state abbreviation, e.g. "IA" for Iowa.'),
      repeat: {
        type: 'string',
        enum: ['none', 'weekly', 'biweekly', 'monthly'],
        description: 'Whether it repeats ("every Sunday" is weekly).',
      },
      repeat_weekday: {
        type: 'integer',
        description: 'The day it repeats on: 0 Sunday … 6 Saturday.',
      },
      public: { type: 'boolean', description: 'Shown to the public, not only the team.' },
      virtual: { type: 'boolean', description: 'Held online.' },
      virtual_link: str('The meeting link, for a virtual event.'),
      food_items: idsOf('The food sign-up sheet’s items, e.g. "Chips", "Paper plates".'),
      cars: listOf(
        {
          label: str('Its name, e.g. "Jacob’s van"'),
          seats: { type: 'integer' },
          driver_id: str(),
          rider_ids: idsOf('Who rides in it.'),
        },
        'Carpool cars.'
      ),
      lodging: listOf(
        {
          name: str('The hotel or house'),
          address: str(),
          room: str(),
          confirmation: str(),
          people_ids: idsOf('Who stays there.'),
        },
        'Where people stay.'
      ),
      flights: listOf(
        { person_id: str(), outbound: leg('outbound'), return: leg('return') },
        'One entry per person flying.'
      ),
      teams: listOf(
        { name: str(), leader_ids: idsOf('Team leads.'), member_ids: idsOf('Members.') },
        'The event’s teams.'
      ),
      common_teams: idsOf('Names of common teams (from people_and_groups) to add as they are.'),
      dress_code: listOf(
        {
          for: str(
            'A team’s name, "Unassigned", or "everyone" — everyone not covered by another entry.'
          ),
          text: str('What to wear.'),
        },
        'Dress code, by team.'
      ),
      extra_days: listOf(
        { date: str('YYYY-MM-DD'), start_time: str(), venue: str() },
        'More days of a multi-day event.'
      ),
      task_template_id: str('A task template to start the event’s tasks from.'),
      ...(edit
        ? {
            add_groups: idsOf('Groups to assign.'),
            remove_groups: idsOf('Groups to take off.'),
            add_people: idsOf('People to assign.'),
            remove_people: idsOf('People to take off.'),
          }
        : {
            groups: idsOf('Groups to assign.'),
            people: idsOf('People to assign one by one.'),
            except_people: idsOf(
              'People to leave out of the groups: "everyone in All except Jacob".'
            ),
          }),
      unmatched_names: idsOf(
        'Names of people, groups, teams or templates that were said but match nothing, or more than one, as said.'
      ),
    },
    required: edit ? ['event_key'] : [],
    additionalProperties: false,
  }
}

export const COMMANDS: Record<CommandName, { roles: string[]; tool: ToolDefinition }> = {
  open_event_form: {
    // Only admins create events (firestore.rules: events, write: isAdmin()).
    roles: ['admin'],
    tool: {
      name: 'open_event_form',
      description:
        'Open the form for a new event, filled in with what was asked for, for the person to check and save. ' +
        'Use it for any request to create, add, set up or schedule an event. ' +
        'Fill in only what the request says — never guess a venue, address, time, link or person — and leave out the rest. ' +
        'Ids of people, groups and task templates come from people_and_groups.',
      strict: false,
      input_schema: EVENT_FIELDS(),
    },
  },
  edit_event: {
    roles: ['admin'],
    tool: {
      name: 'edit_event',
      description:
        'Open an existing event’s form with the changes asked for made, for the person to check and save. ' +
        'Give only what changes. People and groups are added or taken off with add_/remove_; ' +
        'a list (food items, cars, lodging, flights, teams, dress code, extra days) is given whole, as it should be — read it first with get_event.',
      strict: false,
      input_schema: EVENT_FIELDS(true),
    },
  },

  open_task_form: {
    // The Assignments screen's Assign Task form is admins' (app/(app)/assignments.tsx).
    roles: ['admin'],
    tool: {
      name: 'open_task_form',
      description:
        'Open the form to assign a new task, filled in, for the person to check and save. ' +
        'Assigned to people one by one, or to a whole group. Ids from people_and_groups.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          due_date: { type: 'string', description: 'YYYY-MM-DD; "" if not said.' },
          people: { type: 'array', items: { type: 'string' }, description: 'People to assign.' },
          group: { type: 'string', description: 'A group to assign instead; "" if none.' },
          lead: { type: 'string', description: 'Who leads it, of those assigned; "" if not said.' },
          unmatched_names: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'due_date', 'people', 'group', 'lead', 'unmatched_names'],
        additionalProperties: false,
      },
    },
  },
  people_and_groups: {
    // Who a new event's form can name: asked for only when one is being made,
    // so the lists are not sent with every question.
    roles: ['admin'],
    tool: {
      name: 'people_and_groups',
      description:
        'The people, groups, common teams and task templates, with their ids. ' +
        'Call it before open_event_form, or any admin change, that names any of them.',
      strict: true,
      input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },

  // Questions: read only, and only what the person may see (./data.ts).
  find_events: {
    roles: ANYONE_SIGNED_IN,
    tool: {
      name: 'find_events',
      description:
        'Find events this person can see by name, city or venue, or on a date: returns each match’s key, title, date, time and city, nearest upcoming first, ' +
        'and everything get_event gives for the first of them as `details`. ' +
        'Use it first for any question about an event. With neither, it lists the next few events.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Words from the event’s name, city or venue, as said: "revival heartland", "Dallas". "" for any.',
          },
          date: {
            type: 'string',
            description:
              'YYYY-MM-DD, for "this Sunday", "tomorrow", "on the 25th"; "" for any date.',
          },
        },
        required: ['query', 'date'],
        additionalProperties: false,
      },
    },
  },
  get_event: {
    roles: ANYONE_SIGNED_IN,
    tool: {
      name: 'get_event',
      description:
        'For an event other than the one find_events gave `details` for: everything about one event this person is shown: date, time, report times, venue and address, the meeting and sign-up links, dress code, ' +
        'their food sign-up and the sheet, their car (every car for an admin), their flight and lodging (everyone’s for an admin), their own availability, and its tasks with status, due date and who has them (theirs, or all of them for an admin).',
      strict: true,
      input_schema: keyOnly('The event’s key, from find_events.'),
    },
  },
  event_availability: {
    roles: ANYONE_SIGNED_IN,
    tool: {
      name: 'event_availability',
      description:
        'Who on an event is not plainly available: not available, partly available, not sure yet (TBD), and not answered — with their notes. ' +
        'Only admins are shown other people’s; anyone else gets their own.',
      strict: true,
      input_schema: keyOnly('The event’s key, from find_events.'),
    },
  },
  event_weather: {
    roles: ANYONE_SIGNED_IN,
    tool: {
      name: 'event_weather',
      description:
        'The forecast for an event’s day where it is held, as its page shows it: summary, high and low (°F), chance of rain and wind. ' +
        'Forecasts reach about 15 days ahead.',
      strict: true,
      input_schema: keyOnly('The event’s key, from find_events.'),
    },
  },
  find_tasks: {
    roles: ANYONE_SIGNED_IN,
    tool: {
      name: 'find_tasks',
      description:
        'Find tasks this person can see by name, with status, due date, who it is assigned to and the event it is for. ' +
        'An empty query lists their open tasks.',
      strict: true,
      input_schema: queryOnly('Words from the task’s name, as said.'),
    },
  },
  answer: {
    roles: ANYONE_SIGNED_IN,
    tool: {
      name: 'answer',
      description:
        'Give the answer — always the last step of a question. `spoken` is read aloud and shown; `open` is where the app takes them to see it.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          spoken: {
            type: 'string',
            description:
              'The answer in one to three short sentences, to be heard: plain words, no lists or symbols, dates said in full ("Friday, September 25th").',
          },
          open: {
            type: 'string',
            enum: ['event', 'task', 'availability', 'screen', 'video', 'reorder', 'none'],
            description:
              'event: the event’s page; task: the task; availability: the admin availability page; ' +
              'screen: one of the screens they can open, from the list they are sent; video: a video from Content, to play; reorder: a reorder list item’s link, to buy it; none: nothing to show.',
          },
          target: {
            type: 'string',
            description:
              'The event’s key, the task’s id, the screen’s id, the Content item’s id (from find_content), or the reorder item’s id (from read_operations); "" when open is availability or none.',
          },
          section: {
            type: 'string',
            enum: ['dress_code', 'availability', 'weather', 'details', 'none'],
            description: 'On an event’s page, the part the answer is about.',
          },
          choices: {
            ...stringList,
            description:
              'When you are not sure which event they meant: up to three event keys from find_events’ closest, offered as buttons. Otherwise [].',
          },
          heard_name: {
            type: 'string',
            description:
              'The words they used for the event, as heard ("revival in the hard land"); "" if they named none.',
          },
        },
        required: ['spoken', 'open', 'target', 'section', 'choices', 'heard_name'],
        additionalProperties: false,
      },
    },
  },
}

/**
 * Lookups run in the app, as the person signed in — so the database's own
 * rules decide what they return, as they do for the screens — and offered
 * only where the app says this person has the screen they come from
 * (src/features/miriam/appTools.ts). Read only.
 */
export type AppToolName =
  | 'find_content'
  | 'read_announcements'
  | 'read_messages'
  | 'read_operations'
  | 'read_settings'
  | ActionName

/**
 * Changes, made in the app as the person signed in, through the same code
 * as its screens — and never straight away: calling one ends the request,
 * and the app shows exactly what will be done, to be confirmed or not.
 */
export type ActionName =
  | 'send_message'
  | 'post_announcement'
  | 'set_task_status'
  | 'set_availability'
  | 'sign_up_food'
  | 'change_notification'
  // Admins'
  | 'create_user'
  | 'update_user'
  | 'reset_user_password'
  | 'delete_user'
  | 'create_group'
  | 'update_group'
  | 'delete_group'
  | 'create_team'
  | 'update_team'
  | 'delete_team'
  | 'delete_task_template'

export const ACTIONS: readonly ActionName[] = [
  'create_user',
  'update_user',
  'reset_user_password',
  'delete_user',
  'create_group',
  'update_group',
  'delete_group',
  'create_team',
  'update_team',
  'delete_team',
  'delete_task_template',
  'send_message',
  'post_announcement',
  'set_task_status',
  'set_availability',
  'sign_up_food',
  'change_notification',
]

/** Settings' notification switches (src/lib/notificationKeys.ts). */
const NOTIFICATIONS = [
  'newAssignment',
  'newMessage',
  'eventReminder',
  'announcement',
  'issueAssigned',
  'eventJoin',
  'eventRemoved',
  'worshipSetAssigned',
  'taskDueSoon',
  'rsvpNonAvailable',
  'kaizenSubmission',
  'issueSubmission',
  'eventHealthBehind',
  'chatFlagged',
  'securityReport',
  'weatherAlertAdmin',
  'textingListSignup',
  'eventLogistics',
  'flightReminder',
  'foodSignupOpen',
  'foodSignupReminder',
  'livestream',
  'publicAnnouncement',
  'publicEvent',
  'contentFeatured',
  'weeklyDigest',
  'monthlyDigest',
  'securityReportUrgent',
]
const ACTS = ' Only when they plainly tell you to; they will be shown it to confirm first.'
const ADMINS = ' Admins only. Ids from people_and_groups.' + ACTS
const ROLES = ['admin', 'security', 'worship', 'regular', 'intern', 'guest', 'public']
const ids = (description: string) => ({ type: 'array', items: { type: 'string' }, description })
const objectOf = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

export const APP_TOOLS: Record<AppToolName, Omit<ToolDefinition, 'name'> & { name: AppToolName }> =
  {
    find_content: {
      name: 'find_content',
      description:
        'Videos in Content — music, sermons and podcasts — by title, album, preacher, host or kind ("sermon"): each with its id, kind, title and who and when. ' +
        'An empty query lists the newest. To play one, answer with open "video" and its id.',
      strict: true,
      input_schema: queryOnly('Words from the title, album, preacher or host, or the kind.'),
    },
    read_announcements: {
      name: 'read_announcements',
      description:
        'The announcements this person is shown, newest first, with what they say, who posted them and when. An empty query lists the latest.',
      strict: true,
      input_schema: queryOnly('Words to look for in the title or text; "" for the latest.'),
    },
    read_messages: {
      name: 'read_messages',
      description:
        'Their messages. With a conversation — a person’s name or a group chat’s — its latest messages, who sent each and when; with "", their conversations, unread first, each with its latest message.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          conversation: {
            type: 'string',
            description: 'A person’s name or a group chat’s name, as said; "" for all of them.',
          },
        },
        required: ['conversation'],
        additionalProperties: false,
      },
    },
    read_operations: {
      name: 'read_operations',
      description:
        'The Operations tab: issues reported (with status, root cause and actions), kaizen ideas (with status and votes), and — for admins — planning boards and inventory, with the reorder list of things to buy (each with its id and whether it has a link to buy it). ' +
        'Names there are as typed ("AAA batteries"), not as said ("triple A batteries"): look with a short query, or "" for the whole list.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          area: { type: 'string', enum: ['issues', 'kaizen', 'planning', 'inventory'] },
          query: { type: 'string', description: 'Words to look for; "" for all of them.' },
        },
        required: ['area', 'query'],
        additionalProperties: false,
      },
    },
    send_message: {
      name: 'send_message',
      description: 'Send a message in one of their conversations.' + ACTS,
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          conversation: {
            type: 'string',
            description: 'The person’s name or the group chat’s name, as said.',
          },
          text: {
            type: 'string',
            description: 'The message, in their words, as they would type it.',
          },
        },
        required: ['conversation', 'text'],
        additionalProperties: false,
      },
    },
    post_announcement: {
      name: 'post_announcement',
      description:
        'Post an announcement to every member (admins only). To choose who sees it, or add a photo, they use the Announcements screen.' +
        ACTS,
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string', description: 'What it says, in their words.' },
          last_day: {
            type: 'string',
            description: 'YYYY-MM-DD: the last day it is shown, if they said; "" to keep it.',
          },
        },
        required: ['title', 'body', 'last_day'],
        additionalProperties: false,
      },
    },
    set_task_status: {
      name: 'set_task_status',
      description: 'Mark one of their tasks not started, in progress or done.' + ACTS,
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'The task’s id, from find_tasks.' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'done'] },
        },
        required: ['task_id', 'status'],
        additionalProperties: false,
      },
    },
    set_availability: {
      name: 'set_availability',
      description: 'Answer whether they are available for an event, on that date.' + ACTS,
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          event_key: { type: 'string', description: 'The event’s key, from find_events.' },
          status: {
            type: 'string',
            enum: ['yes', 'no', 'partial', 'tbd'],
            description: 'yes: available; no: not; partial: part of it; tbd: not sure yet.',
          },
          note: { type: 'string', description: 'What they said about it, if anything; "".' },
        },
        required: ['event_key', 'status', 'note'],
        additionalProperties: false,
      },
    },
    sign_up_food: {
      name: 'sign_up_food',
      description:
        'Sign them up to bring one of the items on an event’s food sign-up sheet.' + ACTS,
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          event_key: { type: 'string', description: 'The event’s key, from find_events.' },
          item: { type: 'string', description: 'The item, as get_event lists it.' },
        },
        required: ['event_key', 'item'],
        additionalProperties: false,
      },
    },
    change_notification: {
      name: 'change_notification',
      description: 'Turn one of their notifications on or off, by push, email or both.' + ACTS,
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          notification: { type: 'string', enum: NOTIFICATIONS },
          channel: {
            type: 'string',
            enum: ['push', 'email', 'both'],
            description: 'For a digest, "email".',
          },
          on: { type: 'boolean' },
        },
        required: ['notification', 'channel', 'on'],
        additionalProperties: false,
      },
    },
    create_user: {
      name: 'create_user',
      description:
        'Open the form for a new account, filled in, for them to set its first password and save (admins only).',
      strict: true,
      input_schema: objectOf({
        name: { type: 'string' },
        email: { type: 'string', description: '"" if not said.' },
        roles: { type: 'array', items: { type: 'string', enum: ROLES } },
      }),
    },
    update_user: {
      name: 'update_user',
      description: 'Change a person’s name, email or roles.' + ADMINS,
      strict: true,
      input_schema: objectOf({
        person_id: { type: 'string' },
        name: { type: 'string', description: 'The new name; "" to keep it.' },
        email: { type: 'string', description: 'The new email; "" to keep it.' },
        add_roles: { type: 'array', items: { type: 'string', enum: ROLES } },
        remove_roles: { type: 'array', items: { type: 'string', enum: ROLES } },
      }),
    },
    reset_user_password: {
      name: 'reset_user_password',
      description: 'Reset a person’s password to the temporary one.' + ADMINS,
      strict: true,
      input_schema: objectOf({ person_id: { type: 'string' } }),
    },
    delete_user: {
      name: 'delete_user',
      description:
        'Delete a person’s account; for an admin, ask the other admins to approve it.' + ADMINS,
      strict: true,
      input_schema: objectOf({ person_id: { type: 'string' } }),
    },
    create_group: {
      name: 'create_group',
      description: 'Make a group of people.' + ADMINS,
      strict: true,
      input_schema: objectOf({ name: { type: 'string' }, people_ids: ids('Who is in it.') }),
    },
    update_group: {
      name: 'update_group',
      description: 'Rename a group, or add or take people out of it.' + ADMINS,
      strict: true,
      input_schema: objectOf({
        group_id: { type: 'string' },
        new_name: { type: 'string', description: '"" to keep it.' },
        add_people_ids: ids('People to add.'),
        remove_people_ids: ids('People to take out.'),
      }),
    },
    delete_group: {
      name: 'delete_group',
      description: 'Delete a group.' + ADMINS,
      strict: true,
      input_schema: objectOf({ group_id: { type: 'string' } }),
    },
    create_team: {
      name: 'create_team',
      description: 'Add a common team (Admin — Common Teams).' + ADMINS,
      strict: true,
      input_schema: objectOf({ name: { type: 'string' }, people_ids: ids('Who is on it.') }),
    },
    update_team: {
      name: 'update_team',
      description: 'Rename a common team, or add or take people off it.' + ADMINS,
      strict: true,
      input_schema: objectOf({
        team: { type: 'string', description: 'Its name, from people_and_groups.' },
        new_name: { type: 'string', description: '"" to keep it.' },
        add_people_ids: ids('People to add.'),
        remove_people_ids: ids('People to take off.'),
      }),
    },
    delete_team: {
      name: 'delete_team',
      description: 'Remove a common team.' + ADMINS,
      strict: true,
      input_schema: objectOf({ team: { type: 'string', description: 'Its name.' } }),
    },
    delete_task_template: {
      name: 'delete_task_template',
      description: 'Delete a task template. Making or changing one is done on its screen.' + ADMINS,
      strict: true,
      input_schema: objectOf({ template_id: { type: 'string' } }),
    },
    read_settings: {
      name: 'read_settings',
      description:
        'Their own profile and settings: name, email, title, roles, location for nearby events, and which notifications they get by push and by email.',
      strict: true,
      input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  }

/**
 * The API takes at most this many strict tools in one request (structured
 * outputs' limits); past it, the whole request is turned away.
 */
export const MAX_STRICT_TOOLS = 20

/**
 * The tools offered in a request: Miriam's own commands strict, so what she
 * hands back always fits their schemas — and the app's lookups and changes
 * not, as the app checks every input to them itself (features/miriam:
 * appTools, actions), and an admin has more of them than the API allows
 * strict tools.
 */
export function toolsFor(commands: CommandName[], appTools: AppToolName[]) {
  return [
    ...commands.map((name) => COMMANDS[name].tool),
    ...appTools.map((name) => ({ ...APP_TOOLS[name], strict: false as const })),
  ]
}

/** The app's lookups named in a request, those that exist. */
export function appToolsFrom(names: unknown): AppToolName[] {
  if (!Array.isArray(names)) return []
  return (Object.keys(APP_TOOLS) as AppToolName[]).filter((n) => names.includes(n))
}

/** The commands someone with these roles may use. */
export function commandsFor(roles: readonly string[] | undefined): CommandName[] {
  const held = new Set(roles ?? [])
  return (Object.keys(COMMANDS) as CommandName[]).filter((name) =>
    COMMANDS[name].roles.some((r) => held.has(r))
  )
}

/** The people and groups a request can name. */
export interface Roster {
  people: { id: string; name: string }[]
  groups: { id: string; name: string; members: string[] }[]
  commonTeams?: { name: string; members: string[] }[]
  taskTemplates?: { id: string; name: string }[]
}

/** What Claude filled in for open_event_form. */
/** What Claude fills in for an event's form (EVENT_FIELDS), before it is checked. */
export type EventFormInput = Record<string, unknown>

export interface FlightLeg {
  date: string
  time: string
  airport: string
  airline: string
  flight: string
  confirmation: string
  arrival: string
}

/**
 * An event's form, filled in. Mirrored in the app (src/lib/miriam.ts).
 *
 * For a new event, the fields not said are '' or []. For an edit, only what
 * changes is here: a field left out is as the event has it. `users` and
 * `groups`, when present, are the whole of them after the change.
 */
export interface EventDraft {
  title: string
  /** YYYY-MM-DD, or '' */
  date: string
  /** "9:00 PM", or '' */
  startTime: string
  location: string
  address: string
  city: string
  state: string
  users?: string[]
  groups?: string[]
  repeat?: { recur: 'weekly' | 'biweekly' | 'monthly'; recDay: number } | null
  isPublic?: boolean
  isVirtual?: boolean
  virtualLink?: string
  foodItems?: string[]
  cars?: { label: string; seats?: number; driver: string; riders: string[] }[]
  lodging?: {
    name: string
    address: string
    room: string
    confirmation: string
    assignees: string[]
  }[]
  flights?: { uid: string; out: FlightLeg; ret: FlightLeg }[]
  teams?: { name: string; leaders: string[]; members: string[] }[]
  dressCode?: { group: string; text: string }[]
  extraDays?: { date: string; startTime: string; location: string }[]
  taskTemplateId?: string
}

/** What an edit starts from: who the event is assigned to now. */
export interface EventBase {
  users: string[]
  groups: string[]
}

const clean = (s: unknown, max = 120) => (typeof s === 'string' ? s.trim().slice(0, max) : '')

/** A real calendar date, YYYY-MM-DD, or ''. */
export function validDate(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return ''
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? s : ''
}

/** "9 pm", "9:00pm", "21:00" → "9:00 PM"; anything else → ''. */
export function validTime(s: string): string {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]?\.?$/.exec(s.trim())
  if (m) {
    const h = +m[1]
    const min = m[2] ?? '00'
    if (h < 1 || h > 12 || +min > 59) return ''
    return `${h}:${min} ${m[3].toUpperCase()}M`
  }
  const h24 = /^(\d{1,2}):(\d{2})$/.exec(s.trim())
  if (h24) {
    const h = +h24[1]
    if (h > 23 || +h24[2] > 59) return ''
    return `${h % 12 || 12}:${h24[2]} ${h < 12 ? 'AM' : 'PM'}`
  }
  return ''
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
const said = (input: Record<string, unknown>, key: string) => key in input && input[key] !== null

/**
 * The form to open, from what Claude filled in — checked, not trusted.
 *
 * Only ids on the roster are kept, and only known teams and templates;
 * anything else said goes into `notes`, to be told. "Everyone in All except
 * Jacob" is worked out here, not by the model: the groups' members, less
 * those left out, as people assigned one by one (a group assigned as a group
 * would bring them back in). With `base`, it is an edit: only what was said
 * is in the draft, and people and groups are added to and taken from it.
 */
export function draftFromInput(
  input: EventFormInput,
  roster: Roster,
  base?: EventBase
): { draft: EventDraft; notes: string[] } {
  const personIds = new Set(roster.people.map((p) => p.id))
  const groupsById = new Map(roster.groups.map((g) => [g.id, g]))
  const ids = (v: unknown, known: (id: string) => boolean) =>
    [...new Set(list(v).map(String))].filter(known)
  const isPerson = (id: string) => personIds.has(id)
  const people = (v: unknown) => ids(v, isPerson)
  const notes: string[] = []

  const draft: EventDraft = {
    title: clean(input.title),
    date: validDate(clean(input.date, 10)),
    startTime: validTime(clean(input.start_time, 12)),
    location: clean(input.venue),
    address: clean(input.address),
    city: clean(input.city, 60),
    state: clean(input.state, 2).toUpperCase(),
  }

  // Who it is assigned to.
  if (!base) {
    const groups = ids(input.groups, (id) => groupsById.has(id))
    const one = people(input.people)
    const except = new Set(people(input.except_people))
    if (except.size > 0) {
      const everyone = new Set(one)
      for (const g of groups) for (const m of groupsById.get(g)?.members ?? []) everyone.add(m)
      draft.users = [...everyone].filter((id) => !except.has(id) && isPerson(id))
      draft.groups = []
    } else {
      draft.users = one
      draft.groups = groups
    }
  } else if (
    ['add_people', 'remove_people', 'add_groups', 'remove_groups'].some((k) => said(input, k))
  ) {
    const remove = new Set(people(input.remove_people))
    const takeGroups = new Set(
      ids(input.remove_groups, (id) => groupsById.has(id) || base.groups.includes(id))
    )
    let groups = [
      ...new Set([...base.groups, ...ids(input.add_groups, (id) => groupsById.has(id))]),
    ].filter((g) => !takeGroups.has(g))
    const users = new Set([...base.users.map(String), ...people(input.add_people)])
    // Someone taken off who is in an assigned group: that group's members
    // are assigned one by one instead, without them.
    for (const g of [...groups]) {
      const members = groupsById.get(g)?.members ?? []
      if (members.some((m) => remove.has(m))) {
        members.forEach((m) => users.add(m))
        groups = groups.filter((x) => x !== g)
      }
    }
    draft.users = [...users].filter((u) => !remove.has(u))
    draft.groups = groups
  }

  // Repeating.
  if (said(input, 'repeat')) {
    const recur = String(input.repeat)
    if (recur === 'none') draft.repeat = null
    else if (recur === 'weekly' || recur === 'biweekly' || recur === 'monthly') {
      const day = Number(input.repeat_weekday)
      const fromDate = draft.date ? new Date(`${draft.date}T12:00:00Z`).getUTCDay() : 0
      draft.repeat = {
        recur,
        recDay: Number.isInteger(day) && day >= 0 && day <= 6 ? day : fromDate,
      }
    }
  }
  if (typeof input.public === 'boolean') draft.isPublic = input.public
  const link = clean(input.virtual_link, 500)
  if (link) {
    if (/^https?:\/\//i.test(link)) {
      draft.virtualLink = link
      draft.isVirtual = true
    } else notes.push(`“${link}” isn’t a web link — add the meeting link by hand.`)
  }
  if (typeof input.virtual === 'boolean') draft.isVirtual = input.virtual || !!draft.virtualLink

  if (said(input, 'food_items')) {
    draft.foodItems = list(input.food_items)
      .map((x) => clean(x, 80))
      .filter(Boolean)
  }
  if (said(input, 'cars')) {
    draft.cars = list(input.cars).map((c) => {
      const car = obj(c)
      const seats = Number(car.seats)
      return {
        label: clean(car.label, 60),
        ...(Number.isInteger(seats) && seats > 0 && seats < 60 ? { seats } : {}),
        driver: people([car.driver_id])[0] ?? '',
        riders: people(car.rider_ids),
      }
    })
  }
  if (said(input, 'lodging')) {
    draft.lodging = list(input.lodging).map((l) => {
      const place = obj(l)
      return {
        name: clean(place.name),
        address: clean(place.address, 200),
        room: clean(place.room, 40),
        confirmation: clean(place.confirmation, 60),
        assignees: people(place.people_ids),
      }
    })
  }
  if (said(input, 'flights')) {
    const legOf = (v: unknown): FlightLeg => {
      const l = obj(v)
      return {
        date: validDate(clean(l.date, 10)),
        time: validTime(clean(l.time, 12)) || clean(l.time, 12),
        airport: clean(l.airport, 60),
        airline: clean(l.airline, 60),
        flight: clean(l.flight, 20),
        confirmation: clean(l.confirmation, 40),
        arrival: clean(l.arrival, 20),
      }
    }
    draft.flights = list(input.flights)
      .map((f) => {
        const flight = obj(f)
        return {
          uid: people([flight.person_id])[0] ?? '',
          out: legOf(flight.outbound),
          ret: legOf(flight.return),
        }
      })
      .filter((f) => {
        if (!f.uid) notes.push('A flight was for someone I couldn’t find — add it by hand.')
        return !!f.uid
      })
  }
  if (said(input, 'teams') || said(input, 'common_teams')) {
    const teams = list(input.teams).map((t) => {
      const team = obj(t)
      return {
        name: clean(team.name, 60),
        leaders: people(team.leader_ids),
        members: people(team.member_ids),
      }
    })
    for (const name of list(input.common_teams).map((n) => clean(n, 60))) {
      const common = (roster.commonTeams ?? []).find(
        (t) => t.name.toLowerCase() === name.toLowerCase()
      )
      if (common)
        teams.push({ name: common.name, leaders: [], members: common.members.filter(isPerson) })
      else if (name) notes.push(`There’s no common team called “${name}”.`)
    }
    draft.teams = teams.filter((t) => t.name)
  }
  if (said(input, 'dress_code')) {
    draft.dressCode = list(input.dress_code)
      .map((d) => {
        const entry = obj(d)
        const who = clean(entry.for, 60)
        return {
          group: /^(everyone|all|everybody|remaining)$/i.test(who) || !who ? '_remainder_' : who,
          text: clean(entry.text, 300),
        }
      })
      .filter((d) => d.text)
  }
  if (said(input, 'extra_days')) {
    draft.extraDays = list(input.extra_days)
      .map((d) => {
        const day = obj(d)
        return {
          date: validDate(clean(day.date, 10)),
          startTime: validTime(clean(day.start_time, 12)),
          location: clean(day.venue),
        }
      })
      .filter((d) => d.date)
  }
  const template = clean(input.task_template_id, 80)
  if (template) {
    if ((roster.taskTemplates ?? []).some((t) => t.id === template)) draft.taskTemplateId = template
    else notes.push('That task template wasn’t found — pick it by hand.')
  }

  const unmatched = list(input.unmatched_names)
    .map((n) => clean(n, 60))
    .filter(Boolean)
  if (unmatched.length) {
    notes.push(`Couldn’t find ${unmatched.map((n) => `“${n}”`).join(', ')} — add them by hand.`)
  }
  return { draft, notes }
}

/** A new task's form, filled in. Mirrored in the app (src/lib/miriam.ts). */
export interface TaskDraft {
  title: string
  /** YYYY-MM-DD, or '' */
  dueDate: string
  users: string[]
  group: string
  lead: string
}

/** The task form to open, from what Claude filled in — checked, not trusted. */
export function taskDraftFromInput(
  input: Record<string, unknown>,
  roster: Roster
): { draft: TaskDraft; notes: string[] } {
  const personIds = new Set(roster.people.map((p) => p.id))
  const group = roster.groups.find((g) => g.id === String(input.group ?? ''))
  const users = [...new Set(list(input.people).map(String))].filter((id) => personIds.has(id))
  const assigned = new Set(group ? group.members : users)
  const lead = String(input.lead ?? '')
  const unmatched = list(input.unmatched_names)
    .map((n) => clean(n, 60))
    .filter(Boolean)
  return {
    draft: {
      title: clean(input.title, 200),
      dueDate: validDate(clean(input.due_date, 10)),
      users: group ? [] : users,
      group: group?.id ?? '',
      lead: assigned.has(lead) ? lead : '',
    },
    notes: unmatched.length
      ? [`Couldn’t find ${unmatched.map((n) => `“${n}”`).join(', ')} — add them by hand.`]
      : [],
  }
}
