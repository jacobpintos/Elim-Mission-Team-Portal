import { YStack, Text, Switch } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'

interface ToggleSwitchProps {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  /** Left to Tamagui's own default when unset, so callers that never sized
   *  their switch keep the size they had. */
  size?: '$2' | '$3' | '$4'
  disabled?: boolean
  /**
   * Drop the word underneath. For a row where the switch already sits beside
   * text that names its state; never to save space in a list of many.
   */
  hideLabel?: boolean
  /** What the switch controls, for screen readers. */
  accessibilityLabel?: string
}

/**
 * A switch you can tell the state of.
 *
 * Tamagui's SwitchFrame defines no `checked` variant — its background comes
 * from one rule, `unstyled: false -> backgroundColor: '$background'`, which is
 * the page colour whether the switch is on or off. So the thumb's position was
 * the only thing distinguishing the two states, on a track the same colour as
 * what surrounds it. A tester could not tell which of his notification
 * toggles were on, and a settings screen holding twenty of them is unreadable
 * at a glance whatever the individual states are.
 *
 * The track therefore takes the theme's primary colour when on. Nothing in the
 * frame competes for that property, so the prop simply lands.
 *
 * The word "On" or "Off" underneath is what actually settles it, though. The
 * palette is user-editable, so a theme can be chosen whose primary reads as
 * muted against its own background, and colour alone excludes anyone who
 * cannot separate the two hues.
 */
export function ToggleSwitch({
  checked,
  onCheckedChange,
  size,
  disabled = false,
  hideLabel = false,
  accessibilityLabel,
}: ToggleSwitchProps) {
  const colors = useThemeColors()

  // Omitted, not passed as undefined. Tamagui's `size` is a spread variant, so
  // an explicit undefined runs its resolver with no value rather than falling
  // through to the token default — the frame ends up with no dimensions and
  // stretches to fill its parent, which is a full-height track and a thumb the
  // size of a coin. Callers that never set a size must reach Switch with no
  // size prop at all, exactly as they did before this component existed.
  const sizeProps = size ? { size } : {}

  return (
    <YStack alignItems="center" gap="$1" opacity={disabled ? 0.5 : 1}>
      <Switch
        {...sizeProps}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        backgroundColor={checked ? colors.primary : colors.border}
        borderColor={checked ? colors.primary : colors.border}
        accessibilityLabel={accessibilityLabel}
      >
        <Switch.Thumb backgroundColor={checked ? colors.onPrimary : colors.surface} />
      </Switch>
      {hideLabel ? null : (
        <Text
          fontSize={10}
          fontWeight={checked ? '700' : '500'}
          color={checked ? colors.primary : colors.textMuted}
        >
          {checked ? 'On' : 'Off'}
        </Text>
      )}
    </YStack>
  )
}
