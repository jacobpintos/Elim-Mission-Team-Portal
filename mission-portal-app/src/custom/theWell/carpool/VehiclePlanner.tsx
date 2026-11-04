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
import { canPull, type TrailersNeeded } from '../vehicles/types'
import { planVehicles, TRAILER_SAID } from './planVehicles'
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
  /** Start over, by hand: the carpool builder with no cars. */
  onManual: () => void
  /** The cars and drivers to be chosen by hand, and the riders filled again: Auto-assign, from these. */
  onPickCars: (cars: CarpoolCarData[]) => void
  onClose: () => void
}

/**
 * Custom: The Well. Auto-fill: a carpool planned from the team's vehicles
 * (./planVehicles), opened done — with its questions above it, which
 * trailers and "Bring the Elim Van?", answered None and No until changed,
 * the plan worked out again as each is.
 *
 * Everything in it can be changed by whoever is making the event: a
 * vehicle's driver (Change driver), one who can't drive this time (swapped
 * out, to ride), a vehicle left out or brought, children added, the next
 * vehicle offered when one is full, which vehicle pulls each trailer. The
 * rules (Admin → Vehicles) are for the plan's own choosing; what's changed
 * by hand isn't held to them — anyone going can be picked to drive any
 * vehicle, and any vehicle to pull a trailer. Then:
 *  - Use this plan: the cars into the event's carpool, still to be arranged
 *    by hand there before the event is saved;
 *  - Pick cars & drivers: the builder's Auto-assign, with these vehicles and
 *    drivers to change, and the riders filled again;
 *  - Start over manually: the builder, with no cars.
 */
