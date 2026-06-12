import { useRef, useState } from 'react'
import { Platform, Pressable, ActivityIndicator } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'

const STORAGE_KEY = 'theme.photoColors'

interface PhotoColorExtractorProps {
  onSetPrimary: (hex: string) => void
  onSetSecondary: (hex: string) => void
  onSetLogo?: (dataUrl: string) => Promise<void>
}

function loadStoredColors(): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((c) => /^#[0-9a-f]{6}$/i.test(c)) : []
  } catch {
    return []
  }
}

function storeColors(colors: string[]) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors))
  } catch {
    // storage full or unavailable — colors just won't persist
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)
}

// Downscale the photo to a small canvas, bucket pixels into coarse RGB bins,
// then pick the most frequent buckets that are sufficiently distinct from
// each other. Runs entirely in the browser — the image never leaves the device.
async function extractColors(dataUrl: string): Promise<string[]> {
  const img = new window.Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Could not read image'))
    img.src = dataUrl
  })

  const SIZE = 64
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(img, 0, 0, SIZE, SIZE)
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE)

  // Bucket by top 4 bits per channel, averaging the real pixel values in
  // each bucket so the swatch matches the photo rather than the bin center.
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.r += r; bucket.g += g; bucket.b += b; bucket.n++
    } else {
      buckets.set(key, { r, g, b, n: 1 })
    }
  }

  const ranked = [...buckets.values()]
    .map((b) => ({ rgb: [b.r / b.n, b.g / b.n, b.b / b.n] as [number, number, number], n: b.n }))
    .sort((a, b) => b.n - a.n)

  const picked: [number, number, number][] = []
  for (const { rgb } of ranked) {
    if (picked.length >= 8) break
    if (picked.every((p) => colorDistance(p, rgb) > 60)) picked.push(rgb)
  }

  return picked.map(([r, g, b]) => rgbToHex(r, g, b))
}

export function PhotoColorExtractor({ onSetPrimary, onSetSecondary, onSetLogo }: PhotoColorExtractorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [colors, setColors] = useState<string[]>(loadStoredColors)
  const [selected, setSelected] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null)
  const [settingLogo, setSettingLogo] = useState(false)

  if (Platform.OS !== 'web') return null

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAnalyzing(true)
    setError(null)
    setSelected(null)
    setCapturedDataUrl(null)
    try {
      const reader = new FileReader()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const extracted = await extractColors(dataUrl)
      setColors(extracted)
      storeColors(extracted)
      // Keep the dataUrl only when logo replacement is available
      if (onSetLogo) setCapturedDataUrl(dataUrl)
    } catch {
      setError('Could not analyze that photo. Try a different image.')
    } finally {
      setAnalyzing(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleClear = () => {
    setColors([])
    setSelected(null)
    setCapturedDataUrl(null)
    storeColors([])
  }

  const handleSetLogo = async () => {
    if (!capturedDataUrl || !onSetLogo) return
    setSettingLogo(true)
    setError(null)
    try {
      await onSetLogo(capturedDataUrl)
      setCapturedDataUrl(null)
    } catch {
      setError('Failed to update logo. Try again.')
    } finally {
      setSettingLogo(false)
    }
  }

  return (
    <YStack gap="$2" padding="$3" backgroundColor="$gray2" borderRadius="$3">
      <Text fontWeight="700" fontSize="$3">
        Colors from Photo
      </Text>
      <Text fontSize="$2" color="$gray10">
        Upload a photo to pull its main colors.
        {onSetLogo
          ? ' You can also use the photo as the app logo.'
          : ' The photo is analyzed on your device and deleted after the colors are extracted.'}
      </Text>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <XStack gap="$2" alignItems="center">
        <Pressable onPress={() => fileInputRef.current?.click()} disabled={analyzing}>
          <XStack
            borderWidth={1}
            borderColor="$gray8"
            borderRadius="$2"
            paddingHorizontal="$3"
            paddingVertical="$2"
            alignItems="center"
            gap="$2"
            opacity={analyzing ? 0.6 : 1}
          >
            {analyzing ? <ActivityIndicator size="small" /> : null}
            <Text fontSize="$3">{analyzing ? 'Analyzing…' : 'Upload Photo'}</Text>
          </XStack>
        </Pressable>
        {colors.length > 0 ? (
          <Pressable onPress={handleClear}>
            <Text fontSize="$2" color="$gray10" textDecorationLine="underline">
              Clear
            </Text>
          </Pressable>
        ) : null}
      </XStack>

      {error ? (
        <Text fontSize="$2" color="$red10">
          {error}
        </Text>
      ) : null}

      {colors.length > 0 ? (
        <XStack flexWrap="wrap" gap="$2">
          {colors.map((hex) => (
            <Pressable key={hex} onPress={() => setSelected(selected === hex ? null : hex)}>
              <YStack alignItems="center" gap="$1">
                <YStack
                  width={44}
                  height={44}
                  borderRadius="$2"
                  backgroundColor={hex}
                  borderWidth={selected === hex ? 3 : 1}
                  borderColor={selected === hex ? '$blue10' : '$gray8'}
                />
                <Text fontSize={10} color="$gray10">
                  {hex}
                </Text>
              </YStack>
            </Pressable>
          ))}
        </XStack>
      ) : null}

      {selected ? (
        <XStack gap="$2" alignItems="center">
          <YStack width={20} height={20} borderRadius={99} backgroundColor={selected} />
          <Pressable
            onPress={() => {
              onSetPrimary(selected)
              setSelected(null)
            }}
          >
            <XStack
              backgroundColor={selected}
              borderRadius="$2"
              paddingHorizontal="$3"
              paddingVertical="$1.5"
            >
              <Text color="white" fontSize="$2" fontWeight="600">
                Set as Primary
              </Text>
            </XStack>
          </Pressable>
          <Pressable
            onPress={() => {
              onSetSecondary(selected)
              setSelected(null)
            }}
          >
            <XStack
              borderWidth={1}
              borderColor={selected}
              borderRadius="$2"
              paddingHorizontal="$3"
              paddingVertical="$1.5"
            >
              <Text fontSize="$2" fontWeight="600">
                Set as Secondary
              </Text>
            </XStack>
          </Pressable>
        </XStack>
      ) : null}

      {onSetLogo && capturedDataUrl ? (
        <YStack
          gap="$2"
          paddingTop="$3"
          marginTop="$1"
          borderTopWidth={1}
          borderTopColor="$gray6"
        >
          <XStack gap="$3" alignItems="center">
            <img
              src={capturedDataUrl}
              alt="Uploaded photo"
              style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
            />
            <Text fontSize="$2" flex={1}>
              Replace the app logo with this photo? The existing logo will be backed up for 30 days.
            </Text>
          </XStack>
          <XStack gap="$2">
            <Pressable onPress={handleSetLogo} disabled={settingLogo}>
              <XStack
                borderWidth={1}
                borderColor="$gray8"
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$2"
                alignItems="center"
                gap="$2"
                opacity={settingLogo ? 0.6 : 1}
              >
                {settingLogo ? <ActivityIndicator size="small" /> : null}
                <Text fontSize="$2" fontWeight="600">
                  {settingLogo ? 'Uploading…' : 'Replace Logo'}
                </Text>
              </XStack>
            </Pressable>
            <Pressable onPress={() => setCapturedDataUrl(null)} disabled={settingLogo}>
              <XStack paddingHorizontal="$3" paddingVertical="$2">
                <Text fontSize="$2" color="$gray10">
                  No thanks
                </Text>
              </XStack>
            </Pressable>
          </XStack>
        </YStack>
      ) : null}
    </YStack>
  )
}
