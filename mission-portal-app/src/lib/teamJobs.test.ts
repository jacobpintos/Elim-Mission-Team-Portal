import { describe, expect, it } from 'vitest'
import { ORG, type OrgModule } from '@/custom'
import { orgCan, planIncludes } from './entitlements'
import { doesJob, holdsJob, jobHoldersOf, orgJobs, toggledJob } from './teamJobs'

describe('jobs several people hold (Sound Engineer, Video Operator)', () => {
  it('are read as uids, each once, whatever was stored', () => {
    expect(jobHoldersOf(undefined)).toEqual([])
    expect(jobHoldersOf('a')).toEqual([])
    expect(jobHoldersOf(['a', 'b', 'a', '', 3, null])).toEqual(['a', 'b'])
  })

  it('are held by several people at once', () => {
    const holders = toggledJob(toggledJob([], 'mitch'), 'sarah')
    expect(holders).toEqual(['mitch', 'sarah'])
    expect(holdsJob('mitch', holders)).toBe(true)
    expect(holdsJob('sarah', holders)).toBe(true)
  })

  it('are taken back from one without the others', () => {
    expect(toggledJob(['mitch', 'sarah'], 'mitch')).toEqual(['sarah'])
  })

  it('are nobody’s when nobody is signed in', () => {
    expect(holdsJob(undefined, ['mitch'])).toBe(false)
    expect(holdsJob('', [''])).toBe(false)
  })
})

describe('jobs and the organization’s equipment and plan', () => {
  const withEquipment = (equipment: OrgModule['equipment']): OrgModule => ({ ...ORG, equipment })

  it('has every job where it has the sound desk and the video switcher (The Well)', () => {
    expect(orgJobs()).toEqual(['soundEngineers', 'videoOperators'])
    expect(doesJob('soundEngineers', 'mitch', ['mitch'])).toBe(true)
  })

  it('has no Sound Engineers without a sound desk, nor Video Operators without a switcher', () => {
    const videoOnly = withEquipment({ videoSwitcher: 'atem' })
    expect(orgJobs(videoOnly)).toEqual(['videoOperators'])
    expect(doesJob('soundEngineers', 'mitch', ['mitch'], videoOnly)).toBe(false)
    expect(doesJob('videoOperators', 'mitch', ['mitch'], videoOnly)).toBe(true)
    expect(orgJobs(withEquipment({}))).toEqual([])
  })

  it('asks the plan as well as the equipment', () => {
    expect(planIncludes('founding', 'soundDesk')).toBe(true)
    expect(orgCan('videoSwitcher')).toBe(true)
    expect(orgCan('videoSwitcher', withEquipment({ soundDesk: 'x32' }))).toBe(false)
  })
})
