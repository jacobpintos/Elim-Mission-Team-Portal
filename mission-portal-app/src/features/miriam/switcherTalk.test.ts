import { beforeEach, describe, expect, it } from 'vitest'
import { fakeAtem, type FakeInput } from '@/lib/__fixtures__/fakeAtem'
import type { Here, Reply, Talk } from './localTalk'
import { forgetSwitcherInputs, switcherHere, type SwitcherAccess } from './switcherTalk'

const INPUTS: FakeInput[] = [
  { id: 0, long: 'Black', external: false },
  { id: 1, long: 'Wide' },
  { id: 2, long: 'Pulpit' },
  { id: 3, long: 'Camera 3' },
  { id: 4, long: 'ProPresenter' },
  { id: 1000, long: 'Color Bars', external: false },
]

/** A Video Operator talking to her, on the switcher's network: each line said, and what came of it. */
function atTheSwitcher(access?: Exclude<SwitcherAccess['kind'], 'ready'>, setup = {}) {
  const atem = fakeAtem({ inputs: INPUTS, program: 1, preview: 2, ...setup })
  const log: string[] = []
  let waiting: Reply | null = null
  let undo: (() => Promise<string>) | null = null
  const talk = {
    say: (text: string) => log.push(`say: ${text}`),
    ask: (text: string, onReply: Reply) => {
      log.push(`ask: ${text}`)
      waiting = onReply
    },
    thinking: () => {},
    done: (text: string, u: () => Promise<string>) => {
      log.push(`done: ${text} [Undo]`)
      undo = u
    },
  } as unknown as Talk
  const here = {
    switcher: async (): Promise<SwitcherAccess> =>
      access
        ? ({ kind: access } as SwitcherAccess)
        : { kind: 'ready', open: atem.open, clock: atem.clock },
  } as unknown as Here
  const say = async (said: string): Promise<string[]> => {
    log.length = 0
    if (waiting) {
      const onReply: Reply = waiting
      waiting = null
      if (await onReply(said, talk)) return [...log]
      log.push('(not an answer)')
    }
    if (!(await switcherHere(said, here, talk))) log.push('(not the switcher)')
    return [...log]
  }
  return Object.assign(say, { atem, undo: async () => (undo ? undo() : 'nothing to undo') })
}

beforeEach(() => forgetSwitcherInputs())

describe('Miriam at the video switcher', () => {
  it('cuts to a camera at once, with Undo, connecting and leaving each time', async () => {
    const say = atTheSwitcher()
    expect(await say('camera 2')).toEqual(['done: Pulpit is live. [Undo]'])
    expect(say.atem.live.program).toBe(2)
    expect(say.atem.sessions()).toEqual({ opened: 1, closed: 1 })
    expect(await say.undo()).toBe('Back to Wide.')
    expect(say.atem.live.program).toBe(1)
    expect(say.atem.sessions()).toEqual({ opened: 2, closed: 2 })
  })

  it('cuts by a name on the switcher', async () => {
    const say = atTheSwitcher()
    expect(await say('switch to ProPresenter')).toEqual(['done: ProPresenter is live. [Undo]'])
    expect(say.atem.live.program).toBe(4)
  })

  it('puts a camera on preview, then takes it', async () => {
    const say = atTheSwitcher()
    expect(await say('preview camera 3')).toEqual(['done: Camera 3 is on preview. [Undo]'])
    expect(await say('take it')).toEqual(['done: Camera 3 is live. [Undo]'])
    expect(say.atem.commands).toEqual(['CPvI', 'DCut'])
  })

  it('dissolves with the switcher’s transition', async () => {
    const say = atTheSwitcher()
    expect(await say('dissolve to camera 3')).toEqual(['done: Dissolving to Camera 3. [Undo]'])
    expect(say.atem.commands).toEqual(['CPvI', 'DAut'])
  })

  it('asks before fading to black', async () => {
    const say = atTheSwitcher()
    expect(await say('fade to black')).toEqual(['ask: Fade the program to black?'])
    expect(await say('no')).toEqual(['say: Okay — left as it is.'])
    expect(say.atem.live.black).toBe(false)
    await say('fade to black')
    expect(await say('yes')).toEqual(['done: Fading to black. [Undo]'])
    expect(say.atem.live.black).toBe(true)
    expect(await say('fade back up')).toEqual(['done: Fading back up from black. [Undo]'])
    expect(say.atem.live.black).toBe(false)
  })

  it('says what’s live, and what there’s nothing to do about', async () => {
    const say = atTheSwitcher()
    expect(await say('what’s live?')).toEqual(['say: Wide is live, and Pulpit is on preview.'])
    expect(await say('camera 1')).toEqual(['say: Wide is already live.'])
    expect(await say('cut to the balcony')).toEqual([
      'say: I can’t find “balcony” on the switcher.',
    ])
  })

  it('leaves a name that isn’t on the switcher to the rest of her', async () => {
    const say = atTheSwitcher()
    await say('what’s live?')
    expect(await say('go to the pastor')).toEqual(['(not the switcher)'])
    expect(await say('take it')).toEqual(['done: Pulpit is live. [Undo]'])
  })

  it('says when the switcher can’t be reached, or doesn’t take it', async () => {
    expect(await atTheSwitcher(undefined, { silent: true })('camera 2')).toEqual([
      'say: I can’t reach the video switcher. Is this phone on its network?',
    ])
    expect(await atTheSwitcher(undefined, { deaf: true })('camera 2')).toEqual([
      'say: The switcher didn’t take that. Try again, or switch it on the panel.',
    ])
  })

  it('is for Video Operators, on the phone app, once it knows where the switcher is', async () => {
    expect(await atTheSwitcher('not operator')('camera 2')).toEqual([
      'say: Only Video Operators can switch cameras. An admin can make you one on the Leadership Team screen.',
    ])
    expect(await atTheSwitcher('not operator')('take it')).toEqual(['(not the switcher)'])
    expect(await atTheSwitcher('no app')('camera 2')).toEqual([
      'say: I can switch cameras only from the phone app, on the switcher’s network.',
    ])
    expect(await atTheSwitcher('no address')('camera 2')).toEqual([
      'say: I don’t know where the video switcher is yet. Put its address in Settings, under Video switcher.',
    ])
  })
})
