import { describe, expect, it } from 'vitest'
import { eitherSexLabel, hasRules, rulesData, rulesFrom, seatingRulesFrom } from './types'

describe('special rules for people', () => {
  it('reads what was kept, never keeping someone with or from themselves', () => {
    expect(
      rulesFrom('ben', {
        noDrive: true,
        eitherSex: true,
        keepWith: ['beth', 'ben', 'beth'],
        keepApart: ['beth', 'carl'],
        note: '  Front seat ',
      })
    ).toEqual({
      uid: 'ben',
      noDrive: true,
      eitherSex: true,
      keepWith: ['beth'],
      keepApart: ['carl'],
      note: 'Front seat',
    })
    expect(hasRules(rulesFrom('x', {}))).toBe(false)
    expect(rulesData({ uid: 'x', noTrailer: true })).toMatchObject({
      noTrailer: true,
      noDrive: false,
    })
  })

  it('gives Auto-assign the seating ones', () => {
    const seating = seatingRulesFrom([
      { uid: 'ben', eitherSex: true, keepWith: ['beth'] },
      { uid: 'carl', keepApart: ['dan'] },
    ])
    expect([...(seating.eitherSex ?? [])]).toEqual(['ben'])
    expect(seating.together).toEqual([['ben', 'beth']])
    expect(seating.apart).toEqual([['carl', 'dan']])
  })

  it('says the seating rule as it is for them', () => {
    expect(eitherSexLabel('male')).toBe('Can ride with women')
    expect(eitherSexLabel('female')).toBe('Can ride with men')
  })
})
