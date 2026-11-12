import { describe, it, expect } from 'vitest'
import {
  buildEventReport,
  eventAsked,
  reportAsked,
  seenToDrop,
  sinceSaid,
  tasksOfEvent,
  type EventReportInput,
  type ReportTask,
} from './eventReport'
import { outstandingFor } from '../../functions/src/reimbursements/logic'
import {
  findEvents,
  type EventInstance,
  type EventTemplate,
  type Viewer,
} from '../../functions/src/miriam/data'

const today = '2026-11-18' // a Wednesday

describe('asking for a report', () => {
  it('is heard in the ways it is asked', () => {
    for (const said of [
      'Give me a report on Revival',
      'Miriam, can you give me a status report for Revival?',
      'Status report on revival',
      'Report on Revival please',
      'Can I get an event report about Revival',
      'Pull up the report for Revival',
      "What's the report on revival",
      'I want a quick report on revival',
    ]) {
      expect(reportAsked(said, today), said).toEqual({
        date: null,
        name: 'revival',
        loose: false,
      })
    }
  })

  it('takes the day it is asked of', () => {
    expect(reportAsked('Give me a report on Sunday’s service', today)).toEqual({
      date: '2026-11-22',
      name: 'sunday service',
      loose: false,
    })
    expect(reportAsked("Give me a report on this Sunday's service", today)).toMatchObject({
      date: '2026-11-22',
      name: 'sunday service',
    })
    expect(reportAsked('Give me a report on sunday service', today)).toMatchObject({
      date: '2026-11-22',
      name: 'sunday service',
    })
    expect(reportAsked('report on tomorrow', today)).toMatchObject({ date: '2026-11-19' })
    expect(reportAsked("report on tonight's event", today)).toEqual({
      date: today,
      name: '',
      loose: false,
    })
  })

  it('takes “the next event”, or none named, as the next to come — “the next service” as the service', () => {
    for (const said of [
      'Give me a report on the next event',
      'report on the next event',
      'give me a report on my next event',
      'give me a report on the upcoming event',
      'give me a status report',
      'give me a report',
      'status report',
      'event report',
    ]) {
      expect(reportAsked(said, today), said).toEqual({ date: null, name: '', loose: false })
    }
    expect(reportAsked('give me a report on the next service', today)).toEqual({
      date: null,
      name: 'service',
      loose: false,
    })
    // Named before the word, as "the Revival report" is: loose.
    expect(reportAsked('the next event report', today)).toEqual({
      date: null,
      name: '',
      loose: true,
    })
    // "next Sunday" is still a day.
    expect(reportAsked('give me a report on next Sunday', today)).toMatchObject({
      date: '2026-11-22',
    })
  })

  it('hears it asked as a question, loose: an event must be found by it, and only an admin has it', () => {
    for (const [said, name] of [
      ['How is Sunday Service looking?', 'sunday service'],
      ["What's the status of Revival?", 'revival'],
      ['Give me an update on Revival', 'revival'],
      ['Are we on track for Revival?', 'revival'],
      ['Is Revival behind?', 'revival'],
      ['Where are we with the retreat?', 'retreat'],
      ['Catch me up on Revival', 'revival'],
      ['How are things looking for Revival?', 'revival'],
    ]) {
      expect(reportAsked(said, today), said).toMatchObject({ name, loose: true })
    }
    for (const said of [
      'How is the weather looking?',
      'How are you doing?',
      "How's it going?",
      'How am I looking?',
      "What's my next event?",
      'When is the next event?',
    ]) {
      expect(reportAsked(said, today), said).toBeNull()
    }
  })

  it('takes a name said before the word, marked to be found before it is used', () => {
    expect(reportAsked('Give me the Revival report', today)).toEqual({
      date: null,
      name: 'revival',
      loose: true,
    })
    expect(reportAsked('the youth retreat status report', today)).toMatchObject({
      name: 'youth retreat',
      loose: true,
    })
  })

  it('leaves alone the briefing, report times, and reports that are no event’s', () => {
    for (const said of [
      'Give me my daily report',
      'the security report',
      'What time do I report for Revival?',
      'I want to report a problem with the projector',
      'Report an issue',
      'report to security',
      'Give me the weather report',
    ]) {
      expect(reportAsked(said, today), said).toBeNull()
    }
  })
})

