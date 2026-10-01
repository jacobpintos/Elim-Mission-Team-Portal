import { create } from 'zustand'
import type { AudioPlayer } from 'expo-audio'
import type { LoopRange } from '@/lib/audioSeek'

/**
 * The player each reference track is playing through, by its URL.
 *
 * A track's player lives in its card on the set list. Open that song's chord
 * sheet and the card is still there underneath — still playing — but out of
 * reach. The chord sheet finds the same player here and draws its own
 * controls for it, so pausing, skipping or scrubbing from the sheet moves the
 * one track that is sounding rather than starting a second copy.
 *
 * Looked up, not handed down, because the player is replaced whenever its
 * source is — the offline copy taking over from the stream does that — and
 * anything holding the old one would be holding a player that has gone.
 */
interface AudioPlayersStore {
  players: Record<string, AudioPlayer>
  register: (url: string, player: AudioPlayer) => void
  unregister: (url: string, player: AudioPlayer) => void

  /**
   * Speed and loop, by track.
   *
   * Kept here rather than on the player for the same reason the player is:
   * the card and the chord sheet both show them and either may change them,
   * and the player itself is replaced when the offline copy takes over. The
   * card that owns the player applies them to whichever player it has.
   */
  rates: Record<string, number>
  loops: Record<string, LoopRange | null>
  setRate: (url: string, rate: number) => void
  setLoop: (url: string, loop: LoopRange | null) => void
  /** Forget a track's speed and loop — when its set list is closed. */
  clearSettings: (url: string) => void
}

export const useAudioPlayersStore = create<AudioPlayersStore>((set, get) => ({
  players: {},

  register: (url, player) => set({ players: { ...get().players, [url]: player } }),

  // Only the player that is registered may take itself out: a card that has
  // swapped to its offline copy must not be removed by the old player's
  // cleanup running after the new one has registered.
  unregister: (url, player) => {
    if (get().players[url] !== player) return
    const players = { ...get().players }
    delete players[url]
    set({ players })
  },

  rates: {},
  loops: {},
  setRate: (url, rate) => set({ rates: { ...get().rates, [url]: rate } }),
  setLoop: (url, loop) => set({ loops: { ...get().loops, [url]: loop } }),
  clearSettings: (url) => {
    const rates = { ...get().rates }
    const loops = { ...get().loops }
    delete rates[url]
    delete loops[url]
    set({ rates, loops })
  },
}))
