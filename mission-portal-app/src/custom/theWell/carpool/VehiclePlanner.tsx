import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'
import { FullScreenOverlay } from '@/components/ui/FullScreenOverlay'
import { useThemeColors } from '@/theme/useThemeColors'
import { readCarpoolMemory } from '@/lib/carpoolMemoryDb'
import { togetherCounts } from '@/lib/carpoolMemory'
import { CARD_COLORS, cardColorsFor } from '@/features/events/carpoolCards'
import type { CarpoolPerson } from '@/features/events/CarpoolBuilder'
import type { AvailResponse, CarpoolCarData, CarpoolChild } from '@/types/events'
import { useVehiclesStore } from '../vehicles/vehiclesStore'
import type { TrailersNeeded } from '../vehicles/types'
import { planVehicles } from './planVehicles'
import { usePersonRulesStore } from '../people/personRulesStore'
import { familyName } from '@/features/events/carpoolAssign'

type Trailers = 'none' | 'small' | 'big' | 'both'
const TRAILER_CHOICES: { key: Trailers; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'small', label: 'Small trailer' },
  { key: 'big', label: 'Big trailer' },
  { key: 'both', label: 'Both' },
]
const needed = (t: Trailers): TrailersNeeded => ({
  small: t === 'small' || t === 'both',
  big: t === 'big' || t === 'both',
})

export interface VehiclePlannerProps {
  /** What it's for, under the title: the event and its date. */
  subtitle?: string
  /** Everyone on the event. */
  people: CarpoolPerson[]
  /** Their answer for this date, or null for none. */
  statusOf: (uid: string) => AvailResponse['status'] | null
  /** The event and date, as its cars are remembered: its own last arrangement isn't another time. */
  rideKey?: string
  onUse: (cars: CarpoolCarData[]) => void
  onClose: () => void
}

/**
 * Custom: The Well. A carpool planned from the team's vehicles (./planVehicles):
 * first the questions — which trailers, and "Bring the Elim Van?" — then the
 * plan: each vehicle with its driver and who rides, to change before it is
 * used. A driver who can't drive this time is swapped out ("Can't drive"),
 * children are added to a vehicle, and when a vehicle is full the next is
 * offered. "Use this plan" hands the cars to the event's carpool, where they
 * can still be arranged by hand before the event is saved.
 */
