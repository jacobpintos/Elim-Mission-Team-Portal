import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import type { FlightEntry, LodgingEntry } from '@/types/events'

/** One leg as readTravelImage returns it: every field present, blank if unseen. */
export interface ReadFlightLeg {
  date: string
  time: string
  airport: string
  airline: string
  flight: string
  ticket: string
  confirmation: string
  arrival: string
}

export interface ReadFlight {
  outbound: ReadFlightLeg
  return: ReadFlightLeg
}

export interface ReadHotel {
  name: string
  address: string
  room: string
  confirmation: string
}

/** How each field read off the picture maps onto a FlightEntry, per leg. */
const LEG_FIELDS: Record<keyof ReadFlightLeg, string> = {
  date: 'Date',
  time: 'Time',
  airport: 'Airport',
  airline: 'Airline',
  flight: 'Flight',
  ticket: 'Ticket',
  confirmation: 'Confirmation',
  arrival: 'Arrival',
}

const blank = (v: unknown) => typeof v !== 'string' || v.trim() === ''
const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/**
 * The fields to set on a flight entry from what was read: only those still
 * blank on the entry, so nothing someone has typed is ever overwritten.
 */
export function flightPatchFromRead(
  entry: FlightEntry,
  read: Partial<ReadFlight>
): Partial<FlightEntry> {
  const patch: Record<string, string> = {}
  for (const [prefix, leg] of [
    ['out', read.outbound],
    ['ret', read.return],
  ] as const) {
    if (!leg) continue
    for (const [from, suffix] of Object.entries(LEG_FIELDS)) {
      const value = clean(leg[from as keyof ReadFlightLeg])
      const key = `${prefix}${suffix}`
      if (value && blank(entry[key as keyof FlightEntry])) patch[key] = value
    }
  }
  return patch as Partial<FlightEntry>
}

/** As flightPatchFromRead, for a hotel. */
export function lodgingPatchFromRead(
  entry: LodgingEntry,
  read: Partial<ReadHotel>
): Partial<LodgingEntry> {
  const patch: Partial<LodgingEntry> = {}
  for (const key of ['name', 'address', 'room', 'confirmation'] as const) {
    const value = clean(read[key])
    if (value && blank(entry[key])) patch[key] = value
  }
  return patch
}

/** Ask the readTravelImage function what a just-uploaded picture shows. */
export async function readFlightImage(path: string, leg: 'out' | 'ret'): Promise<ReadFlight> {
  const call = httpsCallable<object, { fields: ReadFlight }>(functions, 'readTravelImage')
  return (await call({ kind: 'flight', path, leg })).data.fields
}

export async function readHotelImage(path: string): Promise<ReadHotel> {
  const call = httpsCallable<object, { fields: ReadHotel }>(functions, 'readTravelImage')
  return (await call({ kind: 'hotel', path })).data.fields
}
