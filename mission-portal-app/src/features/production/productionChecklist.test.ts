import { describe, it, expect } from 'vitest'
import { PRODUCTION_CHECKLIST_URL, staysInChecklist } from './productionChecklist'

describe('staysInChecklist', () => {
  it('keeps the checklist’s own pages in the tab', () => {
    expect(staysInChecklist(PRODUCTION_CHECKLIST_URL)).toBe(true)
    expect(staysInChecklist('https://elim-production.web.app/sunday?step=3')).toBe(true)
    expect(staysInChecklist('https://ELIM-PRODUCTION.web.app/')).toBe(true)
    expect(staysInChecklist('https://elim-production.firebaseapp.com/')).toBe(true)
    expect(staysInChecklist('about:blank')).toBe(true)
  })

  it('sends a link to anywhere else to the browser', () => {
    expect(staysInChecklist('https://www.youtube.com/watch?v=x')).toBe(false)
    expect(staysInChecklist('https://elim-production.web.app.evil.test/')).toBe(false)
    expect(staysInChecklist('https://other.web.app/')).toBe(false)
    expect(staysInChecklist('mailto:someone@example.com')).toBe(false)
    expect(staysInChecklist('not a url')).toBe(false)
  })
})
