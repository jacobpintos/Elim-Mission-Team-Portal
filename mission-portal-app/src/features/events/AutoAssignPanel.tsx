import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { readCarpoolMemory } from '@/lib/carpoolMemoryDb'
import {
  carKey,
  emptyMemory,
  rememberedCars,
  seatsRemembered,
  togetherCounts,
  usualDrivers,
  type CarpoolMemory,
} from '@/lib/carpoolMemory'
import type { CarpoolCarData, CarpoolChild } from '@/types/events'
import type { CarpoolPerson } from './CarpoolBuilder'
import { NameTyper } from './CarpoolNameTyper'
import {
  autoAssign,
  DEFAULT_SEATS,
  familyName,
  roomFor,
  type AssignCar,
  type SeatingRules,
} from './carpoolAssign'
import { customSeatingRules } from '@/custom/carpool'
import { CARD_COLORS, cardColorsFor, carName, newCar, newChild } from './carpoolCards'

/** A car as it is set up: its size as typed. */
interface SetupCar {
  id: string
  label: string
  seats: string
  driver: string
  children: CarpoolChild[]
}

/** The most usual drivers offered at once. */
const MOST_DRIVERS = 6

const seatsOf = (car: SetupCar) => {
  const n = parseInt(car.seats, 10)
  return Number.isFinite(n) && n > 0 ? Math.min(n, 60) : DEFAULT_SEATS
}

const asAssignCar = (car: SetupCar): AssignCar => ({
  id: car.id,
  label: car.label.trim(),
  seats: seatsOf(car),
  driver: car.driver,
  children: car.children.filter((k) => k.name.trim()),
})

/**
 * Auto-assign, set up: the cars first — each one's name, how many it holds,
 * its driver and any children riding in it — then who isn't riding. Then
 * everyone else is put in a car (./carpoolAssign): not a car full while
 * another has room, men with men and women with women, and not the same
 * people together as last time — family (a shared last name) together
 * whatever their sex, and any special rules for people followed. The cars
 * come back to the builder, to be
 * looked over and changed by hand before they are saved.
 *
 * The team's cars are remembered by name and size, and who usually drives
 * (lib/carpoolMemory): offered here a tap away.
 */
