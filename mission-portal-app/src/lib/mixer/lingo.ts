/**
 * How people say what's on the sound desk, and how its scribble strips
 * shorten it: "Sunny's mic", "Sunny vocal" and "Sunny Vox" are the same
 * channel; "electric guitar" is "EG"; "talkback" is "TB". Used by ./desk to
 * match what's said with the desk's names, both read the same way.
 *
 * "Guitar" alone could be electric or acoustic, so it fits either, and when
 * someone has both, Miriam asks which.
 */

/** Two-word names, made one word first: "electric guitar" is "eg". */
const PHRASES: [RegExp, string][] = [
  [/\belectric\s+guitars?\b|\belec\s*gtrs?\b|\be\s*gtrs?\b|\be[\s-]guitars?\b/g, 'eg'],
  [/\bacoustic\s+guitars?\b|\bacc?\s*gtrs?\b|\ba\s*gtrs?\b|\ba[\s-]guitars?\b/g, 'ag'],
  [/\bbass\s+guitars?\b|\bb\s*gtrs?\b/g, 'bass'],
  [/\bbass\s+drums?\b|\bkick\s+drums?\b/g, 'kick'],
  [/\bsnare\s+drums?\b/g, 'snare'],
  [/\btalk\s*back\b/g, 'tb'],
  [/\bhi[\s-]?hats?\b/g, 'hat'],
  [/\bover\s*heads?\b/g, 'oh'],
  [/\b(?:backing|background|backup|harmony)\s+(?:vocals?|vox|singers?|voices?|mics?)\b/g, 'bv'],
  [/\bin[\s-]?ears?\b/g, 'iem'],
  [/\bplay\s*back\b|\bbacking\s+tracks?\b/g, 'tracks'],
]

/** What each word can mean. A word in no list means only itself (a name, usually). */
const MEANINGS: Record<string, string[]> = {
  vocal: [
    'vox',
    'voc',
    'vocs',
    'vocal',
    'vocals',
    'voice',
    'voices',
    'mic',
    'mics',
    'microphone',
    'microphones',
    'singer',
    'singing',
    'sing',
    'lav',
    'lavalier',
    'headset',
    'hs',
    'handheld',
    'wireless',
    'wl',
    // A backing vocal is a vocal, and "HH" on a strip may be a handheld mic.
    'bv',
    'bvs',
    'bgv',
    'bgvs',
    'hh',
  ],
  bv: ['bv', 'bvs', 'bgv', 'bgvs'],
  eg: ['eg', 'egtr', 'egt', 'electric', 'elec', 'guitar', 'guitars', 'gtr', 'gtrs', 'gt'],
  ag: ['ag', 'agtr', 'agt', 'acoustic', 'acc', 'guitar', 'guitars', 'gtr', 'gtrs', 'gt'],
  bass: ['bass', 'bs', 'bas'],
  keys: [
    'keys',
    'key',
    'kb',
    'kbd',
    'kbds',
    'keyboard',
    'keyboards',
    'piano',
    'pno',
    'synth',
    'syn',
  ],
  organ: ['organ', 'org'],
  tb: ['tb', 'talkback'],
  kick: ['kick', 'kik', 'kd', 'bd'],
  snare: ['snare', 'snr', 'sn', 'sd'],
  hat: ['hat', 'hats', 'hh'],
  tom: ['tom', 'toms', 'tm', 'rack', 'floor'],
  oh: ['oh', 'ohs', 'overhead', 'overheads'],
  drums: ['drums', 'drum', 'kit', 'dr'],
  tracks: ['tracks', 'track', 'trk', 'trks', 'trx', 'mtr', 'stems'],
  click: ['click', 'clk', 'metronome'],
  pastor: ['pastor', 'pst', 'pstr', 'preacher', 'sermon'],
  video: ['video', 'vid', 'pc', 'computer', 'comp', 'laptop', 'propresenter', 'pro7', 'pp'],
  violin: ['violin', 'vln', 'vn', 'fiddle'],
  cello: ['cello', 'vc'],
  sax: ['sax', 'saxophone'],
  trumpet: ['trumpet', 'tpt', 'trp'],
  flute: ['flute', 'fl'],
  choir: ['choir', 'chr'],
  ambient: ['ambient', 'amb', 'room', 'crowd', 'audience', 'aud'],
}

const MEANS = new Map<string, Set<string>>()
for (const [meaning, ws] of Object.entries(MEANINGS)) {
  for (const w of ws) {
    const set = MEANS.get(w) ?? new Set<string>()
    set.add(meaning)
    MEANS.set(w, set)
  }
}

/** A name or what was said, its two-word names made one word. */
export const withPhrases = (s: string) => PHRASES.reduce((t, [re, w]) => t.replace(re, w), s)

/** What a word can mean (empty for a word in no list). */
export const meaningsOf = (word: string): ReadonlySet<string> => MEANS.get(word) ?? new Set()

/** Two words that can mean the same thing: "mic" and "vox", "guitar" and "eg". */
export function sameMeaning(a: string, b: string): boolean {
  const x = meaningsOf(a)
  if (!x.size) return false
  for (const m of meaningsOf(b)) if (x.has(m)) return true
  return false
}

/** A word for someone's mic: "vox", "vocal", "mic", "lav". */
export const isMicWord = (word: string) => meaningsOf(word).has('vocal')
