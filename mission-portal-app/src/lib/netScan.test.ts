import { describe, expect, it } from 'vitest'
import {
  addressesToScan,
  networkSaid,
  prefixOfNetmask,
  scanAddresses,
  type Exchange,
} from './netScan'
import { deskFromAnswer, findDesks } from './mixer/find'
import { findSwitchers, isAtemHello } from './switcher/find'
import { HELLO, makePacket } from './switcher/atem'
import { encodeOsc } from './mixer/osc'
import { fakeX32 } from './__fixtures__/fakeX32'

describe('the phone’s network', () => {
  it('reads a network mask', () => {
    expect(prefixOfNetmask('255.255.255.0')).toBe(24)
    expect(prefixOfNetmask('255.255.252.0')).toBe(22)
    expect(prefixOfNetmask('255.255.255.255')).toBe(32)
    expect(prefixOfNetmask('255.0.255.0')).toBeNull()
    expect(prefixOfNetmask('nope')).toBeNull()
  })

  it('asks every other address on it, at most its own x.x.x.0–255', () => {
    const all = addressesToScan('192.168.1.37', 24)
    expect(all).toHaveLength(253)
    expect(all[0]).toBe('192.168.1.1')
    expect(all.at(-1)).toBe('192.168.1.254')
    expect(all).not.toContain('192.168.1.37')
    // A wider network: only the phone's own part of it.
    expect(addressesToScan('10.0.5.9', 16)).toHaveLength(253)
    expect(addressesToScan('10.0.5.9', 16)[0]).toBe('10.0.5.1')
    // A narrower one: only that.
    expect(addressesToScan('192.168.1.130', 26)).toHaveLength(61)
    expect(networkSaid('192.168.1.37')).toBe('192.168.1.x')
  })

  it('asks a batch at a time, keeping those that answer', async () => {
    let asking = 0
    let most = 0
    const found = await scanAddresses(
      addressesToScan('192.168.1.37', 24),
      async (host) => {
        most = Math.max(most, ++asking)
        await new Promise((r) => setTimeout(r, 1))
        asking--
        return host.endsWith('.20') ? 'here' : null
      },
      64
    )
    expect(found).toEqual([{ host: '192.168.1.20', found: 'here' }])
    expect(most).toBeLessThanOrEqual(64)
  })
})

describe('finding the sound desk', () => {
  it('knows an X32 by its answer to /xinfo', async () => {
    const desk = fakeX32()
    expect(deskFromAnswer(await desk.link.exchange(encodeOsc('/xinfo'), 500))).toEqual({
      name: 'Sanctuary',
      model: 'X32',
    })
    expect(deskFromAnswer(null)).toBeNull()
    expect(deskFromAnswer(encodeOsc('/ch/01/mix/on', [{ t: 'i', v: 1 }]))).toBeNull()
  })

  it('finds it on the phone’s network', async () => {
    const desk = fakeX32()
    const exchange: Exchange = async (host, port, message, timeoutMs) =>
      host === '192.168.1.20' && port === 10023 ? desk.link.exchange(message, timeoutMs) : null
    expect(await findDesks(exchange, { address: '192.168.1.37', prefix: 24 }, 'x32')).toEqual([
      { host: '192.168.1.20', found: { name: 'Sanctuary', model: 'X32' } },
    ])
  })
})

describe('finding the video switcher', () => {
  it('knows an ATEM by its answer to hello', () => {
    expect(isAtemHello(makePacket(0x02, 0x53ab, { packetId: 0 }, new Uint8Array(8)))).toBe(true)
    expect(isAtemHello(makePacket(0x10, 0x53ab, { ackId: 1 }))).toBe(false)
    expect(isAtemHello(null)).toBe(false)
  })

  it('finds it on the phone’s network', async () => {
    const exchange: Exchange = async (host, port, message) =>
      host === '192.168.1.40' && port === 9910 && message.length === HELLO.length
        ? makePacket(0x02, 0x53ab, { packetId: 0 }, new Uint8Array(8))
        : null
    expect(await findSwitchers(exchange, { address: '192.168.1.37', prefix: 24 })).toEqual([
      { host: '192.168.1.40', found: true },
    ])
  })
})
