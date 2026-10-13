import { useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text, XStack, YStack } from 'tamagui'
import { FullScreenOverlay } from '@/components/ui/FullScreenOverlay'
import { confirmAsync } from '@/lib/confirm'
import { useThemeColors } from '@/theme/useThemeColors'
import type { CarpoolCarData } from '@/types/events'
import type { Sex } from '@/types/user'
import { DragCard, measureRect, type Rect } from './DragCard'
import {
  CARD_COLORS,
  cardColorsFor,
  carName,
  headCount,
  matchesSearch,
  moveTo,
  newCar,
  newChild,
  spotOf,
  tidyCars,
  unplaced,
  type Spot,
} from './carpoolCards'

/** Someone a card can be made for. `sex` only colours the card. */
export interface CarpoolPerson {
  uid: string
  name: string
  sex?: Sex
}

/** Where a dragged card can land: this car's seats, the pool, or another car's tab. */
type Zone = 'driver' | 'passengers' | 'pool' | `car:${string}`

interface CarpoolBuilderProps {
  /** What the cars are for, under the window's title: the event's name. */
  subtitle?: string
  cars: CarpoolCarData[]
  /** Everyone on the event: the cards in the pool, until they are put in a car. */
  people: CarpoolPerson[]
  /** Anyone else a car names — someone since taken off the event, say. */
  lookup?: (uid: string) => CarpoolPerson | undefined
  onSave: (cars: CarpoolCarData[]) => void
  onClose: () => void
}

const intersect = (a: Rect, b: Rect): Rect | null => {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null
}

const inside = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height

/**
 * Arrange an event's cars, in a window of its own.
 *
 * The cars are along the top. Choosing one opens its driver's seat and its
 * passengers, with everyone on the event who is not in a car yet below as
 * cards — blue for male, pink for female — to be dragged into place: from the
 * pool into a seat, between seats, onto another car's tab to move them to
 * that car, or back to the pool. A card can also be tapped, and where it goes
 * picked from the bar that opens, for anyone who would rather not drag.
 * Children have no accounts, so each is a card added to a car and named on it.
 *
 * Works on a copy: nothing is kept until Save, which hands the cars back.
 */
