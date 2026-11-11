import { setGlobalOptions } from 'firebase-functions/v2'

/**
 * Limits every function is made with, unless it says otherwise.
 *
 * Imported first by ./index, before any function is defined: each reads
 * these as it is defined, so set any later they would not apply.
 *
 * maxInstances: how many copies of one function may run at once. Google's
 * default is a hundred. A ceiling well under that bounds what a runaway —
 * a function that keeps setting itself off, or one called over and over —
 * can cost, while leaving room for the bursts the app makes: a group's
 * members changing puts right every event the group is on, each a write
 * that sets off its own functions. The ones that cost money each time they
 * run (Miriam, reading a travel picture) are held lower where they are
 * defined.
 */
setGlobalOptions({ maxInstances: 30 })
