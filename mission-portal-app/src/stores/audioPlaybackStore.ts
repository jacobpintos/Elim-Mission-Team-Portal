import { create } from 'zustand'

interface AudioPlaybackStore {
  /** Whatever is playing right now, identified by its source URL. */
  activeUrl: string | null
  claim: (url: string) => void
  release: (url: string) => void
}

/**
 * Which reference track is playing, so that only one ever is.
 *
 * A set list renders a player per song, and each one owns its own audio. Two
 * tracks playing over each other is not something anyone asks for, and the way
 * you get there is ordinary: play a song, scroll, press play on the next.
 *
 * The players coordinate through this rather than being driven by a parent,
 * because they are rendered in three places (the set list modal, the same
 * modal reached from Assignments, and anywhere a song is shown later) and a
 * parent would have to be taught the same trick in each.
 */
export const useAudioPlaybackStore = create<AudioPlaybackStore>((set, get) => ({
  activeUrl: null,

  claim: (url) => set({ activeUrl: url }),

  // Only the player that currently holds the slot may give it up: a track
  // ending after another has already started must not clear the new one.
  release: (url) => {
    if (get().activeUrl === url) set({ activeUrl: null })
  },
}))