export function AutoAssignPanel({
  cars: startingCars,
  people,
  personFor,
  rideKey,
  onAssign,
  onCancel,
}: {
  cars: CarpoolCarData[]
  /** Everyone on the event. */
  people: CarpoolPerson[]
  personFor: (uid: string) => CarpoolPerson
  /** The event being arranged, whose own last arrangement isn't another time together. */
  rideKey?: string
  onAssign: (cars: CarpoolCarData[], noRoom: string[]) => void
  onCancel: () => void
}) {
  const colors = useThemeColors()
  const [memory, setMemory] = useState<CarpoolMemory | null>(null)
  // Rules for particular people, where this build keeps them (src/custom).
  const [rules, setRules] = useState<SeatingRules>({})
  const [cars, setCars] = useState<SetupCar[]>(() =>
    startingCars.map((c) => ({
      id: c.id,
      label: c.label,
      seats: c.seats ? String(c.seats) : '',
      driver: c.driver,
      children: c.children ?? [],
    }))
  )
  const [leftOut, setLeftOut] = useState<string[]>([])
  const [childName, setChildName] = useState<Record<string, string>>({})

  useEffect(() => {
    let live = true
    customSeatingRules()
      .then((r) => live && setRules(r))
      .catch(() => {})
    readCarpoolMemory().then((m) => {
      if (!live) return
      setMemory(m)
      // A car named as one remembered: its size, as it was.
      setCars((cs) =>
        cs.map((c) => (c.seats ? c : { ...c, seats: String(seatsRemembered(m, c.label) ?? '') }))
      )
    })
    return () => {
      live = false
    }
  }, [])

  const onEvent = useMemo(() => new Set(people.map((p) => p.uid)), [people])
  const driving = new Set(cars.map((c) => c.driver).filter(Boolean))
  const known = memory ?? emptyMemory()
  // The team's cars not set up yet, and who usually drives — on this event, and not driving yet.
  const named = new Set(cars.map((c) => carKey(c.label)).filter(Boolean))
  const fleet = rememberedCars(known).filter((c) => !named.has(carKey(c.label)))
  const drivers = usualDrivers(known)
    .filter((d) => onEvent.has(d.uid) && !driving.has(d.uid) && !leftOut.includes(d.uid))
    .slice(0, MOST_DRIVERS)

  const riders = people.filter((p) => !driving.has(p.uid) && !leftOut.includes(p.uid))
  const seats = cars.reduce((n, c) => n + roomFor(asAssignCar(c)), 0)
  const short = riders.length - seats

  const change = (id: string, part: Partial<SetupCar>) =>
    setCars((cs) => cs.map((c) => (c.id === id ? { ...c, ...part } : c)))
  const asCarData = (cs: SetupCar[]): CarpoolCarData[] =>
    cs.map((c) => ({ id: c.id, label: c.label, driver: c.driver, riders: [] }))
  const addCar = (label = '', seatsSaid?: number, driver = '') =>
    setCars((cs) => [
      ...cs,
      {
        id: newCar(asCarData(cs)).id,
        label,
        seats: seatsSaid ? String(seatsSaid) : '',
        driver: driver && onEvent.has(driver) && !cs.some((c) => c.driver === driver) ? driver : '',
        children: [],
      },
    ])
  /** Someone made a driver: of the first car with none, or of a car of their own. */
  const drive = (uid: string) => {
    const free = cars.find((c) => !c.driver)
    if (free) change(free.id, { driver: uid })
    else addCar(`${personFor(uid).name.split(' ')[0]}’s car`, undefined, uid)
  }
  const addChild = (car: SetupCar) => {
    const name = (childName[car.id] ?? '').trim()
    if (!name) return
    const child = { ...newChild({ ...asCarData([car])[0], children: car.children }), name }
    change(car.id, { children: [...car.children, child] })
    setChildName((n) => ({ ...n, [car.id]: '' }))
  }

  const assign = () => {
    const result = autoAssign({
      cars: cars.map(asAssignCar),
      people: people.map((p) => ({ uid: p.uid, sex: p.sex, family: familyName(p.name) })),
      leftOut,
      together: togetherCounts(known, rideKey),
      rules,
      // Each time asked, another of the arrangements as good as each other.
      seed: Date.now() % 2147483647,
    })
    onAssign(result.cars, result.noRoom)
  }

  const label = (text: string) => (
    <Text color={colors.textMuted} fontSize="$2" fontWeight="700" letterSpacing={0.5}>
      {text}
    </Text>
  )
  const chip = (key: string, text: string, onPress: () => void, hint: string) => (
    <Pressable
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={hint}
      style={[styles.chip, { borderColor: colors.primary }]}
    >
      <Text color={colors.primary} fontSize="$2" fontWeight="700" numberOfLines={1}>
        {text}
      </Text>
    </Pressable>
  )
  const personChip = (uid: string, onRemove: () => void, what: string) => {
    const person = personFor(uid)
    const tint = cardColorsFor(person.sex)
    return (
      <View
        key={uid}
        style={[
          styles.person,
          {
            backgroundColor: tint?.background ?? colors.surface,
            borderColor: tint?.border ?? colors.border,
          },
        ]}
      >
        <Text color={tint?.text ?? colors.text} fontSize="$3" fontWeight="600" numberOfLines={1}>
          {person.name}
        </Text>
        <Pressable
          onPress={onRemove}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Take ${person.name} off ${what}`}
        >
          <Text color={tint?.text ?? colors.textMuted} fontSize="$3">
            ✕
          </Text>
        </Pressable>
      </View>
    )
  }
  const inputStyle = [
    styles.input,
    { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
  ]

  return (
    <YStack flex={1} gap="$2">
      <Text color={colors.textMuted} fontSize="$3">
        Set up the cars, and anyone not riding. Everyone else is put in a car — no car full while
        another has room, men with men and women with women, and not with the same people as last
        time.
      </Text>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 10 }}>
        {label('CARS')}
        {cars.map((car, i) => (
          <YStack
            key={car.id}
            gap="$2"
            padding="$2.5"
            borderRadius={10}
            borderWidth={1}
            borderColor={colors.border}
            backgroundColor={colors.background}
          >
            <XStack alignItems="center" gap="$2">
              <TextInput
                value={car.label}
                onChangeText={(text) => change(car.id, { label: text })}
                onBlur={() => {
                  // Named as a car remembered: its size, if none is typed.
                  const remembered = seatsRemembered(known, car.label)
                  if (!car.seats && remembered) change(car.id, { seats: String(remembered) })
                }}
                placeholder={`Name this car — e.g. Andy’s van`}
                placeholderTextColor={colors.textMuted}
                style={[...inputStyle, { flex: 1, minWidth: 0 }]}
                accessibilityLabel={`${carName({ ...asCarData([car])[0] }, i)}: name`}
              />
              <TextInput
                value={car.seats}
                onChangeText={(text) => change(car.id, { seats: text.replace(/\D/g, '') })}
                placeholder={String(DEFAULT_SEATS)}
                placeholderTextColor={colors.textMuted}
                keyboardType="number-pad"
                maxLength={2}
                style={[...inputStyle, styles.seats]}
                accessibilityLabel="Most it holds, the driver counted"
              />
              <Text color={colors.textMuted} fontSize="$2">
                seats
              </Text>
              <Pressable
                onPress={() => setCars((cs) => cs.filter((c) => c.id !== car.id))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Remove this car"
              >
                <Text color="$red10" fontSize="$3" fontWeight="600">
                  ✕
                </Text>
              </Pressable>
            </XStack>
            <XStack alignItems="center" gap="$2" flexWrap="wrap">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="700">
                DRIVER
              </Text>
              {car.driver ? (
                personChip(car.driver, () => change(car.id, { driver: '' }), 'driving')
              ) : (
                <View style={{ flex: 1, minWidth: 180 }}>
                  <NameTyper
                    placeholder="Type the driver’s name"
                    candidates={people.filter((p) => !driving.has(p.uid))}
                    where={() => ''}
                    onPick={(uid) => change(car.id, { driver: uid })}
                  />
                </View>
              )}
            </XStack>
            <XStack alignItems="center" gap="$2" flexWrap="wrap">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="700">
                CHILDREN
              </Text>
              {car.children.map((k) => (
                <View
                  key={k.id}
                  style={[
                    styles.person,
                    {
                      backgroundColor: CARD_COLORS.child.background,
                      borderColor: CARD_COLORS.child.border,
                    },
                  ]}
                >
                  <Text color={CARD_COLORS.child.text} fontSize="$3" fontWeight="600">
                    🧒 {k.name}
                  </Text>
                  <Pressable
                    onPress={() =>
                      change(car.id, { children: car.children.filter((x) => x.id !== k.id) })
                    }
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Take ${k.name} out of this car`}
                  >
                    <Text color={CARD_COLORS.child.text} fontSize="$3">
                      ✕
                    </Text>
                  </Pressable>
                </View>
              ))}
              <TextInput
                value={childName[car.id] ?? ''}
                onChangeText={(text) => setChildName((n) => ({ ...n, [car.id]: text }))}
                onSubmitEditing={() => addChild(car)}
                blurOnSubmit={false}
                placeholder="+ Child’s name"
                placeholderTextColor={colors.textMuted}
                returnKeyType="done"
                style={[...inputStyle, styles.child]}
                accessibilityLabel="Add a child riding in this car"
              />
            </XStack>
          </YStack>
        ))}
        <XStack gap="$2" flexWrap="wrap" alignItems="center">
          {chip('add', '+ Add car', () => addCar(), 'A new car, to name')}
          {fleet.map((c) =>
            chip(
              `fleet:${c.label}`,
              `${c.label}${c.seats ? ` · ${c.seats}` : ''}`,
              () => addCar(c.label, c.seats, c.driver),
              'A car the team has used before, with its size and usual driver'
            )
          )}
        </XStack>

        {drivers.length ? (
          <>
            {label('USUAL DRIVERS')}
            <XStack gap="$2" flexWrap="wrap">
              {drivers.map((d) =>
                chip(
                  `driver:${d.uid}`,
                  `${personFor(d.uid).name} · ${d.times}×`,
                  () => drive(d.uid),
                  'Makes them a driver'
                )
              )}
            </XStack>
          </>
        ) : null}

        {label('NOT RIDING')}
        <XStack gap="$2" flexWrap="wrap" alignItems="center">
          {leftOut.map((uid) =>
            personChip(uid, () => setLeftOut((l) => l.filter((x) => x !== uid)), 'not riding')
          )}
          <View style={{ flex: 1, minWidth: 200 }}>
            <NameTyper
              placeholder="Someone not riding — type a name"
              candidates={people.filter((p) => !driving.has(p.uid) && !leftOut.includes(p.uid))}
              where={() => ''}
              onPick={(uid) => setLeftOut((l) => [...l, uid])}
            />
          </View>
        </XStack>
      </ScrollView>

      <Text color={short > 0 ? '$red10' : colors.textMuted} fontSize="$3">
        {riders.length} to seat · {seats} {seats === 1 ? 'seat' : 'seats'}
        {short > 0 ? ` — ${short} more than there are seats: add a car, or seats.` : ''}
        {cars.some((c) => !c.driver)
          ? ' · A car without a driver is filled too: pick its driver from those in it.'
          : ''}
      </Text>
      <XStack gap="$2" justifyContent="flex-end">
        <Pressable
          onPress={onCancel}
          accessibilityRole="button"
          style={[styles.button, { borderColor: colors.border, backgroundColor: colors.surface }]}
        >
          <Text color={colors.primary} fontSize="$3" fontWeight="600">
            Cancel
          </Text>
        </Pressable>
        <Pressable
          onPress={assign}
          disabled={cars.length === 0}
          accessibilityRole="button"
          style={[
            styles.button,
            {
              backgroundColor: colors.primary,
              borderColor: colors.primary,
              opacity: cars.length ? 1 : 0.5,
            },
          ]}
        >
          <Text color={colors.onPrimary} fontSize="$3" fontWeight="700">
            Assign
          </Text>
        </Pressable>
      </XStack>
    </YStack>
  )
}

const styles = StyleSheet.create({
  input: {
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 15,
  },
  seats: {
    width: 52,
    textAlign: 'center',
  },
  child: {
    minWidth: 140,
    flexGrow: 1,
  },
  chip: {
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 36,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  button: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
