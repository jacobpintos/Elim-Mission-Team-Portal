import { describe, it, expect } from 'vitest'
import { saleLingoForSpeech as say } from './saleSpoken'

describe('sale lingo, said', () => {
  it('BOGO, however it is written', () => {
    expect(say('BOGO 1/2 off all hats')).toBe('buy one, get one half off all hats')
    expect(say('Bogo free on T-shirts')).toBe('buy one, get one free on T-shirts')
    expect(say('B.O.G.O. this weekend')).toBe('buy one, get one this weekend')
    expect(say('BOGOF hoodies')).toBe('buy one, get one free hoodies')
    expect(say('BOGO50 on books')).toBe('buy one, get one 50 percent off on books')
    expect(say('BOGO 50% off')).toBe('buy one, get one 50% off')
    expect(say('B2G1 free')).toBe('buy two, get one free')
  })

  it('fractions off, deals for a price, and the short forms', () => {
    expect(say('1/2 OFF everything')).toBe('half OFF everything')
    expect(say('All books 1/3 off')).toBe('All books a third off')
    expect(say('Hats 2/$20')).toBe('Hats two for $20')
    expect(say('Free sticker w/ purchase')).toBe('Free sticker with purchase')
    expect(say('Sale runs thru Sunday')).toBe('Sale runs through Sunday')
    expect(say('Tees $15 ea.')).toBe('Tees $15 each')
    expect(say('Tees $15/ea')).toBe('Tees $15 each')
    expect(say('20% off, excl. books')).toBe('20% off, excluding books')
    expect(say('Hoodies $30, reg. $45')).toBe('Hoodies $30, regularly $45')
  })

  it('leaves the rest alone: dates, times, words that only look like it', () => {
    expect(say('Practice moved to 11/2 at 6')).toBe('Practice moved to 11/2 at 6')
    expect(say('Meet at 5:30 pm, 1/2 mile north')).toBe('Meet at 5:30 pm, 1/2 mile north')
    expect(say('Bogota mission trip')).toBe('Bogota mission trip')
    expect(say('Reg. desk opens at 9')).toBe('Reg. desk opens at 9')
  })
})
