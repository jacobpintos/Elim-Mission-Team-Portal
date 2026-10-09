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
  strict: true
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

export const COMMANDS: Record<CommandName, { roles: string[]; tool: ToolDefinition }> = {
  open_event_form: {
    // Only admins create events (firestore.rules: events, write: isAdmin()).
    roles: ['admin'],
    tool: {
      name: 'open_event_form',
      description:
        'Open the form for a new event, filled in with what was asked for, for the person to check and save. ' +
        'Use it for any request to create, add, set up or schedule an event. ' +
        'Leave a field empty ("" or []) when the request does not say it — never guess a venue, address or time.',
      strict: true,
      input_schema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The event name, in title case.' },
          date: {
            type: 'string',
            description:
              'YYYY-MM-DD. A date said without a year is the next one on or after today. "" if not said.',
          },
          start_time: {
            type: 'string',
            description: 'Like "9:00 PM" or "10:30 AM". "" if not said.',
          },
          venue: { type: 'string', description: 'The venue or building name, if said.' },
          address: { type: 'string', description: 'The street address, if said.' },
          city: { type: 'string' },
          state: {
            type: 'string',
            description: 'Two-letter US state abbreviation, e.g. "IA" for Iowa.',
          },
          groups: {
            ...stringList,
            description: 'Ids of the groups to assign, from people_and_groups.',
          },
          people: {
            ...stringList,
            description: 'Ids of individual people to assign, from people_and_groups.',
          },
          except_people: {
            ...stringList,
            description:
              'Ids of people to leave out of the groups assigned: "everyone in All except Jacob".',
          },
          unmatched_names: {
            ...stringList,
            description:
              'Names that were said but match nobody from people_and_groups, or more than one person, as said.',
          },
        },
        required: [
          'title',
          'date',
          'start_time',
          'venue',
          'address',
          'city',
          'state',
          'groups',
          'people',
          'except_people',
          'unmatched_names',
        ],
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
            enum: ['event', 'task', 'availability', 'screen', 'video', 'none'],
            description:
              'event: the event’s page; task: the task; availability: the admin availability page; ' +
              'screen: one of the screens they can open, from the list they are sent; video: a video from Content, to play; none: nothing to show.',
          },
          target: {
            type: 'string',
            description:
              'The event’s key, the task’s id, the screen’s id, or the Content item’s id (from find_content); "" when open is availability or none.',
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
        'The Operations tab: issues reported (with status, root cause and actions), kaizen ideas (with status and votes), and — for admins — planning boards and inventory.',
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
}

/** What Claude filled in for open_event_form. */
export interface EventFormInput {
  title: string
  date: string
  start_time: string
  venue: string
  address: string
  city: string
  state: string
  groups: string[]
  people: string[]
  except_people: string[]
  unmatched_names: string[]
}

/** A new event's form, filled in. Mirrored in the app (src/lib/miriam.ts). */
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

/**
 * The form to open, from what Claude filled in — checked, not trusted.
 *
 * Only ids on the roster are kept. "Everyone in All except Jacob" is worked
 * out here, not by the model: the groups' members, less those left out, as
 * people assigned one by one (a group assigned as a group would bring them
 * back in). `notes` are things to tell the person: names that matched nobody.
 */
export function draftFromInput(
  input: Partial<EventFormInput>,
  roster: Roster
): { draft: EventDraft; notes: string[] } {
  const personIds = new Set(roster.people.map((p) => p.id))
  const groupsById = new Map(roster.groups.map((g) => [g.id, g]))
  const ids = (list: unknown, known: (id: string) => boolean) =>
    [...new Set(Array.isArray(list) ? list.map(String) : [])].filter(known)

  const groups = ids(input.groups, (id) => groupsById.has(id))
  const people = ids(input.people, (id) => personIds.has(id))
  const except = new Set(ids(input.except_people, (id) => personIds.has(id)))

  let users: string[]
  let assignedGroups: string[]
  if (except.size > 0) {
    const everyone = new Set(people)
    for (const g of groups) for (const m of groupsById.get(g)?.members ?? []) everyone.add(m)
    users = [...everyone].filter((id) => !except.has(id) && personIds.has(id))
    assignedGroups = []
  } else {
    users = people
    assignedGroups = groups
  }

  const unmatched = Array.isArray(input.unmatched_names)
    ? input.unmatched_names.map((n) => clean(n, 60)).filter(Boolean)
    : []
  const notes = unmatched.length
    ? [`Couldn’t find ${unmatched.map((n) => `“${n}”`).join(', ')} — add them by hand.`]
    : []

  return {
    draft: {
      title: clean(input.title),
      date: validDate(clean(input.date, 10)),
      startTime: validTime(clean(input.start_time, 12)),
      location: clean(input.venue),
      address: clean(input.address),
      city: clean(input.city, 60),
      state: clean(input.state, 2).toUpperCase(),
      users,
      groups: assignedGroups,
    },
    notes,
  }
}
