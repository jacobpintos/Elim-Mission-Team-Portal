/**
 * What counts as an audio file, and what to call it on the way to Storage.
 *
 * Both questions used to be answered inline by the uploader, and both were
 * answered wrongly for the same reason: a browser's idea of a file's type is
 * a guess, and on a phone it is often no guess at all. A track that reached
 * the phone through another app frequently arrives typed as
 * application/octet-stream, or as nothing.
 */

/** Extensions we are willing to call audio, whatever the browser says. */
const AUDIO_EXTENSIONS: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  wave: 'audio/wav',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  caf: 'audio/x-caf',
  amr: 'audio/amr',
  wma: 'audio/x-ms-wma',
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

/**
 * Is this a file we should accept as a track?
 *
 * The name is trusted when the reported type is unhelpful, which is the common
 * case on a phone: an .mp3 that came in over a messaging app is routinely
 * handed over as application/octet-stream, and refusing it because the browser
 * shrugged would be refusing the file the person actually chose.
 */
export function looksLikeAudio(name: string, reportedType?: string | null): boolean {
  if ((reportedType ?? '').toLowerCase().startsWith('audio/')) return true
  return extensionOf(name) in AUDIO_EXTENSIONS
}

/**
 * The content type to store the file under.
 *
 * Never the reported type unless it is actually an audio type. The Storage
 * rule for setListAudio/ requires audio/*, so uploading an mp3 that the
 * browser called application/octet-stream under that name is an upload the
 * rules reject — and the player will not touch it either.
 */
export function audioContentType(name: string, reportedType?: string | null): string {
  const reported = (reportedType ?? '').toLowerCase()
  if (reported.startsWith('audio/')) return reported
  return AUDIO_EXTENSIONS[extensionOf(name)] ?? 'audio/mpeg'
}

/**
 * How far an upload has got, as a whole percentage.
 *
 * Its own function because the two ways it goes wrong are both silent: a
 * total of zero divides to NaN and renders as "NaN%", and a transferred count
 * that momentarily exceeds the total — which Storage does report — renders as
 * "101%" and reads like a bug to whoever is watching the number.
 */
export function uploadPercent(transferred: number, total: number): number {
  if (!Number.isFinite(transferred) || !Number.isFinite(total) || total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((transferred / total) * 100)))
}
