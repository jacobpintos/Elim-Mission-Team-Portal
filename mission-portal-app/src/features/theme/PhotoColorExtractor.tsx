import { useRef, useState } from 'react'
import { Platform, Pressable, ActivityIndicator, Image as RNImage } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { uriToBlob } from '@/lib/uriToBlob'
import { useColorExtraction } from './useColorExtraction'

const STORAGE_KEY = 'theme.photoColors'

/** The picked photo, in both the forms the two consumers need. */
interface PickedPhoto {
  /** For the swatch preview and, on web, the extractor input. */
  previewUri: string
  /** What gets uploaded if the admin promotes this photo to the app logo. */
  blob: Blob
  contentType: string
}

interface PhotoColorExtractorProps {
  onSetPrimary: (hex: string) => void
  onSetSecondary: (hex: string) => void
  onSetLogo?: (blob: Blob, contentType: string) => Promise<void>
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

export function PhotoColorExtractor({
  onSetPrimary,
  onSetSecondary,
  onSetLogo,
}: PhotoColorExtractorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [colors, setColors] = useState<string[]>(loadStoredColors)
  const [selected, setSelected] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [captured, setCaptured] = useState<PickedPhoto | null>(null)
  const [settingLogo, setSettingLogo] = useState(false)
  const { extract, bridge } = useColorExtraction()

  /** Shared tail of both pick paths: analyze, then offer the logo swap. */
  const analyze = async (dataUrl: string, photo: PickedPhoto) => {
    setAnalyzing(true)
    setError(null)
    setSelected(null)
    setCaptured(null)
    try {
      const extracted = await extract(dataUrl)
      setColors(extracted)
      storeColors(extracted)
      // Keep the photo only when logo replacement is available
      if (onSetLogo) setCaptured(photo)
    } catch {
      setError('Could not analyze that photo. Try a different image.')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const reader = new FileReader()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      await analyze(dataUrl, {
        previewUri: dataUrl,
        blob: file,
        contentType: file.type || 'image/jpeg',
      })
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const pickPhoto = async () => {
    if (Platform.OS === 'web') {
      fileInputRef.current?.click()
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ImagePicker = require('expo-image-picker')
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      setError('Enable photo access for Mission Portal in your device settings')
      return
    }

    // base64 feeds the extractor; the URI is what gets read into a Blob for
    // upload, since React Native cannot build one from bytes.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
      base64: true,
    })
    if (result.canceled) return
    const asset = result.assets?.[0]
    if (!asset?.uri || !asset.base64) return

    const contentType = asset.mimeType ?? 'image/jpeg'
    try {
      await analyze(`data:${contentType};base64,${asset.base64}`, {
        previewUri: asset.uri,
        blob: await uriToBlob(asset.uri),
        contentType,
      })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not read that photo')
    }
  }

  const handleClear = () => {
    setColors([])
    setSelected(null)
    setCaptured(null)
    storeColors([])
  }

  const handleSetLogo = async () => {
    if (!captured || !onSetLogo) return
    setSettingLogo(true)
    setError(null)
    try {
      await onSetLogo(captured.blob, captured.contentType)
      setCaptured(null)
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

      {Platform.OS === 'web' ? (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      ) : null}
      {bridge}

      <XStack gap="$2" alignItems="center">
        <Pressable onPress={pickPhoto} disabled={analyzing}>
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

      {onSetLogo && captured ? (
        <YStack
          gap="$2"
          paddingTop="$3"
          marginTop="$1"
          borderTopWidth={1}
          borderTopColor="$gray6"
        >
          <XStack gap="$3" alignItems="center">
            <RNImage
              source={{ uri: captured.previewUri }}
              accessibilityLabel="Uploaded photo"
              resizeMode="cover"
              style={{ width: 56, height: 56, borderRadius: 6, flexShrink: 0 }}
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
            <Pressable onPress={() => setCaptured(null)} disabled={settingLogo}>
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
