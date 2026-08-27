/**
 * Tell an admin that the address they pasted is not a picture.
 *
 * Every image field in the page builder takes a URL, and the way people
 * actually get one is to copy the address of the thing they are looking at —
 * which, for a photo seen on Facebook or Instagram, is the address of a page
 * that contains the photo, not of the photo itself. Nothing can render that,
 * and the block simply comes out blank with no explanation.
 *
 * These are hints shown under the field, never a block on saving: the check
 * cannot know every host that serves images, and being wrong should cost the
 * admin nothing.
 */

/**
 * Hosts that serve pages, not files.
 *
 * A share link from any of these is the commonest way to end up with a blank
 * hero. Their real image addresses live on separate CDN hosts (fbcdn.net,
 * cdninstagram.com), which is why the site host is safe to reject outright.
 */
const PAGE_HOSTS = [
  'facebook.com',
  'fb.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'pinterest.com',
  'drive.google.com',
  'docs.google.com',
  'dropbox.com',
]

const IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.avif',
  '.heic',
  '.bmp',
  '.svg',
]

export function checkImageAddress(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim()
  if (!text) return null
  if (text.startsWith('data:')) return null

  let url: URL
  try {
    url = new URL(text)
  } catch {
    return 'That does not look like a web address. It should start with https://'
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return 'That does not look like a web address. It should start with https://'
  }

  const host = url.hostname.replace(/^www\./, '')
  const isPageHost = PAGE_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))
  if (isPageHost) {
    return `This is a link to a page on ${host}, not to an image file, so nothing will appear. Save the picture and upload it somewhere that serves the file itself.`
  }

  const path = url.pathname.toLowerCase()
  if (!IMAGE_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    // Plenty of legitimate image addresses have no extension — a Firebase
    // Storage or Squarespace URL can end in an id — so this stays a maybe.
    return 'This may not be an image: the address does not end in .jpg, .png or similar. Check that opening it shows the picture on its own.'
  }

  return null
}
