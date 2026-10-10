import { describe, expect, it } from 'vitest'
import { parseSheetCommand } from './sheetCommands'

const sheets = [
  { id: 1, title: 'Holy Forever' },
  { id: 2, title: 'Breathe' },
  { id: 3, title: 'All Hail King Jesus' },
]
const cmd = (text: string, aliases?: Map<string, string>) => {
  const c = parseSheetCommand(text, sheets, aliases)
  if (c?.type === 'queue') {
    return { type: 'queue', id: c.request.sheet.id, key: c.request.key }
  }
  return c
}

describe('parseSheetCommand', () => {
  it('moves between songs', () => {
    expect(cmd('Next song')).toEqual({ type: 'next' })
    expect(cmd('okay next song please')).toEqual({ type: 'next' })
    expect(cmd('previous song')).toEqual({ type: 'previous' })
    expect(cmd('go back')).toEqual({ type: 'previous' })
    expect(cmd('back to the chorus')).toEqual({ type: 'section', kind: 'chorus', number: null })
  })

  it('queues a song, in a key if one is said', () => {
    expect(cmd('queue Holy Forever')).toEqual({ type: 'queue', id: 1, key: null })
    expect(cmd('queue up Holy Forever in D')).toEqual({ type: 'queue', id: 1, key: 'D' })
    expect(cmd('cue Breathe key of E')).toEqual({ type: 'queue', id: 2, key: 'E' })
    expect(cmd('up next breathe')).toEqual({ type: 'queue', id: 2, key: null })
    expect(cmd('Breathe next')).toEqual({ type: 'queue', id: 2, key: null })
    expect(cmd('play oh hill king jesus next')).toEqual({ type: 'queue', id: 3, key: null })
    expect(cmd('queue weight maker', new Map([['weight maker', '1']]))).toEqual({
      type: 'queue',
      id: 1,
      key: null,
    })
    expect(cmd('queue something unknown')).toBeNull()
    expect(cmd('clear queue')).toEqual({ type: 'clearQueue' })
  })

  it('changes the key', () => {
    expect(cmd('key of G')).toEqual({ type: 'key', key: 'G', minor: false })
    expect(cmd('in E flat')).toEqual({ type: 'key', key: 'Eb', minor: false })
    expect(cmd('Kyiv D')).toEqual({ type: 'key', key: 'D', minor: false })
    expect(cmd('numbers')).toEqual({ type: 'numbers' })
  })

  it('drives autoscroll', () => {
    expect(cmd('start scrolling')).toEqual({ type: 'scroll', action: 'start' })
    expect(cmd('stop')).toEqual({ type: 'scroll', action: 'pause' })
    expect(cmd('faster')).toEqual({ type: 'scroll', action: 'faster' })
    expect(cmd('slow down')).toEqual({ type: 'scroll', action: 'slower' })
  })

  it('starts autoscroll at a speed, as asked in a sentence', () => {
    const at = (level: number) => ({ type: 'scroll', action: 'start', level })
    expect(cmd('Start auto scroll on five')).toEqual(at(5))
    expect(cmd('start autoscroll at speed 7')).toEqual(at(7))
    expect(cmd('autoscroll on twelve')).toEqual(at(12))
    expect(cmd('scroll three')).toEqual(at(3))
    expect(cmd('okay start scrolling at 10 please')).toEqual(at(10))
    expect(cmd('speed seven')).toEqual({ type: 'scroll', action: 'speed', level: 7 })
    expect(cmd('set the speed to four')).toEqual({ type: 'scroll', action: 'speed', level: 4 })
    // Said without a speed, as before; and a number alone, or out of range, is nothing.
    expect(cmd('start auto scroll')).toEqual({ type: 'scroll', action: 'start' })
    expect(cmd('autoscroll on')).toEqual({ type: 'scroll', action: 'start' })
    expect(cmd('stop autoscroll')).toEqual({ type: 'scroll', action: 'pause' })
    expect(cmd('autoscroll off')).toEqual({ type: 'scroll', action: 'pause' })
    expect(cmd('five')).toBeNull()
    expect(cmd('autoscroll on thirteen')).toBeNull()
    expect(cmd('verse two')).toEqual({ type: 'section', kind: 'verse', number: 2 })
  })

  it('goes to a section', () => {
    expect(cmd('chorus')).toEqual({ type: 'section', kind: 'chorus', number: null })
    expect(cmd('go to the bridge')).toEqual({ type: 'section', kind: 'bridge', number: null })
    expect(cmd('verse two')).toEqual({ type: 'section', kind: 'verse', number: 2 })
    expect(cmd('chorus 2')).toEqual({ type: 'section', kind: 'chorus', number: 2 })
    expect(cmd('pre chorus')).toEqual({ type: 'section', kind: 'pre-chorus', number: null })
    expect(cmd('from the top')).toEqual({ type: 'top' })
  })

  it('does the rest', () => {
    expect(cmd('chords only')).toEqual({ type: 'chordsOnly', on: true })
    expect(cmd('show lyrics')).toEqual({ type: 'chordsOnly', on: false })
    expect(cmd('stop listening')).toEqual({ type: 'stopListening' })
  })

  it('is not a lyric that holds a command word', () => {
    expect(cmd('the next thing I know')).toBeNull()
    expect(cmd('holy holy holy is the lord')).toBeNull()
    expect(cmd('and I will sing the chorus of your praise')).toBeNull()
    expect(cmd('a')).toBeNull()
    expect(cmd('')).toBeNull()
  })
})
