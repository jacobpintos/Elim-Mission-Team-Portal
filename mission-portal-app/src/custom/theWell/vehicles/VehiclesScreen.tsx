import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { Spinner, Text, XStack, YStack } from 'tamagui'
import { ScreenTitle } from '@/components/ui/ScreenTitle'
import { MemberPicker } from '@/features/admin/MemberPicker'
import { confirmAsync } from '@/lib/confirm'
import { useUIStore } from '@/stores/uiStore'
import { useUsersStore } from '@/stores/usersStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { ELIM_VAN_ID } from './elimVan'
import { TRAILER_LABELS, type TrailerAbility, type Vehicle } from './types'
import { newVehicleId, useVehiclesStore } from './vehiclesStore'

const TRAILERS: TrailerAbility[] = ['none', 'small', 'both']

/**
 * Custom: The Well. Admin → Vehicles: the vehicles the team can bring to an
 * event — each one's name, how many it seats, who may drive it, and what it
 * can pull — which the carpool planner chooses from (../carpool). Whose a
 * vehicle is doesn't matter, only who may drive it: its owner needn't be
 * going for it to go.
 *
 * The Elim Van is here from the start (./elimVan): its seats and what it can
 * pull can be changed, and drivers of its own added, but it isn't removed.
 */
