import type { OscArg } from './osc'
import { wingGet, wingSet, type WingKind } from './wing'
import type { DeskLink } from './x32'

/**
 * Moving channels on a WING (./channelMove for the asking, and the X32's
 * way). Each strip takes every setting it has, as the desk's tree lists them
 * (less what's only shown, the $ ones): its input (so channel 25 still hears
 * input 15), name, colour, icon and whether it takes them from its input,
 * trim, delay, filters, gate, EQ and compressor and their side-chains,
 * inserts, fader, mute, pan and width, its sends to the mains, buses and
 * matrices, and its tags (its DCAs and mute groups). Gain and phantom power
 * belong to the input, where the strip still listens, so they stay.
 *
 * What points at a channel by number follows it too:
 * - direct outs: a user signal (/io/in/USR/N) taken from a channel, which an
 *   output then sends on (to a recorder, or Pro Tools);
 * - gate and compressor side-chains keyed from another channel ("CH.15").
 *
 * A WING has no stereo pairs of channels to keep together: a channel is
 * stereo itself. Snapshots can be recalled from outside the desk, but not
 * saved, so one saved before the move is saved again on the desk.
 */

/** A channel strip's settings under /ch/N/, as the desk's tree has them, a heading at a time. */
const GROUPS: [string, string][] = [
  ['in/set', 'srcauto:i altsrc:i inv:i trim:f bal:f dlymode:s dly:f dlyon:i'],
  ['in/conn', 'grp:s in:i altgrp:s altin:i'],
  ['flt', 'lc:i lcf:f lcs:s hc:i hcf:f hcs:s tf:i mdl:s tilt:f'],
  [
    '',
    'clink:i col:i name:s icon:i led:i mute:i fdr:f pan:f wid:f solosafe:i mon:s proc:s ptap:s tapwid:f tags:s',
  ],
  ['peq', 'on:i 1g:f 1f:f 1q:f 2g:f 2f:f 2q:f 3g:f 3f:f 3q:f'],
  // Each processor's model before its settings: they're the model's.
  ['gate', 'on:i mdl:s thr:f range:f att:f hld:f rel:f acc:f ratio:s'],
  ['gatesc', 'type:s f:f q:f src:s tap:s'],
  [
    'eq',
    'on:i mdl:s mix:f lg:f lf:f lq:f leq:s 1g:f 1f:f 1q:f 2g:f 2f:f 2q:f 3g:f 3f:f 3q:f 4g:f 4f:f 4q:f hg:f hf:f hq:f heq:s',
  ],
  ['dyn', 'on:i mdl:s mix:f gain:f thr:f ratio:f knee:i det:s att:f hld:f rel:f env:s auto:i'],
  ['dynxo', 'depth:f type:s f:f'],
  ['dynsc', 'type:s f:f q:f src:s tap:s'],
  ['preins', 'on:i ins:s'],
  ['postins', 'on:i mode:s ins:s w:f'],
  ...[1, 2, 3, 4].map((m): [string, string] => [`main/${m}`, 'on:i lvl:f pre:i']),
  ...[
    ...Array.from({ length: 16 }, (_, i) => String(i + 1)),
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((m) => `MX${m}`),
  ].map((s): [string, string] => [`send/${s}`, 'on:i lvl:f pon:i mode:s plink:i pan:f']),
]

/** Every setting on a channel strip: where it is under /ch/N/, and its kind. */
export const WING_CHANNEL_SETTINGS: readonly { path: string; kind: WingKind }[] = GROUPS.flatMap(
  ([head, leaves]) =>
    leaves.split(' ').map((leaf) => {
      const [name, kind] = leaf.split(':') as [string, WingKind]
      return { path: head ? `${head}/${name}` : name, kind }
    })
)

const CHANNELS = 40
/** User signals that can be taken from a channel: what a direct out is on a WING. */
const USER_SIGNALS = 24

const settingsAt = (ch: number) =>
  WING_CHANNEL_SETTINGS.map((s) => ({ ...s, path: `/ch/${ch}/${s.path}` }))
const SIDE_CHAINS = ['gatesc/src', 'dynsc/src']
const userSignal = (k: number) => ({
  grp: `/io/in/USR/${k}/user/grp`,
  in: `/io/in/USR/${k}/user/in`,
})

/** What a move starts from, and Undo puts back: every setting read, by its place, and each moved channel's shown name. */
export interface WingBefore {
  values: Map<string, OscArg>
  shown: Map<number, string>
}

/** Reads these, a few at a time (a WING is asked by few at once): those it answered. */
async function readAll(raw: DeskLink, wanted: readonly { path: string; kind: WingKind }[]) {
  const out = new Map<string, OscArg>()
  for (let i = 0; i < wanted.length; i += 8) {
    const batch = wanted.slice(i, i + 8)
    const values = await Promise.all(batch.map((w) => wingGet(raw, w.path, w.kind)))
    batch.forEach((w, j) => {
      const v = values[j]
      if (v) out.set(w.path, v)
    })
  }
  return out
}