describe('the event a report is given on', () => {
  const admin: Viewer = { uid: 'boss', roles: ['admin'] }
  const sunday: EventTemplate = {
    id: 'svc',
    title: 'Sunday Service',
    isRec: true,
    recur: 'weekly',
    recDay: 0,
  }
  const revival: EventTemplate = {
    id: 'rev',
    title: 'Revival In The Heartland',
    date: '2026-11-20',
  }
  const retreat: EventTemplate = { id: 'ret', title: 'Youth Retreat', date: '2026-12-05' }
  const pastRetreat: EventTemplate = { id: 'old', title: 'Fall Retreat', date: '2026-10-10' }
  const templates = [sunday, revival, retreat, pastRetreat]
  /** As the app asks (features/miriam/eventReportData eventForReport). */
  const asked = (said: string) => {
    const ask = reportAsked(said, today)!
    const find = (date: string) => findEvents(templates, {}, [], admin, ask.name, today, date, 6)
    const ev = eventAsked(ask, find)
    return ev && `${ev.title} ${ev.date}`
  }

  it('by its name, the next to come', () => {
    expect(asked('Give me a report on sunday service')).toBe('Sunday Service 2026-11-22')
    expect(asked('Give me a report on Revival')).toBe('Revival In The Heartland 2026-11-20')
    expect(asked('report on the youth retreat')).toBe('Youth Retreat 2026-12-05')
  })

  it('the next event: whichever comes first; the next service: Sunday’s', () => {
    expect(asked('Give me a report on the next event')).toBe('Revival In The Heartland 2026-11-20')
    expect(asked('give me a status report')).toBe('Revival In The Heartland 2026-11-20')
    expect(asked('give me a report on the next service')).toBe('Sunday Service 2026-11-22')
  })

  it('on a day said, that day’s; a day with nothing on it is none', () => {
    expect(asked('give me a report on Friday')).toBe('Revival In The Heartland 2026-11-20')
    expect(asked('give me a report on Sunday')).toBe('Sunday Service 2026-11-22')
    expect(asked('give me a report on Thursday')).toBeNull()
  })

  it('a name not found is none: left to Claude, who looks further', () => {
    expect(asked('give me a report on the picnic')).toBeNull()
  })

  it('a past event by name, when it has no date to come', () => {
    expect(asked('give me a report on the fall retreat')).toBe('Fall Retreat 2026-10-10')
  })
})

const ev = (over: Partial<EventInstance> = {}): EventInstance =>
  ({
    id: 'e1',
    templateId: 'e1',
    title: 'Revival',
    date: '2026-11-22',
    instanceKey: 'e1_2026-11-22',
    users: ['ann', 'ben', 'cy', 'dee'],
    _geocodeLat: 41.7,
    _geocodeLng: -91.6,
    ...over,
  }) as EventInstance

const task = (over: Partial<ReportTask>): ReportTask => ({
  id: 't',
  title: 'A task',
  status: 'pending',
  assignees: ['ann'],
  evTemplateId: 'e1',
  ...over,
})

const names = new Map([
  ['ann', 'Ann Lee'],
  ['ben', 'Ben Ortiz'],
  ['cy', 'Cy Park'],
  ['dee', 'Dee Moss'],
])

const input = (over: Partial<EventReportInput> = {}): EventReportInput => ({
  ev: ev(),
  tasks: [],
  groups: [],
  instance: {},
  series: {},
  names,
  seen: null,
  reimbursements: {
    toDecide: 0,
    toPay: 0,
    overdue: 0,
    toDecideCents: 0,
    toPayCents: 0,
    amounts: false,
  },
  weather: {
    forecast: { high: 71.6, low: 54.2, precipPct: 30, label: 'Partly Cloudy' },
    alerts: [],
  },
  today,
  now: Date.parse('2026-11-18T15:00:00'),
  ...over,
})

describe('an event’s tasks', () => {
  it('are those made for it; a repeating event’s, those for its date or none', () => {
    const tasks = [
      task({ id: 1, evTemplateId: 'e1' }),
      task({ id: 2, evId: 'e1', evTemplateId: 'other' }),
      task({ id: 3, evTemplateId: 'e2' }),
      task({ id: 4, evTemplateId: 'e1', evDate: '2026-11-29' }),
    ]
    expect(tasksOfEvent(tasks, ev()).map((t) => t.id)).toEqual([1, 2, 4])
    expect(tasksOfEvent(tasks, ev({ isRec: true })).map((t) => t.id)).toEqual([1, 2])
  })
})

