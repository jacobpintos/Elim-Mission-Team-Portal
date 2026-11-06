import { choicePicked, listed, saidNeverMind, saidNo, saidYes } from '@/lib/miriamReplies'
import { mixerAsked, plainlyTheDesk, type MixerAsk } from '@/lib/mixer/asked'
import { aim, earsFound, micsOf, workOut, type Target } from '@/lib/mixer/desk'
import {
  resetSwaps,
  sameName,
  swapsListed,
  swapsSaid,
  withSwaps,
  SWAP_HOURS,
  type Swap,
} from '@/lib/mixer/swaps'
import { readDeskNames, type DeskLink, type DeskNames } from '@/lib/mixer/x32'
import type { Here, Talk } from './localTalk'

/**
 * Miriam and the sound desk, worked out on the phone with no internet: the
 * church's X32 is on its own Wi-Fi, and the phone talks to it directly
 * (lib/mixer). For Sound Engineers (Admin → Leadership Team).
 *
 *   "mute Mitch EG", "Mitch EG down 10% in the house",
 *   "more bass in Mia's ears", "Mia is using Sunny's pack",
 *   "Mia is using Jacob's mic", "reset the packs"
 *
 * Muting and turning down are done at once, with Undo; unmuting and turning
 * up are asked first (lib/mixer/desk).
 */

/** Whether this phone can reach the desk, and why not. */
export type DeskAccess =
  | { kind: 'ready'; link: DeskLink }
  | { kind: 'not engineer' }
  /** The website: a browser can't talk to the desk. */
  | { kind: 'no app' }
  /** The phone app, before the desk's address is set. */
  | { kind: 'no address' }

/** Pack and mic swaps, kept on this phone. */
export interface SwapStore {
  load: () => Promise<Swap[]>
  save: (swaps: Swap[]) => Promise<void>
}

const NOT_ENGINEER =
  'Only Sound Engineers can change the sound desk. An admin can make you one on the Leadership Team screen.'
const NO_APP = 'I can change the sound desk only from the phone app, on the desk’s Wi-Fi.'
const NO_ADDRESS =
  'I don’t know where the sound desk is yet. Put its address in Settings, under Sound desk.'
const UNREACHABLE = 'I can’t reach the sound desk. Is this phone on its Wi-Fi?'
const NOT_TAKEN = 'The desk didn’t take that. Try again, or change it in MX-Q.'
const STREAM = 'The livestream is mixed in Pro Tools, so I can’t change it from here.'

/** The desk's names, read again after this long, or when a name isn't found. */
const NAMES_MS = 30_000
let names: { at: number; names: DeskNames } | null = null

async function deskNames(link: DeskLink, now: number, fresh = false): Promise<DeskNames | null> {
  if (names && !fresh && now - names.at < NAMES_MS) return names.names
  const read = await readDeskNames(link)
  if (read) names = { at: now, names: read }
  return read
}

/** The names last read from the desk, however old: for knowing a channel when the desk can't be reached. */
export const lastDeskNames = () => names?.names ?? null

/** Forgets the desk's names (tests, or another desk's address). */
export function forgetDeskNames(): void {
  names = null
}

const firstName = (here: Here) => (here.profile?.displayName ?? '').trim().split(/\s+/)[0] ?? ''

/** Worked out here: a request to the desk, or about who is using whose pack or mic. False to leave it. */
export async function mixerHere(said: string, here: Here, talk: Talk): Promise<boolean> {
  if (!here.desk) return false
  // Read first, so the desk is only looked for when it's asked for.
  const swapped = swapsSaid(said)
  const ask = swapped ? null : mixerAsked(said)
  if (!swapped && !ask) return false
  const access = await here.desk()
  if (swapped) {
    if (access.kind === 'not engineer') {
      talk.say(NOT_ENGINEER)
      return true
    }
    await swapsHere(swapped, access, here, talk)
    return true
  }
  if (!ask) return false
  const plainly = plainlyTheDesk(ask)
  if (access.kind !== 'ready') {
    // A plain "mute X" from someone who can't use the desk may be about a chat.
    if (!plainly) return false
    talk.say(
      access.kind === 'not engineer' ? NOT_ENGINEER : access.kind === 'no app' ? NO_APP : NO_ADDRESS
    )
    return true
  }
  if (ask.place?.kind === 'stream') {
    talk.say(STREAM)
    return true
  }
  talk.thinking()
  const now = here.now()
  const read = await deskNames(access.link, now)
  if (!read) {
    // Not reached: said so only when it's plainly the desk, or a channel it had.
    const known = lastDeskNames()
    const isChannel = known ? aimAt(ask, known, [], here, now).kind === 'target' : false
    if (!plainly && !isChannel) return false
    talk.say(UNREACHABLE)
    return true
  }
  const swaps = (await here.swaps?.load()) ?? []
  let aimed = aimAt(ask, read, swaps, here, now)
  if (aimed.kind === 'no channel' && names && now - names.at > 5000) {
    // Renamed since it was read: read again, once.
    const again = await deskNames(access.link, now, true)
    if (again) aimed = aimAt(ask, again, swaps, here, now)
  }
  return aimedHere(ask, aimed, access.link, read, swaps, here, talk, plainly)
}

