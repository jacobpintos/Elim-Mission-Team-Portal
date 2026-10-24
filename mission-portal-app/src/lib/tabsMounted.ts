export type NavState = {
  index?: number
  routes: { name: string; state?: NavState }[]
}

/**
 * Whether the signed-in group's tabs have mounted: the (app) route on screen
 * holds its navigator's own state, which a navigator puts there only once it
 * exists.
 *
 * Being sent into the group is not the same thing. The URL, and useSegments,
 * say (app) the moment a redirect is dispatched, a render before the tabs are
 * there. expo-router sends a link to the deepest navigator whose state matches
 * it, so a push in that render finds no tabs and goes to the root instead:
 * there it stacks a second copy of the whole app, opened at the link, on top
 * of the one being set up at the first tab.
 */
export function signedInTabsMounted(state: NavState | undefined): boolean {
  let at = state
  while (at) {
    const route = at.routes[at.index ?? 0]
    if (!route) return false
    if (route.name === '(app)') return !!route.state
    at = route.state
  }
  return false
}