describe('the report', () => {
  it('is on track with nothing behind or overdue, and says what is due soon', () => {
    const r = buildEventReport(
      input({
        tasks: [
          task({ id: 1, status: 'done' }),
          task({ id: 2, title: 'Print programs', dueDate: '2026-11-20' }),
          task({ id: 3, title: 'Order chairs', dueDate: '2026-12-20' }),
        ],
      })
    )
    expect(r.status).toBe('on-track')
    expect(r.tasks).toMatchObject({ total: 3, done: 1 })
    expect(r.tasks.dueSoon.map((t) => t.id)).toEqual([2])
    expect(r.text).toContain('Status: ✓ On Track')
    expect(r.text).toContain('Due in the next 7 days: Print programs (Ann Lee, due Nov 20)')
    expect(r.spoken).toContain('It’s on track: 1 of 3 tasks done, and 1 due in the next week.')
  })

  it('is behind with a task behind or overdue, and names them', () => {
    const r = buildEventReport(
      input({
        tasks: [
          task({ id: 1, title: 'Sound check', status: 'behind', projectedDate: '2026-11-21' }),
          task({ id: 2, title: 'Book the van', dueDate: '2026-11-15', assignees: ['ben', 'cy'] }),
          task({ id: 3, title: 'Banners', status: 'in_progress', dueDate: '2026-11-19' }),
        ],
      })
    )
    expect(r.status).toBe('behind')
    expect(r.text).toContain('Status: ⚠ Behind')
    expect(r.text).toContain('• Behind: Sound check (Ann Lee, projected Nov 21)')
    expect(r.text).toContain('• Overdue: Book the van (Ben Ortiz and 1 more, due Nov 15)')
    expect(r.spoken).toContain(
      'It’s behind: 1 task is behind and 1 is overdue — Sound check and Book the van. 1 more is due in the next week.'
    )
  })

  it('has no status to give without tasks', () => {
    const r = buildEventReport(input())
    expect(r.status).toBe('no-tasks')
    expect(r.spoken).toContain('It has no tasks.')
  })

  it('counts who can come, the series’ answer standing for a repeating event’s date', () => {
    const r = buildEventReport(
      input({
        ev: ev({ isRec: true }),
        instance: { ann: { status: 'yes' }, ben: { status: 'no' } },
        series: { cy: { status: 'tbd' }, ann: { status: 'no' } },
      })
    )
    expect(r.availability.counts).toEqual({ yes: 1, no: 1, partial: 0, tbd: 1, none: 1 })
    expect(r.text).toContain(
      'Availability (4 people on it): 1 available · 1 not available · 1 not sure · 1 no answer'
    )
    expect(r.spoken).toContain(
      'Of 4 people on it, 1 is available, 1 isn’t, 1 isn’t sure yet and 1 hasn’t answered.'
    )
  })

  it('says nothing of changes the first time, and keeps the answers for the next', () => {
    const r = buildEventReport(input({ instance: { ann: { status: 'yes' } } }))
    expect(r.availability.changes).toBeNull()
    expect(r.text).not.toMatch(/first report|since you last|changed/i)
    expect(r.spoken).not.toMatch(/first report|since you last|changed/i)
    expect(r.seen).toEqual({
      at: Date.parse('2026-11-18T15:00:00'),
      answers: { ann: 'yes', ben: 'none', cy: 'none', dee: 'none' },
    })
  })

  it('says what changed since they last had it, and nothing of what didn’t', () => {
    const r = buildEventReport(
      input({
        instance: { ann: { status: 'no' }, ben: { status: 'yes' }, dee: { status: 'tbd' } },
        seen: {
          at: Date.parse('2026-11-16T09:00:00'), // Monday
          answers: { ann: 'yes', ben: 'none', cy: 'partial', dee: 'tbd' },
        },
      })
    )
    expect(r.availability.changes?.map((c) => [c.uid, c.was, c.now])).toEqual([
      ['ann', 'yes', 'no'],
      ['ben', 'none', 'yes'],
      ['cy', 'partial', 'none'],
    ])
    expect(r.text).toContain(
      'Since you last checked (on Monday): Ann Lee: available → not available; Ben Ortiz answered: available; Cy Park took back their answer'
    )
    expect(r.spoken).toContain(
      'Since you last checked on Monday, Ann Lee changed from available to not available; Ben Ortiz answered available; Cy Park took back their answer.'
    )
  })

  it('says when nothing changed', () => {
    const r = buildEventReport(
      input({
        seen: {
          at: Date.parse('2026-11-18T08:00:00'),
          answers: { ann: 'none', ben: 'none', cy: 'none', dee: 'none' },
        },
      })
    )
    expect(r.availability.changes).toEqual([])
    expect(r.spoken).toContain('Nothing has changed since you last checked earlier today.')
  })

  it('gives the reimbursements still open — amounts only to whoever may see them', () => {
    const open = {
      toDecide: 1,
      toPay: 2,
      overdue: 1,
      toDecideCents: 4520,
      toPayCents: 12000,
    }
    const admin = buildEventReport(input({ reimbursements: { ...open, amounts: false } }))
    expect(admin.text).toContain(
      'Reimbursements: 1 request waiting for a decision and 2 approved requests waiting to be paid, 1 past its pay-by date.'
    )
    expect(admin.text).not.toContain('$')
    const accountant = buildEventReport(input({ reimbursements: { ...open, amounts: true } }))
    expect(accountant.text).toContain('1 request waiting for a decision ($45.20)')
    expect(accountant.text).toContain('waiting to be paid ($120.00)')
    expect(buildEventReport(input()).text).toContain('Reimbursements: None outstanding.')
    expect(buildEventReport(input({ reimbursements: null })).text).toContain(
      'I couldn’t check reimbursements just now.'
    )
  })

  it('gives the weather, its alerts, or why there is none', () => {
    expect(buildEventReport(input()).text).toContain(
      'Weather: Partly cloudy, high 72°, low 54°, 30% chance of rain.'
    )
    const alert = buildEventReport(
      input({
        weather: {
          forecast: { high: 80, low: 60, precipPct: 0, label: 'Sunny' },
          alerts: ['Severe Thunderstorm Watch'],
        },
      })
    )
    expect(alert.text).toContain(
      'Sunny, high 80°, low 60°. Weather alert: Severe Thunderstorm Watch.'
    )
    expect(buildEventReport(input({ ev: ev({ isVirtual: true }) })).text).toContain('It’s virtual')
    expect(
      buildEventReport(input({ ev: ev({ _geocodeLat: undefined, _geocodeLng: undefined }) })).text
    ).toContain('No place is set for it')
    expect(buildEventReport(input({ weather: { forecast: null, alerts: [] } })).text).toContain(
      'too far off for a forecast'
    )
    expect(buildEventReport(input({ weather: null })).text).toContain(
      'couldn’t get the forecast just now'
    )
  })
})