export function CarpoolBuilder({
  subtitle,
  cars: initialCars,
  people,
  lookup,
  onSave,
  onClose,
}: CarpoolBuilderProps) {
  const colors = useThemeColors()
  const insets = useSafeAreaInsets()
  // A phone's width: the cars' tabs smaller, so more of them fit on a line.
  const compact = useWindowDimensions().width < 520

  const [cars, setCars] = useState<CarpoolCarData[]>(initialCars)
  const [selectedId, setSelectedId] = useState<string | null>(
    initialCars.length === 1 ? initialCars[0].id : null
  )
  // Tapped, waiting to be told where to go.
  const [picked, setPicked] = useState<string | null>(null)
  const [dragging, setDragging] = useState<{ uid: string; width: number; height: number } | null>(
    null
  )
  const [hover, setHover] = useState<Zone | null>(null)
  const [search, setSearch] = useState('')
  // What should take the cursor when it appears: a new car's name, a new child's.
  const [focus, setFocus] = useState<string | null>(null)
  // The car's name being typed: its box outlined in the theme's colour.
  const [naming, setNaming] = useState(false)

  const rootRef = useRef<View>(null)
  const tabsRef = useRef<View>(null)
  const tabRefs = useRef(new Map<string, View>())
  const panelRef = useRef<View>(null)
  const driverRef = useRef<View>(null)
  const passengersRef = useRef<View>(null)
  const poolRef = useRef<View>(null)
  const zones = useRef<{ zone: Zone; rect: Rect }[]>([])
  const drag = useRef<{ uid: string; card: Rect; grab: { x: number; y: number } } | null>(null)
  const root = useRef<Rect | null>(null)

  // Where the lifted card is drawn, inside the window.
  const ghostX = useSharedValue(0)
  const ghostY = useSharedValue(0)
  const ghostOn = useSharedValue(0)
  const ghostStyle = useAnimatedStyle(() => ({
    opacity: ghostOn.get(),
    transform: [{ translateX: ghostX.get() }, { translateY: ghostY.get() }, { scale: 1.06 }],
  }))

  const selected = cars.find((c) => c.id === selectedId) ?? null
  const byUid = new Map(people.map((p) => [p.uid, p]))
  const personFor = (uid: string): CarpoolPerson =>
    byUid.get(uid) ?? lookup?.(uid) ?? { uid, name: 'Someone' }

  const pool = unplaced(
    cars,
    people.map((p) => p.uid)
  )
    .map(personFor)
    .sort((a, b) => a.name.localeCompare(b.name))
  const searching = search.trim().length > 0
  const poolShown = searching ? pool.filter((p) => matchesSearch(p.name, search)) : pool
  // Anyone the search finds who is in a car already, so "where is Jacob?" has an answer.
  const placedMatches = searching
    ? cars
        .flatMap((car, index) =>
          [car.driver, ...car.riders]
            .filter(Boolean)
            .map((uid) => ({ person: personFor(uid), car, index, driving: car.driver === uid }))
        )
        .filter((m) => matchesSearch(m.person.name, search))
        .slice(0, 5)
    : []

  // Who a name typed into a seat can be: everyone on the event, those not in
  // a car first — and where each is now, said beside them.
  const poolUids = new Set(pool.map((p) => p.uid))
  const typeable = [...people].sort(
    (a, b) =>
      Number(!poolUids.has(a.uid)) - Number(!poolUids.has(b.uid)) || a.name.localeCompare(b.name)
  )
  const whereIs = (uid: string) => {
    const at = spotOf(cars, uid)
    if (at.kind === 'pool') return ''
    const index = cars.findIndex((c) => c.id === at.carId)
    const name = index >= 0 ? carName(cars[index], index) : 'a car'
    return at.kind === 'driver' ? `driving ${name}` : `in ${name}`
  }

  const dirty = JSON.stringify(tidyCars(cars)) !== JSON.stringify(tidyCars(initialCars))

  // ── Changing the cars ─────────────────────────────────────────────────

  const put = (uid: string, to: Spot) => setCars((cs) => moveTo(cs, uid, to))

  const updateCar = (carId: string, change: Partial<CarpoolCarData>) =>
    setCars((cs) => cs.map((c) => (c.id === carId ? { ...c, ...change } : c)))

  const addCar = () => {
    const car = newCar(cars)
    setCars((cs) => [...cs, car])
    setSelectedId(car.id)
    setPicked(null)
    setFocus(`car:${car.id}`)
  }

  const removeCar = async (car: CarpoolCarData, index: number) => {
    if (headCount(car) > 0) {
      const ok = await confirmAsync(
        `Remove ${carName(car, index)}? Everyone in it goes back to “Not in a car”.`,
        { title: 'Remove car', confirmLabel: 'Remove', destructive: true }
      )
      if (!ok) return
    }
    setCars((cs) => cs.filter((c) => c.id !== car.id))
    setSelectedId(null)
    setPicked(null)
  }

  const addChild = (car: CarpoolCarData) => {
    const child = newChild(car)
    updateCar(car.id, { children: [...(car.children ?? []), child] })
    setFocus(`child:${child.id}`)
  }

  const renameChild = (car: CarpoolCarData, childId: string, name: string) =>
    updateCar(car.id, {
      children: (car.children ?? []).map((k) => (k.id === childId ? { ...k, name } : k)),
    })

  const removeChild = (car: CarpoolCarData, childId: string) =>
    updateCar(car.id, { children: (car.children ?? []).filter((k) => k.id !== childId) })

  /** A card let go over a zone: put them there. */
  const dropOn = (uid: string, zone: Zone) => {
    if (zone === 'pool') return put(uid, { kind: 'pool' })
    if (zone === 'driver' && selected) return put(uid, { kind: 'driver', carId: selected.id })
    if (zone === 'passengers' && selected) {
      return put(uid, { kind: 'passenger', carId: selected.id })
    }
    if (zone.startsWith('car:')) {
      const carId = zone.slice(4)
      const now = spotOf(cars, uid)
      // Already in that car, in either seat: nothing to do.
      if (now.kind !== 'pool' && now.carId === carId) return
      put(uid, { kind: 'passenger', carId })
    }
  }

  // ── Dragging ──────────────────────────────────────────────────────────

  /**
   * Where everything a card can be dropped on is, measured as the card
   * lifts — the lists may have scrolled since anything was last laid out.
   * A zone inside something that scrolls only counts where it can be seen.
   */
  const measureZones = () => {
    zones.current = []
    const add = (zone: Zone, view: View | null | undefined, clip?: View | null) =>
      measureRect(view ?? null, (rect) => {
        if (!clip) {
          zones.current.push({ zone, rect })
          return
        }
        measureRect(clip, (bounds) => {
          const seen = intersect(rect, bounds)
          if (seen) zones.current.push({ zone, rect: seen })
        })
      })
    if (selected) {
      add('driver', driverRef.current, panelRef.current)
      add('passengers', passengersRef.current, panelRef.current)
    }
    add('pool', poolRef.current)
    for (const car of cars) add(`car:${car.id}`, tabRefs.current.get(car.id), tabsRef.current)
  }

  const zoneAt = (moved: { x: number; y: number }): Zone | null => {
    const d = drag.current
    if (!d) return null
    const x = d.card.x + d.grab.x + moved.x
    const y = d.card.y + d.grab.y + moved.y
    return zones.current.find((z) => inside(z.rect, x, y))?.zone ?? null
  }

  const onDragStart = (uid: string, card: Rect, grab: { x: number; y: number }) => {
    drag.current = { uid, card, grab }
    setPicked(null)
    setDragging({ uid, width: card.width, height: card.height })
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

  // ── Closing ───────────────────────────────────────────────────────────

  const close = async () => {
    if (dirty) {
      const ok = await confirmAsync('Close without saving? The changes to the cars will be lost.', {
        title: 'Unsaved changes',
        confirmLabel: 'Discard',
        destructive: true,
      })
      if (!ok) return
    }
    onClose()
  }

  // ── Drawing ───────────────────────────────────────────────────────────

  const togglePick = (uid: string) => setPicked((p) => (p === uid ? null : uid))

  /** A person's card, to be dragged or tapped. */
  const draggable = (person: CarpoolPerson) => (
    <DraggablePerson
      key={person.uid}
      person={person}
      picked={picked === person.uid}
      dimmed={dragging?.uid === person.uid}
      onTap={togglePick}
      onLift={onDragStart}
      onMove={onDragMove}
      onDrop={onDragEnd}
      onCancel={endDrag}
    />
  )

  const zoneStyle = (zone: Zone) => [
    styles.zone,
    { borderColor: colors.border, backgroundColor: colors.background },
    dragging && { borderColor: colors.primary },
    hover === zone && { borderColor: colors.primary, borderStyle: 'solid' as const },
    hover === zone && styles.zoneHover,
  ]

  const label = (text: string) => (
    <Text color={colors.textMuted} fontSize="$2" fontWeight="700" letterSpacing={0.5}>
      {text}
    </Text>
  )

  const button = (text: string, onPress: () => void, primary = false) => (
    <Pressable
      key={text}
      onPress={onPress}
      accessibilityRole="button"
      style={[
        styles.button,
        primary
          ? { backgroundColor: colors.primary, borderColor: colors.primary }
          : { borderColor: colors.border, backgroundColor: colors.surface },
      ]}
    >
      <Text color={primary ? colors.onPrimary : colors.primary} fontSize="$3" fontWeight="600">
        {text}
      </Text>
    </Pressable>
  )

  const pickedPerson = picked ? personFor(picked) : null
  const pickedSpot = picked ? spotOf(cars, picked) : null
  const inThisCar = (s: Spot | null) => !!s && s.kind !== 'pool' && s.carId === selected?.id

  return (
    // Over the form it was opened from, on the web as on the phones.
    <FullScreenOverlay visible animationType="slide" transparent onRequestClose={close} aboveSheets>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {/* The space the dragged card is drawn in, and measured against: the
            whole screen, with nothing inset, so its corner is the screen's. */}
        <View ref={rootRef} collapsable={false} style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
              {/* Header */}
              <XStack alignItems="center" gap="$2">
                <YStack flex={1}>
                  <Text color={colors.text} fontSize="$6" fontWeight="700">
                    Arrange cars
                  </Text>
                  {subtitle ? (
                    <Text color={colors.textMuted} fontSize="$2" numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </YStack>
                <Pressable
                  onPress={() => onSave(tidyCars(cars))}
                  accessibilityRole="button"
                  style={[
                    styles.button,
                    { backgroundColor: colors.primary, borderColor: colors.primary },
                  ]}
                >
                  <Text color={colors.onPrimary} fontWeight="700" fontSize="$3">
                    Save
                  </Text>
                </Pressable>
                <Pressable
                  onPress={close}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Text color={colors.textMuted} fontSize="$6" paddingHorizontal="$1">
                    ✕
                  </Text>
                </Pressable>
              </XStack>

              {/* The cars: as many lines as they take, so every one, and
                  "+ Add car" after them, is always in sight. */}
              <View ref={tabsRef} collapsable={false} style={styles.tabs}>
                {cars.map((car, i) => {
                  const on = car.id === selectedId
                  const over = hover === `car:${car.id}`
                  return (
                    <Pressable
                      key={car.id}
                      ref={(v) => {
                        if (v) tabRefs.current.set(car.id, v)
                        else tabRefs.current.delete(car.id)
                      }}
                      collapsable={false}
                      onPress={() => setSelectedId(on ? null : car.id)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      style={[
                        styles.tab,
                        compact && styles.tabCompact,
                        {
                          borderColor: on || over ? colors.primary : colors.border,
                          backgroundColor: on ? colors.primary : colors.background,
                        },
                        over && styles.zoneHover,
                      ]}
                    >
                      <Text
                        color={on ? colors.onPrimary : colors.text}
                        fontSize={compact ? '$2' : '$3'}
                        fontWeight="700"
                        numberOfLines={1}
                        maxWidth={compact ? 120 : 150}
                      >
                        🚗 {carName(car, i)}
                      </Text>
                      {/* How many are in it. */}
                      <View
                        style={[
                          styles.count,
                          { backgroundColor: on ? 'rgba(255,255,255,0.28)' : colors.surface },
                        ]}
                        accessibilityLabel={`${headCount(car)} in this car`}
                      >
                        <Text
                          color={on ? colors.onPrimary : colors.text}
                          fontSize="$2"
                          fontWeight="700"
                        >
                          {headCount(car)}
                        </Text>
                      </View>
                    </Pressable>
                  )
                })}
                <Pressable
                  onPress={addCar}
                  accessibilityRole="button"
                  style={[
                    styles.tab,
                    compact && styles.tabCompact,
                    { borderColor: colors.primary, borderStyle: 'dashed' },
                  ]}
                >
                  <Text color={colors.primary} fontSize={compact ? '$2' : '$3'} fontWeight="700">
                    + Add car
                  </Text>
                </Pressable>
              </View>

              {selected ? (
                <>
                  {/* Where a tapped card goes */}
                  {pickedPerson ? (
                    <XStack
                      flexWrap="wrap"
                      alignItems="center"
                      gap="$2"
                      padding="$2"
                      borderRadius="$3"
                      borderWidth={1}
                      borderColor={colors.primary}
                      backgroundColor={colors.background}
                    >
                      <Text color={colors.text} fontSize="$3" fontWeight="700">
                        Move {pickedPerson.name} to:
                      </Text>
                      {!(pickedSpot?.kind === 'driver' && inThisCar(pickedSpot))
                        ? button('Driver', () => {
                            put(pickedPerson.uid, { kind: 'driver', carId: selected.id })
                            setPicked(null)
                          })
                        : null}
                      {!(pickedSpot?.kind === 'passenger' && inThisCar(pickedSpot))
                        ? button('Passenger', () => {
                            put(pickedPerson.uid, { kind: 'passenger', carId: selected.id })
                            setPicked(null)
                          })
                        : null}
                      {pickedSpot?.kind !== 'pool'
                        ? button('Not in a car', () => {
                            put(pickedPerson.uid, { kind: 'pool' })
                            setPicked(null)
                          })
                        : null}
                      <Pressable onPress={() => setPicked(null)} hitSlop={8}>
                        <Text color={colors.textMuted} fontSize="$3">
                          Cancel
                        </Text>
                      </Pressable>
                    </XStack>
                  ) : (
                    <Text color={colors.textMuted} fontSize="$2">
                      Hold a card and drag it into place — or tap it to choose where it goes.
                    </Text>
                  )}

                  {/* The chosen car: its name, its driver, its passengers */}
                  <View ref={panelRef} collapsable={false} style={styles.panel}>
                    <ScrollView
                      scrollEnabled={Platform.OS === 'web' || !dragging}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={{ gap: 8 }}
                    >
                      {label('CAR NAME')}
                      <XStack alignItems="center" gap="$2">
                        {/* One per car, so a new car's opens with the cursor in it:
                            autoFocus only acts as the box first appears. Drawn
                            darker than the window, with a border that shows on
                            it, in either theme. */}
                        <TextInput
                          key={selected.id}
                          value={selected.label}
                          onChangeText={(label) => updateCar(selected.id, { label })}
                          placeholder="Name this car — e.g. Andy’s van"
                          placeholderTextColor={colors.textMuted}
                          autoFocus={focus === `car:${selected.id}`}
                          onFocus={() => {
                            setFocus(null)
                            setNaming(true)
                          }}
                          onBlur={() => setNaming(false)}
                          style={[
                            styles.input,
                            styles.carName,
                            {
                              color: colors.text,
                              backgroundColor: colors.background,
                              borderColor: naming ? colors.primary : colors.textMuted,
                              flex: 1,
                              minWidth: 0,
                            },
                          ]}
                          accessibilityLabel="Car name"
                        />
                        <Pressable
                          onPress={() =>
                            removeCar(
                              selected,
                              cars.findIndex((c) => c.id === selected.id)
                            )
                          }
                          hitSlop={8}
                          accessibilityRole="button"
                        >
                          <Text color="$red10" fontSize="$3" fontWeight="600">
                            Remove car
                          </Text>
                        </Pressable>
                      </XStack>

                      {label('DRIVER')}
                      <View ref={driverRef} collapsable={false} style={zoneStyle('driver')}>
                        {selected.driver ? (
                          draggable(personFor(selected.driver))
                        ) : (
                          <Text color={colors.textMuted} fontSize="$3">
                            Drag the driver here
                          </Text>
                        )}
                        <NameTyper
                          key={`driver:${selected.id}`}
                          placeholder={
                            selected.driver
                              ? 'Type a name to change the driver'
                              : 'Or type their name'
                          }
                          candidates={typeable.filter((p) => p.uid !== selected.driver)}
                          where={whereIs}
                          onPick={(uid) => put(uid, { kind: 'driver', carId: selected.id })}
                        />
                      </View>

                      <XStack alignItems="center" justifyContent="space-between">
                        {label(
                          `PASSENGERS · ${selected.riders.length + (selected.children?.length ?? 0)}`
                        )}
                        <Pressable
                          onPress={() => addChild(selected)}
                          hitSlop={8}
                          accessibilityRole="button"
                        >
                          <Text color={colors.primary} fontSize="$3" fontWeight="700">
                            + Add child
                          </Text>
                        </Pressable>
                      </XStack>
                      <View
                        ref={passengersRef}
                        collapsable={false}
                        style={[zoneStyle('passengers'), styles.wrap]}
                      >
                        {selected.riders.map((uid) => draggable(personFor(uid)))}
                        {(selected.children ?? []).map((child) => (
                          <View
                            key={child.id}
                            style={[
                              styles.card,
                              styles.child,
                              {
                                backgroundColor: CARD_COLORS.child.background,
                                borderColor: CARD_COLORS.child.border,
                              },
                            ]}
                          >
                            <Text fontSize={15}>🧒</Text>
                            <TextInput
                              value={child.name}
                              onChangeText={(name) => renameChild(selected, child.id, name)}
                              placeholder="Child’s name"
                              placeholderTextColor="#4D7C5B"
                              autoFocus={focus === `child:${child.id}`}
                              onFocus={() => setFocus(null)}
                              style={[styles.childInput, { color: CARD_COLORS.child.text }]}
                              accessibilityLabel="Child’s name"
                            />
                            <Pressable
                              onPress={() => removeChild(selected, child.id)}
                              hitSlop={10}
                              accessibilityRole="button"
                              accessibilityLabel="Remove child"
                            >
                              <Text color={CARD_COLORS.child.text} fontSize="$3">
                                ✕
                              </Text>
                            </Pressable>
                          </View>
                        ))}
                        {selected.riders.length === 0 && !selected.children?.length ? (
                          <Text color={colors.textMuted} fontSize="$3">
                            Drag passengers here
                          </Text>
                        ) : null}
                        <NameTyper
                          key={`riders:${selected.id}`}
                          placeholder="Or type a name"
                          candidates={typeable.filter((p) => !selected.riders.includes(p.uid))}
                          where={whereIs}
                          onPick={(uid) => put(uid, { kind: 'passenger', carId: selected.id })}
                          onChild={(name) => {
                            const child = { ...newChild(selected), name }
                            updateCar(selected.id, {
                              children: [...(selected.children ?? []), child],
                            })
                          }}
                        />
                      </View>
                    </ScrollView>
                  </View>

                  {/* Everyone not in a car yet, and a search that narrows them as it is typed */}
                  {label(
                    searching
                      ? `NOT IN A CAR · ${poolShown.length} of ${pool.length}`
                      : `NOT IN A CAR · ${pool.length}`
                  )}
                  <XStack
                    alignItems="center"
                    borderWidth={1}
                    borderColor={searching ? colors.primary : colors.border}
                    borderRadius={8}
                    backgroundColor={colors.background}
                    paddingLeft="$2"
                  >
                    <Text color={colors.textMuted} fontSize="$3">
                      🔍
                    </Text>
                    <TextInput
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Search by name"
                      placeholderTextColor={colors.textMuted}
                      autoCorrect={false}
                      autoCapitalize="none"
                      returnKeyType="search"
                      style={[styles.search, { color: colors.text }]}
                      accessibilityLabel="Search people not in a car"
                    />
                    {searching ? (
                      <Pressable
                        onPress={() => setSearch('')}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Clear search"
                        style={[styles.clear, { backgroundColor: colors.border }]}
                      >
                        <Text color={colors.text} fontSize="$2" fontWeight="700">
                          ✕
                        </Text>
                      </Pressable>
                    ) : null}
                  </XStack>
                  <View ref={poolRef} collapsable={false} style={[zoneStyle('pool'), styles.pool]}>
                    <ScrollView
                      scrollEnabled={Platform.OS === 'web' || !dragging}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={styles.wrap}
                    >
                      {poolShown.map(draggable)}
                      {poolShown.length === 0 ? (
                        <Text color={colors.textMuted} fontSize="$3">
                          {pool.length === 0
                            ? people.length === 0
                              ? 'No one is on this event yet.'
                              : 'Everyone on the event is in a car.'
                            : `No one matching “${search.trim()}” is waiting for a car.`}
                        </Text>
                      ) : null}
                      {/* Who the search finds already in a car, and which: tap to open it. */}
                      {placedMatches.map(({ person, car, index, driving }) => (
                        <Pressable
                          key={person.uid}
                          onPress={() => setSelectedId(car.id)}
                          accessibilityRole="button"
                          style={styles.fullWidth}
                        >
                          <Text color={colors.textMuted} fontSize="$3">
                            {person.name} is in{' '}
                            <Text color={colors.primary} fontSize="$3" fontWeight="600">
                              {carName(car, index)}
                            </Text>
                            {driving ? ', driving' : ''}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                </>
              ) : (
                /* No car chosen: what each holds, to pick one from. */
                <ScrollView contentContainerStyle={{ gap: 8 }}>
                  <Text color={colors.textMuted} fontSize="$3">
                    {cars.length
                      ? 'Choose a car to fill it.'
                      : 'Add a car, name it, then drag people into it.'}
                  </Text>
                  {cars.map((car, i) => (
                    <Pressable
                      key={car.id}
                      onPress={() => setSelectedId(car.id)}
                      accessibilityRole="button"
                      style={[
                        styles.summary,
                        { borderColor: colors.border, backgroundColor: colors.background },
                      ]}
                    >
                      <Text color={colors.text} fontSize="$4" fontWeight="700">
                        🚗 {carName(car, i)}
                      </Text>
                      <Text color={colors.textMuted} fontSize="$3">
                        {car.driver ? `${personFor(car.driver).name} driving` : 'No driver yet'}
                        {car.riders.length
                          ? ` · ${car.riders.length} passenger${car.riders.length === 1 ? '' : 's'}`
                          : ''}
                        {car.children?.length
                          ? ` · ${car.children.length} ${car.children.length === 1 ? 'child' : 'children'}`
                          : ''}
                      </Text>
                    </Pressable>
                  ))}
                  {pool.length > 0 && cars.length > 0 ? (
                    <Text color={colors.textMuted} fontSize="$3">
                      {pool.length === 1
                        ? '1 person isn’t in a car yet.'
                        : `${pool.length} people aren’t in a car yet.`}
                    </Text>
                  ) : null}
                </ScrollView>
              )}
            </YStack>
          </KeyboardAvoidingView>

          {/* The card being dragged, drawn over everything and following the finger. */}
          {dragging ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.ghost, { width: dragging.width }, ghostStyle]}
            >
              <PersonCard person={personFor(dragging.uid)} lifted />
            </Animated.View>
          ) : null}
        </View>
      </GestureHandlerRootView>
    </FullScreenOverlay>
  )
}

/** A person's card: blue for male, pink for female, the theme's own otherwise. */
function PersonCard({
  person,
  picked = false,
  dimmed = false,
  lifted = false,
}: {
  person: CarpoolPerson
  picked?: boolean
  dimmed?: boolean
  lifted?: boolean
}) {
  const colors = useThemeColors()
  const tint = cardColorsFor(person.sex)
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tint?.background ?? colors.surface,
          borderColor: picked ? colors.primary : (tint?.border ?? colors.border),
          borderWidth: picked ? 2.5 : 1.5,
          opacity: dimmed ? 0.3 : 1,
        },
        lifted && styles.lifted,
      ]}
    >
      <Text numberOfLines={1} fontSize={15} fontWeight="600" color={tint?.text ?? colors.text}>
        {person.name}
      </Text>
    </View>
  )
}

