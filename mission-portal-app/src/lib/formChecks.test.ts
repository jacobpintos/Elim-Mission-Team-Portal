import { describe, it, expect } from 'vitest'
import { atLeast, checkedBy, email, isEmail, ticked } from './formChecks'

const run = <T extends Record<string, unknown>>(
  resolver: ReturnType<typeof checkedBy<T>>,
  values: T
) => resolver(values, undefined, { fields: {}, shouldUseNativeValidation: false })

describe('formChecks — the sign-in forms’ checks', () => {
  it('takes an email address as zod’s .email() did', () => {
    for (const ok of [
      'a@b.co',
      'first.last@church.org',
      "o'neil+team@mail.example.com",
      'x_y-z@sub.domain.io',
    ]) {
      expect(isEmail(ok), ok).toBe(true)
    }
    for (const bad of [
      '',
      'plain',
      'a@b',
      'a@b.c',
      ' a@b.com',
      'a@b.com ',
      '.a@b.com',
      'a..b@c.com',
      'a@-b.com',
      'a@b..com',
    ]) {
      expect(isEmail(bad), bad).toBe(false)
    }
  })

  it('reports every failing field, with its message, and the values only when all pass', async () => {
    type F = { email: string; password: string; terms: boolean }
    const resolver = checkedBy<F>({
      email: email('Invalid email address'),
      password: atLeast(8, 'Password must be at least 8 characters'),
      terms: ticked('You must accept the Terms of Use to register'),
    })
    const failed = await run(resolver, { email: 'nope', password: 'short', terms: false })
    expect(failed.values).toEqual({})
    expect(failed.errors).toEqual({
      email: { type: 'validate', message: 'Invalid email address' },
      password: { type: 'validate', message: 'Password must be at least 8 characters' },
      terms: { type: 'validate', message: 'You must accept the Terms of Use to register' },
    })

    const values = { email: 'a@b.co', password: '12345678', terms: true }
    expect(await run(resolver, values)).toEqual({ values, errors: {} })
  })

  it('counts characters as zod did: an emoji is one', async () => {
    type F = { password: string }
    const resolver = checkedBy<F>({ password: atLeast(8, 'Too short') })
    expect((await run(resolver, { password: '😀😀😀😀' })).errors).toEqual({
      password: { type: 'validate', message: 'Too short' },
    })
    expect((await run(resolver, { password: '😀😀😀😀😀😀😀😀' })).errors).toEqual({})
    expect((await run(resolver, { password: 'abcdefgh' })).errors).toEqual({})
  })

  it('compares one field with another', async () => {
    type F = { password: string; confirmPassword: string }
    const resolver = checkedBy<F>({
      confirmPassword: (value, all) => (value === all.password ? null : 'Passwords do not match'),
    })
    expect(
      (await run(resolver, { password: 'abcdefgh', confirmPassword: 'abcdefgx' })).errors
    ).toEqual({
      confirmPassword: { type: 'validate', message: 'Passwords do not match' },
    })
    expect(
      (await run(resolver, { password: 'abcdefgh', confirmPassword: 'abcdefgh' })).errors
    ).toEqual({})
  })
})
