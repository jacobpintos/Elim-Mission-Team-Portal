// Merch utilities for Phase 3

export const MERCH_CATEGORIES = ['books', 'hats', 'clothing'] as const
export const CLOTHING_SUBS = [
  't-shirts',
  'sweaters',
  'hoodies',
  'crewnecks',
  'jean jackets',
] as const
export const CLOTHING_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'] as const

export type MerchCategory = (typeof MERCH_CATEGORIES)[number]
export type ClothingSize = (typeof CLOTHING_SIZES)[number]

export function getSeason(ts: number): 'Spring' | 'Summer' | 'Fall' | 'Winter' {
  const m = new Date(ts).getMonth()
  if (m >= 2 && m <= 4) return 'Spring'
  if (m >= 5 && m <= 7) return 'Summer'
  if (m >= 8 && m <= 10) return 'Fall'
  return 'Winter'
}

export function linReg(xVals: number[], yVals: number[]) {
  const n = xVals.length
  if (n < 2) return { m: 0, b: yVals[0] ?? 0, r2: 0 }
  const xm = xVals.reduce((s, v) => s + v, 0) / n
  const ym = yVals.reduce((s, v) => s + v, 0) / n
  let num = 0,
    den = 0,
    ssRes = 0,
    ssTot = 0
  for (let i = 0; i < n; i++) {
    num += (xVals[i] - xm) * (yVals[i] - ym)
    den += (xVals[i] - xm) ** 2
  }
  const slope = den > 0 ? num / den : 0
  const b = ym - slope * xm
  yVals.forEach((y, i) => {
    ssRes += (y - (slope * xVals[i] + b)) ** 2
    ssTot += (y - ym) ** 2
  })
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0
  return { m: slope, b, r2 }
}

/** Default sizes for a new clothing item */
export function defaultClothingSizes(): Record<string, number> {
  return { S: 0, M: 0, L: 0, XL: 0, '2XL': 0, '3XL': 0 }
}

/** Default sizes for a non-clothing item */
export function defaultNonClothingSizes(): Record<string, number> {
  return { one: 0 }
}
