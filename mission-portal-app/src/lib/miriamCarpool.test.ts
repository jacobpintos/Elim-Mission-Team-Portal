import { describe, expect, it } from 'vitest'
import { carpoolAsked } from './miriamCarpool'

const today = '2026-10-13' // a Tuesday
const none = { date: null, name: '' }

describe('carpool changes, said', () => {
  it('a passenger put in a car', () => {
    expect(carpoolAsked("Put Sam in Andy's truck", today)).toEqual({
      kind: 'passenger',
      who: 'sam',
      car: "andy's truck",
      event: none,
    })
    expect(carpoolAsked('Move Sam Lee to van 2', today)).toMatchObject({
      kind: 'passenger',
      who: 'sam lee',
      car: 'van 2',
    })
  })

  it('a driver, said in several ways', () => {
    for (const said of [
      'Make Beth the driver of van 1',
      'have Beth drive van 1',
      'Beth is driving van 1',
      'Beth will drive the van 1',
      'put Beth as the driver of van 1',
    ]) {
      expect(carpoolAsked(said, today), said).toMatchObject({
        kind: 'driver',
        who: 'beth',
        car: 'van 1',
      })
    }
  })

  it('someone taken out, of a car or of the carpool', () => {
    expect(carpoolAsked('Take Sam out of the van', today)).toMatchObject({
      kind: 'out',
      who: 'sam',
      car: 'van',
    })
    expect(carpoolAsked('remove Sam from the carpool', today)).toMatchObject({
      kind: 'out',
      who: 'sam',
      car: '',
    })
  })

  it('a child added, by name', () => {
    for (const said of [
      'Add a child named Joey to van 1',
      'add Joey as a child in van 1',
      'add a kid to van 1 named Joey',
    ]) {
      expect(carpoolAsked(said, today), said).toMatchObject({
        kind: 'child',
        child: 'joey',
        car: 'van 1',
      })
    }
  })

  it('the event it is for, when said', () => {
    expect(carpoolAsked('put Sam in the van for the youth retreat', today)).toMatchObject({
      kind: 'passenger',
      car: 'van',
      event: { date: null, name: 'youth retreat' },
    })
    expect(carpoolAsked('make Beth the driver of van 1 on Saturday', today)).toMatchObject({
      kind: 'driver',
      car: 'van 1',
      event: { date: '2026-10-17' },
    })
  })

  it('isn’t anything else', () => {
    expect(carpoolAsked('Remind me to call Sam', today)).toBeNull()
    expect(carpoolAsked('What time is youth night', today)).toBeNull()
    expect(carpoolAsked('put me down for chips', today)).toBeNull()
  })
})
