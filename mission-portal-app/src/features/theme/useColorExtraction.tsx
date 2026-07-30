import { useCallback, useMemo, useRef } from 'react'
import { WebView } from 'react-native-webview'
import { SAMPLE_SIZE, paletteFromRGBA } from './palette'
import type { ColorExtraction } from './useColorExtraction.types'

/**
 * React Native has no canvas, so there is no way to read a photo's pixels in
 * app JS. Decoding the JPEG in JavaScript instead would mean holding a
 * full-resolution RGBA buffer in memory — tens of megabytes for a modern phone
 * camera — which risks the OS killing the app on older devices, and a native
 * image library would mean a new native module.
 *
 * A WebView already ships in this app and already works, and WKWebView's own
 * image decoder does the downscale before we ever touch the pixels. So the
 * page below does only the part native cannot do — draw the photo into a
 * SAMPLE_SIZE square and hand back the raw RGBA — and the bucketing runs in
 * app JS against the same {@link paletteFromRGBA} the web build uses.
 *
 * The photo still never leaves the device.
 */
const EXTRACTOR_HTML = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
</head><body><script>
  var SIZE = ${SAMPLE_SIZE};
  function reply(payload) {
    window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }
  function handle(event) {
    var dataUrl = event.data;
    if (typeof dataUrl !== 'string' || dataUrl.indexOf('data:') !== 0) return;
    var img = new Image();
    img.onload = function () {
      try {
        var canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        var d = ctx.getImageData(0, 0, SIZE, SIZE).data;
        var out = new Array(d.length);
        for (var i = 0; i < d.length; i++) out[i] = d[i];
        reply({ pixels: out });
      } catch (e) {
        reply({ error: String((e && e.message) || e) });
      }
    };
    img.onerror = function () { reply({ error: 'Could not read image' }); };
    img.src = dataUrl;
  }
  // iOS delivers WebView.postMessage on window, Android on document.
  window.addEventListener('message', handle);
  document.addEventListener('message', handle);
  reply({ ready: true });
</script></body></html>`

/** How long to wait for the page before giving up on a photo. */
const EXTRACT_TIMEOUT_MS = 15000

interface Pending {
  resolve: (colors: string[]) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export function useColorExtraction(): ColorExtraction {
  const webRef = useRef<WebView>(null)
  const pending = useRef<Pending | null>(null)
  const ready = useRef(false)
  // Photos picked before the page finishes loading wait here rather than
  // being dropped — the user can tap well before a WebView is ready.
  const queued = useRef<string | null>(null)

  const settle = useCallback((fn: (p: Pending) => void) => {
    const p = pending.current
    if (!p) return
    clearTimeout(p.timer)
    pending.current = null
    fn(p)
  }, [])

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      let payload: { ready?: boolean; pixels?: number[]; error?: string }
      try {
        payload = JSON.parse(event.nativeEvent.data)
      } catch {
        return
      }

      if (payload.ready) {
        ready.current = true
        if (queued.current !== null) {
          const dataUrl = queued.current
          queued.current = null
          webRef.current?.postMessage(dataUrl)
        }
        return
      }

      if (payload.error) {
        settle((p) => p.reject(new Error(payload.error)))
        return
      }

      if (payload.pixels) {
        const pixels = payload.pixels
        settle((p) => p.resolve(paletteFromRGBA(pixels)))
      }
    },
    [settle]
  )

  const extract = useCallback(
    (dataUrl: string) =>
      new Promise<string[]>((resolve, reject) => {
        // One photo at a time; a second tap replaces the first.
        settle((p) => p.reject(new Error('Superseded by another photo')))

        pending.current = {
          resolve,
          reject,
          timer: setTimeout(() => {
            settle((p) => p.reject(new Error('Timed out analyzing that photo')))
          }, EXTRACT_TIMEOUT_MS),
        }

        if (ready.current) {
          webRef.current?.postMessage(dataUrl)
        } else {
          queued.current = dataUrl
        }
      }),
    [settle]
  )

  const bridge = useMemo(
    () => (
      <WebView
        ref={webRef}
        source={{ html: EXTRACTOR_HTML }}
        originWhitelist={['*']}
        onMessage={handleMessage}
        // Offscreen worker, not UI. It must stay mounted to receive messages,
        // so it is sized to nothing rather than conditionally rendered.
        style={{ width: 0, height: 0, opacity: 0 }}
        containerStyle={{ width: 0, height: 0, position: 'absolute' }}
        pointerEvents="none"
        javaScriptEnabled
      />
    ),
    [handleMessage]
  )

  return { extract, bridge }
}
