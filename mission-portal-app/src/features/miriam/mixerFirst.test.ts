import { describe, expect, it } from 'vitest'
import { comingAsked } from '@/lib/miriamComing'
import { meetingAsked } from '@/lib/miriamMeeting'
import { playAsked } from '@/lib/miriamQuick'
import { locationAsked, nameChangeAsked, themeAsked } from '@/lib/miriamSettings'
import { storeAsked } from '@/lib/miriamStore'
import { tourAsked } from '@/lib/miriamTour'
import { occasionAsked } from '@/lib/occasions'
import { reminderAsked } from '@/lib/reminders'
import { mixerAsked } from '@/lib/mixer/asked'
import { swapsSaid } from '@/lib/mixer/swaps'
import { selfAsked } from '../../../functions/src/miriam/own/self'
import { switcherAsked } from '@/lib/switcher/asked'

/**
 * What a Sound Engineer says to the desk reaches it: none of what Miriam
 * checks before her conversations on the phone (./useMiriamConversation,
 * then ./localTalk, where the desk is first) takes it for something else.
 */
const SAID = [
  'mute Mitch EG',
  'unmute Mitch EG',
  'decrease Mitch EG channel in the house by 10%',
  'Mitch EG down 10% in the house',
  'mute the bass in Mia’s ears',
  'more bass in my ears',
  'turn the pastor down a little',
  'bring up the keys 3 dB in Sarah’s ears',
  'take Mitch EG out of the house',
  'Mia is using Sunny’s pack, and Sunny is using Mia’s pack',
  'Joel is using Jacob’s pack',
  'Mia is using Jacob’s mic',
  'reset the packs',
  'who’s using whose pack?',
]

describe('desk requests, as Miriam first hears them', () => {
  it.each(SAID)('“%s” is the desk’s', (said) => {
    expect(mixerAsked(said) ?? swapsSaid(said)).not.toBeNull()
    expect(reminderAsked(said, new Date(2026, 10, 8, 10))).toBeNull()
    expect(tourAsked(said)).toBeNull()
    expect(playAsked(said)).toBeFalsy()
    expect(meetingAsked(said)).toBeNull()
    expect(selfAsked(said)).toBe(false)
    expect(storeAsked(said)).toBeNull()
    expect(themeAsked(said)).toBeNull()
    expect(nameChangeAsked(said)).toBeNull()
    expect(locationAsked(said)).toBeNull()
    expect(comingAsked(said)).toBeNull()
    expect(occasionAsked(said, '2026-11-08')).toBeNull()
  })
})

/** Likewise for the video switcher, which comes after the desk: the desk leaves these alone. */
const CAMERAS = [
  'camera 2',
  'cut to the wide shot',
  'switch to camera 3',
  'go to the pulpit cam',
  'preview the pulpit cam',
  'put camera 3 on preview',
  'take it',
  'dissolve to camera 3',
  'fade to black',
  'fade back up',
  'what’s live?',
]

describe('switcher requests, as Miriam first hears them', () => {
  it.each(CAMERAS)('“%s” is the switcher’s', (said) => {
    expect(switcherAsked(said)).not.toBeNull()
    expect(mixerAsked(said)).toBeNull()
    expect(swapsSaid(said)).toBeNull()
    expect(reminderAsked(said, new Date(2026, 10, 8, 10))).toBeNull()
    expect(tourAsked(said)).toBeNull()
    expect(playAsked(said)).toBeFalsy()
    expect(meetingAsked(said)).toBeNull()
    expect(selfAsked(said)).toBe(false)
    expect(storeAsked(said)).toBeNull()
    expect(themeAsked(said)).toBeNull()
    expect(nameChangeAsked(said)).toBeNull()
    expect(locationAsked(said)).toBeNull()
    expect(comingAsked(said)).toBeNull()
    expect(occasionAsked(said, '2026-11-08')).toBeNull()
  })
})
