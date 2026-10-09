import { describe, expect, it } from 'vitest'
import {
  foodItemFor,
  membersAfter,
  notificationSwitch,
  rolesAfter,
  teamsAfter,
} from './miriamActions'
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
    expect(appToolsFrom(['send_message', 'drop_database'])).toEqual(['send_message'])
  })
})

describe('admins’ changes, worked out', () => {
  const ROLES = ['admin', 'security', 'worship', 'regular', 'intern', 'guest', 'public'] as const

  it('adds and takes away roles, only ones that exist', () => {
    expect(rolesAfter(['regular'], ['worship', 'wizard'], [], ROLES)).toEqual([
      'regular',
      'worship',
    ])
    expect(rolesAfter(['regular', 'worship'], [], ['worship'], ROLES)).toEqual(['regular'])
    expect(rolesAfter(['regular'], [], ['regular'], ROLES)).toEqual([])
  })

  it('adds and takes people out of a group, each once', () => {
    expect(membersAfter(['a', 'b'], ['b', 'c'], ['a'])).toEqual(['b', 'c'])
  })

  it('changes the common teams as the screen keeps them', () => {
    const teams = [
      { name: 'Production', members: ['a'] },
      { name: 'Hospitality', members: ['b'] },
    ]
    expect(teamsAfter(teams, { kind: 'add', name: 'Media', members: ['c'] })).toHaveLength(3)
    expect(teamsAfter(teams, { kind: 'add', name: 'production', members: [] })).toBe(
      'There is already a team called production.'
    )
    expect(
      teamsAfter(teams, {
        kind: 'update',
        team: 'hospitality',
        newName: '',
        add: ['c'],
        remove: ['b'],
      })
    ).toEqual([teams[0], { name: 'Hospitality', members: ['c'] }])
    expect(
      teamsAfter(teams, {
        kind: 'update',
        team: 'Hospitality',
        newName: 'Production',
        add: [],
        remove: [],
      })
    ).toBe('There is already a team called Production.')
    expect(teamsAfter(teams, { kind: 'remove', team: 'Production' })).toEqual([teams[1]])
    expect(teamsAfter(teams, { kind: 'remove', team: 'Sound' })).toBe(
      'There is no team called Sound.'
    )
  })
})
