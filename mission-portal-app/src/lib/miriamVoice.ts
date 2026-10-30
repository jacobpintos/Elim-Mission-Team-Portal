/**
 * Miriam's voice: the most natural woman's voice in US English that this
 * phone or browser has, rather than whichever it gives by default — which
 * on many is a man's, or the oldest and most robotic of its voices.
 *
 * Best first: a voice made to sound natural (an iPhone's "premium" or
 * "enhanced" download, Microsoft's "Natural" voices in Edge, Google's
 * network voices on Android), then a woman's voice by name, then any
 * US English voice. Nothing here is downloaded: only what is there is used.
 */
export interface VoiceInfo {
  id: string
  name: string
  lang: string
  /** expo-speech: "Enhanced" for an iPhone's downloaded voices. */
  quality?: string
}

/** Women's voices, by the names they go by on iPhones, Macs, Windows and Chrome. Best first. */
const WOMEN = [
  'ava',
  'zoe',
  'samantha',
  'allison',
  'susan',
  'nicky',
  'aria',
  'jenny',
  'michelle',
  'emma',
  'joanna',
  'salli',
  'kendra',
  'kimberly',
  'google us english',
  'zira',
  'victoria',
  'karen',
  'moira',
  'tessa',
]
/** Android's Google voices for US English that are women's (en-us-x-sfg, …). */
const ANDROID_WOMEN = ['sfg', 'tpf', 'iob', 'iog', 'tpc']
/** Men's, never picked over a woman's. */
const MEN =
  /\b(?:alex|fred|daniel|aaron|arthur|evan|nathan|tom|guy|davis|tony|jason|eric|christopher|roger|ralph|junior|gordon|lee|oliver|rishi|reed|rocko|grandpa|eddy|david|mark|george|ryan|steffan|andrew|brian|male)\b|-(?:iom|tpd|iol)-/i

/** How natural it sounds: 2 made to sound natural, 1 good, 0 the plainest. */
function polish(v: VoiceInfo): number {
  const id = `${v.id} ${v.name}`.toLowerCase()
  if (/premium|natural|neural|online/.test(id)) return 2
  if (v.quality === 'Enhanced' || /enhanced|network/.test(id)) return 1
  return 0
}

/** Whose voice: 2 a woman's we know, 1 not known to be a man's, 0 a man's. */
function hers(v: VoiceInfo): number {
  const id = `${v.id} ${v.name}`.toLowerCase()
  if (MEN.test(id)) return 0
  const android = id.match(/en-us-x-([a-z]{3})-/)
  if (android) return ANDROID_WOMEN.includes(android[1]) ? 2 : 0
  return WOMEN.some((w) => id.includes(w)) ? 2 : 1
}

/** Earlier in WOMEN is better, among those alike otherwise. */
function rank(v: VoiceInfo): number {
  const id = `${v.id} ${v.name}`.toLowerCase()
  const at = WOMEN.findIndex((w) => id.includes(w))
  return at < 0 ? WOMEN.length : at
}

const usEnglish = (v: VoiceInfo) => /^en[-_]us$/i.test(v.lang)

/**
 * Edge's "Multilingual" voices ("Microsoft AvaMultilingual Online
 * (Natural)") work out each sentence's language from its words, so a short
 * one — a list of Bible references, a name — can come out in Spanish.
 * Taken only when there is nothing else.
 */
const multilingual = (v: VoiceInfo) => /multilingual/i.test(`${v.id} ${v.name}`)

/** The voice to speak in, or null to leave it to the phone or browser. */
export function pickVoice(voices: VoiceInfo[]): VoiceInfo | null {
  const english = voices.filter(usEnglish)
  const any = english.length ? english : voices.filter((v) => /^en/i.test(v.lang))
  const oneLanguage = any.filter((v) => !multilingual(v))
  const pool = oneLanguage.length ? oneLanguage : any
  const best = [...pool].sort(
    (a, b) => hers(b) - hers(a) || polish(b) - polish(a) || rank(a) - rank(b)
  )[0]
  // A man's only, or nothing: the default, which may be better than guessing.
  return best && hers(best) > 0 ? best : null
}
