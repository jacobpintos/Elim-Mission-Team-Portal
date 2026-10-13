import { FD } from './format'
import {
  pickBest,
  plain,
  quoted,
  squash,
  withoutAsking,
  withoutEnding,
  type Picked,
} from './miriamReplies'

/**
 * "I finished the sound check", "mark the flyers done", "the bus is booked —
 * done", "I'm working on the slides": one of their tasks marked done, in
 * progress or not started, worked out on the device rather than by Claude.
 *
 * Which task is matched against their own (lib/miriamReplies: pickBest), and
 * the change is the same confirmed `set_task_status` Claude would offer.
 * Anything not read plainly here is left to Claude: null.
 */

export type TaskStatus = 'pending' | 'in_progress' | 'done'

export interface TaskStatusAsk {
  status: TaskStatus
  /** The task as named: "sound check". */
  name: string
  /** "Task" or "to-do" was said: plainly about a task, even if none fits. */
  saidTask: boolean
}

/** As a task's status is said: "done", "in progress", "not started". */
export const STATUS_WORDS: Record<TaskStatus, string> = {
  done: 'done',
  in_progress: 'in progress',
  pending: 'not started',
}

const DONE_WORD =
  '(?:done|complete|completed|finished|closed|resolved|taken\\s+care\\s+of|handled|sorted(?:\\s+out)?|wrapped\\s+up|checked\\s+off|knocked\\s+out|out\\s+of\\s+the\\s+way|ready|good\\s+to\\s+go|all\\s+set|squared\\s+away)'
const STARTED_WORD =
  '(?:in\\s+progress|started|underway|under\\s+way|ongoing|in\\s+the\\s+works|working)'
const UNDONE_WORD =
  '(?:not\\s+(?:yet\\s+)?(?:started|done|finished|complete(?:d)?)|incomplete|undone|unfinished|pending|to\\s*-?\\s*do|open|unchecked)'
const MARK = '(?:mark|set|put|move|change|update|flag|make|switch|turn)'
const WE = '(?:i|we)'
const HAVE = "(?:'ve|\\s+have|\\s+just|'ve\\s+just|\\s+have\\s+just)?"
const BE = "(?:'m|\\s+am|'re|\\s+are)"

/**
 * Done, said as what was done: "I booked the bus", "the flyers are printed".
 * Not "called", "texted" or "made": said as often of people and plans as of tasks.
 */
const DID =
  '(booked|bought|ordered|sent|printed|paid|scheduled|confirmed|submitted|reserved|purchased|delivered|emailed|mailed|posted|uploaded|set\\s+up|cleaned(?:\\s+up)?|packed|loaded|picked\\s+up|dropped\\s+off|prepared|practiced|practised|rehearsed|signed|filed|returned|fixed|repaired|edited|finalized|finalised|planned|organized|organised|arranged|registered|rented|installed|tested|updated|shared|invited|recorded)'

const IRREGULAR: Record<string, string> = { bought: 'buy', sent: 'send', paid: 'pay' }

/**
 * A done verb as a task would name it: "printed" — "print", "planned" —
 * "plan". Near enough is enough: names are matched by how words begin, so
 * "schedul" finds "Schedule".
 */
export function doneStem(verb: string): string {
  const [first, ...rest] = verb.split(/\s+/)
  let stem = IRREGULAR[first] ?? first
  if (!IRREGULAR[first]) {
    if (/ied$/.test(stem)) stem = stem.replace(/ied$/, 'y')
    else if (/ed$/.test(stem)) {
      stem = stem.replace(/ed$/, '')
      // "planned" — "plann" — "plan"; not "called" — "cal".
      if (/([bdfgmnprt])\1$/.test(stem)) stem = stem.slice(0, -1)
    }
  }
  return [stem, ...rest].join(' ')
}

/**
 * Each way of saying it, and the status it sets. The name is the first group,
 * unless `name` builds it — with what was done, for a done verb.
 */
