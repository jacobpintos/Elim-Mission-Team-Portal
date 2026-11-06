import { describe, expect, it } from 'vitest'
import { plainlyTheSwitcher, switcherAsked } from './switcher/asked'
import { emptyAtemState, type AtemState } from './switcher/atem'
import { inputFound, liveSaid, planFor } from './switcher/plan'

describe('what is asked of the video switcher', () => {
  it('reads a cut, by number or by name', () => {
    expect(switcherAsked('camera 2')).toEqual({ kind: 'cut', input: 'camera 2', strong: true })
    expect(switcherAsked('cam two')).toEqual({ kind: 'cut', input: 'camera 2', strong: true })
    expect(switcherAsked('cut to the wide shot')).toEqual({
      kind: 'cut',
      input: 'wide shot',
      strong: true,
    })
    expect(switcherAsked('switch to camera 3 now')).toMatchObject({
      kind: 'cut',
      input: 'camera 3',
    })
    expect(switcherAsked('go to the pulpit cam')).toEqual({
      kind: 'cut',
      input: 'pulpit cam',
      strong: false,
    })
    expect(switcherAsked('put the slides up')).toEqual({
      kind: 'cut',
      input: 'slides',
      strong: false,
    })
  })

  it('reads preview, a transition, and taking preview live', () => {
    expect(switcherAsked('preview the pulpit cam')).toEqual({
      kind: 'preview',
      input: 'pulpit cam',
    })
    expect(switcherAsked('put camera 3 on preview')).toEqual({ kind: 'preview', input: 'camera 3' })
    expect(switcherAsked('dissolve to the wide shot')).toEqual({
      kind: 'dissolve',
      input: 'wide shot',
    })
    expect(switcherAsked('take it')).toEqual({ kind: 'take', how: 'cut' })
    expect(switcherAsked('go')).toEqual({ kind: 'take', how: 'cut' })
    expect(switcherAsked('auto')).toEqual({ kind: 'take', how: 'auto' })
  })

  it('reads fading to black and back, and a question', () => {
    expect(switcherAsked('fade to black')).toEqual({ kind: 'black' })
    expect(switcherAsked('go to black')).toEqual({ kind: 'black' })
    expect(switcherAsked('fade back up')).toEqual({ kind: 'unblack' })
    expect(switcherAsked('come back from black')).toEqual({ kind: 'unblack' })
    expect(switcherAsked('what’s live?')).toEqual({ kind: 'which' })
    expect(switcherAsked('what camera are we on')).toEqual({ kind: 'which' })
  })

  it('leaves alone what is about the app or the sound desk', () => {
    expect(switcherAsked('go to my tasks')).toBeNull()
    expect(switcherAsked('show my events')).toBeNull()
    expect(switcherAsked('go to settings')).toBeNull()
    expect(switcherAsked('mute Mitch EG')).toBeNull()
    expect(switcherAsked('show the lyrics')).toBeNull()
  })

  it('tells a plain request to the switcher from one that may be something else', () => {
    expect(plainlyTheSwitcher(switcherAsked('camera 2')!)).toBe(true)
    expect(plainlyTheSwitcher(switcherAsked('cut to the pastor')!)).toBe(true)
    expect(plainlyTheSwitcher(switcherAsked('go to the wide shot')!)).toBe(true)
    expect(plainlyTheSwitcher(switcherAsked('go to the pastor')!)).toBe(false)
    expect(plainlyTheSwitcher(switcherAsked('take it')!)).toBe(false)
  })
})

function switcher(over: Partial<AtemState> = {}): AtemState {
  const s = emptyAtemState()
  for (const [id, long, external] of [
    [0, 'Black', false],
    [1, 'Wide', true],
    [2, 'Pulpit', true],
    [3, 'Camera 3', true],
    [4, 'ProPresenter', true],
    [1000, 'Color Bars', false],
  ] as const) {
    s.inputs.set(id, { id, long, short: '', external })
  }
  return { ...s, program: 1, preview: 2, ready: true, ...over }
}

describe('a switcher request, worked out', () => {
  it('finds inputs by number and by name', () => {
    const s = switcher()
    expect(inputFound('camera 3', s)).toMatchObject({ kind: 'one', input: { id: 3 } })
    expect(inputFound('wide shot', s)).toMatchObject({ kind: 'one', input: { id: 1 } })
    expect(inputFound('pulpit cam', s)).toMatchObject({ kind: 'one', input: { id: 2 } })
    expect(inputFound('propresenter', s)).toMatchObject({ kind: 'one', input: { id: 4 } })
    expect(inputFound('the balcony', s)).toEqual({ kind: 'none' })
  })

  it('cuts at once, and says so once it’s live', () => {
    const plan = planFor(switcherAsked('cut to the pulpit')!, switcher())
    if (plan.kind !== 'commands') throw new Error(plan.kind)
    expect(plan.commands.map((c) => String.fromCharCode(...c.subarray(4, 8)))).toEqual(['CPgI'])
    expect(plan.said(switcher({ program: 2 }))).toBe('Pulpit is live.')
    expect(plan.said(switcher({ program: 1 }))).toBeNull()
    expect(plan.undo?.said).toBe('Back to Wide.')
  })

  it('says when there’s nothing to do', () => {
    expect(planFor(switcherAsked('camera 1')!, switcher())).toEqual({
      kind: 'said',
      text: 'Wide is already live.',
    })
    expect(planFor(switcherAsked('fade back up')!, switcher())).toEqual({
      kind: 'said',
      text: 'The program isn’t faded to black.',
    })
    expect(planFor(switcherAsked('cut to the balcony')!, switcher())).toEqual({
      kind: 'no input',
      said: 'balcony',
    })
  })

  it('says what’s live', () => {
    expect(liveSaid(switcher())).toBe('Wide is live, and Pulpit is on preview.')
    expect(liveSaid(switcher({ black: true }))).toBe(
      'Wide is live, and Pulpit is on preview. The program is faded to black.'
    )
  })
})
