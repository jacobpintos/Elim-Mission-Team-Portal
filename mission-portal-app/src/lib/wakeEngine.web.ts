import type { WakeEngine } from './wakeEngine'

/**
 * Listening for "Hey Miriam" in the browser: sherpa-onnx's keyword spotter,
 * built for the web (WebAssembly) and served from /miriam-wake/ — fetched
 * the first time it is switched on, about 18 MB, and from then on from the
 * browser's cache. It hears whether that one phrase was said and nothing
 * else; nothing heard leaves the browser.
 *
 * The microphone is read with the Web Audio API at the 16 kHz the model
 * takes, with the browser's own echo cancelling and noise suppression on.
 */

/** Where the build lives (public/miriam-wake). */
const BASE = '/miriam-wake/'
/**
 * "Hey Miriam" in the model's word pieces — the same list as the phones'
 * (modules/miriam-wake/ios/model/miriam-wake/keywords.txt), and the same
 * settings (SCORE, THRESHOLD).
 *
 * Asked for as "▁HE Y ▁MI RI A M" alone, at 0.25, it was missed one time in
 * two or three. The soft "h" of "hey" is the first thing a phone's noise
 * suppression clips as someone starts to speak, and the model then hears
 * "a Miriam"; and her name is heard Miriam, Meriam or Mariam as people say
 * it. So each greeting with each — and listened for a little harder.
 * Measured on the model with synthetic speech: heard 69% of the time from
 * 33%, 63% from 24% said quietly, with no more false wakes on other speech
 * ("hey Marian" aside, which it can't tell from her name).
 */
const GREETINGS = ['▁HE Y', '▁HI', '▁A']
const NAMES = ['▁MI RI A M', '▁ME RI A M', '▁MA RI A M']
const KEYWORDS = GREETINGS.flatMap((g) => NAMES.map((n) => `${g} ${n} @HEY_MIRIAM`)).join('\n')
/** How strongly the phrase is favoured over what else it might be (sherpa-onnx's default is 1). */
const SCORE = 2.5
/** How sure it must be: lower hears more, and wakes more by mistake. */
const THRESHOLD = 0.15
const RATE = 16000

interface KwsStream {
  acceptWaveform(sampleRate: number, samples: Float32Array): void
  free(): void
}
interface Kws {
  createStream(): KwsStream
  isReady(s: KwsStream): boolean
  decode(s: KwsStream): void
  reset(s: KwsStream): void
  getResult(s: KwsStream): { keyword: string }
}
type CreateKws = (module: unknown, config: unknown) => Kws

declare global {
  interface Window {
    Module?: Record<string, unknown>
    createKws?: CreateKws
    webkitAudioContext?: typeof AudioContext
  }
}

function script(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script')
    el.src = src
    el.async = true
    el.onload = () => resolve()
    el.onerror = () => reject(new Error(`Could not load ${src}`))
    document.head.appendChild(el)
  })
}

let loading: Promise<Kws> | null = null

/** The spotter, loaded once. */
function load(): Promise<Kws> {
  if (loading) return loading
  loading = new Promise<Kws>((resolve, reject) => {
    const module: Record<string, unknown> = {
      locateFile: (path: string) => BASE + path,
      print: () => {},
      printErr: () => {},
    }
    module.onRuntimeInitialized = () => {
      try {
        const createKws = window.createKws
        if (!createKws) throw new Error('The wake word did not load.')
        resolve(
          createKws(module, {
            featConfig: { samplingRate: RATE, featureDim: 80 },
            modelConfig: {
              transducer: {
                encoder: './encoder-epoch-12-avg-2-chunk-16-left-64.onnx',
                decoder: './decoder-epoch-12-avg-2-chunk-16-left-64.onnx',
                joiner: './joiner-epoch-12-avg-2-chunk-16-left-64.onnx',
              },
              tokens: './tokens.txt',
              provider: 'cpu',
              modelType: 'zipformer2',
              numThreads: 1,
              debug: 0,
              modelingUnit: '',
              bpeVocab: '',
            },
            maxActivePaths: 4,
            numTrailingBlanks: 1,
            keywordsScore: SCORE,
            keywordsThreshold: THRESHOLD,
            keywords: KEYWORDS,
          })
        )
      } catch (err) {
        reject(err)
      }
    }
    window.Module = module
    script(BASE + 'sherpa-onnx-kws.js')
      .then(() => script(BASE + 'sherpa-onnx-wasm-kws-main.js'))
      .catch(reject)
  })
  loading.catch(() => {
    loading = null
  })
  return loading
}

/** From the microphone's rate to the model's. */
function downsample(input: Float32Array, from: number): Float32Array {
  if (from === RATE) return input
  const ratio = from / RATE
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    out[i] = sum / Math.max(1, end - start)
  }
  return out
}

let session: { stop(): void } | null = null

export const wakeEngine: WakeEngine | null =
  typeof window !== 'undefined' &&
  typeof WebAssembly === 'object' &&
  !!navigator.mediaDevices?.getUserMedia
    ? {
        async start(onWake) {
          session?.stop()
          const kws = await load()
          const media = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          })
          const Ctx = window.AudioContext ?? window.webkitAudioContext!
          let ctx: AudioContext
          try {
            ctx = new Ctx({ sampleRate: RATE })
          } catch {
            ctx = new Ctx()
          }
          const source = ctx.createMediaStreamSource(media)
          const processor = ctx.createScriptProcessor(4096, 1, 1)
          const stream = kws.createStream()
          let stopped = false
          const stop = () => {
            if (stopped) return
            stopped = true
            processor.onaudioprocess = null
            source.disconnect()
            processor.disconnect()
            media.getTracks().forEach((t) => t.stop())
            ctx.close().catch(() => {})
            stream.free()
            if (session === me) session = null
          }
          const me = { stop }
          session = me
          processor.onaudioprocess = (e) => {
            if (stopped) return
            const samples = downsample(
              new Float32Array(e.inputBuffer.getChannelData(0)),
              ctx.sampleRate
            )
            stream.acceptWaveform(RATE, samples)
            while (kws.isReady(stream)) {
              kws.decode(stream)
              if (kws.getResult(stream).keyword) {
                kws.reset(stream)
                // Stopped first, so the microphone is free for the request.
                stop()
                onWake()
                return
              }
            }
          }
          source.connect(processor)
          processor.connect(ctx.destination)
          if (ctx.state === 'suspended') await ctx.resume().catch(() => {})
        },
        stop() {
          session?.stop()
        },
      }
    : null
