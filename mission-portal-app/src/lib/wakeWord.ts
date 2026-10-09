/**
 * Finding "Hey Miriam" in what speech recognition wrote down.
 *
 * Recognisers spell a name they were not told about however it sounds to
 * them: Mariam, Merriam, Myriam. Each of those is taken as her name. Only
 * after a greeting, though: "Miriam is leading worship on Sunday" is not
 * talking to her. And not "Mary Ann", a different name that sounds close.
 */
const GREETING = String.raw`(?:hey|hay|hi|okay|ok|a)`
const NAME = String.raw`(?:miriam|mariam|merriam|meriam|myriam|mirriam|miriem|mirium|marium|meriem)`
const WAKE = new RegExp(String.raw`\b${GREETING}[\s,.!-]+${NAME}(?:'s)?\b[\s,.!?:;-]*`, 'gi')

/**
 * Whether "Hey Miriam" was said, and what was said after it — "Hey Miriam,
 * create an event" → "create an event". After the last time, should it be
 * said more than once.
 */
export function findWake(text: string): { after: string } | null {
  const last = [...text.matchAll(WAKE)].pop()
  if (!last || last.index === undefined) return null
  return { after: text.slice(last.index + last[0].length).trim() }
}
