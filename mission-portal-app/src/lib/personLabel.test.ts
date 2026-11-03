import { describe, expect, it } from 'vitest'
import { personLabel } from './personLabel'
import {
  groupsWithout,
  isBlank,
  strayMembers,
  teamsWithoutAll,
  isPublicOnly,
} from '../../functions/src/accountAudit'

describe('someone, as a picker shows them', () => {
  it('their name, their email, or — with neither — an unnamed account', () => {
    expect(personLabel({ uid: 'u1', displayName: 'Sam Holub', email: 's@x.org' })).toBe('Sam Holub')
    expect(personLabel({ uid: 'u1', displayName: ' ', email: 's@x.org' })).toBe('s@x.org')
    expect(personLabel({ uid: 'FvJAUM7HIBRpNLWX0qaZg7Kqyas2' })).toBe('Unnamed account (…Kqyas2)')
  })
})

describe('the account check: members with no account, accounts with no name', () => {
  const known = new Set(['a', 'b'])
  const groups = [
    { id: 'all', name: 'All', members: ['a', 'gone1', 'b', 'gone2'] },
    { id: 'band', name: 'Band', members: ['b', 'gone1'] },
    { id: 'empty', name: 'Empty' },
  ]
  const teams = ['Greeters', { name: 'Production', members: ['a', 'gone3'] }]

  it('finds the uids with no profile and no account, and where', () => {
    expect(strayMembers(groups, teams, (u) => known.has(u))).toEqual([
      { uid: 'gone1', in: ['All', 'Band'] },
      { uid: 'gone2', in: ['All'] },
      { uid: 'gone3', in: ['Production (common team)'] },
    ])
    expect(strayMembers(groups, 'not a list', (u) => known.has(u)).map((s) => s.uid)).toEqual([
      'gone1',
      'gone2',
    ])
  })

  it('takes them out: only the groups and teams that had them change', () => {
    const gone = new Set(['gone1', 'gone2', 'gone3'])
    expect(groupsWithout(groups, gone)).toEqual([
      { id: 'all', members: ['a', 'b'] },
      { id: 'band', members: ['b'] },
    ])
    expect(teamsWithoutAll(teams, gone)).toEqual([
      'Greeters',
      { name: 'Production', members: ['a'] },
    ])
    expect(teamsWithoutAll(teams, new Set(['nobody']))).toBeNull()
  })

  it('an account with no name and no email is blank', () => {
    expect(isBlank({ displayName: '', email: '' })).toBe(true)
    expect(isBlank({})).toBe(true)
    expect(isBlank({ displayName: '  ' })).toBe(true)
    expect(isBlank({ email: 'x@y.org' })).toBe(false)
    expect(isBlank({ displayName: 'Sam' })).toBe(false)
  })
})

describe('a public account and nothing more', () => {
  it('is public with no member role, nor a guest', () => {
    expect(isPublicOnly(['public'])).toBe(true)
    expect(isPublicOnly(['public', 'regular'])).toBe(false)
    expect(isPublicOnly(['public', 'guest'])).toBe(false)
    expect(isPublicOnly(['regular'])).toBe(false)
    expect(isPublicOnly(undefined)).toBe(false)
  })
})
