import { describe, expect, it } from 'vitest'
import { stillHere, teamsWithout } from './commonTeamMembers'

describe('a deleted account, out of the common teams', () => {
  it('takes the uid out of every team that had it', () => {
    const teams = [
      { name: 'Setup', members: ['a', 'gone', 'b'] },
      'Greeters',
      { name: 'Audio', members: ['gone'] },
      { name: 'Video', members: ['c'] },
    ]
    expect(teamsWithout(teams, 'gone')).toEqual([
      { name: 'Setup', members: ['a', 'b'] },
      'Greeters',
      { name: 'Audio', members: [] },
      { name: 'Video', members: ['c'] },
    ])
  })

  it('writes nothing when no team had them', () => {
    expect(teamsWithout([{ name: 'Video', members: ['c'] }], 'gone')).toBeNull()
    expect(teamsWithout(undefined, 'gone')).toBeNull()
  })

  it('shows only members who still have an account — all of them before people load', () => {
    const users = [{ uid: 'a' }, { uid: 'b' }]
    expect(stillHere(['a', 'gone', 'b'], users)).toEqual(['a', 'b'])
    expect(stillHere(['a', 'gone'], [])).toEqual(['a', 'gone'])
  })
})
