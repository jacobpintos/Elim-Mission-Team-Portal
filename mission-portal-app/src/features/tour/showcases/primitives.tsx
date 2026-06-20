import { Pressable } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'

/** A bordered "surface" card, matching the app's surface styling. */
export function ScCard({ children }: { children: React.ReactNode }) {
  const c = useThemeColors()
  return (
    <YStack
      backgroundColor={c.surface}
      borderColor={c.border}
      borderWidth={1}
      borderRadius={12}
      padding="$3"
      gap="$2"
    >
      {children}
    </YStack>
  )
}

/** A faux labelled input box (read-only depiction of a form field). */
export function ScField({
  label,
  value,
  placeholder,
}: {
  label: string
  value?: string
  placeholder?: string
}) {
  const c = useThemeColors()
  return (
    <YStack gap="$1">
      <Text color={c.textMuted} fontSize={12} fontWeight="600">
        {label}
      </Text>
      <YStack
        backgroundColor={c.background}
        borderColor={c.border}
        borderWidth={1}
        borderRadius={8}
        paddingHorizontal="$3"
        paddingVertical="$2"
      >
        <Text color={value ? c.text : c.textMuted} fontSize={14}>
          {value || placeholder || ''}
        </Text>
      </YStack>
    </YStack>
  )
}

/** A toggle row with a working switch (local state only). */
export function ScToggle({
  label,
  on,
  onToggle,
}: {
  label: string
  on: boolean
  onToggle: () => void
}) {
  const c = useThemeColors()
  return (
    <Pressable onPress={onToggle}>
      <XStack alignItems="center" justifyContent="space-between" paddingVertical="$1.5">
        <Text color={c.text} fontSize={14}>
          {label}
        </Text>
        <YStack
          width={44}
          height={26}
          borderRadius={13}
          backgroundColor={on ? c.primary : c.border}
          padding={3}
          alignItems={on ? 'flex-end' : 'flex-start'}
        >
          <YStack width={20} height={20} borderRadius={10} backgroundColor="#fff" />
        </YStack>
      </XStack>
    </Pressable>
  )
}

/** A selectable chip. */
export function ScChip({
  label,
  active,
  onPress,
  tint,
}: {
  label: string
  active?: boolean
  onPress?: () => void
  tint?: string
}) {
  const c = useThemeColors()
  const color = tint ?? c.primary
  return (
    <Pressable onPress={onPress}>
      <YStack
        backgroundColor={active ? color : 'transparent'}
        borderColor={active ? color : c.border}
        borderWidth={1}
        borderRadius={999}
        paddingHorizontal="$3"
        paddingVertical="$1.5"
      >
        <Text
          color={active ? c.onPrimary : c.text}
          fontSize={13}
          fontWeight={active ? '700' : '500'}
        >
          {label}
        </Text>
      </YStack>
    </Pressable>
  )
}

/** A button (primary or outline). */
export function ScButton({
  label,
  onPress,
  kind = 'primary',
  flex,
}: {
  label: string
  onPress?: () => void
  kind?: 'primary' | 'outline' | 'danger'
  flex?: boolean
}) {
  const c = useThemeColors()
  const bg = kind === 'primary' ? c.primary : 'transparent'
  const bd = kind === 'danger' ? '#c0392b' : kind === 'primary' ? c.primary : c.border
  const fg = kind === 'primary' ? c.onPrimary : kind === 'danger' ? '#c0392b' : c.text
  return (
    <Pressable onPress={onPress} style={{ flex: flex ? 1 : undefined }}>
      <YStack
        backgroundColor={bg}
        borderColor={bd}
        borderWidth={1}
        borderRadius={8}
        paddingVertical="$2.5"
        alignItems="center"
      >
        <Text color={fg} fontSize={14} fontWeight="700">
          {label}
        </Text>
      </YStack>
    </Pressable>
  )
}

/** A small colored badge/pill. */
export function ScBadge({ label, color }: { label: string; color: string }) {
  return (
    <YStack
      backgroundColor={color + '22'}
      borderRadius={6}
      paddingHorizontal="$2"
      paddingVertical={2}
    >
      <Text color={color} fontSize={12} fontWeight="700">
        {label}
      </Text>
    </YStack>
  )
}

/** A collapsible section row (used to depict the event detail card sections). */
export function ScSection({
  icon,
  label,
  open,
  onToggle,
  children,
}: {
  icon: string
  label: string
  open: boolean
  onToggle: () => void
  children?: React.ReactNode
}) {
  const c = useThemeColors()
  return (
    <YStack borderColor={c.border} borderWidth={1} borderRadius={10} overflow="hidden">
      <Pressable onPress={onToggle}>
        <XStack
          alignItems="center"
          gap="$2"
          paddingHorizontal="$3"
          paddingVertical="$2.5"
          backgroundColor={open ? c.primary + '11' : 'transparent'}
        >
          <Text fontSize={15}>{icon}</Text>
          <Text color={c.text} fontSize={14} fontWeight="700" flex={1}>
            {label}
          </Text>
          <Text color={c.textMuted} fontSize={13}>
            {open ? '▾' : '▸'}
          </Text>
        </XStack>
      </Pressable>
      {open ? (
        <YStack paddingHorizontal="$3" paddingBottom="$3" paddingTop="$1" gap="$2">
          {children}
        </YStack>
      ) : null}
    </YStack>
  )
}

/** Muted helper line. */
export function ScNote({ children }: { children: React.ReactNode }) {
  const c = useThemeColors()
  return (
    <Text color={c.textMuted} fontSize={12} fontStyle="italic">
      {children}
    </Text>
  )
}

/** Plain label/value row. */
export function ScRow({ label, value }: { label: string; value: string }) {
  const c = useThemeColors()
  return (
    <XStack justifyContent="space-between" gap="$3">
      <Text color={c.textMuted} fontSize={13}>
        {label}
      </Text>
      <Text color={c.text} fontSize={13} fontWeight="600" flexShrink={1} textAlign="right">
        {value}
      </Text>
    </XStack>
  )
}
