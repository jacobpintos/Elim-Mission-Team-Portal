import { describe, expect, it } from 'vitest'
import { textingAsked } from './miriamTexting'

describe('the texting list, asked about', () => {
  it('joining', () => {
    for (const said of [
      'add me to the texting list',
      'Can you add me to the texting list?',
      'sign me up for the texts',
      'put me on the text list',
      'I want to get the texts',
      'subscribe me to the texting list',
      'join the texting list',
    ]) {
      expect(textingAsked(said), said).toBe('join')
    }
  })

  it('how to join', () => {
    for (const said of [
      'how do i get added to the texting list',
      'How can I join the texting list?',
      'how do I get the texts',
      'where do I sign up for the texting list',
    ]) {
      expect(textingAsked(said), said).toBe('how')
    }
  })

  it('stopping them', () => {
    for (const said of [
      'unsubscribe me from the texting list',
      'take me off the texting list',
      'stop sending me texts',
      'stop the texts',
      'how do I unsubscribe from the texts',
      'how do i stop the text messages',
      'I don’t want the texts anymore',
      'remove me from the texting list',
    ]) {
      expect(textingAsked(said), said).toBe('stop')
    }
  })

  it('whether they are on it', () => {
    expect(textingAsked('am I on the texting list?')).toBe('status')
  })

  it('not the list: a message, a notification switch, anything else', () => {
    for (const said of [
      'text Sam I’m running late',
      'turn off texting list notifications',
      'stop texting list sign-up notifications',
      'add me to the worship team',
      'unsubscribe me from emails',
    ]) {
      expect(textingAsked(said), said).toBeNull()
    }
  })
})
