import { eventRef } from './miriamQuick'
import { plain, withoutAsking, withoutEnding } from './miriamReplies'

/**
 * A change to an event's cars, said to Miriam by an admin — "put Sam in Andy's
 * truck", "make Beth the driver of van 1", "take Sam out of the van", "add a
 * child named Joey to van 1", each perhaps "for the retreat" or "on
 * Saturday". Worked out on the device (features/miriam/localTalk), and made
 * as the carpool builder makes it (features/events/carpoolCards).
 */
export type CarpoolMove = {
  /** The event, as far as it was said; both empty when it wasn't. */
  event: { date: string | null; name: string }
  /** The car, as said: "andy's truck". Empty for "take Sam out of the carpool". */
  car: string
} & ({ kind: 'driver' | 'passenger' | 'out'; who: string } | { kind: 'child'; child: string })

/** The car as said, without the word before it: "the van" — "van". */
const carSaid = (s: string) => s.replace(/^(?:the|their|his|her|a)\s+/, '').trim()

/** Any car at all: "out of the carpool", "out of their car". */
const ANY_CAR =
  /^(?:the\s+)?(?:carpool|car\s*pool|cars|their\s+car|his\s+car|her\s+car|any\s+car|a\s+car)$/

export function carpoolAsked(text: string, today: string): CarpoolMove | null {
  let s = withoutEnding(plain(withoutAsking(plain(text))))
  // What it is for, if said: "… for the retreat", "… on saturday".
  let event: { date: string | null; name: string } = { date: null, name: '' }
  const forPart = /\s+(?:for|on|at)\s+(?!the\s+(?:driver|passengers?)\b)(.+)$/.exec(s)
  if (forPart) {
    const ref = eventRef(forPart[1], today)
    if (ref) {
      event = { date: ref.date, name: ref.name }
      s = s.slice(0, forPart.index).trim()
    }
  }
  const tryAll = (
    patterns: [RegExp, (m: RegExpExecArray) => Omit<CarpoolMove, 'event'> | null][]
  ): CarpoolMove | null => {
    for (const [re, read] of patterns) {
      const m = re.exec(s)
      if (!m) continue
      const move = read(m)
      if (move) return { ...move, event } as CarpoolMove
    }
    return null
  }
  return tryAll([
    // "add a child named joey to van 1", "add joey as a child in van 1", "add a kid to van 1 named joey"
    [
      /^add\s+(?:a\s+)?(?:child|kid)\s+(?:named|called)\s+(.+?)\s+(?:to|in|into)\s+(.+)$/,
      (m) => ({ kind: 'child', child: m[1], car: carSaid(m[2]) }),
    ],
    [
      /^add\s+(.+?)\s+as\s+a\s+(?:child|kid)\s+(?:to|in|into)\s+(.+)$/,
      (m) => ({ kind: 'child', child: m[1], car: carSaid(m[2]) }),
    ],
    [
      /^add\s+(?:a\s+)?(?:child|kid)\s+(?:to|in|into)\s+(.+?)\s+(?:named|called)\s+(.+)$/,
      (m) => ({ kind: 'child', child: m[2], car: carSaid(m[1]) }),
    ],
    // "make beth the driver of van 1", "have beth drive van 1", "let beth drive the truck"
    [
      /^(?:make|have|let|set)\s+(.+?)\s+(?:be\s+)?(?:the\s+)?(?:driver\s+(?:of|for|in)|drive)\s+(.+)$/,
      (m) => ({ kind: 'driver', who: m[1], car: carSaid(m[2]) }),
    ],
    // "beth is driving van 1", "beth will drive the truck", "beth should be the driver of van 1"
    [
      /^(.+?)\s+(?:is|will\s+be|should\s+be|is\s+going\s+to\s+be)\s+(?:driving|the\s+driver\s+(?:of|for|in))\s+(.+)$/,
      (m) => ({ kind: 'driver', who: m[1], car: carSaid(m[2]) }),
    ],
    [
      /^(.+?)\s+(?:will|should|can)\s+drive\s+(.+)$/,
      (m) => ({ kind: 'driver', who: m[1], car: carSaid(m[2]) }),
    ],
    // "put beth as the driver of van 1", "move beth to driver of van 1"
    [
      /^(?:put|move|switch|set)\s+(.+?)\s+(?:as|to)\s+(?:the\s+)?driver\s+(?:of|for|in)\s+(.+)$/,
      (m) => ({ kind: 'driver', who: m[1], car: carSaid(m[2]) }),
    ],
    // "take sam out of the van", "remove sam from the carpool"
    [
      /^(?:take|remove|pull|drop|kick)\s+(.+?)\s+(?:out\s+of|from|off(?:\s+of)?)\s+(.+)$/,
      (m) => ({ kind: 'out', who: m[1], car: ANY_CAR.test(m[2]) ? '' : carSaid(m[2]) }),
    ],
    // "put sam in andy's truck", "move sam to van 2", "add sam to the van"
    [
      /^(?:put|add|move|place|seat|switch)\s+(.+?)\s+(?:in|into|to|on)\s+(.+)$/,
      (m) => (ANY_CAR.test(m[2]) ? null : { kind: 'passenger', who: m[1], car: carSaid(m[2]) }),
    ],
  ])
}
