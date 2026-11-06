import { choicePicked, listed, saidNeverMind, saidNo, saidYes } from '@/lib/miriamReplies'
import { plainlyTheSwitcher, switcherAsked, type SwitcherAsk } from '@/lib/switcher/asked'
import { visitAtem, type AtemInput, type AtemState, type UdpSession } from '@/lib/switcher/atem'
import { inputFound, inputName, planFor, type Plan } from '@/lib/switcher/plan'
import type { Here, Talk } from './localTalk'

/**
 * Miriam and the video switcher (a Blackmagic ATEM), worked out on the phone:
 * the phone joins the switcher's network and talks to it directly
 * (lib/switcher/atem), connecting for each request and leaving once it's
 * done. For Video Operators (Admin → Leadership Team).
 *
 *   "camera 2", "cut to the wide shot", "preview the pulpit cam",
 *   "take it", "dissolve to camera 3", "fade to black", "what's live?"
 *
 * Cuts happen at once, with Undo. Fading to black is asked first.
 */

export type SwitcherAccess =
  /** `clock`: for the tests' switcher, which keeps time of its own. */
  | { kind: 'ready'; open: () => Promise<UdpSession | null>; clock?: () => number }
  | { kind: 'not operator' }
  /** The website: a browser can't talk to the switcher. */
  | { kind: 'no app' }
  /** The phone app, before the switcher's address is set. */
  | { kind: 'no address' }

const NOT_OPERATOR =
  'Only Video Operators can switch cameras. An admin can make you one on the Leadership Team screen.'
const NO_APP = 'I can switch cameras only from the phone app, on the switcher’s network.'
const NO_ADDRESS =
  'I don’t know where the video switcher is yet. Put its address in Settings, under Video switcher.'
const UNREACHABLE = 'I can’t reach the video switcher. Is this phone on its network?'
const NOT_TAKEN = 'The switcher didn’t take that. Try again, or switch it on the panel.'

/** The switcher's inputs as last read: to tell, without connecting, whether a name is one of them. */
let lastInputs: AtemInput[] | null = null

/** Forgets the inputs last read (tests, or another switcher's address). */
export function forgetSwitcherInputs(): void {
  lastInputs = null
}

/** Worked out here: a request to the video switcher. False to leave it. */
export async function switcherHere(said: string, here: Here, talk: Talk): Promise<boolean> {
  if (!here.switcher) return false
  const ask = switcherAsked(said)
  if (!ask) return false
  const plainly = plainlyTheSwitcher(ask)
  // A name that isn't plainly a camera, and isn't one the switcher had last time: not for it.
  if (!plainly && 'input' in ask && lastInputs) {
    const known: AtemState = {
      product: '',
      inputs: new Map(lastInputs.map((i) => [i.id, i])),
      program: null,
      preview: null,
      black: false,
      ready: true,
    }
    if (inputFound(ask.input, known).kind === 'none') return false
  }
  const access = await here.switcher()
  if (access.kind !== 'ready') {
    if (!plainly) return false
    talk.say(
      access.kind === 'not operator' ? NOT_OPERATOR : access.kind === 'no app' ? NO_APP : NO_ADDRESS
    )
    return true
  }
  // Fading to black is seen by everyone: asked first.
  if (ask.kind === 'black') {
    talk.ask('Fade the program to black?', async (r, t) => {
      if (saidYes(r)) {
        await visitHere(ask, access, t, true)
        return true
      }
      if (saidNeverMind(r) || saidNo(r)) {
        t.say('Okay — left as it is.')
        return true
      }
      return false
    })
    return true
  }
  return visitHere(ask, access, talk, plainly)
}

/** Connects, works the request out from what the switcher says, does it, and leaves. */
async function visitHere(
  ask: SwitcherAsk,
  access: Extract<SwitcherAccess, { kind: 'ready' }>,
  talk: Talk,
  plainly: boolean,
  picked?: AtemInput
): Promise<boolean> {
  talk.thinking()
  let plan: Plan | null = null
  const { open, clock } = access
  const v = await visitAtem(
    open,
    (state) => {
      lastInputs = [...state.inputs.values()]
      plan = planFor(ask, state, picked)
      return plan.kind === 'commands' ? plan.commands : []
    },
    clock
  )
  if (v.kind === 'unreachable') {
    if (!plainly) return false
    talk.say(UNREACHABLE)
    return true
  }
  const p = plan as Plan | null
  if (!p) return false
  if (v.kind === 'not taken') {
    talk.say(NOT_TAKEN)
    return true
  }
  switch (p.kind) {
    case 'said':
      talk.say(p.text)
      return true
    case 'no input':
      if (!plainly) return false
      talk.say(`I can’t find “${p.said}” on the switcher.`)
      return true
    case 'which input': {
      const options = p.options.map((i) => inputName(i, i.id))
      talk.ask(`Which one: ${listed(options, 'or')}?`, async (r, t) => {
        if (saidNeverMind(r)) {
          t.say('Okay — nothing was changed.')
          return true
        }
        const i = choicePicked(r, options)
        if (i < 0) return false
        await visitHere(ask, access, t, true, p.options[i])
        return true
      })
      return true
    }
    case 'commands': {
      const text = p.said(v.after)
      if (!text) {
        talk.say(NOT_TAKEN)
        return true
      }
      const undo = p.undo
      if (undo && talk.done) {
        talk.done(text, async () => {
          const back = await visitAtem(open, () => undo.commands, clock)
          return back.kind === 'done'
            ? undo.said
            : back.kind === 'unreachable'
              ? UNREACHABLE
              : NOT_TAKEN
        })
      } else {
        talk.say(text)
      }
      return true
    }
  }
}
