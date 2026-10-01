import { create } from 'zustand'
import type { AudioPlayer } from 'expo-audio'

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
}))