const SAID: [RegExp, TaskStatus, ((m: RegExpExecArray) => string)?][] = [
  // "Mark the flyers (as) not started" — before "started" and "done", which it ends with.
  [new RegExp(`^${MARK}\\s+(.+?)\\s+(?:as\\s+|to\\s+|back\\s+to\\s+)?${UNDONE_WORD}$`), 'pending'],
  // "Mark the flyers (as) done", "set sound check to complete".
  [new RegExp(`^${MARK}\\s+(.+?)\\s+(?:as\\s+|to\\s+)?${DONE_WORD}$`), 'done'],
  [new RegExp(`^${MARK}\\s+(.+?)\\s+(?:as\\s+|to\\s+)?${STARTED_WORD}$`), 'in_progress'],
  // "Check off the flyers", "cross the bus off (my list)".
  [
    /^(?:check|tick|cross|knock|scratch)\s+off\s+(.+?)(?:\s+(?:from|on)\s+my\s+(?:list|to\s*-?\s*do\s+list))?$/,
    'done',
  ],
  [
    /^(?:check|tick|cross|scratch)\s+(.+?)\s+off(?:\s+(?:my|the)\s+(?:list|to\s*-?\s*do\s+list))?$/,
    'done',
  ],
  // "Reopen the flyers", "uncheck sound check".
  [/^(?:reopen|re-open|re\s+open|uncheck|un-check|untick|unmark)\s+(.+)$/, 'pending'],
  // "I (have) (just) finished the flyers", "we wrapped up the bus".
  [
    new RegExp(
      `^${WE}${HAVE}\\s+(?:just\\s+|already\\s+|finally\\s+|now\\s+)?(?:finished|completed|done|did|wrapped\\s+up|took\\s+care\\s+of|taken\\s+care\\s+of|knocked\\s+out|handled|sorted(?:\\s+out)?|got\\s+through|checked\\s+off|crossed\\s+off)\\s+(?:with\\s+)?(.+)$`
    ),
    'done',
  ],
  // "I booked the bus", "we've printed the flyers".
  [
    new RegExp(`^${WE}${HAVE}\\s+(?:just\\s+|already\\s+|finally\\s+|now\\s+)?${DID}\\s+(.+)$`),
    'done',
    (m) => `${doneStem(m[1])} ${nameFrom(m[2])}`,
  ],
  // "I'm (all) done with the flyers".
  [
    new RegExp(
      `^${WE}${BE}\\s+(?:all\\s+|finally\\s+|now\\s+)?(?:done|finished|through)\\s+(?:with\\s+)?(.+)$`
    ),
    'done',
  ],
  // "(I) got the flyers done", "got the flyers printed".
  [new RegExp(`^(?:${WE}\\s+)?(?:got|have|had)\\s+(.+?)\\s+${DONE_WORD}$`), 'done'],
  [
    new RegExp(`^(?:${WE}\\s+)?(?:got|have|had)\\s+(.+?)\\s+${DID}$`),
    'done',
    (m) => `${doneStem(m[2])} ${nameFrom(m[1])}`,
  ],
  // "I've started (on) the slides", "we began the bus".
  [
    new RegExp(
      `^${WE}${HAVE}\\s+(?:just\\s+|finally\\s+|now\\s+)?(?:started|begun|began|kicked\\s+off|got\\s+started)\\s+(?:on\\s+|with\\s+|working\\s+on\\s+)?(.+)$`
    ),
    'in_progress',
  ],
  // "I'm (now) working on the slides".
  [
    new RegExp(
      `^${WE}${BE}\\s+(?:now\\s+|currently\\s+|still\\s+|already\\s+)?(?:working\\s+on|starting(?:\\s+on)?|in\\s+the\\s+middle\\s+of|underway\\s+(?:on|with))\\s+(.+)$`
    ),
    'in_progress',
  ],
  // "I haven't finished the flyers after all", "I didn't do the bus".
  [
    new RegExp(
      `^${WE}\\s+(?:haven'?t|have\\s+not|didn'?t|did\\s+not)\\s+(?:actually\\s+|really\\s+)?(?:finished|finish|done|do|completed|complete|started|start)\\s+(.+?)(?:\\s+(?:yet|after\\s+all))?$`
    ),
    'pending',
  ],
  // "Finish the flyers", "complete sound check", "start on the slides".
  [/^(?:complete|finish|close(?:\s+out)?|resolve)\s+(.+)$/, 'done'],
  [/^(?:start|begin)\s+(?:on\s+|working\s+on\s+)?(.+)$/, 'in_progress'],
  // "(All) done with the flyers".
  [/^(?:all\s+)?(?:done|finished|completed|through)\s+(?:with\s+)?(.+)$/, 'done'],
  // "The flyers aren't done after all".
  [
    new RegExp(
      `^(.+?)\\s+(?:isn'?t|is\\s+not|wasn'?t|was\\s+not|aren'?t|are\\s+not)\\s+(?:actually\\s+|really\\s+)?(?:done|finished|complete(?:d)?)(?:\\s+(?:yet|after\\s+all))?$`
    ),
    'pending',
  ],
  // "The flyers are (all) done", "sound check's finished", "the slides are in progress".
  [
    new RegExp(
      `^(.+?)(?:\\s+(?:is|are|was|were|has\\s+been|have\\s+been|got)|'s)\\s+(?:all\\s+|finally\\s+|now\\s+)?${DONE_WORD}$`
    ),
    'done',
  ],
  [new RegExp(`^(.+?)(?:\\s+(?:is|are)|'s)\\s+(?:now\\s+)?${STARTED_WORD}$`), 'in_progress'],
  // "The bus is booked", "flyers have been printed".
  [
    new RegExp(
      `^(.+?)(?:\\s+(?:is|are|was|were|has\\s+been|have\\s+been|got)|'s)\\s+(?:all\\s+|finally\\s+|now\\s+)?${DID}$`
    ),
    'done',
    (m) => `${doneStem(m[2])} ${nameFrom(m[1])}`,
  ],
  // Said tersely: "sound check done".
  [new RegExp(`^(.+?)\\s+${DONE_WORD}$`), 'done'],
]

