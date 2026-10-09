import { describe, expect, it } from 'vitest'
import { foodItemFor, notificationSwitch } from './miriamActions'
import { ACTIONS, APP_TOOLS, appToolsFrom } from '../../functions/src/miriam/plan'

describe('which food item was meant', () => {
  const items = ['Paper plates', 'Chips & salsa', 'Brownies', 'Bottled water']
  it('takes the item named, or the one item that fits', () => {
    expect(foodItemFor(items, 'brownies')).toBe(2)
    expect(foodItemFor(items, 'the chips')).toBe(1)
    expect(foodItemFor(items, 'water')).toBe(3)
  })
  it('takes none when it is not on the sheet, or more than one fits', () => {
    expect(foodItemFor(items, 'lasagna')).toBe(-1)
    expect(foodItemFor(['Red plates', 'Blue plates'], 'plates')).toBe(-1)
  })
})

describe('which notification switch', () => {
  it('writes push, email or both, as Settings names it', () => {
    expect(notificationSwitch('newMessage', 'both', false)).toEqual({
      paths: ['notificationPrefs.newMessage.push', 'notificationPrefs.newMessage.email'],
      label: 'New message (push and email)',
    })
    expect(notificationSwitch('weeklyDigest', 'email', false)?.paths).toEqual([
      'notificationPrefs.weeklyDigest',
    ])
  })
  it('keeps admins’ switches for admins, and refuses ones that do not exist', () => {
    expect(notificationSwitch('chatFlagged', 'push', false)).toBeNull()
    expect(notificationSwitch('chatFlagged', 'push', true)).not.toBeNull()
    expect(notificationSwitch('roles', 'push', true)).toBeNull()
  })
})

describe('the changes Miriam can be asked for', () => {
  it('are each defined, and offered only by name', () => {
    for (const a of ACTIONS) expect(APP_TOOLS[a].name).toBe(a)
    expect(appToolsFrom(['send_message', 'delete_user'])).toEqual(['send_message'])
  })
})
