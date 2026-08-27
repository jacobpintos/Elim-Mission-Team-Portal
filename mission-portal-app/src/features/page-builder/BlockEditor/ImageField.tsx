import { useState } from 'react'
import { Image } from 'expo-image'
import { YStack, XStack, Text, Input, Button } from 'tamagui'
import { useUIStore } from '@/stores/uiStore'
import { checkImageAddress } from '@/lib/imageAddress'
import { pickAndUploadPageImages, deletePageImage } from '@/lib/pageImageUpload'

interface ImageFieldProps {
  label: string
  value: string | undefined
  onChange: (url: string) => void
  /** Which page's folder the file belongs in. */
  pageKey: string
  placeholder?: string
}

/**
 * One picture: choose a file, or paste an address.
 *
 * Upload comes first because pasting an address is the harder path and the
 * one that goes wrong — it means finding the picture somewhere public,
 * copying its address rather than the page's, and hoping that host keeps
 * serving it. The field stays visible and editable underneath because the
 * addresses already in these pages point at the existing website, and those
 * should keep working without being re-uploaded.
 */
export function ImageField({ label, value, onChange, pageKey, placeholder }: ImageFieldProps) {
  const { toast } = useUIStore()
  const [busy, setBusy] = useState(false)
  const warning = checkImageAddress(value)

  const choose = async () => {
    setBusy(true)
    try {
      const picked = await pickAndUploadPageImages(pageKey)
      if (picked[0]) {
        const replaced = value
        onChange(picked[0].url)
        // Only removes a file this app uploaded for a page, and only once its
        // replacement is safely stored.
        void deletePageImage(replaced)
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Could not add that picture', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <YStack gap="$2">
      <Text fontSize="$3" fontWeight="600">
        {label}
      </Text>

      <XStack gap="$2" alignItems="center">
        {value ? (
          <Image
            source={{ uri: value }}
            style={{ width: 48, height: 48, borderRadius: 6 }}
            contentFit="cover"
          />
        ) : null}
        <Button size="$3" onPress={choose} disabled={busy} theme="active">
          {busy ? 'Uploading…' : value ? 'Replace photo' : 'Choose photo'}
        </Button>
      </XStack>

      <Input
        placeholder={placeholder ?? 'https://... (or use Choose photo)'}
        value={value ?? ''}
        onChangeText={onChange}
        size="$3"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {warning ? (
        <Text fontSize="$1" color="$orange10">
          {warning}
        </Text>
      ) : null}
    </YStack>
  )
}
