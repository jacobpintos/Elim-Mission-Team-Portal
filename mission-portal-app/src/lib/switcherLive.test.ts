import { describe, expect, it } from 'vitest'
import { ATEM, AtemConnection, type AtemState } from './switcher/atem'
import { feedUrlOf, multiviewHtml } from './switcher/multiview'
import { fakeAtem } from './__fixtures__/fakeAtem'

describe('staying connected to the switcher (the Video screen)', () => {
  it('follows changes made on the panel, and takes commands', async () => {
    const atem = fakeAtem({ program: 1, preview: 2 })
    const conn = new AtemConnection(atem.open, atem.clock)
    const seen: number[] = []
    conn.onChange = (s: AtemState) => {
      if (s.program !== null) seen.push(s.program)
    }
    expect(await conn.connect()).toBe(true)
    const listening = conn.listen()
    atem.fromPanel(3)
    await conn.wait(200)
    expect(conn.state.program).toBe(3)
    expect(seen).toContain(3)
    expect(await conn.command([ATEM.preview(1)])).toBe(true)
    await conn.wait(200)
    expect(conn.state.preview).toBe(1)
    expect(await conn.command([ATEM.cut()])).toBe(true)
    await conn.wait(200)
    expect(conn.state.program).toBe(1)
    conn.close()
    expect(await listening).toBe('closed')
    expect(atem.sessions()).toEqual({ opened: 1, closed: 1 })
  })

  it('knows when the switcher has gone quiet', async () => {
    const atem = fakeAtem()
    const conn = new AtemConnection(atem.open, atem.clock)
    expect(await conn.connect()).toBe(true)
    atem.goQuiet()
    expect(await conn.listen()).toBe('lost')
    expect(await conn.command([ATEM.cut()])).toBe(false)
  })
})

describe('the multiview’s picture', () => {
  it('takes an encoder’s address as typed', () => {
    expect(feedUrlOf('192.168.1.50/snapshot.jpg')).toBe('http://192.168.1.50/snapshot.jpg')
    expect(feedUrlOf('http://192.168.1.50:8080/preview.mjpg')).toBe(
      'http://192.168.1.50:8080/preview.mjpg'
    )
    expect(feedUrlOf('ftp://192.168.1.50/x')).toBeNull()
    expect(feedUrlOf('   ')).toBeNull()
  })

  it('shows a still picture by asking for it again, and a motion JPEG as it comes', () => {
    const still = multiviewHtml({ url: 'http://192.168.1.50/snapshot.jpg', kind: 'still' })
    expect(still).toContain('"http://192.168.1.50/snapshot.jpg"')
    expect(still).toContain("'t=' + Date.now()")
    const mjpeg = multiviewHtml({ url: 'http://192.168.1.50/preview.mjpg', kind: 'mjpeg' })
    expect(mjpeg).toContain(`document.getElementById('v').src = "http://192.168.1.50/preview.mjpg"`)
    expect(mjpeg).not.toContain('Date.now()')
  })

  it('never lets the address end the page’s script', () => {
    const html = multiviewHtml({
      url: 'http://x/</script><script>alert(1)</script>',
      kind: 'still',
    })
    expect(html.match(/<\/script>/g)).toHaveLength(1)
  })
})
