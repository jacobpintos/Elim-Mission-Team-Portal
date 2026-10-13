import { describe, it, expect, vi } from 'vitest'
import { flightPatchFromRead, lodgingPatchFromRead, type ReadFlightLeg } from './travelImageRead'

// Hoisted above the import by vitest.

vi.mock('@/lib/firebase', () => ({ functions: {} }))
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }))

const leg = (over: Partial<ReadFlightLeg> = {}): ReadFlightLeg => ({
  date: '',
  time: '',
  airport: '',
  airline: '',
  flight: '',
  ticket: '',
  confirmation: '',
  arrival: '',
  ...over,
})

describe('flightPatchFromRead', () => {
  it('fills both legs from what was read', () => {
    const patch = flightPatchFromRead(
      { id: '1', uid: 'u' },
      {
        outbound: leg({ date: '10/20/26', flight: 'UA 12', confirmation: 'ABC123' }),
        return: leg({ date: '10/27/26', arrival: ' 4:10 PM ' }),
      }
    )
    expect(patch).toEqual({
      outDate: '10/20/26',
      outFlight: 'UA 12',
      outConfirmation: 'ABC123',
      retDate: '10/27/26',
      retArrival: '4:10 PM',
    })
  })

  it('never overwrites what someone typed', () => {
    const patch = flightPatchFromRead(
      { id: '1', uid: 'u', outFlight: 'DL 9', outDate: '  ' },
      { outbound: leg({ flight: 'UA 12', date: '10/20/26' }), return: leg() }
    )
    expect(patch).toEqual({ outDate: '10/20/26' })
  })
})

describe('lodgingPatchFromRead', () => {
  it('fills only blank fields', () => {
    const patch = lodgingPatchFromRead(
      { id: '1', name: 'Hampton Inn', address: '', assignees: [] },
      { name: 'Hilton', address: '1 Main St', room: '', confirmation: 'X9' }
    )
    expect(patch).toEqual({ address: '1 Main St', confirmation: 'X9' })
  })
})
