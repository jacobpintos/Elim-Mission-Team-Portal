/**
 * The cue that listening has started or stopped, in a browser: the same two
 * short tones as the phone app (rising for start, falling for stop), made
 * on the spot rather than loaded, and a buzz where the browser can (not on
 * iPhones, whose browsers have no vibration).
 *
 * Played from the tap that starts listening, which is what lets a browser
 * make a sound at all.
 */
let context: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  context = context ?? new Ctx()
  if (context.state === 'suspended') context.resume().catch(() => {})
  return context
}

export function listeningCue(kind: 'start' | 'stop'): void {
  try {
    navigator.vibrate?.(kind === 'start' ? 20 : 12)
  } catch {
    // No vibration here.
  }
  try {
    const ctx = audio()
    if (!ctx) return
    const notes = kind === 'start' ? [880, 1320] : [1320, 880]
    notes.forEach((freq, i) => {
      const at = ctx.currentTime + i * 0.095
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, at)
      gain.gain.linearRampToValueAtTime(0.18, at + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.075)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + 0.08)
    })
  } catch {
    // A silent start is still a start.
  }
}
