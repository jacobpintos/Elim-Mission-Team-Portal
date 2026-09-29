import { create } from 'zustand'

interface MediaPlaybackStore {
  /**
   * Whatever is playing right now, identified by its source URL.
   *
   * One slot for every kind of media, not one per kind: a reference track and
   * a YouTube video are both "the song", and hearing them at once is the thing
   * being prevented.
   */
  activeUrl: string | null
  claim: (url: string) => void
  release: (url: string) => void
}

/**
 * What is playing, so that only one thing ever is.
 *
 * A set list renders a player per song and a video player over the top of
 * them, and each one owns its own audio. Two of them sounding at once is not
 * something anyone asks for, and the way you get there is ordinary: start a
 * track, scroll, press play on the next — or open the video of the song you
 * are already listening to.
 *
 * The players coordinate through this rather than being driven by a parent,
 * because they are rendered in several places (the set list modal, the same
 * modal reached from Assignments, Content's own video player) and a parent
 * would have to be taught the same trick in each.
 */
export const useMediaPlaybackStore = create<MediaPlaybackStore>((set, get) => ({
  activeUrl: null,

  claim: (url) => set({ activeUrl: url }),

  // Only whatever currently holds the slot may give it up: a track ending
  // after a video has started must not clear the video.
  release: (url) => {
    if (get().activeUrl === url) set({ activeUrl: null })
  },
}))
