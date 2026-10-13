import { describe, expect, it } from 'vitest'
import { doneStem, taskPicked, taskSaid, taskStatusAsked, type TaskLike } from './miriamTaskStatus'

const ask = (text: string) => {
  const a = taskStatusAsked(text)
  return a ? `${a.status}:${a.name}` : null
}

describe('taskStatusAsked: done', () => {
  it.each([
    ['Mark the flyers done', 'done:flyers'],
    ['mark sound check as complete', 'done:sound check'],
    ['Set the bus task to finished', 'done:bus'],
    ['Hey Miriam, can you please mark the flyers as done for me', 'done:flyers'],
    ['I finished the sound check', 'done:sound check'],
    ["I've finished the sound check", 'done:sound check'],
    ['I just finished the flyers', 'done:flyers'],
    ['I have completed the slides', 'done:slides'],
    ['I did the sound check', 'done:sound check'],
    ['We wrapped up the setup', 'done:setup'],
    ["I'm done with the flyers", 'done:flyers'],
    ["I'm all done with the slides", 'done:slides'],
    ['Done with the slides', 'done:slides'],
    ['Finished the flyers', 'done:flyers'],
    ['The flyers are done', 'done:flyers'],
    ["The sound check's finished", 'done:sound check'],
    ['Sound check is complete', 'done:sound check'],
    ['the slides are all done', 'done:slides'],
    ['sound check done', 'done:sound check'],
    ['Check off the flyers', 'done:flyers'],
    ['Cross the bus off my list', 'done:bus'],
    ['complete the task called book the bus', 'done:book the bus'],
    ['I took care of the flyers', 'done:flyers'],
    ['I got the flyers done', 'done:flyers'],
    ['The sound check task is done', 'done:sound check'],
    ['I finished the sound check today', 'done:sound check'],
    ['All done with the flyers', 'done:flyers'],
    ['The slides are ready', 'done:slides'],
    ['The van is good to go', 'done:van'],
    ['Got the flyers printed', 'done:print flyers'],
    ["I've completed booking the bus", 'done:booking the bus'],
  ])('"%s"', (text, want) => {
    expect(ask(text)).toBe(want)
  })
})

describe('taskStatusAsked: done, said as what was done', () => {
  it.each([
    ['I booked the bus', 'done:book bus'],
    ['We printed the flyers', 'done:print flyers'],
    ['The flyers are printed', 'done:print flyers'],
    ['The bus has been booked', 'done:book bus'],
    ['I set up the chairs', 'done:set up chairs'],
    ['I bought the snacks', 'done:buy snacks'],
    ["I've sent the invitations", 'done:send invitations'],
  ])('"%s"', (text, want) => {
    expect(ask(text)).toBe(want)
  })
})

describe('taskStatusAsked: in progress, not started', () => {
  it.each([
    ['Mark the slides in progress', 'in_progress:slides'],
    ["I've started the slides", 'in_progress:slides'],
    ['I started on the flyers', 'in_progress:flyers'],
    ["I'm working on the slides", 'in_progress:slides'],
    ["I'm now working on the sound check", 'in_progress:sound check'],
    ['Start the slides', 'in_progress:slides'],
    ['The slides are in progress', 'in_progress:slides'],
    ['Mark the flyers not started', 'pending:flyers'],
    ['Mark the flyers as not done', 'pending:flyers'],
    ['Reopen the flyers', 'pending:flyers'],
    ['Uncheck sound check', 'pending:sound check'],
    ["The flyers aren't done after all", 'pending:flyers'],
    ["I haven't finished the slides yet", 'pending:slides'],
  ])('"%s"', (text, want) => {
    expect(ask(text)).toBe(want)
  })
})

describe('taskStatusAsked: not one', () => {
  it.each([
    'Is the sound check done?',
    'Did I finish the flyers?',
    'What are my tasks?',
    "I'm done",
    'I did it',
    'Mark it done',
    'Mark all my tasks done',
    "We're all done for today",
    'Mark the flyers done and start the slides',
    'What time is it',
    'Turn off message notifications',
  ])('"%s"', (text) => {
    expect(taskStatusAsked(text)).toBeNull()
  })

  it('knows when "task" was said', () => {
    expect(taskStatusAsked('Mark the bus task done')?.saidTask).toBe(true)
    expect(taskStatusAsked('Mark the bus done')?.saidTask).toBe(false)
  })
})

describe('doneStem', () => {
  it.each([
    ['printed', 'print'],
    ['booked', 'book'],
    ['planned', 'plan'],
    ['submitted', 'submit'],
    ['called', 'call'],
    ['bought', 'buy'],
    ['set up', 'set up'],
    ['picked up', 'pick up'],
  ])('%s — %s', (verb, stem) => expect(doneStem(verb)).toBe(stem))
})

describe('taskPicked', () => {
  const tasks: TaskLike[] = [
    { id: 1, title: 'Sound check', status: 'pending', dueDate: '2026-10-25' },
    { id: 2, title: 'Sound check', status: 'pending', dueDate: '2026-10-18' },
    { id: 3, title: 'Print flyers', status: 'in_progress', dueDate: '2026-10-15' },
    { id: 4, title: 'Hand out flyers', status: 'pending' },
    { id: 5, title: 'Book the bus', status: 'pending', dueDate: '2026-10-20' },
    { id: 6, title: 'Order shirts', status: 'done' },
    { id: 7, title: 'Order snacks', status: 'pending' },
  ]
  const pick = (text: string) => {
    const a = taskStatusAsked(text)
    if (!a) return 'not asked'
    const p = taskPicked(tasks, a)
    return p.kind === 'sure' || p.kind === 'likely'
      ? `${p.kind}:${p.item.id}`
      : p.kind === 'which'
        ? `which:${p.items.map((t) => t.id).join(',')}`
        : 'none'
  }

  it('is sure of the one plainly named', () => {
    expect(pick('I booked the bus')).toBe('sure:5')
    expect(pick('The flyers are printed')).toBe('sure:3')
  })

  it('asks which of several that fit', () => {
    expect(pick('Mark the flyers done')).toBe('which:3,4')
  })

  it('takes the soonest of tasks of the same name, as likely', () => {
    expect(pick('I finished the sound check')).toBe('likely:2')
  })

  it('leaves out one already as asked when another fits as well', () => {
    expect(pick('Mark the order done')).toBe('likely:7')
  })

  it('finds none for a task that is not theirs', () => {
    expect(pick('I finished the dishes')).toBe('none')
  })

  it('says a task back with its due date', () => {
    expect(taskSaid(tasks[1])).toBe('“Sound check”, due Sun, Oct 18')
    expect(taskSaid(tasks[3])).toBe('“Hand out flyers”')
  })
})
