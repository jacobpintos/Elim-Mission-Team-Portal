import { describe, expect, it } from 'vitest'
import { reminderAsked, reminderWhen, repeatWhen } from './reminders'

// Monday, October 12 2026, 3:00 PM on this device.
const now = new Date(2026, 9, 12, 15, 0)
const when = (said: string) => {
  const r = reminderAsked(said, now)
  return r && { text: r.text, spoken: r.spoken, at: r.at.toString().slice(0, 21) }
}
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toString().slice(0, 21)

describe('reminders, as asked', () => {
  it('takes a time and a day either way round', () => {
    expect(when('Remind me to go to Costco at 5 pm tomorrow')).toEqual({
      text: 'Go to Costco',
      spoken: 'to go to Costco',
      at: at(13, 17),
    })
    expect(when('remind me tomorrow at 5:30 p.m. to go to Costco')?.at).toBe(at(13, 17, 30))
    expect(when('Hey Miriam, remind me to call my mom at 8')?.spoken).toBe('to call your mom')
    expect(when('remind me to call my mom at 8')?.at).toBe(at(12, 20))
    expect(when('remind me at 9 to take out the trash')?.at).toBe(at(12, 21))
  })
  it('takes "in" a while, parts of the day, weekdays and dates', () => {
    expect(when('remind me in 20 minutes to check the oven')).toEqual({
      text: 'Check the oven',
      spoken: 'to check the oven',
      at: at(12, 15, 20),
    })
    expect(when('remind me in an hour to call Sam')?.at).toBe(at(12, 16))
    expect(when('remind me tomorrow morning to pack the van')?.at).toBe(at(13, 9))
    expect(when('remind me tonight to lock up')?.at).toBe(at(12, 20))
    expect(when('set a reminder for Friday to book the bus')?.at).toBe(at(16, 9))
    expect(when('remind me next monday at 10 to send the set list')?.at).toBe(at(19, 10))
    expect(when('remind me on October 25th at noon about the potluck')).toEqual({
      text: 'The potluck',
      spoken: 'about the potluck',
      at: at(25, 12),
    })
    expect(when('remind me on 10/20 to order shirts')?.at).toBe(at(20, 9))
  })
  it('leaves it to Claude without a time, or when it isn’t a reminder', () => {
    expect(when('remind me to go to Costco')).toBeNull()
    expect(when('remind me at 5')).toBeNull()
    expect(when('what reminders do I have')).toBeNull()
    expect(when('remind me today at 9 am to wake up')).toBeNull() // already past
  })
})

describe('when, as said back', () => {
  it('says it plainly', () => {
    expect(reminderWhen(new Date(2026, 9, 12, 15, 20), now)).toBe('in 20 minutes')
    expect(reminderWhen(new Date(2026, 9, 12, 17, 0), now)).toBe('today at 5 PM')
    expect(reminderWhen(new Date(2026, 9, 13, 17, 30), now)).toBe('tomorrow at 5:30 PM')
    expect(reminderWhen(new Date(2026, 9, 16, 9, 0), now)).toBe('on Friday at 9 AM')
  })
})

describe('repeating reminders', () => {
  const rep = (said: string) => {
    const r = reminderAsked(said, now)
    return r && { text: r.text, repeat: r.repeat, at: r.at.toString().slice(0, 21) }
  }
  it('hears how often, and starts at the next one', () => {
    expect(rep('remind me every Sunday at 8 am to pack the merch table')).toEqual({
      text: 'Pack the merch table',
      repeat: 'weekly',
      at: at(18, 8),
    })
    // Monday at 3 PM: 8 AM today has gone, so tomorrow.
    expect(rep('remind me every day at 8 to read my Bible')).toMatchObject({
      repeat: 'daily',
      at: at(13, 8),
    })
    expect(rep('remind me every weekday morning to check email')).toMatchObject({
      repeat: 'weekdays',
      at: at(13, 9),
    })
    expect(rep('remind me every month to pay rent')).toMatchObject({
      repeat: 'monthly',
      at: at(13, 9),
    })
    // Monday at 3 PM, "every Monday at 5 pm": today.
    expect(rep('remind me every monday at 5 pm to call home')?.at).toBe(at(12, 17))
  })
  it('says it back', () => {
    expect(repeatWhen(new Date(2026, 9, 18, 8, 0), 'weekly')).toBe('every Sunday at 8 AM')
    expect(repeatWhen(new Date(2026, 9, 13, 7, 30), 'weekdays')).toBe('every weekday at 7:30 AM')
    expect(repeatWhen(new Date(2026, 10, 1, 9, 0), 'monthly')).toBe(
      'on the 1st of every month at 9 AM'
    )
  })
})
