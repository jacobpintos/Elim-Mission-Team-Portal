/**
 * Custom: The Well. The Production Checklist: a church member's own site,
 * shown under Operations as it is (./ProductionChecklistScreen). It is theirs — built,
 * hosted and updated by them — so nothing of it is copied here: the tab
 * shows the live site, and whatever they publish shows with it.
 */
export const PRODUCTION_CHECKLIST_URL = 'https://elim-production.web.app'

/** The hosts the site is served from: Firebase Hosting gives both names. */
const ITS_HOSTS = new Set(['elim-production.web.app', 'elim-production.firebaseapp.com'])

/**
 * Whether a page the checklist goes to stays in the tab: its own pages do;
 * a link it gives elsewhere (a supplier, a video) opens in the browser, so
 * the tab is never left showing some other site with no way back.
 */
export function staysInChecklist(url: string): boolean {
  if (url === 'about:blank' || url.startsWith('blob:') || url.startsWith('data:')) return true
  try {
    return ITS_HOSTS.has(new URL(url).hostname.toLowerCase())
  } catch {
    return false
  }
}
