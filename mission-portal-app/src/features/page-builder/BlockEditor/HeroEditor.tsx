import { YStack, XStack, Text, Input, Checkbox, Label } from 'tamagui'
import { checkImageAddress } from '@/lib/imageAddress'
import type { HeroData } from '@/types/pages'

interface HeroEditorProps {
  data: HeroData
  onChange: (data: HeroData) => void
}

export function HeroEditor({ data, onChange }: HeroEditorProps) {
  const update = (patch: Partial<HeroData>) => onChange({ ...data, ...patch })
  const bgWarning = checkImageAddress(data.bgImage)

  return (
    <YStack gap="$3">
      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Heading
        </Text>
        <Input
          placeholder="Main heading"
          value={data.heading ?? ''}
          onChangeText={(v) => update({ heading: v })}
          size="$3"
        />
      </YStack>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Subheading
        </Text>
        <Input
          placeholder="Subheading text"
          value={data.subheading ?? ''}
          onChangeText={(v) => update({ subheading: v })}
          size="$3"
        />
      </YStack>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Background Image URL
        </Text>
        <Input
          placeholder="https://..."
          value={data.bgImage ?? ''}
          onChangeText={(v) => update({ bgImage: v })}
          size="$3"
          autoCapitalize="none"
        />
        {bgWarning ? (
          <Text fontSize="$1" color="$orange10">
            {bgWarning}
          </Text>
        ) : null}
      </YStack>

      <XStack alignItems="center" gap="$2">
        <Checkbox
          id="hero-parallax"
          checked={data.parallax ?? false}
          onCheckedChange={(v) => update({ parallax: v === true })}
          size="$3"
        >
          <Checkbox.Indicator>
            <Text>✓</Text>
          </Checkbox.Indicator>
        </Checkbox>
        <Label htmlFor="hero-parallax" fontSize="$3">
          Parallax effect
        </Label>
      </XStack>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Overlay Color (hex, e.g. #00000080)
        </Text>
        <Input
          placeholder="#00000066"
          value={data.overlayColor ?? ''}
          onChangeText={(v) => update({ overlayColor: v })}
          size="$3"
          autoCapitalize="none"
          maxLength={9}
        />
      </YStack>

      <YStack gap="$1">
        <Text fontSize="$3" fontWeight="600">
          Text Color Override (hex)
        </Text>
        <Input
          placeholder="#ffffff"
          value={data.textColor ?? ''}
          onChangeText={(v) => update({ textColor: v })}
          size="$3"
          autoCapitalize="none"
          maxLength={7}
        />
      </YStack>
    </YStack>
  )
}