/** A person's card that can be dragged somewhere else, or tapped. */
function DraggablePerson({
  person,
  picked,
  dimmed,
  onTap,
  onLift,
  onMove,
  onDrop,
  onCancel,
}: {
  person: CarpoolPerson
  picked: boolean
  dimmed: boolean
  onTap: (uid: string) => void
  onLift: (uid: string, card: Rect, grab: { x: number; y: number }) => void
  onMove: (moved: { x: number; y: number }) => void
  onDrop: (moved: { x: number; y: number }) => void
  onCancel: () => void
}) {
  return (
    <DragCard
      onTap={() => onTap(person.uid)}
      onDragStart={(card, grab) => onLift(person.uid, card, grab)}
      onDragMove={onMove}
      onDragEnd={onDrop}
      onDragCancel={onCancel}
    >
      <PersonCard person={person} picked={picked} dimmed={dimmed} />
    </DragCard>
  )
}

/**
 * A name typed into a seat, for anyone who would rather type than drag: the
 * people it could be, as it is typed, to put there with a tap — or Enter,
 * when it is plainly one of them. In the passengers', a name that is no one
 * on the event can be added as a child.
 */
function NameTyper({
  placeholder,
  candidates,
  where,
  onPick,
  onChild,
}: {
  placeholder: string
  candidates: CarpoolPerson[]
  /** Where someone is now ("in Car 2", "driving Andy’s van"), or '' if not in a car. */
  where: (uid: string) => string
  onPick: (uid: string) => void
  onChild?: (name: string) => void
}) {
  const colors = useThemeColors()
  const [text, setText] = useState('')
  const typed = text.trim()
  const found = typed ? candidates.filter((p) => matchesSearch(p.name, typed)).slice(0, 5) : []
  const pick = (uid: string) => {
    onPick(uid)
    setText('')
  }
  const addChild = () => {
    onChild?.(typed)
    setText('')
  }
  // Enter: the one it fits, or the one it names in full — never a guess among several.
  const enter = () => {
    const exact = found.filter((p) => p.name.trim().toLowerCase() === typed.toLowerCase())
    if (found.length === 1) pick(found[0].uid)
    else if (exact.length === 1) pick(exact[0].uid)
    else if (found.length === 0 && typed && onChild) addChild()
  }
  return (
    <View style={styles.typer}>
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={enter}
        // Kept open for the next name.
        blurOnSubmit={false}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCorrect={false}
        autoCapitalize="words"
        returnKeyType="done"
        style={[
          styles.typerInput,
          { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
        ]}
        accessibilityLabel={placeholder}
      />
      {typed ? (
        <YStack gap="$1">
          {found.map((p) => (
            <Pressable
              key={p.uid}
              onPress={() => pick(p.uid)}
              accessibilityRole="button"
              accessibilityLabel={`Put ${p.name} here`}
              style={[styles.suggestion, { borderColor: colors.border }]}
            >
              <Text
                color={colors.text}
                fontSize="$3"
                fontWeight="600"
                numberOfLines={1}
                flexShrink={1}
              >
                {p.name}
              </Text>
              {where(p.uid) ? (
                <Text color={colors.textMuted} fontSize="$2" numberOfLines={1}>
                  {where(p.uid)}
                </Text>
              ) : null}
            </Pressable>
          ))}
          {found.length === 0 ? (
            onChild ? (
              <Pressable
                onPress={addChild}
                accessibilityRole="button"
                style={[styles.suggestion, { borderColor: CARD_COLORS.child.border }]}
              >
                <Text color={colors.primary} fontSize="$3" fontWeight="600" numberOfLines={1}>
                  + Add “{typed}” as a child
                </Text>
              </Pressable>
            ) : (
              <Text color={colors.textMuted} fontSize="$2">
                No one on this event matches “{typed}”.
              </Text>
            )
          ) : null}
        </YStack>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 2,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  tabCompact: {
    gap: 6,
    minHeight: 34,
    paddingHorizontal: 10,
  },
  // Half the window at most, so the pool below always has room to drag from.
  panel: {
    flexShrink: 1,
    maxHeight: '50%',
  },
  zone: {
    minHeight: 58,
    padding: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  zoneHover: {
    transform: [{ scale: 1.01 }],
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    alignContent: 'flex-start',
    justifyContent: 'flex-start',
    gap: 8,
  },
  pool: {
    flex: 1,
    minHeight: 120,
    justifyContent: 'flex-start',
  },
  card: {
    minHeight: 40,
    minWidth: 72,
    maxWidth: 180,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    justifyContent: 'center',
  },
  child: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 220,
    borderWidth: 1.5,
  },
  childInput: {
    minWidth: 96,
    maxWidth: 130,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 2,
    paddingHorizontal: 0,
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
  input: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 15,
  },
  carName: {
    minHeight: 44,
    borderWidth: 2,
    fontSize: 16,
    fontWeight: '600',
  },
  search: {
    flex: 1,
    // Free to shrink (see the car name's): a text box on the web otherwise keeps its default width.
    minWidth: 0,
    minHeight: 40,
    paddingHorizontal: 8,
    fontSize: 15,
  },
  fullWidth: {
    width: '100%',
  },
  // A whole line of its seat, under whoever is in it.
  typer: {
    width: '100%',
    marginTop: 4,
    gap: 6,
  },
  typerInput: {
    minHeight: 36,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 15,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  count: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Big enough to hit first time, on a phone as with a mouse.
  clear: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  summary: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 2,
  },
})
