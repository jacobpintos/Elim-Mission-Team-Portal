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
        'The groups and people a new event can be assigned to, with their ids. ' +
        'Call it before open_event_form when the request names any people or groups.',
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
            enum: ['event', 'task', 'availability', 'none'],
            description:
              'event: the event’s page; task: the task; availability: the admin availability page; none: nothing to show.',
          },
          target: {
            type: 'string',
            description: 'The event’s key or the task’s id; "" when open is availability or none.',
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
