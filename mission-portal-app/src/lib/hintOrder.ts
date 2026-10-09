/**
 * Which song titles the phone's speech recognition is told to expect first.
 *
 * It takes a hundred phrases at most (SongListener), so with a large
 * library not every title fits, and the order decides which do:
 *
 * 1. Titles with words that are not English — Agnus Dei, Hosanna, Abba,
 *    Kyrie. Recognition writes what it thinks it heard in English ("Agnes
 *    Day"), so these are the ones it cannot get right without being told.
 * 2. Songs this device has had to be corrected to — picked from the
 *    guesses or searched for after being misheard: proven hard to hear.
 * 3. Songs in a set list for the next two weeks: what is about to be asked
 *    for.
 * 4. The rest, alphabetically, so the order is the same every time.
 *
 * The finding itself is not limited by this: whatever is heard is compared
 * with every title (songRequest).
 */

/** Words in worship song titles that are not English, or not ordinary English. */
const NOT_ENGLISH = new Set(
  [
    // Latin
    'agnus',
    'dei',
    'deo',
    'gloria',
    'excelsis',
    'kyrie',
    'eleison',
    'christe',
    'sanctus',
    'benedictus',
    'domine',
    'domini',
    'dominus',
    'pater',
    'noster',
    'venite',
    'adoremus',
    'magnificat',
    'nunc',
    'dimittis',
    'te',
    'deum',
    'regina',
    'ave',
    'maria',
    'veni',
    'emmanuel',
    'immanuel',
    'jubilate',
    'laudate',
    'dona',
    'nobis',
    'pacem',
    'miserere',
    'alleluia',
    'adeste',
    'fideles',
    'ubi',
    'caritas',
    'credo',
    'gratia',
    'soli',
    // Hebrew and Aramaic
    'hosanna',
    'hallelujah',
    'halleluyah',
    'abba',
    'maranatha',
    'shalom',
    'selah',
    'el',
    'shaddai',
    'adonai',
    'elohim',
    'yahweh',
    'jehovah',
    'jireh',
    'nissi',
    'rapha',
    'rohi',
    'roi',
    'shammah',
    'tsidkenu',
    'olam',
    'kadosh',
    'baruch',
    'hashem',
    'yeshua',
    'ruach',
    'emet',
    'chesed',
    'ebenezer',
    'elyon',
    'gibbor',
    'mekoddishkem',
    'shekinah',
    'amen',
    // Greek
    'agape',
    'logos',
    'kyrios',
    'christos',
    'ichthys',
    // Spanish and Portuguese, often sung in English services
    'dios',
    'santo',
    'senor',
    'aleluya',
    'cristo',
    'gracias',
    'espiritu',
    'jesucristo',
  ].map((w) => w.toLowerCase())
)

const words = (title: string) =>
  title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

/** Whether a title has a word recognition will not write down right unaided. */
export function hasForeignWord(title: string): boolean {
  return words(title).some((w) => NOT_ENGLISH.has(w))
}

/** The sheets in set lists dated from `today` to `days` after, as ids. */
export function upcomingSheetIds(
  setLists: { eventDate?: string | null; songs: { chordSheetId?: string | number | null }[] }[],
  today: string,
  days = 14
): Set<string> {
  const until = new Date(`${today}T00:00:00Z`)
  until.setUTCDate(until.getUTCDate() + days)
  const last = until.toISOString().slice(0, 10)
  const ids = new Set<string>()
  for (const list of setLists) {
    const date = list.eventDate ?? ''
    if (!/^\d{4}-\d{2}-\d{2}/.test(date) || date.slice(0, 10) < today || date.slice(0, 10) > last) {
      continue
    }
    for (const song of list.songs) if (song.chordSheetId != null) ids.add(String(song.chordSheetId))
  }
  return ids
}

/** `sheets` in the order their titles should be hinted (see above). */
export function orderForHints<T extends { id: string | number; title: string }>(
  sheets: T[],
  upcoming: Set<string>,
  taught: Set<string> = new Set()
): T[] {
  const rank = (s: T) =>
    hasForeignWord(s.title) ? 0 : taught.has(String(s.id)) ? 1 : upcoming.has(String(s.id)) ? 2 : 3
  return [...sheets].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title))
}
