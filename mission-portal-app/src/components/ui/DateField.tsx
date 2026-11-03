import { useState } from 'react'
import { Pressable, TextInput, View, type StyleProp, type TextStyle } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { Text, XStack, YStack } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { isoToDisplay, typedDateToIso } from '@/lib/eventDates'
import { localToday } from '@/lib/events'

const CALENDAR =
  'M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7zM5 10h14v10H5V10z'
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const pad = (n: number) => String(n).padStart(2, '0')

interface DateFieldProps {
  /** As typed: "11/20/26", "1/5/26", or as stored, "2026-11-20". lib/eventDates typedDateToIso reads it. */
  value: string
  onChange: (text: string) => void
  /** The earliest day the calendar offers, YYYY-MM-DD: today, for a date still to come. */
  min?: string
  placeholder?: string
  inputStyle?: StyleProp<TextStyle>
  accessibilityLabel?: string
}

/**
 * A date, typed however it comes — 11/20/26, 1/5/26, 01/5/2026, or 11/20
 * for the next one to come — or picked from a month with the calendar
 * button beside it. What's picked is written
 * into the field as MM/DD/YY, so the field is always what's saved.
 */
export function DateField({
  value,
  onChange,
  min,
  placeholder = 'MM/DD/YY',
  inputStyle,
  accessibilityLabel = 'Date',
}: DateFieldProps) {
  const colors = useThemeColors()
  const [open, setOpen] = useState(false)
  const chosen = typedDateToIso(value) || null
  const [month, setMonth] = useState(() => (chosen ?? min ?? localToday()).slice(0, 7))

  const toggle = () => {
    // Opened at the day in the field, or the first one it offers.
    if (!open) setMonth((typedDateToIso(value) || min || localToday()).slice(0, 7))
    setOpen(!open)
  }

  return (
    <YStack gap="$2">
      <XStack gap="$2" alignItems="center">
        <TextInput
          style={[inputStyle, { flex: 1 }]}
          value={value}
          onChangeText={onChange}
          // Left, it reads as it will be saved: "11/20" as "11/20/26", so the
          // year it took is plain to see.
          onBlur={() => {
            const iso = typedDateToIso(value)
            if (iso && isoToDisplay(iso) !== value) onChange(isoToDisplay(iso))
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
          accessibilityLabel={accessibilityLabel}
        />
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityLabel={open ? 'Close the calendar' : 'Pick from a calendar'}
          accessibilityState={{ expanded: open }}
          hitSlop={4}
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: open ? colors.primary : colors.border,
              backgroundColor: open ? colors.primary + '22' : colors.background,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path d={CALENDAR} fill={open ? colors.primary : colors.text} />
            </Svg>
          </View>
        </Pressable>
      </XStack>
      {open ? (
        <Month
          month={month}
          onMonth={setMonth}
          min={min}
          chosen={chosen}
          onPick={(day) => {
            onChange(isoToDisplay(day))
            setOpen(false)
          }}
        />
      ) : null}
    </YStack>
  )
}

/** One month to pick a day from: days before `min` can't be, the chosen one is marked. */
function Month({
  month,
  onMonth,
  min,
  chosen,
  onPick,
}: {
  month: string
  onMonth: (m: string) => void
  min?: string
  chosen: string | null
  onPick: (day: string) => void
}) {
  const colors = useThemeColors()
  const today = localToday()
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7))
  const first = new Date(y, m - 1, 1).getDay()
  const days = new Date(y, m, 0).getDate()
  const step = (n: number) => {
    const d = new Date(y, m - 1 + n, 1)
    onMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
  }
  const canGoBack = !min || month > min.slice(0, 7)
  const cells = Array.from({ length: Math.ceil((first + days) / 7) * 7 }, (_, i) => {
    const d = i - first + 1
    return d >= 1 && d <= days ? `${month}-${pad(d)}` : null
  })

  return (
    <YStack
      borderWidth={1}
      borderColor={colors.border}
      borderRadius={12}
      padding="$2"
      gap="$1"
      backgroundColor={colors.background}
    >
      <XStack alignItems="center" justifyContent="space-between" paddingBottom="$1">
        <Pressable
          onPress={() => step(-1)}
          disabled={!canGoBack}
          hitSlop={8}
          accessibilityLabel="Previous month"
        >
          <Text
            color={canGoBack ? colors.primary : colors.border}
            fontSize="$5"
            paddingHorizontal="$2"
          >
            ‹
          </Text>
        </Pressable>
        <Text color={colors.text} fontWeight="700" fontSize="$3">
          {MONTHS[m - 1]} {y}
        </Text>
        <Pressable onPress={() => step(1)} hitSlop={8} accessibilityLabel="Next month">
          <Text color={colors.primary} fontSize="$5" paddingHorizontal="$2">
            ›
          </Text>
        </Pressable>
      </XStack>
      <XStack>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <Text key={i} flex={1} textAlign="center" color={colors.textMuted} fontSize={11}>
            {d}
          </Text>
        ))}
      </XStack>
      {Array.from({ length: cells.length / 7 }, (_, w) => (
        <XStack key={w}>
          {cells.slice(w * 7, w * 7 + 7).map((day, i) => {
            if (!day) return <YStack key={i} flex={1} height={36} />
            const off = !!min && day < min
            const on = day === chosen
            return (
              <Pressable
                key={i}
                style={{ flex: 1, alignItems: 'center' }}
                disabled={off}
                onPress={() => onPick(day)}
                accessibilityLabel={new Date(`${day}T12:00:00`).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
                accessibilityState={{ selected: on, disabled: off }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: on ? colors.primary : 'transparent',
                    borderWidth: day === today && !on ? 1 : 0,
                    borderColor: colors.primary,
                  }}
                >
                  <Text
                    color={on ? 'white' : off ? colors.border : colors.text}
                    fontSize={13}
                    fontWeight={on ? '700' : '400'}
                  >
                    {Number(day.slice(8))}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </XStack>
      ))}
    </YStack>
  )
}
