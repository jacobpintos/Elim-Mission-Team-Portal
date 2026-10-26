import { useEffect, useState } from 'react'
import { Pressable } from 'react-native'
import { Input, Text, XStack, YStack } from 'tamagui'
import { Modal } from '@/components/ui/Modal'
import { useThemeColors } from '@/theme/useThemeColors'
import { confirmAsync } from '@/lib/confirm'
import { localToday } from '@/lib/events'
import {
  daySaid,
  nextDate,
  OCCASION_ICON,
  occasionTitle,
  type Occasion,
  type OccasionKind,
  type OccasionPerson,
} from '@/lib/occasions'
import { newOccasionId, useOccasionsStore } from '@/stores/occasionsStore'
import { useUIStore } from '@/stores/uiStore'
import { useUsersStore } from '@/stores/usersStore'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** The most days each month can have: the 29th of February is someone's birthday. */
const MOST_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/** When it comes round next: "Sunday, Nov 1" — "Today, Nov 1", "Tomorrow, Nov 1" when it's that close. */
function comingSaid(o: Occasion, today: string): string {
  const date = nextDate(o, today)
  const said = daySaid(date, today)
  if (said !== 'today' && said !== 'tomorrow') return said
  const when = said === 'today' ? 'Today' : 'Tomorrow'
  return `${when}, ${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8))}`
}

const blank = (kind: OccasionKind): Occasion => ({
  id: newOccasionId(),
  kind,
  people: kind === 'birthday' ? [{ name: '' }] : [{ name: '' }, { name: '' }],
  month: 0,
  day: 0,
})

/**
 * Birthdays and anniversaries on the event calendar, kept by admins
 * (lib/occasions): the list, soonest first, and one added or changed.
 * `editing`: opened at that one, from its day on the calendar.
 */
export function OccasionsSheet({
  open,
  onClose,
  editing,
}: {
  open: boolean
  onClose: () => void
  editing?: Occasion | null
}) {
  const colors = useThemeColors()
  const occasions = useOccasionsStore((s) => s.occasions)
  const names = new Map(useUsersStore((s) => s.users).map((u) => [String(u.uid), u.displayName]))
  const [draft, setDraft] = useState<Occasion | null>(null)

  // Opened at one from the calendar, or at the list.
  useEffect(() => {
    // Loaded each time it opens, not a change of this sheet's own state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setDraft(editing ?? null)
  }, [open, editing])

  const today = localToday()
  const soonest = [...occasions].sort((a, b) =>
    nextDate(a, today).localeCompare(nextDate(b, today))
  )

  return (
    <Modal
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      title={
        draft
          ? `${occasions.some((o) => o.id === draft.id) ? 'Edit' : 'New'} ${draft.kind}`
          : 'Birthdays & Anniversaries'
      }
      scrollable
    >
      {draft ? (
        <OccasionForm
          key={draft.id}
          draft={draft}
          isNew={!occasions.some((o) => o.id === draft.id)}
          onChange={setDraft}
          onDone={() => (editing ? onClose() : setDraft(null))}
        />
      ) : (
        <YStack gap="$3">
          <Text color={colors.textMuted} fontSize="$2">
            Shown on the event calendar to everyone but guests and public accounts, and in Miriam’s
            briefing the week before.
          </Text>
          <XStack gap="$2">
            {(['birthday', 'anniversary'] as const).map((kind) => (
              <Pressable key={kind} onPress={() => setDraft(blank(kind))}>
                <XStack
                  backgroundColor={colors.primary}
                  borderRadius="$2"
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                >
                  <Text color="white" fontWeight="700" fontSize="$3">
                    {OCCASION_ICON[kind]} Add {kind}
                  </Text>
                </XStack>
              </Pressable>
            ))}
          </XStack>
          {soonest.length === 0 ? (
            <Text color={colors.textMuted} fontSize="$3">
              None yet.
            </Text>
          ) : (
            <YStack borderWidth={1} borderColor={colors.border} borderRadius="$3">
              {soonest.map((o, i) => (
                <Pressable key={o.id} onPress={() => setDraft(o)}>
                  <XStack
                    padding="$3"
                    gap="$2"
                    alignItems="center"
                    borderBottomWidth={i === soonest.length - 1 ? 0 : 1}
                    borderBottomColor={colors.border}
                  >
                    <Text fontSize="$5">{OCCASION_ICON[o.kind]}</Text>
                    <YStack flex={1}>
                      <Text color={colors.text} fontWeight="600" fontSize="$3">
                        {occasionTitle(o, names)}
                      </Text>
                      <Text color={colors.textMuted} fontSize="$2">
                        {comingSaid(o, today)}
                      </Text>
                    </YStack>
                    <Text color={colors.textMuted}>›</Text>
                  </XStack>
                </Pressable>
              ))}
            </YStack>
          )}
        </YStack>
      )}
    </Modal>
  )
}