/** A question, not a change: "is the sound check done?", "did I finish the flyers?" */
const QUESTION =
  /^(?:is|are|was|were|has|have|had|did|do|does|what|when|where|who|whose|why|how|which|should|will|would)\b/

/** Words that name nothing on their own: "for today", "all my". */
const EMPTY_WORDS = new Set(
  'a an the it its that this those these them my our your all every everything both each for with of to in on at up so now today tonight done just really then there here i me we us you ok okay yes no not one ones lot lots stuff things thing'.split(
    ' '
  )
)

/** Said for the task, but not its name. */
const NOT_A_NAME =
  /^(?:it|that|this|those|these|them|everything|all|all\s+of\s+(?:them|it|my\s+tasks)|all\s+my\s+tasks|my\s+tasks|both|both\s+of\s+them|i|i'm|we|we're|you|so|ok|okay|yes|no|now|today|for\s+the\s+day|for\s+today|with\s+(?:it|that))$/

/** The name as said, without what is around it: "the task called sound check for me" — "sound check". */
function nameFrom(said: string): string {
  let s = said.trim()
  for (;;) {
    const next = s
      .replace(/^(?:the|my|our|that|this|a|an|those|these)\s+/, '')
      .replace(
        /^(?:tasks?|to\s*-?\s*dos?|assignments?)\s+(?:called|named|for|to|about|of|that\s+says)\s+/,
        ''
      )
      .replace(/^(?:one|task)\s+(?:called|named|for|about)\s+/, '')
      .replace(/\s+(?:tasks?|to\s*-?\s*dos?|assignments?|items?)$/, '')
      .replace(
        /\s+(?:for\s+me|on\s+my\s+(?:list|to\s*-?\s*do\s+list)|off\s+my\s+list|from\s+my\s+list)$/,
        ''
      )
      .replace(
        /\s+(?:today|yesterday|this\s+morning|this\s+afternoon|this\s+evening|tonight|earlier|finally|at\s+last|already)$/,
        ''
      )
      .trim()
    if (next === s) return s
    s = next
  }
}

export function taskStatusAsked(text: string): TaskStatusAsk | null {
  const said = withoutEnding(withoutAsking(plain(text)))
  if (!said || QUESTION.test(said)) return null
  // More than one thing at once ("mark A done and start B") is Claude's.
  if (/\band\s+(?:mark|start|set|finish|complete|reopen)\b/.test(said)) return null
  for (const [re, status, build] of SAID) {
    const m = re.exec(said)
    if (!m) continue
    const name = build ? build(m).trim() : nameFrom(m[1] ?? '')
    const raw = (m[1] ?? '').trim()
    if (!name || NOT_A_NAME.test(name) || NOT_A_NAME.test(raw) || name.split(' ').length > 12) {
      return null
    }
    // "All my tasks", "everything on my list": more than one, or none named.
    if (/^(?:all|every|everything|each)\b/.test(raw)) return null
    if (name.split(' ').every((w) => EMPTY_WORDS.has(w))) return null
    return { status, name, saidTask: /\b(?:tasks?|to\s*-?\s*dos?|assignments?)\b/.test(said) }
  }
  return null
}

/** A task as Miriam matches it: what lib/miriamQuick and the store both have. */
export interface TaskLike {
  id: string | number
  title: string
  status: string
  dueDate?: string | null
}

/**
 * Which of their tasks was meant. Tasks of the same name (one for each
 * Sunday) count as one: the one wanted is taken to be the soonest due that
 * isn't already as asked — but only likely, since another could be meant.
 * Of several that fit as well, those already as asked are left out when
 * others aren't.
 */
export function taskPicked<T extends TaskLike>(tasks: T[], ask: TaskStatusAsk): Picked<T> {
  const groups = new Map<string, T[]>()
  for (const t of tasks) {
    const key = squash(t.title)
    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  const firstOf = (same: T[]) =>
    [...same].sort(
      (a, b) =>
        Number(a.status === ask.status) - Number(b.status === ask.status) ||
        (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999')
    )[0]
  const shown = [...groups.values()].map(firstOf)
  const repeated = (t: T) => (groups.get(squash(t.title))?.length ?? 0) > 1

  const picked = pickBest(shown, (t) => t.title, ask.name)
  if (picked.kind === 'sure' && repeated(picked.item)) {
    // The others of that name, soonest due first: offered if this isn't the one.
    const others = (groups.get(squash(picked.item.title)) ?? [])
      .filter((t) => t !== picked.item)
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
    return { kind: 'likely', item: picked.item, others }
  }
  if (picked.kind === 'which') {
    const notYet = picked.items.filter((t) => t.status !== ask.status)
    if (notYet.length === 1) return { kind: 'likely', item: notYet[0], others: [] }
    if (notYet.length > 1) return { kind: 'which', items: notYet }
  }
  return picked
}

/** A task as said back: “Sound check”, due Sun, Oct 18. */
export function taskSaid(t: TaskLike): string {
  return `${quoted(t.title)}${t.dueDate ? `, due ${FD(t.dueDate, { weekday: true })}` : ''}`
}
