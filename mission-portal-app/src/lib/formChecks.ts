import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form'

/**
 * The sign-in forms' checks (login, register, reset password), for
 * react-hook-form. They were written with zod, about 93 KB of the web app as
 * it loads, for an email's form, a length and two boxes ticked: these are
 * the same checks, with the same messages, and no library.
 */

/** An email address, as zod's .email() takes one: the same pattern. */
const EMAIL =
  /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/

export const isEmail = (value: string) => EMAIL.test(value)

/** A field's check: what is wrong with it, or null. Given every field too, to compare. */
export type FieldCheck<T, V> = (value: V, all: T) => string | null

/** A form's resolver from a check for each field that has one: every failing field reported. */
export function checkedBy<T extends FieldValues>(checks: {
  [K in keyof T]?: FieldCheck<T, T[K]>
}): Resolver<T> {
  return async (values) => {
    const errors: Record<string, { type: string; message: string }> = {}
    for (const key of Object.keys(checks) as (keyof T & string)[]) {
      const message = checks[key]?.(values[key], values)
      if (message) errors[key] = { type: 'validate', message }
    }
    return Object.keys(errors).length
      ? { values: {}, errors: errors as FieldErrors<T> }
      : { values, errors: {} }
  }
}

/** Checks, by what they ask for. */
export const email =
  (message: string): FieldCheck<unknown, string> =>
  (value) =>
    isEmail(value) ? null : message

/** At least `length` characters, counted as zod's .min() counts them: an emoji is one. */
export const atLeast =
  (length: number, message: string): FieldCheck<unknown, string> =>
  (value) =>
    [...value].length >= length ? null : message

export const ticked =
  (message: string): FieldCheck<unknown, boolean> =>
  (value) =>
    value === true ? null : message
