import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, TextInput, View } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { MemberPicker } from '@/features/admin/MemberPicker'
import { useUIStore } from '@/stores/uiStore'
import { useUsersStore } from '@/stores/usersStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { isPublic } from '@/lib/roles'
import { eitherSexLabel, hasRules, type PersonRules } from './types'
import { usePersonRulesStore } from './personRulesStore'

/**
 * Custom: The Well. Admin → Vehicles: Special rules for people — for driving
 * (doesn't drive, can't pull a trailer) and seating (can ride with the other
 * sex, keep with, keep apart), and a note shown beside them on the plan.
 * Followed when a carpool is planned from the vehicles, and the seating
 * rules by Auto-assign and Miriam too.
 */
export function PersonRulesSection() {
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)
  const users = useUsersStore((s) => s.users)
  const { rules, subscribe, unsubscribe, save } = usePersonRulesStore()
  const [draft, setDraft] = useState<PersonRules | null>(null)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    subscribe()
    return () => unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const person = (uid: string) => users.find((u) => String(u.uid) === uid)
  const nameOf = (uid: string) => person(uid)?.displayName ?? 'Removed account'
  const listed = [...rules].sort((a, b) => nameOf(a.uid).localeCompare(nameOf(b.uid)))
  const typed = search.trim().toLowerCase()
  const found = typed
    ? users
        .filter(
          (u) =>
            !isPublic(u) &&
            !!u.displayName &&
            u.displayName.toLowerCase().includes(typed) &&
            !rules.some((r) => r.uid === String(u.uid))
        )
        .slice(0, 6)
    : []

  /** Their rules, said in a line. */
  const summary = (r: PersonRules) =>
    [
      r.noDrive ? 'Doesn’t drive' : '',
      r.noTrailer && !r.noDrive ? 'Can’t pull a trailer' : '',
      r.eitherSex ? eitherSexLabel(person(r.uid)?.sex) : '',
      r.keepWith?.length ? `Keep with ${r.keepWith.map(nameOf).join(', ')}` : '',
      r.keepApart?.length ? `Keep apart from ${r.keepApart.map(nameOf).join(', ')}` : '',
      r.note ?? '',
    ]
      .filter(Boolean)
      .join(' · ')

  const keep = async (next: PersonRules) => {
    setSaving(true)
    try {
      await save(next)
      toast(
        hasRules(next)
          ? `Rules for ${nameOf(next.uid)} saved`
          : `${nameOf(next.uid)} has no rules now`,
        'success'
      )
      setDraft(null)
    } catch {
      toast('That didn’t save — try again in a moment.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const rule = (label: string, hint: string, on: boolean, set: (on: boolean) => void) => (
    <Pressable
      onPress={() => set(!on)}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <XStack alignItems="center" gap="$3">
        <View style={[styles.track, { backgroundColor: on ? colors.primary : colors.border }]}>
          <View style={[styles.knob, on && styles.knobOn]} />
        </View>
        <YStack flex={1}>
          <Text fontSize="$3" fontWeight="600" color={colors.text}>
            {label}
          </Text>
          <Text fontSize="$2" color={colors.textMuted}>
            {hint}
          </Text>
        </YStack>
      </XStack>
    </Pressable>
  )
  const button = (text: string, onPress: () => void, primary = false) => (
    <Pressable
      key={text}
      onPress={onPress}
      disabled={saving}
      accessibilityRole="button"
      style={[
        styles.button,
        primary
          ? { backgroundColor: colors.primary, borderColor: colors.primary }
          : { borderColor: colors.border },
      ]}
    >
      <Text color={primary ? 'white' : colors.text} fontWeight={primary ? '700' : '600'}>
        {text}
      </Text>
    </Pressable>
  )
  const input = [
    styles.input,
    { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
  ]

  return (
    <YStack gap="$3" paddingTop="$4">
      <Text fontSize="$6" fontWeight="700" color={colors.text}>
        Special rules for people
      </Text>
      <Text fontSize="$3" color={colors.textMuted}>
        For driving and seating, followed when a carpool is planned. People who share a last name
        may already ride together whatever their sex.
      </Text>

      {draft ? (
        <YStack
          gap="$3"
          padding="$3"
          borderRadius={12}
          borderWidth={1}
          borderColor={colors.primary}
          backgroundColor={colors.surface}
        >
          <Text fontSize="$5" fontWeight="700" color={colors.text}>
            {nameOf(draft.uid)}
          </Text>
          {rule(
            'Doesn’t drive',
            'Never asked to drive; always a passenger.',
            !!draft.noDrive,
            (on) => setDraft({ ...draft, noDrive: on })
          )}
          {!draft.noDrive
            ? rule(
                'Can’t pull a trailer',
                'May drive, but never a vehicle pulling a trailer.',
                !!draft.noTrailer,
                (on) => setDraft({ ...draft, noTrailer: on })
              )
            : null}
          {rule(
            eitherSexLabel(person(draft.uid)?.sex),
            'Not counted as mixed in a vehicle with the other sex.',
            !!draft.eitherSex,
            (on) => setDraft({ ...draft, eitherSex: on })
          )}
          <MemberPicker
            selected={draft.keepWith ?? []}
            onChange={(keepWith) =>
              setDraft({ ...draft, keepWith: keepWith.filter((u) => u !== draft.uid) })
            }
            label="Keep in the same vehicle as"
          />
          <MemberPicker
            selected={draft.keepApart ?? []}
            onChange={(keepApart) =>
              setDraft({ ...draft, keepApart: keepApart.filter((u) => u !== draft.uid) })
            }
            label="Keep apart from"
          />
          <Text fontSize="$2" fontWeight="700" color={colors.textMuted}>
            NOTE (OPTIONAL) — SHOWN ON THE PLAN
          </Text>
          <TextInput
            value={draft.note ?? ''}
            onChangeText={(note) => setDraft({ ...draft, note })}
            placeholder="e.g. Gets carsick — front seat"
            placeholderTextColor={colors.textMuted}
            style={input}
            accessibilityLabel="Note, shown on the plan"
          />
          <XStack gap="$2" justifyContent="space-between" flexWrap="wrap">
            {rules.some((r) => r.uid === draft.uid) ? (
              <Pressable
                onPress={() => keep({ uid: draft.uid })}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text color="$red10" fontSize="$3" fontWeight="600">
                  Clear their rules
                </Text>
              </Pressable>
            ) : (
              <View />
            )}
            <XStack gap="$2">
              {button('Cancel', () => setDraft(null))}
              {button('Save', () => keep(draft), true)}
            </XStack>
          </XStack>
        </YStack>
      ) : null}

      {listed.map((r) => (
        <Pressable
          key={r.uid}
          onPress={() => setDraft({ ...r })}
          accessibilityRole="button"
          accessibilityHint="Change their rules"
        >
          <YStack
            gap="$1"
            padding="$3"
            borderRadius={12}
            borderWidth={1}
            borderColor={colors.border}
            backgroundColor={colors.surface}
          >
            <Text fontSize="$4" fontWeight="700" color={colors.text}>
              {nameOf(r.uid)}
            </Text>
            <Text fontSize="$3" color={colors.textMuted}>
              {summary(r)}
            </Text>
          </YStack>
        </Pressable>
      ))}
      {listed.length === 0 && !draft ? (
        <Text fontSize="$3" color={colors.textMuted}>
          No one has special rules yet.
        </Text>
      ) : null}

      <YStack gap="$1.5">
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="+ Add a person — type their name"
          placeholderTextColor={colors.textMuted}
          style={input}
          accessibilityLabel="Add a person with special rules"
        />
        {found.map((u) => (
          <Pressable
            key={String(u.uid)}
            onPress={() => {
              setDraft({ uid: String(u.uid) })
              setSearch('')
            }}
            accessibilityRole="button"
            style={[styles.found, { borderColor: colors.border }]}
          >
            <Text fontSize="$3" fontWeight="600" color={colors.text}>
              {u.displayName}
            </Text>
          </Pressable>
        ))}
      </YStack>
    </YStack>
  )
}

const styles = StyleSheet.create({
  input: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 15,
  },
  found: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  track: {
    width: 40,
    height: 24,
    borderRadius: 12,
    padding: 3,
  },
  knob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'white',
  },
  knobOn: {
    marginLeft: 16,
  },
  button: {
    minHeight: 38,
    paddingHorizontal: 16,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
