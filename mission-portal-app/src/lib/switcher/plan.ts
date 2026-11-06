import { namesFound } from '@/lib/mixer/desk'
import type { SwitcherAsk } from './asked'
import { ATEM, type AtemInput, type AtemState } from './atem'

/**
 * A request to the switcher (./asked) worked out against what it says about
 * itself: which input, the commands, and what to say once they're done.
 *
 * Cuts happen at once, with Undo (a cut back). Fading the program to black
 * is asked first: everyone watching sees it.
 */

export type InputFound =
  | { kind: 'one'; input: AtemInput }
  | { kind: 'several'; options: AtemInput[] }
  | { kind: 'none' }

/** An input's name, as said: its own long name, else "Camera 2". */
export const inputName = (i: AtemInput | undefined, id?: number) =>
  i?.long || i?.short || (id !== undefined ? `Input ${id}` : 'that input')

/** The input meant: "camera 2" by its number, else by its name on the switcher. */
export function inputFound(said: string, state: AtemState): InputFound {
  const all = [...state.inputs.values()]
  const n = /^(?:camera|input|in|source)\s*(\d+)$/.exec(said)
  if (n) {
    const input = state.inputs.get(Number(n[1]))
    if (input) return { kind: 'one', input }
  }
  const pick = (list: AtemInput[], names: (i: AtemInput) => string): InputFound => {
    const f = namesFound(said, list.map(names))
    if (f.kind === 'one') return { kind: 'one', input: list[f.n - 1] }
    if (f.kind === 'several')
      return { kind: 'several', options: f.options.map((o) => list[o.n - 1]) }
    return { kind: 'none' }
  }
  // Cameras and other inputs plugged in first; black, bars and media players after.
  for (const list of [all.filter((i) => i.external), all]) {
    for (const names of [(i: AtemInput) => i.long, (i: AtemInput) => i.short]) {
      const f = pick(list, names)
      if (f.kind !== 'none') return f
    }
  }
  return { kind: 'none' }
}

/** What a request does, from the switcher as it is. */
export type Plan =
  | {
      kind: 'commands'
      commands: Uint8Array[]
      /** Said once they're done, from the switcher as it is then; null if it isn't what was meant. */
      said: (after: AtemState) => string | null
      /** Puts it back as it was; what to say. */
      undo: { commands: Uint8Array[]; said: string } | null
    }
  /** Nothing to do, said ("Camera 2 is already live"). */
  | { kind: 'said'; text: string }
  | { kind: 'which input'; options: AtemInput[] }
  | { kind: 'no input'; said: string }

const backTo = (state: AtemState) =>
  state.program === null
    ? null
    : {
        commands: [ATEM.program(state.program)],
        said: `Back to ${inputName(state.inputs.get(state.program), state.program)}.`,
      }

/** What's live, said: "Camera 1 is live, and Camera 2 is on preview." */
export function liveSaid(state: AtemState): string {
  const program =
    state.program === null ? null : inputName(state.inputs.get(state.program), state.program)
  const preview =
    state.preview === null ? null : inputName(state.inputs.get(state.preview), state.preview)
  const parts = [
    program ? `${program} is live` : 'I can’t tell what’s live',
    ...(preview ? [`${preview} is on preview`] : []),
  ]
  return `${parts.join(', and ')}.${state.black ? ' The program is faded to black.' : ''}`
}

/** The plan for a request; `input` is the one picked, when several fit what was said. */
export function planFor(ask: SwitcherAsk, state: AtemState, picked?: AtemInput): Plan {
  if (ask.kind === 'which') return { kind: 'said', text: liveSaid(state) }
  if (ask.kind === 'black') {
    if (state.black) return { kind: 'said', text: 'The program is already faded to black.' }
    return {
      kind: 'commands',
      commands: [ATEM.fadeToBlack()],
      said: () => 'Fading to black.',
      undo: { commands: [ATEM.fadeToBlack()], said: 'Fading back up from black.' },
    }
  }
  if (ask.kind === 'unblack') {
    if (!state.black) return { kind: 'said', text: 'The program isn’t faded to black.' }
    return {
      kind: 'commands',
      commands: [ATEM.fadeToBlack()],
      said: () => 'Fading back up from black.',
      undo: { commands: [ATEM.fadeToBlack()], said: 'Fading to black again.' },
    }
  }
  if (ask.kind === 'take') {
    if (state.preview === null) return { kind: 'said', text: 'There’s nothing on preview to take.' }
    const name = inputName(state.inputs.get(state.preview), state.preview)
    if (state.preview === state.program) return { kind: 'said', text: `${name} is already live.` }
    return {
      kind: 'commands',
      commands: [ask.how === 'cut' ? ATEM.cut() : ATEM.auto()],
      // A transition takes a moment: the program changes when it ends.
      said: (after) =>
        ask.how === 'auto'
          ? `Taking ${name} live.`
          : after.program === state.preview
            ? `${name} is live.`
            : null,
      undo: backTo(state),
    }
  }

  const found: InputFound = picked ? { kind: 'one', input: picked } : inputFound(ask.input, state)
  if (found.kind === 'several') return { kind: 'which input', options: found.options }
  if (found.kind === 'none') return { kind: 'no input', said: ask.input }
  const input = found.input
  const name = inputName(input, input.id)

  if (ask.kind === 'preview') {
    if (state.preview === input.id) return { kind: 'said', text: `${name} is already on preview.` }
    return {
      kind: 'commands',
      commands: [ATEM.preview(input.id)],
      said: (after) => (after.preview === input.id ? `${name} is on preview.` : null),
      undo:
        state.preview === null
          ? null
          : {
              commands: [ATEM.preview(state.preview)],
              said: `${inputName(state.inputs.get(state.preview), state.preview)} is back on preview.`,
            },
    }
  }
  if (state.program === input.id) return { kind: 'said', text: `${name} is already live.` }
  if (ask.kind === 'dissolve') {
    return {
      kind: 'commands',
      commands: [ATEM.preview(input.id), ATEM.auto()],
      said: () => `Dissolving to ${name}.`,
      undo: backTo(state),
    }
  }
  return {
    kind: 'commands',
    commands: [ATEM.program(input.id)],
    said: (after) => (after.program === input.id ? `${name} is live.` : null),
    undo: backTo(state),
  }
}
