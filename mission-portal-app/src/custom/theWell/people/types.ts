import type { SeatingRules } from '@/features/events/carpoolAssign'

/**
 * Custom: The Well. Special rules for one person, for driving and seating,
 * kept by admins (Admin → Vehicles: Special rules for people) and followed
 * when a carpool is planned (../carpool) — and the seating ones by Auto-assign
 * in the carpool builder and by Miriam too (src/custom/carpool.ts).
 */
export interface PersonRules {
  uid: string
  /** Never asked to drive. */
  noDrive?: boolean
  /** May drive, but never a vehicle pulling a trailer. */
  noTrailer?: boolean
  /** May ride with men or women: "can ride with women", for a man. */
  eitherSex?: boolean
  /** Put in the same vehicle as these, by uid. */
  keepWith?: string[]
  /** Never put in the same vehicle as these, by uid. */
  keepApart?: string[]
  /** Anything else, shown beside them on the plan: "Gets carsick — front seat". */
  note?: string
}

const ids = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.map(String))].filter(Boolean).slice(0, 50) : []

/** A person's rules as kept: anything missing as it means when absent. */
export function rulesFrom(uid: string, data: Record<string, unknown> | undefined): PersonRules {
  const d = data ?? {}
  const keepWith = ids(d.keepWith).filter((u) => u !== uid)
  const keepApart = ids(d.keepApart).filter((u) => u !== uid && !keepWith.includes(u))
  const note = typeof d.note === 'string' ? d.note.trim().slice(0, 300) : ''
  return {
    uid,
    ...(d.noDrive === true ? { noDrive: true } : {}),
    ...(d.noTrailer === true ? { noTrailer: true } : {}),
    ...(d.eitherSex === true ? { eitherSex: true } : {}),
    ...(keepWith.length ? { keepWith } : {}),
    ...(keepApart.length ? { keepApart } : {}),
    ...(note ? { note } : {}),
  }
}

/** As written: every rule, so turning one off is kept too. */
export function rulesData(r: PersonRules): Record<string, unknown> {
  return {
    noDrive: !!r.noDrive,
    noTrailer: !!r.noTrailer,
    eitherSex: !!r.eitherSex,
    keepWith: r.keepWith ?? [],
    keepApart: r.keepApart ?? [],
    note: r.note?.trim() ?? '',
  }
}

/** Whether a person has any rule at all: one with none isn't kept. */
export const hasRules = (r: PersonRules) =>
  !!(
    r.noDrive ||
    r.noTrailer ||
    r.eitherSex ||
    r.keepWith?.length ||
    r.keepApart?.length ||
    r.note?.trim()
  )

/** The seating rules, as Auto-assign takes them (features/events/carpoolAssign). */
export function seatingRulesFrom(all: PersonRules[]): SeatingRules {
  const pairs = (pick: (r: PersonRules) => string[] | undefined) =>
    all.flatMap((r) => (pick(r) ?? []).map((other) => [r.uid, other] as const))
  return {
    eitherSex: new Set(all.filter((r) => r.eitherSex).map((r) => r.uid)),
    together: pairs((r) => r.keepWith),
    apart: pairs((r) => r.keepApart),
  }
}

/** "Can ride with women", for a man; "with men", for a woman; else "with men or women". */
export function eitherSexLabel(sex: string | undefined): string {
  return sex === 'male'
    ? 'Can ride with women'
    : sex === 'female'
      ? 'Can ride with men'
      : 'Can ride with men or women'
}