/** Everything a move of these channels reads: their settings, every side-chain, and the user signals. */
function readList(plan: ReadonlyMap<number, number>) {
  return [
    ...[...plan.keys()].flatMap(settingsAt),
    ...Array.from({ length: CHANNELS }, (_, i) => i + 1)
      .filter((ch) => !plan.has(ch))
      .flatMap((ch) => SIDE_CHAINS.map((s) => ({ path: `/ch/${ch}/${s}`, kind: 's' as const }))),
    ...Array.from({ length: USER_SIGNALS }, (_, i) => userSignal(i + 1)).flatMap((u) => [
      { path: u.grp, kind: 's' as const },
      { path: u.in, kind: 'i' as const },
    ]),
  ]
}

/** Reads what a move touches; null when the WING can't be reached. */
export async function wingPrepare(
  raw: DeskLink,
  plan: ReadonlyMap<number, number>
): Promise<WingBefore | null> {
  const first = [...plan.keys()][0]
  if (!first || !(await wingGet(raw, `/ch/${first}/name`, 's'))) return null
  const values = await readAll(raw, readList(plan))
  if (!values.size) return null
  const shown = new Map<number, string>()
  for (const ch of plan.keys()) {
    const v = (await wingGet(raw, `/ch/${ch}/$name`, 's')) ?? values.get(`/ch/${ch}/name`)
    shown.set(ch, v?.t === 's' ? v.v.trim() : '')
  }
  return { values, shown }
}

/** A side-chain's source, its channel moved with the move: "CH.15" to "CH.25". */
const followed = (v: OscArg, plan: ReadonlyMap<number, number>): OscArg => {
  if (v.t !== 's') return v
  const m = /^CH\.(\d+)$/.exec(v.v)
  const to = m ? plan.get(Number(m[1])) : undefined
  return to ? { t: 's', v: `CH.${to}` } : v
}

/** The settings the WING should end with: each strip in its new place, what pointed at it following. */
export function wingLanded(before: WingBefore, plan: ReadonlyMap<number, number>) {
  const values = new Map<string, OscArg>()
  for (const [from, to] of plan) {
    const src = settingsAt(from)
    settingsAt(to).forEach((s, i) => {
      const v = before.values.get(src[i].path)
      if (v) values.set(s.path, v)
    })
  }
  let following = 0
  // Side-chains, wherever they now are, keyed from a channel that moved.
  for (let ch = 1; ch <= CHANNELS; ch++) {
    for (const s of SIDE_CHAINS) {
      const path = `/ch/${ch}/${s}`
      const v = values.get(path) ?? before.values.get(path)
      if (!v) continue
      const now = followed(v, plan)
      if (now !== v) following++
      if (now !== v || values.has(path)) values.set(path, now)
    }
  }
  // Direct outs: user signals taken from a channel that moved.
  for (let k = 1; k <= USER_SIGNALS; k++) {
    const u = userSignal(k)
    const grp = before.values.get(u.grp)
    const input = before.values.get(u.in)
    const to = grp?.v === 'CH' && input ? plan.get(Number(input.v)) : undefined
    if (to) {
      values.set(u.in, { t: 'i', v: to })
      following++
    }
  }
  return { values, following }
}

/** How many direct outs and side-chains a move takes along. */
export const wingFollowing = (before: WingBefore, plan: ReadonlyMap<number, number>) =>
  wingLanded(before, plan).following

const kindOf = (path: string): WingKind => {
  if (/\/user\/grp$/.test(path)) return 's'
  if (/\/user\/in$/.test(path)) return 'i'
  const leaf = path.replace(/^\/ch\/\d+\//, '')
  return WING_CHANNEL_SETTINGS.find((s) => s.path === leaf)?.kind ?? 's'
}

const same = (a: OscArg | null, b: OscArg) =>
  !!a &&
  (a.t === 's' || b.t === 's'
    ? a.v === b.v
    : Math.abs(Number(a.v) - Number(b.v)) <= 1e-3 * Math.max(1, Math.abs(Number(b.v))))

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms))

/** Puts these settings on the WING, reads them back, and sends again what didn't take. What still hasn't is given back. */
async function apply(
  raw: DeskLink,
  values: ReadonlyMap<string, OscArg>,
  pauseMs: number
): Promise<string[]> {
  const send = async (entries: [string, OscArg][]) => {
    for (let i = 0; i < entries.length; i += 24) {
      for (const [path, v] of entries.slice(i, i + 24)) await wingSet(raw, path, v)
      if (pauseMs) await pause(pauseMs)
    }
  }
  const differing = async (entries: [string, OscArg][]) => {
    const now = await readAll(
      raw,
      entries.map(([path]) => ({ path, kind: kindOf(path) }))
    )
    return entries.filter(([path, v]) => !same(now.get(path) ?? null, v))
  }
  let left = [...values]
  await send(left)
  left = await differing(left)
  if (left.length) {
    await send(left)
    left = await differing(left)
  }
  return left.map(([path]) => path)
}

/** Moves the channels on the WING as planned. The settings it didn't take are given back. */
export function wingMove(
  raw: DeskLink,
  plan: ReadonlyMap<number, number>,
  before: WingBefore,
  pauseMs = 10
): Promise<string[]> {
  return apply(raw, wingLanded(before, plan).values, pauseMs)
}

/** Puts every setting back as it was before the move (Undo). */
export function wingPutBack(raw: DeskLink, before: WingBefore, pauseMs = 10): Promise<string[]> {
  return apply(raw, before.values, pauseMs)
}