describe('when they last had it', () => {
  it('is said as a person would', () => {
    expect(sinceSaid(Date.parse('2026-11-18T08:00:00'), today)).toBe('earlier today')
    expect(sinceSaid(Date.parse('2026-11-17T08:00:00'), today)).toBe('yesterday')
    expect(sinceSaid(Date.parse('2026-11-14T08:00:00'), today)).toBe('on Saturday')
    expect(sinceSaid(Date.parse('2026-11-03T08:00:00'), today)).toBe('on Nov 3')
  })
})

describe('what is kept between reports', () => {
  it('lets go of events long past, and the oldest past a hundred', () => {
    const kept = {
      'e1_2026-11-22': { at: 5, answers: {} },
      'e2_2026-08-01': { at: 9, answers: {} },
      'e3_2026-11-01_d2': { at: 1, answers: {} },
    }
    expect(seenToDrop(kept, 'e1_2026-11-22', today)).toEqual(['e2_2026-08-01'])
    const many = Object.fromEntries(
      Array.from({ length: 105 }, (_, i) => [`e${i}_2026-11-30`, { at: i, answers: {} }])
    )
    const dropped = seenToDrop(many, 'e104_2026-11-30', today)
    // 105 kept, a hundred at most: the five oldest go.
    expect(dropped.sort()).toEqual([
      'e0_2026-11-30',
      'e1_2026-11-30',
      'e2_2026-11-30',
      'e3_2026-11-30',
      'e4_2026-11-30',
    ])
    expect(dropped).not.toContain('e104_2026-11-30')
  })
})

describe('an event’s reimbursement requests still open', () => {
  const req = (over: Partial<Parameters<typeof outstandingFor>[0][number]>) => ({
    status: 'submitted' as const,
    total: 1000,
    approvedAmount: null,
    payBy: null,
    eventDate: '2026-11-22',
    ...over,
  })

  it('counts those to decide and to pay, and those past their pay-by date', () => {
    expect(
      outstandingFor(
        [
          req({}),
          req({ status: 'approved', approvedAmount: 900, payBy: '2026-11-10' }),
          req({ status: 'partial', approvedAmount: 500, payBy: '2026-11-30' }),
          req({ status: 'denied' }),
          req({ status: 'paid', approvedAmount: 700 }),
        ],
        { today }
      )
    ).toEqual({ toDecide: 1, toPay: 2, overdue: 1, toDecideCents: 1000, toPayCents: 1400 })
  })

  it('counts one date’s alone, when asked', () => {
    const out = outstandingFor([req({}), req({ eventDate: '2026-11-29' })], {
      date: '2026-11-22',
      today,
    })
    expect(out.toDecide).toBe(1)
  })
})
