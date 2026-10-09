import { requireOptionalNativeModule } from 'expo'

/**
 * Listening for "Hey Miriam" on the device itself, with sherpa-onnx's
 * keyword spotter: a small model that hears whether that one phrase was said
 * and nothing else, so nothing heard leaves the device and it is light enough
 * to leave running.
 *
 * Here, the app's own native module (modules/miriam-wake); on the web, the
 * same spotter built for the browser (./wakeEngine.web.ts). Null where there
 * is none — an app build made before it was added — and Miriam is then
 * reached with her button only.
 */
export interface WakeEngine {
  /**
   * Listen until "Hey Miriam" is heard, then stop and call `onWake`. Resolves
   * once listening; rejects if it cannot (no microphone, say).
   */
  start(onWake: () => void): Promise<void>
  /** Stop listening, if it is. */
  stop(): void
}

interface MiriamWakeModule {
  isAvailable(): boolean
  start(): Promise<void>
  stop(): void
  addListener(event: 'onWake', listener: (e: { keyword: string }) => void): { remove(): void }
}

const native = requireOptionalNativeModule<MiriamWakeModule>('MiriamWake')

let subscription: { remove(): void } | null = null

export const wakeEngine: WakeEngine | null =
  native && native.isAvailable()
    ? {
        async start(onWake) {
          subscription?.remove()
          subscription = native.addListener('onWake', () => {
            subscription?.remove()
            subscription = null
            onWake()
          })
          await native.start()
        },
        stop() {
          subscription?.remove()
          subscription = null
          native.stop()
        },
      }
    : null
