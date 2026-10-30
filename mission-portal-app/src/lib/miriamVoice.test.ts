import { describe, expect, it } from 'vitest'
import { pickVoice, type VoiceInfo } from './miriamVoice'

const v = (id: string, name: string, lang = 'en-US', quality = 'Default'): VoiceInfo => ({
  id,
  name,
  lang,
  quality,
})

describe('Miriam’s voice', () => {
  it('takes an iPhone’s downloaded woman’s voice over the plain one', () => {
    const voices = [
      v('com.apple.voice.compact.en-US.Samantha', 'Samantha'),
      v('com.apple.eloquence.en-US.Fred', 'Fred'),
      v('com.apple.voice.premium.en-US.Ava', 'Ava (Premium)', 'en-US', 'Enhanced'),
      v('com.apple.voice.enhanced.en-US.Evan', 'Evan (Enhanced)', 'en-US', 'Enhanced'),
    ]
    expect(pickVoice(voices)?.name).toBe('Ava (Premium)')
    expect(pickVoice(voices.slice(0, 2))?.name).toBe('Samantha')
  })
  it('takes Edge’s natural voices, and Chrome’s woman’s voice', () => {
    expect(
      pickVoice([
        v('Microsoft David', 'Microsoft David - English (United States)'),
        v('Microsoft Zira', 'Microsoft Zira - English (United States)'),
        v('Aria', 'Microsoft Aria Online (Natural) - English (United States)'),
      ])?.id
    ).toBe('Aria')
    expect(
      pickVoice([
        v('Google UK English Male', 'Google UK English Male', 'en-GB'),
        v('g', 'Google US English'),
      ])?.id
    ).toBe('g')
  })
  it('never a voice that works out each sentence’s language, while there is another', () => {
    // A list of Bible references came out in Spanish.
    const edge = [
      v('Multi', 'Microsoft AvaMultilingual Online (Natural) - English (United States)'),
      v('Ava', 'Microsoft Ava Online (Natural) - English (United States)'),
      v('Zira', 'Microsoft Zira - English (United States)'),
    ]
    expect(pickVoice(edge)?.id).toBe('Ava')
    expect(pickVoice([edge[0], edge[2]])?.id).toBe('Zira')
    expect(pickVoice([edge[0]])?.id).toBe('Multi')
  })
  it('takes a woman’s Google voice on Android, the network one first', () => {
    expect(
      pickVoice([
        v('en-us-x-iom-network', 'en-us-x-iom-network'),
        v('en-us-x-sfg-local', 'en-us-x-sfg-local'),
        v('en-us-x-tpf-network', 'en-us-x-tpf-network'),
      ])?.id
    ).toBe('en-us-x-tpf-network')
  })
  it('leaves it to the device when it has only a man’s voice', () => {
    expect(pickVoice([v('com.apple.eloquence.en-US.Fred', 'Fred')])).toBeNull()
    expect(pickVoice([])).toBeNull()
  })
})