export function VehiclesScreen() {
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)
  const users = useUsersStore((s) => s.users)
  const { vehicles, loaded, subscribe, unsubscribe, save, remove } = useVehiclesStore()
  const [open, setOpen] = useState<string | null>(null)
  const [draft, setDraft] = useState<Vehicle | null>(null)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    subscribe()
    useUsersStore.getState().subscribe()
    return () => {
      unsubscribe()
      useUsersStore.getState().unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nameOf = (uid: string) =>
    users.find((u) => String(u.uid) === uid)?.displayName ?? 'Removed account'

  const edit = (v: Vehicle) => {
    setOpen(v.id)
    setDraft({ ...v, drivers: [...v.drivers] })
  }
  const cancel = () => {
    setOpen(null)
    setDraft(null)
  }

  const keep = async () => {
    if (!draft) return
    if (!draft.name.trim()) {
      toast('A vehicle needs a name', 'error')
      return
    }
    setSaving(true)
    try {
      await save({ ...draft, name: draft.name.trim() })
      toast(`${draft.name.trim()} saved`, 'success')
      cancel()
    } catch {
      toast('That didn’t save — try again in a moment.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const add = () => {
    const name = newName.trim()
    if (!name) return
    const v: Vehicle = {
      id: newVehicleId(
        name,
        vehicles.map((x) => x.id)
      ),
      name,
      seats: 5,
      drivers: [],
      trailer: 'none',
    }
    setNewName('')
    setOpen(v.id)
    setDraft(v)
  }

  const drop = async (v: Vehicle) => {
    const ok = await confirmAsync(`Remove ${v.name}? It won’t be offered for carpools again.`, {
      title: 'Remove vehicle',
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (!ok) return
    try {
      await remove(v)
      toast(`${v.name} removed`, 'success')
      cancel()
    } catch {
      toast('That couldn’t be removed — try again in a moment.', 'error')
    }
  }

  /** A setting that is on or off, said plainly. */
  const toggle = (label: string, hint: string, on: boolean, set: (on: boolean) => void) => (
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

  // A new vehicle being set up: shown at the top, before it is kept.
  const unsaved = draft && !vehicles.some((v) => v.id === draft.id) ? [draft] : []
  const input = [
    styles.input,
    { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
  ]

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenTitle options={{ title: 'Vehicles', headerShown: false }} />
      <XStack alignItems="center" justifyContent="space-between">
        <Text fontSize="$6" fontWeight="700" color={colors.text}>
          Vehicles
        </Text>
        {!loaded || saving ? <Spinner size="small" /> : null}
      </XStack>
      <Text fontSize="$3" color={colors.textMuted}>
        The vehicles the team can bring to an event. A carpool is planned from these: a vehicle goes
        when one of its drivers is going, whether or not its owner is.
      </Text>

      {[...unsaved, ...vehicles].map((v) => {
        const editing = open === v.id && draft
        const shown = editing ? draft : v
        return (
          <YStack
            key={v.id}
            borderWidth={1}
            borderColor={editing ? colors.primary : colors.border}
            borderRadius={12}
            padding="$3"
            gap="$2"
            backgroundColor={colors.surface}
          >
            {!editing ? (
              <Pressable
                onPress={() => edit(v)}
                accessibilityRole="button"
                accessibilityHint="Change it"
              >
                <YStack gap="$1">
                  <XStack justifyContent="space-between" alignItems="baseline" gap="$2">
                    <Text fontSize="$5" fontWeight="700" color={colors.text} flexShrink={1}>
                      🚐 {v.name}
                    </Text>
                    <Text fontSize="$3" color={colors.textMuted}>
                      {v.seats} seats
                    </Text>
                  </XStack>
                  <Text fontSize="$3" color={colors.textMuted}>
                    {TRAILER_LABELS[v.trailer]}
                    {v.mixedSex ? ' · Men and women together' : ''}
                    {v.fillFirst ? ' · Filled first' : ''}
                    {v.ask ? ' · Asked about each time' : ''}
                  </Text>
                  <Text fontSize="$3" color={colors.text}>
                    {v.anyDriver
                      ? `Anyone who drives another vehicle${v.drivers.length ? `, and ${v.drivers.map(nameOf).join(', ')}` : ''}`
                      : v.drivers.length
                        ? `Drivers: ${v.drivers.map(nameOf).join(', ')}`
                        : 'No drivers yet — it can’t go until it has one.'}
                  </Text>
                  {v.notes ? (
                    <Text fontSize="$2" color={colors.textMuted}>
                      {v.notes}
                    </Text>
                  ) : null}
                </YStack>
              </Pressable>
            ) : (
              <YStack gap="$2.5">
                <Text fontSize="$2" fontWeight="700" color={colors.textMuted}>
                  NAME
                </Text>
                <TextInput
                  value={shown!.name}
                  onChangeText={(name) => setDraft((d) => (d ? { ...d, name } : d))}
                  placeholder="e.g. Andy’s Odyssey"
                  placeholderTextColor={colors.textMuted}
                  style={input}
                  accessibilityLabel="Vehicle name"
                />
                <XStack alignItems="center" gap="$2">
                  <Text fontSize="$2" fontWeight="700" color={colors.textMuted}>
                    SEATS, THE DRIVER COUNTED
                  </Text>
                  <TextInput
                    value={String(shown!.seats)}
                    onChangeText={(t) => {
                      const n = parseInt(t.replace(/\D/g, ''), 10)
                      setDraft((d) =>
                        d ? { ...d, seats: Number.isFinite(n) ? Math.min(n, 60) : 0 } : d
                      )
                    }}
                    keyboardType="number-pad"
                    maxLength={2}
                    style={[...input, styles.seats]}
                    accessibilityLabel="Seats, the driver counted"
                  />
                </XStack>
                <Text fontSize="$2" fontWeight="700" color={colors.textMuted}>
                  CAN PULL
                </Text>
                <XStack gap="$2" flexWrap="wrap">
                  {TRAILERS.map((t) => {
                    const on = shown!.trailer === t
                    return (
                      <Pressable
                        key={t}
                        onPress={() => setDraft((d) => (d ? { ...d, trailer: t } : d))}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: on }}
                        style={[
                          styles.choice,
                          {
                            borderColor: on ? colors.primary : colors.border,
                            backgroundColor: on ? colors.primary : colors.background,
                          },
                        ]}
                      >
                        <Text fontSize="$3" fontWeight="600" color={on ? 'white' : colors.text}>
                          {TRAILER_LABELS[t]}
                        </Text>
                      </Pressable>
                    )
                  })}
                </XStack>
                {toggle(
                  'Men and women may ride together',
                  'Otherwise it is a men’s or a women’s vehicle, by its driver.',
                  !!shown!.mixedSex,
                  (on) => setDraft((d) => (d ? { ...d, mixedSex: on } : d))
                )}
                {toggle(
                  'Fill it first',
                  'When it goes, it is filled before the others, so fewer cars are needed.',
                  !!shown!.fillFirst,
                  (on) => setDraft((d) => (d ? { ...d, fillFirst: on } : d))
                )}
                {shown!.anyDriver ? (
                  <Text fontSize="$3" color={colors.textMuted}>
                    Anyone who may drive another of the vehicles may drive this one. Add others
                    below who may drive only this one.
                  </Text>
                ) : null}
                <MemberPicker
                  selected={shown!.drivers}
                  onChange={(drivers) => setDraft((d) => (d ? { ...d, drivers } : d))}
                  label={shown!.anyDriver ? 'Drivers of its own' : 'Who may drive it'}
                />
                <Text fontSize="$2" fontWeight="700" color={colors.textMuted}>
                  NOTES (OPTIONAL)
                </Text>
                <TextInput
                  value={shown!.notes ?? ''}
                  onChangeText={(notes) => setDraft((d) => (d ? { ...d, notes } : d))}
                  placeholder="Anything to know: a gas card, the hitch size…"
                  placeholderTextColor={colors.textMuted}
                  style={input}
                  accessibilityLabel="Notes"
                />
                <XStack gap="$2" justifyContent="space-between" alignItems="center" flexWrap="wrap">
                  {v.id !== ELIM_VAN_ID && vehicles.some((x) => x.id === v.id) ? (
                    <Pressable onPress={() => drop(v)} accessibilityRole="button" hitSlop={8}>
                      <Text color="$red10" fontSize="$3" fontWeight="600">
                        Remove vehicle
                      </Text>
                    </Pressable>
                  ) : (
                    <View />
                  )}
                  <XStack gap="$2">
                    <Pressable
                      onPress={cancel}
                      accessibilityRole="button"
                      style={[styles.button, { borderColor: colors.border }]}
                    >
                      <Text color={colors.text} fontWeight="600">
                        Cancel
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={keep}
                      disabled={saving}
                      accessibilityRole="button"
                      style={[
                        styles.button,
                        { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}
                    >
                      <Text color="white" fontWeight="700">
                        Save
                      </Text>
                    </Pressable>
                  </XStack>
                </XStack>
              </YStack>
            )}
          </YStack>
        )
      })}

      <XStack gap="$2" alignItems="center">
        <TextInput
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={add}
          placeholder="New vehicle — e.g. Maria’s Sienna"
          placeholderTextColor={colors.textMuted}
          style={[...input, { flex: 1 }]}
          accessibilityLabel="New vehicle’s name"
        />
        <Pressable
          onPress={add}
          accessibilityRole="button"
          style={[styles.button, { backgroundColor: colors.primary, borderColor: colors.primary }]}
        >
          <Text color="white" fontWeight="700">
            Add
          </Text>
        </Pressable>
      </XStack>
    </ScrollView>
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
  seats: {
    width: 56,
    textAlign: 'center',
  },
  choice: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
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