const aimAt = (ask: MixerAsk, n: DeskNames, swaps: readonly Swap[], here: Here, now: number) =>
  aim(ask, n, swaps, firstName(here), now)

async function aimedHere(
  ask: MixerAsk,
  aimed: ReturnType<typeof aim>,
  link: DeskLink,
  read: DeskNames,
  swaps: readonly Swap[],
  here: Here,
  talk: Talk,
  plainly: boolean
): Promise<boolean> {
  switch (aimed.kind) {
    case 'stream':
      talk.say(STREAM)
      return true
    case 'no channel':
      if (!plainly) return false
      talk.say(`I can’t find a channel called “${ask.channel}” on the desk.`)
      return true
    case 'no mix':
      talk.say(`There’s no in-ear mix named after ${aimed.who} on the desk.`)
      return true
    case 'which channel':
    case 'which mix': {
      const options = aimed.options.map((o) => o.name || `Channel ${o.n}`)
      talk.ask(`Which one: ${listed(options, 'or')}?`, async (r, t) => {
        if (saidNeverMind(r)) {
          t.say('Okay — nothing was changed.')
          return true
        }
        const i = choicePicked(r, options)
        if (i < 0) return false
        const picked = aimed.options[i]
        if (aimed.kind === 'which mix') {
          const ears = { bus: picked.n, busName: picked.name, ...aimed.ears }
          await changeHere(ask, { ...aimed.target, ears }, link, t)
          return true
        }
        // The channel picked, by its number, so it can't be mistaken again.
        const next: MixerAsk = { ...ask, channel: `channel ${picked.n}` }
        return aimedHere(
          next,
          aimAt(next, read, swaps, here, here.now()),
          link,
          read,
          swaps,
          here,
          t,
          true
        )
      })
      return true
    }
    case 'target':
      await changeHere(ask, aimed.target, link, talk)
      return true
  }
}

async function changeHere(ask: MixerAsk, target: Target, link: DeskLink, talk: Talk) {
  const worked = await workOut(link, ask, target)
  if (worked.kind === 'unreachable') return talk.say(UNREACHABLE)
  if (worked.kind === 'said') return talk.say(worked.text)
  const { change } = worked
  const make = async (t: Talk) => {
    t.thinking()
    const text = await change.make()
    if (!text) return t.say(NOT_TAKEN)
    if (t.done) t.done(text, change.undo)
    else t.say(text)
  }
  if (!change.askFirst) return make(talk)
  talk.ask(change.question, async (r, t) => {
    if (saidYes(r)) {
      await make(t)
      return true
    }
    if (saidNeverMind(r) || saidNo(r)) {
      t.say('Okay — left as it is.')
      return true
    }
    return false
  })
}

// --- Who is using whose pack or mic ------------------------------------------------

async function swapsHere(
  said: NonNullable<ReturnType<typeof swapsSaid>>,
  access: DeskAccess,
  here: Here,
  talk: Talk
) {
  const store = here.swaps
  if (!store) return talk.say(NO_APP)
  const now = here.now()
  const swaps = await store.load()
  if (said.kind === 'which') return talk.say(swapsListed(swaps, now))
  if (said.kind === 'reset') {
    await store.save(resetSwaps(swaps, said.items, now))
    const what =
      said.items.length === 2 ? 'packs and mics' : said.items[0] === 'pack' ? 'packs' : 'mics'
    return talk.say(`Okay — everyone is on their own ${what} again.`)
  }
  // Checked against the desk when it can be reached: a pack or mic with
  // nothing on the desk named after its owner can't be used.
  const desk = access.kind === 'ready' ? await deskNames(access.link, now) : null
  const missing = desk
    ? said.pairs.filter(
        (p) =>
          !sameName(p.user, p.owner) &&
          (p.item === 'pack'
            ? earsFound(p.owner, desk).kind === 'none'
            : micsOf(p.owner, desk.channels).length === 0)
      )
    : []
  const pairs = said.pairs.filter((p) => !missing.includes(p))
  const { swaps: next, moved } = withSwaps(swaps, pairs, now)
  await store.save(next)
  const parts = pairs.map((p) =>
    sameName(p.user, p.owner)
      ? `${p.user} is on their own ${p.item}`
      : `${p.user} has ${p.owner}’s ${p.item}`
  )
  const lines: string[] = []
  if (parts.length) {
    const lasting = pairs.some((p) => !sameName(p.user, p.owner))
      ? ` for the next ${SWAP_HOURS} hours, or until you reset the ${
          pairs.every((p) => p.item === 'mic')
            ? 'mics'
            : pairs.every((p) => p.item === 'pack')
              ? 'packs'
              : 'packs and mics'
        }`
      : ''
    lines.push(`Okay — ${listed(parts, 'and')}${lasting}.`)
  }
  for (const m of moved) lines.push(`${m.from} no longer has ${m.owner}’s ${m.item}.`)
  for (const p of missing) {
    lines.push(
      p.item === 'pack'
        ? `There’s no in-ear mix named after ${p.owner} on the desk, so I can’t use their pack.`
        : `There’s no mic channel named after ${p.owner} on the desk, so I can’t use their mic.`
    )
  }
  talk.say(lines.join(' '))
}