export function VehiclePlanner({
  subtitle,
  people,
  statusOf,
  rideKey,
  onUse,
  onManual,
  onPickCars,
  onClose,
}: VehiclePlannerProps) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  const { vehicles, loaded, subscribe, unsubscribe } = useVehiclesStore()
  // Special rules for people (Admin → Vehicles), followed in the plan.
  const personRules = usePersonRulesStore((s) => s.rules)
  // The questions, answered None and No until changed.
  const [trailers, setTrailers] = useState<Trailers>('none')
  const [bring, setBring] = useState<Record<string, boolean>>({})
  // Changed by hand: vehicles left out, drivers chosen, whose driver is being picked.
  const [leaveOut, setLeaveOut] = useState<string[]>([])
  const [driverOf, setDriverOf] = useState<Record<string, string>>({})
  const [picking, setPicking] = useState<string | null>(null)
  // Which vehicle pulls each trailer, chosen by hand; and which is being chosen.
  const [trailerOf, setTrailerOf] = useState<Partial<Record<'small' | 'big', string>>>({})
  const [pickingTrailer, setPickingTrailer] = useState<'small' | 'big' | null>(null)
  const [countUnsure, setCountUnsure] = useState(true)
  const [cantDrive, setCantDrive] = useState<string[]>([])
  const [added, setAdded] = useState<string[]>([])
  // The vehicles going when another was brought by hand: kept, so it's one
  // more, not one swapped in. Let go when the questions are answered again.
  const [kept, setKept] = useState<string[]>([])
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

  const plan = useMemo(
    () =>
      loaded
        ? planVehicles({
            vehicles,
            people: going.map((p) => ({ uid: p.uid, sex: p.sex, family: familyName(p.name) })),
            trailers: needed(trailers),
            bring,
            cantDrive,
            leaveOut,
            driverOf,
            trailerOf,
            add: [...added, ...kept],
            children,
            together,
            rules: personRules,
            seed,
          })
        : null,
    // Worked out again when anything it is planned from changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      loaded,
      leaveOut,
      driverOf,
      trailerOf,
      trailers,
      vehicles,
      bring,
      cantDrive,
      added,
      kept,
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

  // Changed by hand, it stays as it was changed: no rule says otherwise.
  /**
   * A vehicle brought by hand: it goes, on top of those going now — none
   * taken out for it.
   */
  const bringIn = (vehicleId: string) => {
    if (plan && !plan.vehicles.some((pv) => pv.vehicle.id === vehicleId)) {
      const going = plan.vehicles.map((pv) => pv.vehicle.id)
      setKept((k) => [...new Set([...k, ...going])])
    }
    setLeaveOut((l) => l.filter((x) => x !== vehicleId))
    setAdded((a) => (a.includes(vehicleId) ? a : [...a, vehicleId]))
  }
  /** The questions answered again: planned afresh, with fewest vehicles. */
  const answer = (change: () => void) => {
    change()
    setKept([])
  }
  /** They drive it: it goes, and they drive nothing else. */
  const chooseDriver = (vehicleId: string, uid: string) => {
    setDriverOf((d) => ({
      ...Object.fromEntries(Object.entries(d).filter(([, u]) => u !== uid)),
      [vehicleId]: uid,
    }))
    setCantDrive((c) => c.filter((u) => u !== uid))
    bringIn(vehicleId)
    setPicking(null)
  }
  /** It pulls that trailer: it goes, and pulls nothing else. */
  const choosePuller = (size: 'small' | 'big', vehicleId: string) => {
    setTrailerOf((t) => {
      const next = { ...t, [size]: vehicleId }
      const other = size === 'small' ? 'big' : 'small'
      if (next[other] === vehicleId) delete next[other]
      return next
    })
    bringIn(vehicleId)
    setPickingTrailer(null)
  }
  /** Which vehicle can be picked to pull it: any of them — those listed as able first. */
  const trailerPicker = (size: 'small' | 'big', current?: string) => {
    const others = vehicles.filter((v) => v.id !== current)
    const able = others.filter((v) => canPull(v, size))
    const rest = others.filter((v) => !canPull(v, size))
    const row = (list: typeof vehicles) => (
      <XStack gap="$2" flexWrap="wrap">
        {list.map((v) => choice(`${size}:${v.id}`, v.name, false, () => choosePuller(size, v.id)))}
      </XStack>
    )
    return (
      <YStack gap="$1.5">
        {able.length ? (
          <>
            <Text color={colors.textMuted} fontSize="$2">
              Listed as able to pull it:
            </Text>
            {row(able)}
          </>
        ) : null}
        {rest.length ? (
          <>
            <Text color={colors.textMuted} fontSize="$2">
              {able.length ? 'Any other:' : 'Which vehicle pulls it:'}
            </Text>
            {row(rest)}
          </>
        ) : null}
      </YStack>
    )
  }
  /** They ride this time: chosen to drive nothing. */
  const notDriving = (uid: string) => {
    setCantDrive((c) => (c.includes(uid) ? c : [...c, uid]))
    setDriverOf((d) => Object.fromEntries(Object.entries(d).filter(([, u]) => u !== uid)))
  }
  /** Who is driving which vehicle now, by uid. */
  const drivingNow = new Map((plan?.vehicles ?? []).map((pv) => [pv.driver, pv.vehicle]))

  /** Who can be picked to drive it: anyone going — those it's kept for first. */
  const driverPicker = (vehicleId: string, vehicleName: string, current?: string) => {
    const listed = (plan?.canDrive[vehicleId] ?? []).filter((u) => u !== current)
    const others = going
      .map((p) => p.uid)
      .filter((u) => u !== current && !listed.includes(u))
      .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
    const chip = (u: string) => {
      const other = drivingNow.get(u)
      return (
        <Pressable
          key={u}
          onPress={() => chooseDriver(vehicleId, u)}
          accessibilityRole="button"
          accessibilityLabel={`${nameOf(u)} drives ${vehicleName}`}
        >
          {personCard(u, other && other.id !== vehicleId ? `drives ${other.name}` : undefined)}
        </Pressable>
      )
    }
    return (
      <YStack gap="$1.5">
        {listed.length ? (
          <>
            <Text color={colors.textMuted} fontSize="$2">
              Drivers kept for it:
            </Text>
            <View style={styles.wrap}>{listed.map(chip)}</View>
          </>
        ) : null}
        {others.length ? (
          <>
            <Text color={colors.textMuted} fontSize="$2">
              {listed.length ? 'Anyone else going:' : 'Who drives it — anyone going:'}
            </Text>
            <View style={styles.wrap}>{others.map(chip)}</View>
          </>
        ) : null}
        {!listed.length && !others.length ? (
          <Text color={colors.textMuted} fontSize="$2">
            No one else is going.
          </Text>
        ) : null}
      </YStack>
    )
  }

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
  const personCard = (uid: string, aside?: string) => {
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
          {aside ? (
            <Text color={tint?.text ?? colors.textMuted} fontSize="$2" fontWeight="400">
              {` · ${aside}`}
            </Text>
          ) : null}
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
                Auto-fill
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

            <YStack
              gap="$2"
              padding="$2.5"
              borderRadius={12}
              borderWidth={1}
              borderColor={colors.border}
            >
              {label('TRAILERS NEEDED')}
              <XStack gap="$2" flexWrap="wrap">
                {TRAILER_CHOICES.map((t) =>
                  choice(t.key, t.label, trailers === t.key, () => answer(() => setTrailers(t.key)))
                )}
              </XStack>
              {(['big', 'small'] as const)
                .filter((size) => needed(trailers)[size])
                .map((size) => {
                  const by = plan?.vehicles.find((pv) => pv.trailer === size)?.vehicle
                  return (
                    <YStack key={size} gap="$1.5">
                      <XStack alignItems="center" gap="$2" flexWrap="wrap">
                        <Text color={colors.text} fontSize="$3" fontWeight="600" flexShrink={1}>
                          {TRAILER_SAID[size]}:{' '}
                          {by ? `pulled by ${by.name}` : 'no vehicle pulling it yet'}
                        </Text>
                        <Pressable
                          onPress={() => setPickingTrailer((p) => (p === size ? null : size))}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: pickingTrailer === size }}
                          accessibilityLabel={`Choose which vehicle pulls the ${size} trailer`}
                          hitSlop={6}
                        >
                          <Text color={colors.primary} fontSize="$3" fontWeight="700">
                            {by ? 'Change' : 'Pick a vehicle'}
                          </Text>
                        </Pressable>
                      </XStack>
                      {pickingTrailer === size ? trailerPicker(size, by?.id) : null}
                    </YStack>
                  )
                })}
              {asked.map((v) => (
                <YStack key={v.id} gap="$1.5">
                  {label(`BRING THE ${v.name.toUpperCase()}? · ${v.seats} SEATS`)}
                  <XStack gap="$2">
                    {choice(`${v.id}:yes`, 'Yes', bring[v.id] === true, () =>
                      answer(() => setBring((b) => ({ ...b, [v.id]: true })))
                    )}
                    {choice(`${v.id}:no`, 'No', bring[v.id] !== true, () =>
                      answer(() => setBring((b) => ({ ...b, [v.id]: false })))
                    )}
                  </XStack>
                </YStack>
              ))}
            </YStack>
            {loaded && vehicles.length <= asked.length
              ? note(
                  'Only the Elim Van is in the list. Add the team’s vehicles in Admin → Vehicles.'
                )
              : null}
            {!loaded ? (
              <Text color={colors.textMuted} fontSize="$3">
                Planning from the vehicles…
              </Text>
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
                    {button(`Bring ${plan.offer.name}`, () => bringIn(plan.offer!.id), true)}
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
                        <XStack alignItems="baseline" gap="$3">
                          <Text
                            color={load >= pv.vehicle.seats ? '#B45309' : colors.textMuted}
                            fontSize="$3"
                            fontWeight="700"
                          >
                            {load} of {pv.vehicle.seats}
                          </Text>
                          <Pressable
                            onPress={() => {
                              setLeaveOut((l) => [...l, pv.vehicle.id])
                              setAdded((a) => a.filter((x) => x !== pv.vehicle.id))
                              setKept((k) => k.filter((x) => x !== pv.vehicle.id))
                              setDriverOf((d) => {
                                const rest = { ...d }
                                delete rest[pv.vehicle.id]
                                return rest
                              })
                              setTrailerOf((t) =>
                                Object.fromEntries(
                                  Object.entries(t).filter(([, id]) => id !== pv.vehicle.id)
                                )
                              )
                              setChildren((c) => {
                                const rest = { ...c }
                                delete rest[pv.vehicle.id]
                                return rest
                              })
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`Leave ${pv.vehicle.name} out`}
                            hitSlop={6}
                          >
                            <Text color={colors.primary} fontSize="$3" fontWeight="700">
                              Leave out
                            </Text>
                          </Pressable>
                        </XStack>
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
                          onPress={() =>
                            setPicking((v) => (v === pv.vehicle.id ? null : pv.vehicle.id))
                          }
                          accessibilityRole="button"
                          accessibilityState={{ expanded: picking === pv.vehicle.id }}
                          hitSlop={6}
                        >
                          <Text color={colors.primary} fontSize="$3" fontWeight="700">
                            Change driver
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => notDriving(pv.driver)}
                          accessibilityRole="button"
                          accessibilityHint={`Another driver is found for ${pv.vehicle.name}, and ${nameOf(pv.driver)} rides`}
                          hitSlop={6}
                        >
                          <Text color={colors.primary} fontSize="$3" fontWeight="700">
                            Can’t drive this time
                          </Text>
                        </Pressable>
                      </XStack>
                      {picking === pv.vehicle.id
                        ? driverPicker(pv.vehicle.id, pv.vehicle.name, pv.driver)
                        : null}
                      <View style={styles.wrap}>
                        {car.riders.map((u) => personCard(u))}
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
                      <YStack key={vehicle.id} gap="$1.5">
                        <XStack alignItems="center" justifyContent="space-between" gap="$2">
                          <Text color={colors.text} fontSize="$3" flex={1}>
                            {vehicle.name} · {vehicle.seats} seats ·{' '}
                            <Text color={colors.textMuted} fontSize="$3">
                              {why}
                            </Text>
                          </Text>
                          {why === 'not needed' ? (
                            <Pressable
                              onPress={() => bringIn(vehicle.id)}
                              accessibilityRole="button"
                            >
                              <Text color={colors.primary} fontSize="$3" fontWeight="700">
                                Bring it
                              </Text>
                            </Pressable>
                          ) : why === 'left out' ? (
                            <Pressable
                              onPress={() => bringIn(vehicle.id)}
                              accessibilityRole="button"
                            >
                              <Text color={colors.primary} fontSize="$3" fontWeight="700">
                                Bring it
                              </Text>
                            </Pressable>
                          ) : why === 'not brought' ? (
                            <Pressable
                              onPress={() =>
                                answer(() => setBring((b) => ({ ...b, [vehicle.id]: true })))
                              }
                              accessibilityRole="button"
                            >
                              <Text color={colors.primary} fontSize="$3" fontWeight="700">
                                Bring it
                              </Text>
                            </Pressable>
                          ) : (
                            <Pressable
                              onPress={() =>
                                setPicking((v) => (v === vehicle.id ? null : vehicle.id))
                              }
                              accessibilityRole="button"
                              accessibilityState={{ expanded: picking === vehicle.id }}
                              accessibilityHint="Pick anyone going to drive it"
                            >
                              <Text color={colors.primary} fontSize="$3" fontWeight="700">
                                Bring it
                              </Text>
                            </Pressable>
                          )}
                        </XStack>
                        {picking === vehicle.id ? driverPicker(vehicle.id, vehicle.name) : null}
                      </YStack>
                    ))}
                  </YStack>
                ) : null}
              </YStack>
            ) : null}
          </ScrollView>

          <XStack gap="$2" justifyContent="flex-end" flexWrap="wrap">
            {button('Start over manually', onManual)}
            {button(
              'Pick cars & drivers',
              () => plan && onPickCars(plan.cars),
              false,
              !plan || plan.vehicles.length === 0
            )}
            {button('Re-plan', () => setSeed((sd) => (sd * 48271) % 2147483647))}
            {button(
              'Use this plan',
              () => plan && onUse(plan.cars),
              true,
              !plan || plan.vehicles.length === 0
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
