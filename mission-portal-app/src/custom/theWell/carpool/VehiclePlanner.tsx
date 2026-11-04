import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'
import { FullScreenOverlay } from '@/components/ui/FullScreenOverlay'
import { useThemeColors } from '@/theme/useThemeColors'
import { readCarpoolMemory } from '@/lib/carpoolMemoryDb'
import { togetherCounts } from '@/lib/carpoolMemory'
import {
  CARD_COLORS,
  cardColorsFor,
  carProblems,
  headCount,
  moveTo,
  overSeats,
  spotOf,
  swapPlaces,
} from '@/features/events/carpoolCards'
import { DragCard, measureRect, type Rect } from '@/features/events/DragCard'
import type { CarpoolPerson } from '@/features/events/CarpoolBuilder'
import type { AvailResponse, CarpoolCarData, CarpoolChild } from '@/types/events'
import { useVehiclesStore } from '../vehicles/vehiclesStore'
import { canPull, type TrailersNeeded } from '../vehicles/types'
import { NO_DRIVER, planVehicles, TRAILER_SAID } from './planVehicles'
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
 * vehicle offered when one is full, which vehicle pulls each trailer — and
 * anyone dragged (or tapped, then tapped where) into another vehicle, onto
 * someone to swap places with them, or into a driver's seat. Once anyone is
 * moved by hand, everyone stays where they are unless moved: Re-plan lets
 * the plan arrange them again, in the same vehicles. A vehicle may be left with no driver, or more
 * in it than it holds, while people are moved — said, and not to be used
 * that way. The
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
  // Arranged by hand: everyone's place, kept from the first move on (planVehicles' placed).
  const [placed, setPlaced] = useState<Record<string, string>>({})
  const [byHand, setByHand] = useState(false)
  // The trailers as they were when people were first moved: each kept behind its vehicle.
  const [trailersKept, setTrailersKept] = useState<Partial<Record<'small' | 'big', string>>>({})
  // Tapped, waiting to be told where to go; and the card being dragged.
  const [picked, setPicked] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ uid: string; width: number } | null>(null)
  const [hover, setHover] = useState<Zone | null>(null)
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
            placed,
            trailerOf: { ...trailersKept, ...trailerOf },
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
      placed,
      trailerOf,
      trailersKept,
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
  /**
   * The cars as moved by hand, kept: each one's driver (or none, for now),
   * everyone in it, the vehicles going and the trailers behind them — so
   * nothing moves after this unless it's moved.
   */
  const arrange = (next: CarpoolCarData[]) => {
    if (!plan) return
    setDriverOf(Object.fromEntries(next.map((c) => [c.id, c.driver || NO_DRIVER])))
    setPlaced(Object.fromEntries(next.flatMap((c) => c.riders.map((u) => [u, c.id]))))
    setKept((k) => [...new Set([...k, ...next.map((c) => c.id)])])
    setTrailersKept(
      Object.fromEntries(
        plan.vehicles.filter((pv) => pv.trailer).map((pv) => [pv.trailer!, pv.vehicle.id])
      )
    )
    const driving = new Set(next.map((c) => c.driver).filter(Boolean))
    setCantDrive((c) => c.filter((u) => !driving.has(u)))
    setByHand(true)
    setPicked(null)
  }
  /**
   * Everyone placed again by the plan, drivers too: what was moved by hand
   * let go. The vehicles going stay going — none taken out for another.
   */
  const replan = () => {
    if (plan) setKept((k) => [...new Set([...k, ...plan.vehicles.map((pv) => pv.vehicle.id)])])
    setPlaced({})
    setDriverOf({})
    setTrailersKept({})
    setByHand(false)
    setPicked(null)
    setSeed((sd) => (sd * 48271) % 2147483647)
  }
  /** A card let go — or a tapped one sent — somewhere: they go there. */
  const dropOn = (uid: string, zone: Zone) => {
    if (!plan) return
    const at = zone.slice(2)
    // Onto someone: the two swap places.
    if (zone.startsWith('p:')) return arrange(swapPlaces(plan.cars, uid, at))
    // Into a driver's seat: they drive; whoever did takes their place.
    if (zone.startsWith('d:')) return arrange(moveTo(plan.cars, uid, { kind: 'driver', carId: at }))
    // Into a vehicle: a passenger in it — a driver leaving theirs with none, for now.
    const from = spotOf(plan.cars, uid)
    if (from.kind === 'passenger' && from.carId === at) return
    arrange(moveTo(plan.cars, uid, { kind: 'passenger', carId: at }))
  }
  /** They drive it: it goes, and whoever drove it takes their place. */
  const chooseDriver = (vehicleId: string, uid: string) => {
    setPicking(null)
    if (!plan) return
    const goingNow = plan.cars.some((c) => c.id === vehicleId)
    if (goingNow || byHand) {
      const v = vehicles.find((x) => x.id === vehicleId)
      const cars = goingNow
        ? plan.cars
        : [
            ...plan.cars,
            { id: vehicleId, label: v?.name ?? '', seats: v?.seats, driver: '', riders: [] },
          ]
      arrange(moveTo(cars, uid, { kind: 'driver', carId: vehicleId }))
      if (!goingNow) bringIn(vehicleId)
      return
    }
    // A vehicle brought with them driving it, before anyone's been moved:
    // filled with the rest by the plan.
    setDriverOf((d) => ({
      ...Object.fromEntries(Object.entries(d).filter(([, u]) => u !== uid)),
      [vehicleId]: uid,
    }))
    setCantDrive((c) => c.filter((u) => u !== uid))
    bringIn(vehicleId)
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
  /**
   * They ride this time: chosen to drive nothing, and another found to drive
   * theirs — they ride in it, if people were moved by hand.
   */
  const notDriving = (uid: string) => {
    const theirs = plan?.cars.find((c) => c.driver === uid)?.id
    setCantDrive((c) => (c.includes(uid) ? c : [...c, uid]))
    setDriverOf((d) => Object.fromEntries(Object.entries(d).filter(([, u]) => u !== uid)))
    if (byHand && theirs) setPlaced((p) => ({ ...p, [uid]: theirs }))
  }

  // ── Dragging ──────────────────────────────────────────────────────────
  const rootRef = useRef<View>(null)
  const listRef = useRef<View>(null)
  const personRefs = useRef(new Map<string, View>())
  const seatRefs = useRef(new Map<string, View>())
  const vehicleRefs = useRef(new Map<string, View>())
  const zones = useRef<{ zone: Zone; rect: Rect }[]>([])
  const drag = useRef<{ uid: string; card: Rect; grab: { x: number; y: number } } | null>(null)
  const root = useRef<Rect | null>(null)
  const ghostX = useSharedValue(0)
  const ghostY = useSharedValue(0)
  const ghostOn = useSharedValue(0)
  const ghostStyle = useAnimatedStyle(() => ({
    opacity: ghostOn.get(),
    transform: [{ translateX: ghostX.get() }, { translateY: ghostY.get() }, { scale: 1.06 }],
  }))

  /** Where each card, empty driver's seat and vehicle is — what can be seen of it — as a card lifts. */
  const measureZones = () => {
    zones.current = []
    measureRect(listRef.current, (bounds) => {
      const add = (zone: Zone, view: View) =>
        measureRect(view, (rect) => {
          const seen = intersect(rect, bounds)
          if (seen) zones.current.push({ zone, rect: seen })
        })
      personRefs.current.forEach((v, uid) => add(`p:${uid}`, v))
      seatRefs.current.forEach((v, id) => add(`d:${id}`, v))
      vehicleRefs.current.forEach((v, id) => add(`v:${id}`, v))
    })
  }
  /** What's under the finger: a person before an empty seat, a seat before the vehicle it's in. */
  const zoneAt = (moved: { x: number; y: number }): Zone | null => {
    const d = drag.current
    if (!d) return null
    const x = d.card.x + d.grab.x + moved.x
    const y = d.card.y + d.grab.y + moved.y
    const hits = zones.current
      .filter((z) => z.zone !== `p:${d.uid}` && inside(z.rect, x, y))
      .map((z) => z.zone)
    return (
      hits.find((z) => z.startsWith('p:')) ??
      hits.find((z) => z.startsWith('d:')) ??
      hits.find((z) => z.startsWith('v:')) ??
      null
    )
  }
  const onDragStart = (uid: string, card: Rect, grab: { x: number; y: number }) => {
    drag.current = { uid, card, grab }
    setPicked(null)
    setDragging({ uid, width: card.width })
    measureZones()
    measureRect(rootRef.current, (r) => {
      root.current = r
      ghostX.set(card.x - r.x)
      ghostY.set(card.y - r.y)
      ghostOn.set(1)
    })
  }
  const onDragMove = (moved: { x: number; y: number }) => {
    const d = drag.current
    const r = root.current
    if (!d || !r) return
    ghostX.set(d.card.x - r.x + moved.x)
    ghostY.set(d.card.y - r.y + moved.y)
    const zone = zoneAt(moved)
    setHover((h) => (h === zone ? h : zone))
  }
  const endDrag = () => {
    drag.current = null
    ghostOn.set(0)
    setDragging(null)
    setHover(null)
  }
  const onDragEnd = (moved: { x: number; y: number }) => {
    const d = drag.current
    const zone = zoneAt(moved)
    endDrag()
    if (d && zone) dropOn(d.uid, zone)
  }
  /** Tapped: picked up — or, with someone picked, swapped with them. */
  const tapPerson = (uid: string) => {
    if (picked && picked !== uid) dropOn(picked, `p:${uid}`)
    else setPicked((p) => (p === uid ? null : uid))
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
  const personCard = (
    uid: string,
    aside?: string,
    look: { picked?: boolean; dimmed?: boolean; lifted?: boolean; hover?: boolean } = {}
  ) => {
    const p = byUid.get(uid)
    const tint = cardColorsFor(p?.sex)
    const marked = look.picked || look.hover
    return (
      <View
        key={uid}
        style={[
          styles.card,
          {
            backgroundColor: tint?.background ?? colors.surface,
            borderColor: marked ? colors.primary : (tint?.border ?? colors.border),
            borderWidth: marked ? 2.5 : 1.5,
            opacity: look.dimmed ? 0.3 : 1,
          },
          look.lifted && styles.lifted,
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
  /** Someone's card, to be dragged somewhere else or tapped. */
  const draggable = (uid: string) => (
    <DragCard
      key={uid}
      onTap={() => tapPerson(uid)}
      onDragStart={(card, grab) => onDragStart(uid, card, grab)}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
      onDragCancel={endDrag}
    >
      <View
        ref={(v) => {
          if (v) personRefs.current.set(uid, v)
          else personRefs.current.delete(uid)
        }}
        collapsable={false}
      >
        {personCard(uid, undefined, {
          picked: picked === uid,
          dimmed: dragging?.uid === uid,
          hover: hover === `p:${uid}`,
        })}
      </View>
    </DragCard>
  )
  const error = (text: string) => (
    <Text key={text} color="$red10" fontSize="$3" fontWeight="600">
      {text}
    </Text>
  )
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

  // What keeps the plan from being used: a vehicle with no driver, or too many in one.
  const problems = plan ? carProblems(plan.cars) : []
  const pickedName = picked ? nameOf(picked) : ''
  const first = (name: string) => name.split(' ')[0]

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
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* The space the dragged card is drawn in, and measured against: the whole screen. */}
        <View ref={rootRef} collapsable={false} style={styles.overlay}>
          <View
            style={[
              styles.center,
              { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 },
            ]}
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

              <View ref={listRef} collapsable={false} style={{ flex: 1 }}>
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  scrollEnabled={Platform.OS === 'web' || !dragging}
                  contentContainerStyle={{ gap: 12 }}
                >
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
                        choice(t.key, t.label, trailers === t.key, () =>
                          answer(() => setTrailers(t.key))
                        )
                      )}
                    </XStack>
                    {(['big', 'small'] as const)
                      .filter((size) => needed(trailers)[size])
                      .map((size) => {
                        const by = plan?.vehicles.find((pv) => pv.trailer === size)?.vehicle
                        return (
                          <YStack key={size} gap="$1.5">
                            <XStack alignItems="center" gap="$2" flexWrap="wrap">
                              <Text
                                color={colors.text}
                                fontSize="$3"
                                fontWeight="600"
                                flexShrink={1}
                              >
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
                      {plan.noRoom.length ? (
                        <YStack gap="$1.5">
                          {note(
                            `${plan.noRoom.length === 1 ? '1 person has' : `${plan.noRoom.length} people have`} no seat — bring another vehicle, or move them into one.`
                          )}
                          <View style={styles.wrap}>{plan.noRoom.map(draggable)}</View>
                        </YStack>
                      ) : null}
                      {plan.mixed > 0 && !byHand
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

                      <Text color={colors.textMuted} fontSize="$2">
                        Drag anyone to another vehicle, onto someone to swap places, or into a
                        driver’s seat — or tap them, then tap where.
                      </Text>
                      {picked ? (
                        <XStack
                          alignItems="center"
                          gap="$2"
                          flexWrap="wrap"
                          padding="$2"
                          borderRadius={10}
                          borderWidth={1}
                          borderColor={colors.primary}
                        >
                          <Text color={colors.text} fontSize="$3" flex={1} minWidth={180}>
                            Moving <Text fontWeight="700">{pickedName}</Text>: tap someone to swap
                            places with them, or Move here on a vehicle.
                          </Text>
                          <Pressable
                            onPress={() => setPicked(null)}
                            accessibilityRole="button"
                            hitSlop={6}
                          >
                            <Text color={colors.primary} fontSize="$3" fontWeight="700">
                              Cancel
                            </Text>
                          </Pressable>
                        </XStack>
                      ) : null}

                      {plan.vehicles.map((pv, i) => {
                        const car = plan.cars[i]
                        const kids = children[pv.vehicle.id] ?? []
                        const load = headCount(car)
                        const over = overSeats(car)
                        const zone: Zone = `v:${pv.vehicle.id}`
                        const pickedSpot = picked ? spotOf(plan.cars, picked) : null
                        const pickedHere =
                          !!pickedSpot &&
                          pickedSpot.kind === 'passenger' &&
                          pickedSpot.carId === pv.vehicle.id
                        return (
                          <View
                            key={pv.vehicle.id}
                            ref={(v) => {
                              if (v) vehicleRefs.current.set(pv.vehicle.id, v)
                              else vehicleRefs.current.delete(pv.vehicle.id)
                            }}
                            collapsable={false}
                            style={[
                              styles.vehicle,
                              {
                                borderColor:
                                  hover === zone || (dragging && !hover)
                                    ? colors.primary
                                    : over || !pv.driver
                                      ? '#DC2626'
                                      : colors.border,
                                backgroundColor: colors.background,
                              },
                              hover === zone && styles.zoneHover,
                            ]}
                          >
                            <XStack justifyContent="space-between" alignItems="baseline" gap="$2">
                              <Text
                                color={colors.text}
                                fontSize="$5"
                                fontWeight="700"
                                flexShrink={1}
                              >
                                🚐 {pv.vehicle.name}
                              </Text>
                              <XStack alignItems="baseline" gap="$3">
                                <Text
                                  color={
                                    over
                                      ? '$red10'
                                      : load >= pv.vehicle.seats
                                        ? '#B45309'
                                        : colors.textMuted
                                  }
                                  fontSize="$3"
                                  fontWeight="700"
                                >
                                  {load} of {pv.vehicle.seats}
                                  {over ? ` — ${over} too many` : ''}
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
                                    if (picked) setPicked(null)
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
                              {pv.driver ? (
                                draggable(pv.driver)
                              ) : (
                                <Pressable
                                  ref={(v) => {
                                    if (v) seatRefs.current.set(pv.vehicle.id, v)
                                    else seatRefs.current.delete(pv.vehicle.id)
                                  }}
                                  collapsable={false}
                                  onPress={() =>
                                    picked
                                      ? dropOn(picked, `d:${pv.vehicle.id}`)
                                      : setPicking((v) =>
                                          v === pv.vehicle.id ? null : pv.vehicle.id
                                        )
                                  }
                                  accessibilityRole="button"
                                  accessibilityLabel={
                                    picked
                                      ? `${pickedName} drives ${pv.vehicle.name}`
                                      : `${pv.vehicle.name} has no driver: pick one`
                                  }
                                  style={[
                                    styles.seat,
                                    {
                                      borderColor:
                                        hover === `d:${pv.vehicle.id}` ? colors.primary : '#DC2626',
                                    },
                                    hover === `d:${pv.vehicle.id}` && styles.zoneHover,
                                  ]}
                                >
                                  <Text color="$red10" fontSize="$3" fontWeight="700">
                                    {picked
                                      ? `${first(pickedName)} drives`
                                      : 'No driver — drag someone here'}
                                  </Text>
                                </Pressable>
                              )}
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
                              {pv.driver ? (
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
                              ) : null}
                              {picked && !pickedHere ? (
                                <Pressable
                                  onPress={() => dropOn(picked, zone)}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Move ${pickedName} to ${pv.vehicle.name}`}
                                  style={[styles.moveHere, { backgroundColor: colors.primary }]}
                                >
                                  <Text color={colors.onPrimary} fontSize="$3" fontWeight="700">
                                    Move here
                                  </Text>
                                </Pressable>
                              ) : null}
                            </XStack>
                            {picking === pv.vehicle.id
                              ? driverPicker(pv.vehicle.id, pv.vehicle.name, pv.driver)
                              : null}
                            <View style={styles.wrap}>
                              {car.riders.map(draggable)}
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
                                  <Text
                                    color={CARD_COLORS.child.text}
                                    fontSize="$3"
                                    fontWeight="600"
                                  >
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
                              onChangeText={(t) =>
                                setChildName((n) => ({ ...n, [pv.vehicle.id]: t }))
                              }
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
                          </View>
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
                              {picking === vehicle.id
                                ? driverPicker(vehicle.id, vehicle.name)
                                : null}
                            </YStack>
                          ))}
                        </YStack>
                      ) : null}
                    </YStack>
                  ) : null}
                </ScrollView>
              </View>

              {plan && problems.length ? (
                <YStack gap="$0.5">
                  {problems.map(error)}
                  <Text color={colors.textMuted} fontSize="$2">
                    Fix {problems.length === 1 ? 'this' : 'these'} to use the plan.
                  </Text>
                </YStack>
              ) : null}
              <XStack gap="$2" justifyContent="flex-end" flexWrap="wrap">
                {button('Start over manually', onManual)}
                {button(
                  'Pick cars & drivers',
                  () => plan && onPickCars(plan.cars),
                  false,
                  !plan || plan.vehicles.length === 0
                )}
                {button('Re-plan', replan)}
                {button(
                  'Use this plan',
                  () => plan && onUse(plan.cars),
                  true,
                  !plan || plan.vehicles.length === 0 || problems.length > 0
                )}
              </XStack>
            </YStack>
          </View>

          {/* The card being dragged, drawn over everything and following the finger. */}
          {dragging ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.ghost, { width: dragging.width }, ghostStyle]}
            >
              {personCard(dragging.uid, undefined, { lifted: true })}
            </Animated.View>
          ) : null}
        </View>
      </GestureHandlerRootView>
    </FullScreenOverlay>
  )
}

/** Where a card can be let go: on someone, in an empty driver's seat, or in a vehicle. */
type Zone = `p:${string}` | `d:${string}` | `v:${string}`

const inside = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height

const intersect = (a: Rect, b: Rect): Rect | null => {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  vehicle: {
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  zoneHover: {
    transform: [{ scale: 1.01 }],
  },
  seat: {
    minHeight: 34,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 9,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  moveHere: {
    minHeight: 32,
    paddingHorizontal: 12,
    borderRadius: 16,
    justifyContent: 'center',
  },
  lifted: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  ghost: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 1000,
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