export function VehiclePlanner({
  subtitle,
  people,
  statusOf,
  rideKey,
  onUse,
  onClose,
}: VehiclePlannerProps) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { vehicles, loaded, subscribe, unsubscribe } = useVehiclesStore()
  // Special rules for people (Admin → Vehicles), followed in the plan.
  const personRules = usePersonRulesStore((s) => s.rules)
  const [step, setStep] = useState<'ask' | 'plan'>('ask')
  const [trailers, setTrailers] = useState<Trailers | null>(null)
  const [bring, setBring] = useState<Record<string, boolean>>({})
  const [countUnsure, setCountUnsure] = useState(true)
  const [cantDrive, setCantDrive] = useState<string[]>([])
  const [added, setAdded] = useState<string[]>([])
  const [children, setChildren] = useState<Record<string, CarpoolChild[]>>({})
  const [childName, setChildName] = useState<Record<string, string>>({})
  const [seed, setSeed] = useState(() => Date.now() % 2147483647)
  const [together, setTogether] = useState<ReadonlyMap<string, number>>(new Map())

  useEffect(() => {
    subscribe()
    usePersonRulesStore.getState().subscribe()
    let live = true
    readCarpoolMemory().then((m) => live && setTogether(togetherCounts(m, rideKey)))
    return () => {
      live = false
      unsubscribe()
      usePersonRulesStore.getState().unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const byUid = new Map(people.map((p) => [p.uid, p]))
  const nameOf = (uid: string) => byUid.get(uid)?.name ?? 'Someone'
  const notGoing = people.filter((p) => statusOf(p.uid) === 'no')
  const unsure = people.filter((p) => {
    const s = statusOf(p.uid)
    return s === null || s === 'tbd'
  })
  const going = people.filter(
    (p) => statusOf(p.uid) !== 'no' && (countUnsure || !unsure.includes(p))
  )
  const asked = vehicles.filter((v) => v.ask)
  const ready = trailers !== null && asked.every((v) => bring[v.id] !== undefined)

  const plan = useMemo(
    () =>
      step === 'plan' && trailers
        ? planVehicles({
            vehicles,
            people: going.map((p) => ({ uid: p.uid, sex: p.sex, family: familyName(p.name) })),
            trailers: needed(trailers),
            bring,
            cantDrive,
            add: added,
            children,
            together,
            rules: personRules,
            seed,
          })
        : null,
    // Worked out again when anything it is planned from changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      step,
      trailers,
      vehicles,
      bring,
      cantDrive,
      added,
      children,
      together,
      seed,
      countUnsure,
      personRules,
    ]
  )

  const addChild = (vehicleId: string) => {
    const name = (childName[vehicleId] ?? '').trim()
    if (!name) return
    setChildren((c) => ({
      ...c,
      [vehicleId]: [
        ...(c[vehicleId] ?? []),
        { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name },
      ],
    }))
    setChildName((n) => ({ ...n, [vehicleId]: '' }))
  }
  const removeChild = (vehicleId: string, id: string) =>
    setChildren((c) => ({ ...c, [vehicleId]: (c[vehicleId] ?? []).filter((k) => k.id !== id) }))

  const label = (text: string) => (
    <Text color={colors.textMuted} fontSize="$2" fontWeight="700" letterSpacing={0.5}>
      {text}
    </Text>
  )
  const choice = (key: string, text: string, on: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      onPress={onPress}
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
      <Text color={on ? colors.onPrimary : colors.text} fontSize="$3" fontWeight="600">
        {text}
      </Text>
    </Pressable>
  )
  const button = (text: string, onPress: () => void, primary = false, disabled = false) => (
    <Pressable
      key={text}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[
        styles.button,
        primary
          ? { backgroundColor: colors.primary, borderColor: colors.primary }
          : { borderColor: colors.border, backgroundColor: colors.surface },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text color={primary ? colors.onPrimary : colors.primary} fontSize="$3" fontWeight="700">
        {text}
      </Text>
    </Pressable>
  )
  const personCard = (uid: string) => {
    const p = byUid.get(uid)
    const tint = cardColorsFor(p?.sex)
    return (
      <View
        key={uid}
        style={[
          styles.card,
          {
            backgroundColor: tint?.background ?? colors.surface,
            borderColor: tint?.border ?? colors.border,
          },
        ]}
      >
        <Text color={tint?.text ?? colors.text} fontSize="$3" fontWeight="600" numberOfLines={1}>
          {nameOf(uid)}
        </Text>
      </View>
    )
  }
  const note = (text: string, warn = true) => (
    <View
      key={text}
      style={[
        styles.note,
        {
          backgroundColor: warn ? '#FEF3C7' : colors.background,
          borderColor: warn ? '#F59E0B' : colors.border,
        },
      ]}
    >
      <Text color={warn ? '#78350F' : colors.text} fontSize="$3">
        {text}
      </Text>
    </View>
  )

  const goingLine = `${going.length} going · ${notGoing.length} not available${
    unsure.length
      ? ` · ${unsure.length} haven’t answered or said TBD${countUnsure ? ', counted as going' : ', left out'}`
      : ''
  }`

  return (
    <FullScreenOverlay
      visible
      animationType="slide"
      transparent
      onRequestClose={onClose}
      aboveSheets
    >
      <View
        style={[styles.overlay, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}
      >
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$4"
          padding="$3"
          gap="$2.5"
          width="96%"
          maxWidth={760}
          flex={1}
        >
          <XStack alignItems="center" gap="$2">
            <YStack flex={1}>
              <Text color={colors.text} fontSize="$6" fontWeight="700">
                Plan the carpool
              </Text>
              {subtitle ? (
                <Text color={colors.textMuted} fontSize="$2" numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </YStack>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text color={colors.textMuted} fontSize="$6" paddingHorizontal="$1">
                ✕
              </Text>
            </Pressable>
          </XStack>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
            <Text color={colors.text} fontSize="$3">
              {goingLine}
            </Text>
            {unsure.length ? (
              <Pressable
                onPress={() => setCountUnsure((c) => !c)}
                accessibilityRole="switch"
                accessibilityState={{ checked: countUnsure }}
              >
                <Text color={colors.primary} fontSize="$3" fontWeight="600">
                  {countUnsure
                    ? `Leave out the ${unsure.length} who haven’t answered`
                    : `Count the ${unsure.length} who haven’t answered as going`}
                </Text>
              </Pressable>
            ) : null}

            {step === 'ask' ? (
              <YStack gap="$3">
                {label('TRAILERS NEEDED')}
                <XStack gap="$2" flexWrap="wrap">
                  {TRAILER_CHOICES.map((t) =>
                    choice(t.key, t.label, trailers === t.key, () => setTrailers(t.key))
                  )}
                </XStack>
                {asked.map((v) => (
                  <YStack key={v.id} gap="$2">
                    {label(`BRING THE ${v.name.toUpperCase()}?`)}
                    <Text color={colors.textMuted} fontSize="$3">
                      {v.seats} seats
                      {v.anyDriver ? ' · anyone who drives another vehicle may drive it' : ''}
                    </Text>
                    <XStack gap="$2">
                      {choice(`${v.id}:yes`, 'Yes', bring[v.id] === true, () =>
                        setBring((b) => ({ ...b, [v.id]: true }))
                      )}
                      {choice(`${v.id}:no`, 'No', bring[v.id] === false, () =>
                        setBring((b) => ({ ...b, [v.id]: false }))
                      )}
                    </XStack>
                  </YStack>
                ))}
                {loaded && vehicles.length <= asked.length
                  ? note(
                      'Only the Elim Van is in the list. Add the team’s vehicles in Admin → Vehicles.'
                    )
                  : null}
              </YStack>
            ) : plan ? (
              <YStack gap="$2.5">
                {plan.problems.map((p) => note(p))}
                {plan.noRoom.length
                  ? note(
                      `${plan.noRoom.length === 1 ? '1 person has' : `${plan.noRoom.length} people have`} no seat: ${plan.noRoom
                        .map(nameOf)
                        .join(', ')}.`
                    )
                  : null}
                {plan.mixed > 0
                  ? note(
                      `${plan.mixed} ${plan.mixed === 1 ? 'person rides' : 'people ride'} with the other sex: there aren’t seats enough to keep everyone apart.`
                    )
                  : null}
                {plan.offer && (plan.full.length || plan.noRoom.length) ? (
                  <XStack
                    alignItems="center"
                    gap="$2"
                    flexWrap="wrap"
                    padding="$2.5"
                    borderRadius={10}
                    borderWidth={1}
                    borderColor={colors.primary}
                  >
                    <Text color={colors.text} fontSize="$3" flex={1} minWidth={180}>
                      {plan.noRoom.length
                        ? 'Not everyone fits.'
                        : `${plan.full.length === 1 ? 'A vehicle is' : `${plan.full.length} vehicles are`} full.`}{' '}
                      Bring {plan.offer.name} too ({plan.offer.seats} seats)?
                    </Text>
                    {button(
                      `Bring ${plan.offer.name}`,
                      () => setAdded((a) => [...a, plan.offer!.id]),
                      true
                    )}
                  </XStack>
                ) : null}

                {plan.vehicles.map((pv, i) => {
                  const car = plan.cars[i]
                  const kids = children[pv.vehicle.id] ?? []
                  const load = 1 + car.riders.length + kids.length
                  return (
                    <YStack
                      key={pv.vehicle.id}
                      gap="$2"
                      padding="$2.5"
                      borderRadius={12}
                      borderWidth={1}
                      borderColor={colors.border}
                      backgroundColor={colors.background}
                    >
                      <XStack justifyContent="space-between" alignItems="baseline" gap="$2">
                        <Text color={colors.text} fontSize="$5" fontWeight="700" flexShrink={1}>
                          🚐 {pv.vehicle.name}
                        </Text>
                        <Text
                          color={load >= pv.vehicle.seats ? '#B45309' : colors.textMuted}
                          fontSize="$3"
                          fontWeight="700"
                        >
                          {load} of {pv.vehicle.seats}
                        </Text>
                      </XStack>
                      {pv.trailer || pv.vehicle.mixedSex || pv.vehicle.fillFirst ? (
                        <Text color={colors.text} fontSize="$3" fontWeight="600">
                          {[
                            pv.trailer ? `Pulls the ${pv.trailer} trailer` : '',
                            pv.vehicle.mixedSex ? 'Men and women together' : '',
                            pv.vehicle.fillFirst ? 'Filled first' : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      ) : null}
                      <XStack alignItems="center" gap="$2" flexWrap="wrap">
                        <Text color={colors.textMuted} fontSize="$3">
                          Driver
                        </Text>
                        {personCard(pv.driver)}
                        <Pressable
                          onPress={() => setCantDrive((c) => [...c, pv.driver])}
                          accessibilityRole="button"
                          accessibilityHint={`Another driver is found for ${pv.vehicle.name}, and ${nameOf(pv.driver)} rides`}
                          hitSlop={6}
                        >
                          <Text color={colors.primary} fontSize="$3" fontWeight="700">
                            Can’t drive this time
                          </Text>
                        </Pressable>
                      </XStack>
                      <View style={styles.wrap}>
                        {car.riders.map(personCard)}
                        {kids.map((k) => (
                          <View
                            key={k.id}
                            style={[
                              styles.card,
                              {
                                backgroundColor: CARD_COLORS.child.background,
                                borderColor: CARD_COLORS.child.border,
                                flexDirection: 'row',
                                gap: 6,
                              },
                            ]}
                          >
                            <Text color={CARD_COLORS.child.text} fontSize="$3" fontWeight="600">
                              🧒 {k.name}
                            </Text>
                            <Pressable
                              onPress={() => removeChild(pv.vehicle.id, k.id)}
                              hitSlop={8}
                              accessibilityRole="button"
                              accessibilityLabel={`Take ${k.name} out`}
                            >
                              <Text color={CARD_COLORS.child.text} fontSize="$3">
                                ✕
                              </Text>
                            </Pressable>
                          </View>
                        ))}
                      </View>
                      <TextInput
                        value={childName[pv.vehicle.id] ?? ''}
                        onChangeText={(t) => setChildName((n) => ({ ...n, [pv.vehicle.id]: t }))}
                        onSubmitEditing={() => addChild(pv.vehicle.id)}
                        blurOnSubmit={false}
                        placeholder="+ Child’s name, then Enter"
                        placeholderTextColor={colors.textMuted}
                        returnKeyType="done"
                        style={[
                          styles.input,
                          {
                            color: colors.text,
                            borderColor: colors.border,
                            backgroundColor: colors.surface,
                          },
                        ]}
                        accessibilityLabel={`Add a child riding in ${pv.vehicle.name}`}
                      />
                    </YStack>
                  )
                })}

                {plan.notes.length ? (
                  <YStack gap="$1">
                    {label('NOTES')}
                    {plan.notes.map((n) => (
                      <Text key={n.uid} color={colors.text} fontSize="$3">
                        <Text fontWeight="700">{nameOf(n.uid)}:</Text> {n.note}
                      </Text>
                    ))}
                  </YStack>
                ) : null}

                {cantDrive.length ? (
                  <XStack gap="$2" flexWrap="wrap" alignItems="center">
                    <Text color={colors.textMuted} fontSize="$3">
                      Can’t drive this time:
                    </Text>
                    {cantDrive.map((u) => (
                      <Pressable
                        key={u}
                        onPress={() => setCantDrive((c) => c.filter((x) => x !== u))}
                        accessibilityRole="button"
                        accessibilityLabel={`${nameOf(u)} can drive after all`}
                      >
                        <Text color={colors.primary} fontSize="$3" fontWeight="600">
                          {nameOf(u)} ✕
                        </Text>
                      </Pressable>
                    ))}
                  </XStack>
                ) : null}

                {plan.left.length ? (
                  <YStack gap="$1.5">
                    {label('NOT GOING')}
                    {plan.left.map(({ vehicle, why }) => (
                      <XStack
                        key={vehicle.id}
                        alignItems="center"
                        justifyContent="space-between"
                        gap="$2"
                      >
                        <Text color={colors.text} fontSize="$3" flex={1}>
                          {vehicle.name} · {vehicle.seats} seats ·{' '}
                          <Text color={colors.textMuted} fontSize="$3">
                            {why}
                          </Text>
                        </Text>
                        {why === 'not needed' ? (
                          <Pressable
                            onPress={() => setAdded((a) => [...a, vehicle.id])}
                            accessibilityRole="button"
                          >
                            <Text color={colors.primary} fontSize="$3" fontWeight="700">
                              Bring it
                            </Text>
                          </Pressable>
                        ) : why === 'not brought' ? (
                          <Pressable
                            onPress={() => setBring((b) => ({ ...b, [vehicle.id]: true }))}
                            accessibilityRole="button"
                          >
                            <Text color={colors.primary} fontSize="$3" fontWeight="700">
                              Bring it
                            </Text>
                          </Pressable>
                        ) : null}
                      </XStack>
                    ))}
                  </YStack>
                ) : null}
              </YStack>
            ) : null}
          </ScrollView>

          <XStack gap="$2" justifyContent="flex-end" flexWrap="wrap">
            {step === 'ask' ? (
              button('Plan', () => setStep('plan'), true, !ready || !loaded)
            ) : (
              <>
                {button('Back', () => setStep('ask'))}
                {button('Re-plan', () => setSeed((s) => (s * 48271) % 2147483647))}
                {button(
                  'Use this plan',
                  () => plan && onUse(plan.cars),
                  true,
                  !plan || plan.vehicles.length === 0
                )}
              </>
            )}
          </XStack>
        </YStack>
      </View>
    </FullScreenOverlay>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  choice: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: 'center',
  },
  button: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    minHeight: 34,
    borderWidth: 1.5,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  note: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  input: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 15,
  },
})
