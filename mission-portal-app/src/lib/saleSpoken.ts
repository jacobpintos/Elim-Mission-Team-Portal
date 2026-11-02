/**
 * Sale lingo, as Miriam's voice should say it (features/miriam/speak) — as
 * scripture references are (./scriptureSpoken). A phone's voice reads "BOGO"
 * as "bo-go" or letter by letter, "1/2 off" as "one slash two off", "2/$20"
 * as "two slash twenty dollars". Said here as a person would: "buy one, get
 * one", "half off", "two for twenty dollars". What is shown on screen is left
 * as it was written.
 */

const SMALL = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
]
const count = (n: string) => SMALL[Number(n)] ?? n

/** The fractions a sale is given in, said as words. */
const FRACTIONS: Record<string, string> = {
  '1/2': 'half',
  '1/3': 'a third',
  '2/3': 'two thirds',
  '1/4': 'a quarter',
  '3/4': 'three quarters',
}

/** [what is written, what is said], in order: the longer forms first. */
const LINGO: [RegExp, string | ((...m: string[]) => string)][] = [
  // "BOGOF": buy one, get one free.
  [/\bB\.?O\.?G\.?O\.?F\b\.?/gi, 'buy one, get one free'],
  // "BOGO50": buy one, get one fifty percent off. ("BOGO 50% off" reads as it is.)
  [/\bB\.?O\.?G\.?O(\d{1,3})\b/gi, (_m, n) => `buy one, get one ${n} percent off`],
  // "BOGO", "B.O.G.O.", "Bogo".
  [/\bB\.?O\.?G\.?O\b\.?/gi, 'buy one, get one'],
  // "B2G1", "B1G1 free": buy two, get one.
  [/\bB(\d)G(\d)\b/gi, (_m, a, b) => `buy ${count(a)}, get ${count(b)}`],
  // "1/2 off", "1/2 price", "1/3 OFF".
  [/\b(1\/2|1\/3|2\/3|1\/4|3\/4)(?=\s*(?:off|price|priced)\b)/gi, (m) => FRACTIONS[m] ?? m],
  // "2/$20", "3 for $10" (the latter reads well already): two for twenty dollars.
  [/\b(\d{1,2})\s*\/\s*(?=\$\d)/g, (_m, n) => `${count(n)} for `],
  // "w/ purchase", "thru Sunday", "$5 ea.", "excl. sale items", "reg. $40".
  [/\bw\/\s*/gi, 'with '],
  [/\bthru\b/gi, 'through'],
  [/\s*\/\s*ea\b\.?/gi, ' each'],
  [/\bea\.(?=\s|$)/gi, 'each'],
  [/\bexcl\.(?=\s|$)/gi, 'excluding'],
  [/\bincl\.(?=\s|$)/gi, 'including'],
  [/\breg\.(?=\s*\$)/gi, 'regularly'],
  [/\borig\.(?=\s*\$)/gi, 'originally'],
]

export function saleLingoForSpeech(text: string): string {
  let said = text
  for (const [re, to] of LINGO) {
    said = said.replace(re, to as never)
  }
  return said
}
