import { describe, it, expect } from 'vitest'
import { backupFolder, dayOfBackupFile, oldestKept } from '../../functions/src/backups'

describe('nightly backup retention', () => {
  it('names a day folder and reads the day back from a file in it', () => {
    expect(backupFolder('2026-10-14')).toBe('backups/firestore/2026-10-14')
    expect(dayOfBackupFile('backups/firestore/2026-10-14/all_namespaces/output-0')).toBe(
      '2026-10-14'
    )
  })

  it('ignores anything that is not a dated backup file', () => {
    expect(dayOfBackupFile('reimbursements/u1/receipt.jpg')).toBeNull()
    expect(dayOfBackupFile('backups/firestore/notes.txt')).toBeNull()
  })

  it('keeps thirty days, today included', () => {
    expect(oldestKept('2026-10-14')).toBe('2026-09-15')
    expect(oldestKept('2026-03-01', 2)).toBe('2026-02-28')
  })
})