function OccasionForm({
  draft,
  isNew,
  onChange,
  onDone,
}: {
  draft: Occasion
  isNew: boolean
  onChange: (o: Occasion) => void
  onDone: () => void
}) {
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)
  const { save, remove } = useOccasionsStore()
  const [busy, setBusy] = useState(false)
  const [dayText, setDayText] = useState(draft.day ? String(draft.day) : '')

  const setPerson = (i: number, p: OccasionPerson) =>
    onChange({ ...draft, people: draft.people.map((x, j) => (j === i ? p : x)) })

  const most = draft.month ? MOST_DAYS[draft.month - 1] : 31
  const day = Number(dayText)
  const problem = draft.people.some((p) => !p.name.trim())
    ? draft.kind === 'birthday'
      ? 'Whose birthday is it?'
      : 'Whose anniversary is it? Both of them.'
    : !draft.month
      ? 'Which month?'
      : !(Number.isInteger(day) && day >= 1 && day <= most)
        ? `Which day? 1 to ${most}.`
        : null

  const onSave = async () => {
    if (problem) return toast(problem, 'error')
    setBusy(true)
    try {
      await save({ ...draft, day })
      toast(isNew ? `Added ${occasionTitle(draft)}.` : 'Saved.', 'success')
      onDone()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Couldn’t save that.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const onRemove = async () => {
    if (!(await confirmAsync(`Remove ${occasionTitle(draft)} from the calendar?`))) return
    setBusy(true)
    try {
      await remove(draft.id)
      onDone()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Couldn’t remove that.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <YStack gap="$3">
      {draft.people.map((p, i) => (
        <PersonField
          key={i}
          label={
            draft.kind === 'birthday' ? 'Whose birthday' : i === 0 ? 'One of the couple' : 'And'
          }
          value={p}
          onChange={(v) => setPerson(i, v)}
        />
      ))}

      <YStack gap="$1.5">
        <Text color={colors.text} fontWeight="600" fontSize="$3">
          Month
        </Text>
        <XStack flexWrap="wrap" gap="$1.5">
          {MONTHS.map((m, i) => {
            const on = draft.month === i + 1
            return (
              <Pressable key={m} onPress={() => onChange({ ...draft, month: i + 1 })}>
                <XStack
                  width={52}
                  justifyContent="center"
                  paddingVertical="$1.5"
                  borderRadius="$2"
                  borderWidth={1}
                  borderColor={on ? colors.primary : colors.border}
                  backgroundColor={on ? colors.primary : 'transparent'}
                >
                  <Text color={on ? 'white' : colors.text} fontSize="$2" fontWeight="600">
                    {m}
                  </Text>
                </XStack>
              </Pressable>
            )
          })}
        </XStack>
      </YStack>

      <YStack gap="$1.5">
        <Text color={colors.text} fontWeight="600" fontSize="$3">
          Day
        </Text>
        <Input
          width={90}
          value={dayText}
          onChangeText={(v) => setDayText(v.replace(/\D/g, '').slice(0, 2))}
          keyboardType="number-pad"
          placeholder={`1–${most}`}
          backgroundColor={colors.surface}
          color={colors.text}
          borderColor={colors.border}
          size="$3"
          accessibilityLabel="Day of the month"
        />
      </YStack>

      <XStack gap="$2" justifyContent="space-between" alignItems="center" flexWrap="wrap">
        {!isNew ? (
          <Pressable onPress={onRemove} disabled={busy}>
            <Text color="$red10" fontWeight="600" fontSize="$3">
              Remove
            </Text>
          </Pressable>
        ) : (
          <YStack />
        )}
        <XStack gap="$2">
          <Pressable onPress={onDone} disabled={busy}>
            <XStack
              borderWidth={1}
              borderColor={colors.border}
              borderRadius="$2"
              paddingHorizontal="$4"
              paddingVertical="$2"
            >
              <Text color={colors.textMuted}>Cancel</Text>
            </XStack>
          </Pressable>
          <Pressable onPress={onSave} disabled={busy}>
            <XStack
              backgroundColor={colors.primary}
              borderRadius="$2"
              paddingHorizontal="$4"
              paddingVertical="$2"
              opacity={busy ? 0.6 : 1}
            >
              <Text color="white" fontWeight="700">
                {busy ? 'Saving…' : 'Save'}
              </Text>
            </XStack>
          </Pressable>
        </XStack>
      </XStack>
    </YStack>
  )
}

/**
 * A name, typed — or picked from those with an account, so the calendar
 * keeps up with their name if it changes.
 */
function PersonField({
  label,
  value,
  onChange,
}: {
  label: string
  value: OccasionPerson
  onChange: (p: OccasionPerson) => void
}) {
  const colors = useThemeColors()
  const users = useUsersStore((s) => s.users)
  const typed = value.name.trim().toLowerCase()
  const matches =
    typed && !value.uid
      ? users
          .filter((u) => (u.displayName ?? '').toLowerCase().includes(typed))
          .filter((u) => (u.displayName ?? '').toLowerCase() !== typed)
          .slice(0, 4)
      : []

  return (
    <YStack gap="$1.5">
      <Text color={colors.text} fontWeight="600" fontSize="$3">
        {label}
      </Text>
      <Input
        value={value.name}
        onChangeText={(name) => onChange({ name })}
        placeholder="Name"
        backgroundColor={colors.surface}
        color={colors.text}
        borderColor={colors.border}
        size="$3"
      />
      {value.uid ? (
        <Text color={colors.textMuted} fontSize="$1">
          ✓ Their account — the calendar follows their name if it changes.
        </Text>
      ) : null}
      {matches.map((u) => (
        <Pressable
          key={String(u.uid)}
          onPress={() => onChange({ name: u.displayName ?? '', uid: String(u.uid) })}
        >
          <XStack
            paddingHorizontal="$3"
            paddingVertical="$2"
            borderRadius="$2"
            borderWidth={1}
            borderColor={colors.border}
          >
            <Text color={colors.text} fontSize="$3">
              {u.displayName}
            </Text>
          </XStack>
        </Pressable>
      ))}
    </YStack>
  )
}
