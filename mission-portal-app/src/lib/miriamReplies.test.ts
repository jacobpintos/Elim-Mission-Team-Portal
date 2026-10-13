import { describe, expect, it } from 'vitest'
import {
  choicePicked,
  listed,
  looksLikeNewRequest,
  pickBest,
  saidNeverMind,
  saidNo,
  saidYes,
  withoutAsking,
  withoutEnding,
} from './miriamReplies'

describe('saidYes', () => {
  it.each([
    'yes',
    'Yes.',
    'yeah',
    'yep',
    'yes please',
    'please',
    'please do',
    'sure',
    'okay',
    'ok do it',
    "that's right",
    "yeah that's it",
    'that one',
    'correct',
    'exactly',
    'uh huh',
    'yes I did',
    'go ahead',
    'yeah, thanks',
    'Hey Miriam yes',
  ])('takes "%s" for a yes', (reply) => {
    expect(saidYes(reply)).toBe(true)
  })

  it.each(['no', 'thanks', 'yes but the other one', 'the youth one', 'what time is it', ''])(
    'does not take "%s" for a plain yes',
    (reply) => {
      expect(saidYes(reply)).toBe(false)
    }
  )
})

describe('saidNo', () => {
  it('keeps what follows the no', () => {
    expect(saidNo('No, the youth one')).toEqual({ rest: 'the youth one' })
    expect(saidNo('nope')).toEqual({ rest: '' })
    expect(saidNo('no no I meant flight reminders')).toEqual({ rest: 'flight reminders' })
    expect(saidNo("Actually it's the other one")).toEqual({ rest: 'the other one' })
    expect(saidNo('not that one')).toEqual({ rest: '' })
  })

  it('is null for anything else', () => {
    expect(saidNo('yes')).toBeNull()
    expect(saidNo('the dessert')).toBeNull()
    expect(saidNo('November 3rd')).toBeNull()
  })
})

describe('saidNeverMind', () => {
  it.each(['never mind', 'nevermind', 'cancel', 'forget it', 'no thanks', "don't bother"])(
    '"%s"',
    (reply) => expect(saidNeverMind(reply)).toBe(true)
  )
  it('not for an answer', () => expect(saidNeverMind('the second one')).toBe(false))
})

describe('withoutAsking / withoutEnding', () => {
  it('takes the asking off', () => {
    expect(withoutAsking('hey miriam could you please mark it done')).toBe('mark it done')
    expect(withoutAsking('go ahead and turn off messages')).toBe('turn off messages')
    expect(withoutEnding('mark the flyers done for me please')).toBe('mark the flyers done')
  })
})

describe('pickBest', () => {
  const tasks = [
    'Sound check for Sunday',
    'Sound check for youth night',
    'Print flyers',
    'Hand out flyers',
    'Book the bus',
  ]
  const pick = (said: string) => {
    const p = pickBest(tasks, (t) => t, said)
    return p.kind === 'sure' || p.kind === 'likely'
      ? `${p.kind}:${p.item}`
      : p.kind === 'which'
        ? `which:${p.items.join('|')}`
        : 'none'
  }

  it('is sure of a name said in full, or every word of one', () => {
    expect(pick('book the bus')).toBe('sure:Book the bus')
    expect(pick('the bus')).toBe('sure:Book the bus')
    expect(pick('sunday sound check')).toBe('sure:Sound check for Sunday')
  })

  it('asks which when several fit as well', () => {
    expect(pick('sound check')).toBe('which:Sound check for Sunday|Sound check for youth night')
    expect(pick('flyers')).toBe('which:Print flyers|Hand out flyers')
  })

  it('is only likely when not every word was found', () => {
    expect(pick('book the van and bus')).toBe('likely:Book the bus')
  })

  it('hears words as speech recognition writes them', () => {
    expect(pickBest(['Pot roast'], (t) => t, 'potroast')).toEqual({
      kind: 'sure',
      item: 'Pot roast',
    })
    expect(pickBest(['Pot roast', 'Dessert'], (t) => t, 'pot rose').kind).toBe('likely')
  })

  it('finds none for nothing like it', () => {
    expect(pick('lasagna')).toBe('none')
  })
})

describe('choicePicked', () => {
  const options = ['Fall Potluck', 'Youth Night', 'First Sunday breakfast']

  it('by order, by number, or by name', () => {
    expect(choicePicked('the second one', options)).toBe(1)
    expect(choicePicked('number two', options)).toBe(1)
    expect(choicePicked('two', options)).toBe(1)
    expect(choicePicked('the last one', options)).toBe(2)
    expect(choicePicked('the youth one', options)).toBe(1)
    expect(choicePicked('I meant the potluck', options)).toBe(0)
  })

  it('a name before an order word in it', () => {
    expect(choicePicked('first sunday breakfast', options)).toBe(2)
  })

  it('-1 when it is none of them', () => {
    expect(choicePicked('the fourth', options)).toBe(-1)
    expect(choicePicked('the picnic', options)).toBe(-1)
  })
})

describe('listed', () => {
  it('lists', () => {
    expect(listed(['A', 'B', 'C'])).toBe('A, B and C')
    expect(listed(['A', 'B'], 'or')).toBe('A or B')
  })
})

describe('looksLikeNewRequest', () => {
  it.each([
    'what time does it start',
    'Open my tasks',
    'is it raining tomorrow',
    'remind me to call Sam',
  ])('"%s" is a request of its own', (reply) => expect(looksLikeNewRequest(reply)).toBe(true))
  it.each(['the dessert', 'drinks', 'the second one', 'Sunday', 'brisket'])(
    '"%s" is an answer',
    (reply) => expect(looksLikeNewRequest(reply)).toBe(false)
  )
})

describe('fitScore', () => {
  it('a word with an ending, or the start of one, fits', async () => {
    const { fitScore } = await import('./miriamReplies')
    expect(fitScore('Drinks', 'drink')).toBe(1)
    expect(fitScore('Cookie', 'cookies')).toBe(1)
    expect(fitScore('Book the bus', 'booking bus')).toBe(1)
    expect(fitScore('Sermon', 'serm')).toBe(1)
    expect(fitScore('Sound check Oct 25', '25th')).toBe(1)
  })

  it('a longer, different word does not: "potluck" is not "pot"', async () => {
    const { fitScore } = await import('./miriamReplies')
    expect(fitScore('Pot roast', 'potluck')).toBe(0)
    expect(fitScore('Potluck', 'pots')).toBe(0)
  })
})
