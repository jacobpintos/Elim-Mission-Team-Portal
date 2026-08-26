import { YStack, XStack, Text, Input, Button } from 'tamagui'
import type { SocialData } from '@/types/pages'

interface SocialEditorProps {
  data: SocialData
  onChange: (data: SocialData) => void
}

export function SocialEditor({ data, onChange }: SocialEditorProps) {
  const links = data.links ?? []

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

          <Input
            placeholder="Icon — platform name, emoji, or a logo address"
            value={link.icon}
            onChangeText={(v) => updateLink(index, { icon: v })}
            size="$3"
            autoCapitalize="none"
          />
          <Text fontSize="$1" color="$gray10">
            Leave blank and the label is used. Facebook, Instagram, YouTube, Venmo, Cash App,
            Tithe.ly and the like have an icon built in; anything else shows its first letter unless
            you paste the address of a logo image, which is then used as-is.
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
