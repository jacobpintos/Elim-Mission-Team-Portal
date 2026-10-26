import { useState } from 'react'
import { Image } from 'expo-image'
import { YStack, XStack, Text, Input, Button } from 'tamagui'
import type { SocialData } from '@/types/pages'
import { useUIStore } from '@/stores/uiStore'
import { pickAndUploadPageImages, deletePageImage } from '@/lib/pageImageUpload'
import { resolveSocialIcon } from '@/lib/socialIcon'

/** A logo uploaded or pasted for the link, rather than an emoji or nothing. */
const hasLogo = (icon: string) => resolveSocialIcon(icon, '').kind === 'image'

interface SocialEditorProps {
  data: SocialData
  onChange: (data: SocialData) => void
  /** Which page's folder an uploaded logo belongs in. */
  pageKey: string
}

export function SocialEditor({ data, onChange, pageKey }: SocialEditorProps) {
  const links = data.links ?? []
  const { toast } = useUIStore()
  /** The link whose logo is uploading. */
  const [uploading, setUploading] = useState<number | null>(null)

  const updateLink = (
    index: number,
    patch: Partial<{ icon: string; label: string; url: string }>
  ) => {
    const updated = [...links]
    updated[index] = { ...updated[index], ...patch }
    onChange({ ...data, links: updated })
  }

  const addLink = () => {
    onChange({ ...data, links: [...links, { icon: '', label: '', url: '' }] })
  }

  const removeLink = (index: number) => {
    onChange({ ...data, links: links.filter((_, i) => i !== index) })
  }

  // A platform's logo, as a file: Tithe.ly's from its brand page, say.
  const uploadLogo = async (index: number) => {
    setUploading(index)
    try {
      const picked = await pickAndUploadPageImages(pageKey)
      if (picked[0]) {
        const replaced = links[index]?.icon
        updateLink(index, { icon: picked[0].url })
        // Only removes a file this app uploaded for a page.
        void deletePageImage(replaced)
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Could not add that logo', 'error')
    } finally {
      setUploading(null)
    }
  }

  return (
    <YStack gap="$3">
      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Section Heading
        </Text>
        <Input
          placeholder="Connect With Us"
          value={data.heading ?? ''}
          onChangeText={(v) => onChange({ ...data, heading: v })}
          size="$3"
        />
      </YStack>

      <Text fontWeight="700" fontSize="$3">
        Social Links
      </Text>

      {links.map((link, index) => (
        <YStack
          key={index}
          gap="$2"
          padding="$2"
          backgroundColor="$gray2"
          borderRadius="$2"
          borderWidth={1}
          borderColor="$borderColor"
        >
          <XStack justifyContent="space-between" alignItems="center">
            <Text fontSize="$2" fontWeight="600" color="$gray10">
              Link {index + 1}
            </Text>
            <Button size="$1" onPress={() => removeLink(index)} theme="red">
              Remove
            </Button>
          </XStack>

          <XStack gap="$2" alignItems="center">
            {hasLogo(link.icon) ? (
              <Image
                source={{ uri: link.icon }}
                style={{ width: 36, height: 36, borderRadius: 8 }}
                contentFit="cover"
              />
            ) : null}
            <Button
              size="$3"
              onPress={() => uploadLogo(index)}
              disabled={uploading !== null}
              theme="active"
            >
              {uploading === index
                ? 'Uploading…'
                : hasLogo(link.icon)
                  ? 'Replace logo'
                  : 'Upload logo'}
            </Button>
          </XStack>
          <Input
            placeholder="Icon — a logo address, or an emoji"
            value={link.icon}
            onChangeText={(v) => updateLink(index, { icon: v })}
            size="$3"
            autoCapitalize="none"
          />
          <Text fontSize="$1" color="$gray10">
            Venmo and Cash App links show their own logos. For any other, upload the platform&apos;s
            logo or paste its address, or type an emoji; left blank, the button shows the first
            letter of the label.
          </Text>
          <Input
            placeholder="Label (e.g. Facebook)"
            value={link.label}
            onChangeText={(v) => updateLink(index, { label: v })}
            size="$3"
          />
          <Input
            placeholder="URL"
            value={link.url}
            onChangeText={(v) => updateLink(index, { url: v })}
            size="$3"
            autoCapitalize="none"
          />
        </YStack>
      ))}

      <Button size="$3" onPress={addLink} theme="active" alignSelf="flex-start">
        + Add Link
      </Button>
    </YStack>
  )
}
