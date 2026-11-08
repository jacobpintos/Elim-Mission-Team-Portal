import { withDigits } from './channelMove'
import { wingGet, wingSet } from './wing'
import type { DeskLink } from './x32'

/**
 * Scenes (the WING calls them snapshots) on a WING, from outside it: which is
 * on, the next or the one before, or one from the show's list by its number.
 *
 * The WING lets a remote app recall what's in the open show's list, through
 * its library control (/$ctl/lib): the item's number in /$actionidx, then GO
 * in /$action; or GONEXT and GOPREV. What's on is /$active (its name),
 * /$actidx (its number) and /$actshow (the show). A show must be open on the
 * desk: none can be opened from outside it, and nothing can be saved from
 * outside it either, so saving is done on the desk. As the WING's tree has
 * these, and as WING users have reported recalling items by number; how the
 * desk numbers its list is to be checked on it, which is why what's on after
 * a recall is read back and said.
 */

export type SceneAsk =
  | { kind: 'next' }
  | { kind: 'previous' }
  /** "What scene are we on?" */
  | { kind: 'which' }
  /** "Load scene 3": its number on the show's list. */
  | { kind: 'number'; n: number }
  /** "Load the Sunday scene": its number to be asked for. */
  | { kind: 'name'; name: string }
  /** "Save the scene": not from outside the desk. */
  | { kind: 'save' }

const SCENE = '(?:scene|snapshot|snap)'
const LOAD =
  '(?:load|recall|go\\s+to|switch\\s+to|change\\s+to|bring\\s+up|pull\\s+up|put\\s+up|fire|run)'

/**
 * Asked about a scene: "next scene", "go back a scene", "load scene 3",
 * "load the Sunday scene", "what scene are we on?", "save the scene". Null
 * when it isn't about one.
 */
export function sceneAsked(said: string): SceneAsk | null {
  const s = withDigits(
    said
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/[.!?]+$/, '')
  ).trim()
  if (!new RegExp(`\\b${SCENE}s?\\b`).test(s)) return null
  if (new RegExp(`\\b(?:save|store|update|overwrite)\\b.*\\b${SCENE}\\b`).test(s)) {
    return { kind: 'save' }
  }
  if (new RegExp(`\\b(?:next|following)\\s+${SCENE}\\b|\\b${SCENE}\\s+forward\\b`).test(s)) {
    return { kind: 'next' }
  }
  if (
    new RegExp(
      `\\b(?:previous|prior|last)\\s+${SCENE}\\b|\\bback\\s+(?:a|one)\\s+${SCENE}\\b|\\b${SCENE}\\s+back\\b`
    ).test(s)
  ) {
    return { kind: 'previous' }
  }
  const number = new RegExp(`\\b${SCENE}\\s+(?:number\\s+)?(\\d{1,4})\\b`).exec(s)
  if (number) return { kind: 'number', n: Number(number[1]) }
  if (
    new RegExp(`\\b(?:what|which)\\b.*\\b${SCENE}\\b|\\b(?:current|active)\\s+${SCENE}\\b`).test(
      s
    ) &&
    !new RegExp(`\\b${LOAD}\\b`).test(s)
  ) {
    return { kind: 'which' }
  }
  // "The scene called Wednesday" first: "the" alone isn't a scene's name.
  const named =
    new RegExp(`\\b${LOAD}\\s+(?:the\\s+)?${SCENE}\\s+(?:called|named|for)\\s+(.+)$`).exec(s) ??
    new RegExp(`\\b${LOAD}\\s+(?:the\\s+)?(.+?)\\s+${SCENE}\\b`).exec(s)
  if (named) {
    const name = named[1].replace(/^(?:the|a)\s+/, '').trim()
    return name && !/^(?:the|a|this|that)$/.test(name) ? { kind: 'name', name } : null
  }
  return null
}

const LIB = {
  show: '/$ctl/lib/$actshow',
  active: '/$ctl/lib/$active',
  activeIdx: '/$ctl/lib/$actidx',
  idx: '/$ctl/lib/$actionidx',
  action: '/$ctl/lib/$action',
}

/** What's on: the open show (or '' with none open), the scene's name and its number. */
export interface SceneNow {
  show: string
  name: string
  n: number | null
}

/** A scene's name as said: its last part, without a file's ending ("Shows/Sunday.snap" is "Sunday"). */
export const sceneSaid = (name: string) =>
  name
    .split(/[\\/]/)
    .pop()!
    .replace(/\.(?:snap|scn|show)$/i, '')
    .trim()

/** Which scene is on, or null when the WING can't be reached. */
export async function sceneNow(raw: DeskLink): Promise<SceneNow | null> {
  const show = await wingGet(raw, LIB.show, 's')
  const active = await wingGet(raw, LIB.active, 's')
  if (!show && !active) return null
  const n = await wingGet(raw, LIB.activeIdx, 'i')
  return {
    show: show?.t === 's' ? show.v.trim() : '',
    name: active?.t === 's' ? sceneSaid(active.v) : '',
    n: n ? Number(n.v) : null,
  }
}

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms))

/**
 * Recalls a scene: the next, the one before, or one by its number on the
 * show's list. Then, after the desk has had a moment, what's on.
 */
export async function goToScene(
  raw: DeskLink,
  to: { kind: 'next' } | { kind: 'previous' } | { kind: 'number'; n: number },
  settleMs = 600
): Promise<SceneNow | null> {
  if (to.kind === 'number') {
    await wingSet(raw, LIB.idx, { t: 'i', v: to.n })
    await wingSet(raw, LIB.action, { t: 's', v: 'GO' })
  } else {
    await wingSet(raw, LIB.action, { t: 's', v: to.kind === 'next' ? 'GONEXT' : 'GOPREV' })
  }
  if (settleMs) await pause(settleMs)
  return sceneNow(raw)
}
