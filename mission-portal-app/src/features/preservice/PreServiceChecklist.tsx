import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { Text, XStack, YStack } from 'tamagui'
import { useAuthStore } from '@/stores/authStore'
import { useUIStore } from '@/stores/uiStore'
import { useUsersStore } from '@/stores/usersStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { isAdmin } from '@/lib/roles'
import { localToday } from '@/lib/events'
import {
  bySection,
  canCheck,
  mineOf,
  progressOf,
  serviceDayFor,
  serviceDaySaid,
  type Check,
  type Checklist,
  type ChecklistItem,
} from './checklist'
import { checkItem, listenChecklist, listenChecks, uncheckItem } from './preServiceDb'
import { ChecklistEditor } from './ChecklistEditor'

/**
 * Operations → Pre-service Checklist (./checklist), for the next service:
 * how far along it is, what's yours to check off, and, for admins, the whole
 * list with who has each item and who checked it, and the editor.
 */
export function PreServiceChecklist() {
  const colors = useThemeColors()
  const profile = useAuthStore((s) => s.profile)
  const uid = String(profile?.uid ?? '')
  const admin = isAdmin(profile)
  const users = useUsersStore((s) => s.users)
  const { toast } = useUIStore()
  const [list, setList] = useState<Checklist | null>(null)
  const [failed, setFailed] = useState(false)
  // A service's checks, kept with the day they're for.
  const [checksFor, setChecksFor] = useState<{
    day: string
    checks: Record<string, Check>
  } | null>(null)
  const [editing, setEditing] = useState(false)
  const [today, setToday] = useState(localToday)

  // A new day on coming back to it: the next service may have moved on.
  useFocusEffect(useCallback(() => setToday(localToday()), []))

  useEffect(() => listenChecklist(setList, () => setFailed(true)), [])

  // People's names, for the whole list: an admin's alone.
  useEffect(() => {
    if (!admin) return
    useUsersStore.getState().subscribe()
    return () => useUsersStore.getState().unsubscribe()
  }, [admin])

  const day = list ? serviceDayFor(today, list.serviceDays) : null
  useEffect(() => {
    if (!day) return
    return listenChecks(day, (checks) => setChecksFor({ day, checks }))
  }, [day])
  const checks: Record<string, Check> = checksFor && checksFor.day === day ? checksFor.checks : {}

  const nameOf = (u: string) =>
    users.find((p) => String(p.uid) === u)?.displayName ?? 'Removed account'

  const toggle = async (item: ChecklistItem) => {
    if (!day || !canCheck(item, uid, admin)) return
    const done = !!checks[item.id]
    // Shown at once; the listener puts it right if it doesn't save.
    setChecksFor((c) => {
      const next = { ...(c?.day === day ? c.checks : {}) }
      if (done) delete next[item.id]
      else next[item.id] = { by: uid, at: Date.now() }
      return { day, checks: next }
    })
    try {
      if (done) await uncheckItem(day, item.id)
      else await checkItem(day, item.id, uid)
    } catch {
      toast('That didn’t save. Try again.', 'error')
    }
  }

  if (editing && list) {
    return <ChecklistEditor list={list} uid={uid} onDone={() => setEditing(false)} />
  }

  if (!list || !day) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$5">
        <Text color={colors.textMuted}>
          {failed ? 'The checklist couldn’t be loaded.' : 'Loading…'}
        </Text>
      </YStack>
    )
  }

  const { done, total } = progressOf(list.items, checks)
  const mine = mineOf(list.items, uid)

  const row = (item: ChecklistItem, showWho: boolean) => {
    const check = checks[item.id]
    const can = canCheck(item, uid, admin)
    const detail = [
      showWho
        ? item.assignees.length
          ? item.assignees.map(nameOf).join(', ')
          : 'Not given to anyone'
        : item.section,
      check && showWho ? `checked by ${check.by === uid ? 'you' : nameOf(check.by)}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    return (
      <Pressable
        key={item.id}
        onPress={() => void toggle(item)}
        disabled={!can}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: !!check, disabled: !can }}
        accessibilityLabel={item.text}
      >
        <XStack gap="$3" paddingVertical="$2" alignItems="center">
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              borderWidth: 2,
              borderColor: check ? colors.primary : colors.border,
              backgroundColor: check ? colors.primary : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: can ? 1 : 0.5,
            }}
          >
            {check ? (
              <Text color="white" fontWeight="800" fontSize={14}>
                ✓
              </Text>
            ) : null}
          </View>
          <YStack flex={1}>
            <Text
              color={check ? colors.textMuted : colors.text}
              textDecorationLine={check ? 'line-through' : 'none'}
            >
              {item.text}
            </Text>
            {detail ? (
              <Text color={colors.textMuted} fontSize="$2">
                {detail}
              </Text>
            ) : null}
          </YStack>
        </XStack>
      </Pressable>
    )
  }

  const heading = (text: string) => (
    <Text
      color={colors.textMuted}
      fontSize="$2"
      fontWeight="700"
      textTransform="uppercase"
      letterSpacing={1}
    >
      {text}
    </Text>
  )

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <YStack padding="$4" gap="$4">
        <YStack gap="$2">
          <Text fontSize="$6" fontWeight="700" color={colors.text}>
            Pre-service Checklist
          </Text>
          <Text color={colors.textMuted}>For {serviceDaySaid(day)}</Text>
          {total ? (
            <YStack gap="$1">
              <View
                style={{
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.border,
                  overflow: 'hidden',
                }}
                accessibilityRole="progressbar"
                accessibilityValue={{ min: 0, max: total, now: done }}
              >
                <View
                  style={{
                    width: `${Math.round((done / total) * 100)}%`,
                    height: '100%',
                    backgroundColor: colors.primary,
                  }}
                />
              </View>
              <Text color={colors.text} fontWeight="600">
                {done === total ? `All ${total} done` : `${done} of ${total} done`}
              </Text>
            </YStack>
          ) : (
            <Text color={colors.textMuted}>
              {admin
                ? 'Nothing is on the checklist yet. Build it: what has to be done before a service, and who does each.'
                : 'Nothing is on the checklist yet.'}
            </Text>
          )}
        </YStack>

        {total ? (
          <YStack gap="$1">
            {heading('Yours')}
            {mine.length ? (
              mine.map((item) => row(item, false))
            ) : (
              <Text color={colors.textMuted}>Nothing on it is yours.</Text>
            )}
          </YStack>
        ) : null}

        {admin && total ? (
          <YStack gap="$3">
            {heading('The whole list')}
            {bySection(list.items).map((group) => (
              <YStack key={group.section || '-'} gap="$1">
                {group.section ? (
                  <Text color={colors.text} fontWeight="700">
                    {group.section}
                  </Text>
                ) : null}
                {group.items.map((item) => row(item, true))}
              </YStack>
            ))}
          </YStack>
        ) : null}

        {admin ? (
          <Pressable onPress={() => setEditing(true)} style={{ alignSelf: 'flex-start' }}>
            <View
              style={{
                minHeight: 40,
                borderRadius: 8,
                paddingHorizontal: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primary,
              }}
            >
              <Text color="white" fontWeight="700">
                {total ? 'Edit the checklist' : 'Build the checklist'}
              </Text>
            </View>
          </Pressable>
        ) : null}
      </YStack>
    </ScrollView>
  )
}
