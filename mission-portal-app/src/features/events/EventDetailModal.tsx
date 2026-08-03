import { useState, useEffect } from 'react'
import { Pressable, Linking, Alert, Platform } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { onSnapshot, doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Modal } from '@/components/ui/Modal'
import { useThemeColors } from '@/theme/useThemeColors'
import { FD } from '@/lib/format'
import { openLocationInMaps, eventMapQuery } from '@/lib/location'
import { downloadICS } from '@/lib/icsExport'
import { availKey, effectiveAvail, getSeriesAvail } from '@/lib/availability'
import { AvailBadge } from '@/components/ui/AvailBadge'
import { useUIStore } from '@/stores/uiStore'
import { useEventsStore } from '@/stores/eventsStore'
import { usePlanningStore } from '@/stores/planningStore'
import { useUsersStore } from '@/stores/usersStore'
import { sameId } from '@/lib/ids'
import { PlanningBoardCanvas } from '@/features/planning/PlanningBoardCanvas'
import type { EventInstance } from '@/types/events'
import {
  fetchWeather,
  fetchNWSAlerts,
  alertsForDate,
  type WeatherData,
  type NWSAlert,
} from '@/lib/weather'
import { WeatherDetailSheet } from './WeatherDetailSheet'

export function TeamsDisplay({ event, uid }: { event: EventInstance; uid: string }) {
  const colors = useThemeColors()
  const { users } = useUsersStore()
  const [showAll, setShowAll] = useState(false)

  const getName = (id: string | number) =>
    users.find((u) => sameId(u.uid, id))?.displayName ?? String(id)

  const myTeam = (event.teams ?? []).find(
    (t) => t.members.some((m) => sameId(m, uid)) || t.leaders.some((m) => sameId(m, uid))
  )

  return (
    <YStack gap="$2">
      <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
        TEAMS
      </Text>

      {myTeam ? (
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$2"
          padding="$3"
          borderWidth={1}
          borderColor={colors.primary}
          gap="$1"
        >
          <Text color={colors.primary} fontWeight="700" fontSize="$3">
            Your Team: {myTeam.name}
          </Text>
          {myTeam.leaders.length > 0 ? (
            <Text color={colors.textMuted} fontSize="$2">
              Leaders: {myTeam.leaders.map(getName).join(', ')}
            </Text>
          ) : null}
          <Text color={colors.textMuted} fontSize="$2">
            {myTeam.members.map(getName).join(', ')}
          </Text>
        </YStack>
      ) : (
        <Text color={colors.textMuted} fontSize="$3">
          You are not assigned to a team.
        </Text>
      )}

      <Pressable onPress={() => setShowAll((s) => !s)}>
        <Text color={colors.primary} fontSize="$2">
          {showAll ? 'Hide teams' : `Show all teams (${event.teams?.length ?? 0})`}
        </Text>
      </Pressable>

      {showAll
        ? (event.teams ?? []).map((team, idx) => {
            const isMine = team === myTeam
            return (
              <YStack
                key={idx}
                backgroundColor={colors.surface}
                borderRadius="$2"
                padding="$2"
                borderWidth={1}
                borderColor={isMine ? colors.primary : colors.border}
                gap="$1"
              >
                <Text color={isMine ? colors.primary : colors.text} fontWeight="600" fontSize="$3">
                  {team.name}
                </Text>
                {team.leaders.length > 0 ? (
                  <Text color={colors.textMuted} fontSize="$2">
                    Leaders: {team.leaders.map(getName).join(', ')}
                  </Text>
                ) : null}
                <Text color={colors.textMuted} fontSize="$2">
                  {team.members.map(getName).join(', ')}
                </Text>
              </YStack>
            )
          })
        : null}
    </YStack>
  )
}

export function LodgingDisplay({
  event,
  uid,
  isAdmin,
}: {
  event: EventInstance
  uid: string
  isAdmin: boolean
}) {
  const colors = useThemeColors()
  const { users } = useUsersStore()
  const [showAll, setShowAll] = useState(false)

  const getName = (id: string | number) =>
    users.find((u) => sameId(u.uid, id))?.displayName ?? String(id)

  const myEntry = (event.lodgingEntries ?? []).find((e) => e.assignees.some((a) => sameId(a, uid)))

  return (
    <YStack gap="$2">
      <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
        LODGING
      </Text>

      {myEntry ? (
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$2"
          padding="$3"
          borderWidth={1}
          borderColor={colors.primary}
          gap="$1"
        >
          <Text color={colors.primary} fontWeight="700" fontSize="$3">
            {myEntry.name}
          </Text>
          {myEntry.room ? (
            <Text color={colors.textMuted} fontSize="$2">
              Room / Location: {myEntry.room}
            </Text>
          ) : null}
          <Text color={colors.textMuted} fontSize="$2">
            With:{' '}
            {myEntry.assignees
              .filter((a) => !sameId(a, uid))
              .map(getName)
              .join(', ') || 'Just you'}
          </Text>
        </YStack>
      ) : (
        <Text color={colors.textMuted} fontSize="$3">
          You have no lodging assignment.
        </Text>
      )}

      {isAdmin ? (
        <Pressable onPress={() => setShowAll((s) => !s)}>
          <Text color={colors.primary} fontSize="$2">
            {showAll
              ? 'Hide all lodging'
              : `Show all lodging (${event.lodgingEntries?.length ?? 0})`}
          </Text>
        </Pressable>
      ) : null}

      {isAdmin && showAll
        ? (event.lodgingEntries ?? []).map((entry) => {
            const isMine = entry === myEntry
            return (
              <YStack
                key={entry.id}
                backgroundColor={colors.surface}
                borderRadius="$2"
                padding="$2"
                borderWidth={1}
                borderColor={isMine ? colors.primary : colors.border}
                gap="$1"
              >
                <Text color={isMine ? colors.primary : colors.text} fontWeight="600" fontSize="$3">
                  {entry.name}
                  {entry.room ? ` — ${entry.room}` : ''}
                </Text>
                <Text color={colors.textMuted} fontSize="$2">
                  {entry.assignees.map(getName).join(', ') || 'No one assigned'}
                </Text>
              </YStack>
            )
          })
        : null}
    </YStack>
  )
}

type ThemeColors = ReturnType<typeof useThemeColors>

function FlightBlock({
  colors,
  title,
  date,
  time,
  airport,
  airline,
  flight,
  statusLink,
  ticket,
  confirmation,
  arrival,
  contact,
}: {
  colors: ThemeColors
  title: string
  date?: string
  time?: string
  airport?: string
  airline?: string
  flight?: string
  statusLink?: string
  ticket?: string
  confirmation?: string
  arrival?: string
  contact?: string
}) {
  const hasAny =
    date || time || airport || airline || flight || ticket || confirmation || arrival || contact
  if (!hasAny) return null
  return (
    <YStack gap="$1">
      <Text color={colors.primary} fontSize="$2" fontWeight="700">
        {title}
      </Text>
      {date || time ? (
        <Text color={colors.text} fontSize="$3">
          {[date, time].filter(Boolean).join(' at ')}
        </Text>
      ) : null}
      {airport ? (
        <Pressable
          onPress={() =>
            Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(airport)}`)
          }
        >
          <Text color={colors.primary} fontSize="$3" textDecorationLine="underline">
            {airport}
          </Text>
        </Pressable>
      ) : null}
      {airline ? (
        <Text color={colors.textMuted} fontSize="$2">
          {airline}
        </Text>
      ) : null}
      {flight ? (
        statusLink ? (
          <Pressable
            onPress={() =>
              Linking.openURL(
                /^https?:\/\//i.test(statusLink) ? statusLink : `https://${statusLink}`
              )
            }
          >
            <Text color={colors.primary} fontSize="$2" textDecorationLine="underline">
              Flight {flight}
            </Text>
          </Pressable>
        ) : (
          <Text color={colors.textMuted} fontSize="$2">
            Flight {flight}
          </Text>
        )
      ) : null}
      {ticket ? (
        <Text color={colors.textMuted} fontSize="$2">
          Ticket: {ticket}
        </Text>
      ) : null}
      {confirmation ? (
        <Text color={colors.textMuted} fontSize="$2">
          Confirmation: {confirmation}
        </Text>
      ) : null}
      {arrival ? (
        <Text color={colors.textMuted} fontSize="$2">
          Est. arrival: {arrival}
        </Text>
      ) : null}
      {contact ? (
        <Text color={colors.textMuted} fontSize="$2">
          Contact: {contact}
        </Text>
      ) : null}
    </YStack>
  )
}

import type { FlightEntry } from '@/types/events'
import { openExternalUrl } from '@/lib/externalUrl'

function FlightEntryCard({
  colors,
  entry,
  isMine,
  isAdmin,
  getName,
}: {
  colors: ThemeColors
  entry: FlightEntry
  isMine: boolean
  isAdmin: boolean
  getName: (id: string | number) => string
}) {
  return (
    <YStack
      backgroundColor={colors.surface}
      borderRadius="$2"
      padding="$3"
      borderWidth={1}
      borderColor={isMine ? colors.primary : colors.border}
      gap="$2"
    >
      {isAdmin ? (
        <Text color={isMine ? colors.primary : colors.text} fontWeight="700" fontSize="$3">
          {getName(entry.uid)}
        </Text>
      ) : null}
      <FlightBlock
        colors={colors}
        title="OUTBOUND FLIGHT"
        date={entry.outDate}
        time={entry.outTime}
        airport={entry.outAirport}
        airline={entry.outAirline}
        flight={entry.outFlight}
        statusLink={entry.outStatusLink}
        ticket={entry.outTicket}
        confirmation={entry.outConfirmation}
        arrival={entry.outArrival}
        contact={entry.outContact}
      />
      <FlightBlock
        colors={colors}
        title="RETURN FLIGHT"
        date={entry.retDate}
        time={entry.retTime}
        airport={entry.retAirport}
        airline={entry.retAirline}
        flight={entry.retFlight}
        statusLink={entry.retStatusLink}
        ticket={entry.retTicket}
        confirmation={entry.retConfirmation}
        arrival={entry.retArrival}
      />
    </YStack>
  )
}

export function FlightDisplay({
  event,
  uid,
  isAdmin,
}: {
  event: EventInstance
  uid: string
  isAdmin: boolean
}) {
  const colors = useThemeColors()
  const { users } = useUsersStore()
  const [showAll, setShowAll] = useState(false)

  const getName = (id: string | number) =>
    users.find((u) => sameId(u.uid, id))?.displayName ?? String(id)

  const myEntry = (event.flightEntries ?? []).find((e) => sameId(e.uid, uid))

  return (
    <YStack gap="$2">
      <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
        FLIGHTS
      </Text>

      {myEntry ? (
        <FlightEntryCard
          colors={colors}
          entry={myEntry}
          isMine
          isAdmin={isAdmin}
          getName={getName}
        />
      ) : (
        <Text color={colors.textMuted} fontSize="$3">
          You have no flight assignment.
        </Text>
      )}

      {isAdmin ? (
        <Pressable onPress={() => setShowAll((s) => !s)}>
          <Text color={colors.primary} fontSize="$2">
            {showAll
              ? 'Hide all flights'
              : `Show all flights (${event.flightEntries?.length ?? 0})`}
          </Text>
        </Pressable>
      ) : null}

      {isAdmin && showAll
        ? (event.flightEntries ?? []).map((entry) => (
            <FlightEntryCard
              key={entry.id}
              colors={colors}
              entry={entry}
              isMine={entry === myEntry}
              isAdmin={isAdmin}
              getName={getName}
            />
          ))
        : null}
    </YStack>
  )
}

export function DressCodeDisplay({ event, uid }: { event: EventInstance; uid: string }) {
  const colors = useThemeColors()

  // New structured dress code
  if (event.dressCode?.length) {
    const myTeam = (event.teams ?? []).find(
      (t) => t.members.some((m) => sameId(m, uid)) || t.leaders.some((m) => sameId(m, uid))
    )
    const groupName = myTeam?.name ?? 'Unassigned'
    const specific = event.dressCode.find((e) => e.group === groupName)
    const remainder = event.dressCode.find((e) => e.group === '_remainder_')
    const myDC = specific ?? remainder
    if (!myDC) return null

    return (
      <YStack gap="$1">
        <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
          DRESS CODE
        </Text>
        <Text color={colors.text} fontSize="$3">
          {myDC.text}
        </Text>
      </YStack>
    )
  }

  // Legacy dcw/dcm fields
  if (!event.dcw && !event.dcm) return null
  return (
    <YStack gap="$1">
      <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
        DRESS CODE
      </Text>
      {event.dcw ? (
        <Text color={colors.text} fontSize="$3">
          Worship: {event.dcw}
        </Text>
      ) : null}
      {event.dcm ? (
        <Text color={colors.text} fontSize="$3">
          Mission: {event.dcm}
        </Text>
      ) : null}
    </YStack>
  )
}

interface FoodSignupEntry {
  uid: string
  displayName: string
}

export function FoodPanel({
  event,
  uid,
  myDisplayName,
}: {
  event: EventInstance
  uid: string
  myDisplayName: string
}) {
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)
  const [signups, setSignups] = useState<Record<string, FoodSignupEntry>>({})

  const foodKey = `${event.templateId}_${event.date}`

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'foodSignups', foodKey), (snap) => {
      setSignups((snap.data()?.signups as Record<string, FoodSignupEntry>) ?? {})
    })
    return () => unsub()
  }, [foodKey])

  const handleToggle = async (itemIndex: number, itemName: string) => {
    const existing = signups[String(itemIndex)]
    if (existing) {
      if (existing.uid !== uid) {
        toast(`${existing.displayName} is already signed up for "${itemName}"`, 'error')
        return
      }
      const updated = { ...signups }
      delete updated[String(itemIndex)]
      try {
        await setDoc(doc(db, 'foodSignups', foodKey), { signups: updated })
      } catch {
        toast('Failed to update sign-up', 'error')
      }
      return
    }
    const doSignup = async () => {
      try {
        await setDoc(doc(db, 'foodSignups', foodKey), {
          signups: { ...signups, [String(itemIndex)]: { uid, displayName: myDisplayName } },
        })
      } catch {
        toast('Failed to sign up', 'error')
      }
    }
    if (Platform.OS === 'web') {
      if (window.confirm(`Sign up to bring "${itemName}"?`)) doSignup()
      return
    }
    Alert.alert(`Sign up to bring "${itemName}"?`, '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Up', onPress: doSignup },
    ])
  }

  const items = event.foodItems ?? []

  return (
    <YStack gap="$2">
      <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
        FOOD
      </Text>
      {items.length === 0 ? (
        <XStack gap="$1" alignItems="center">
          <Text>🍽</Text>
          <Text color={colors.text} fontSize="$3">
            Food provided
          </Text>
        </XStack>
      ) : (
        items.map((item, i) => {
          const signup = signups[String(i)]
          const isMine = signup?.uid === uid
          const isTaken = !!signup && !isMine
          return (
            <XStack
              key={i}
              alignItems="center"
              backgroundColor={colors.surface}
              borderRadius="$2"
              padding="$2"
              borderWidth={1}
              borderColor={isMine ? colors.primary : colors.border}
              gap="$2"
            >
              <YStack flex={1}>
                <Text color={colors.text} fontSize="$3">
                  {item}
                </Text>
                {signup ? (
                  <Text color={isMine ? colors.primary : colors.textMuted} fontSize="$2">
                    {isMine ? '✓ You are bringing this' : `${signup.displayName} is bringing this`}
                  </Text>
                ) : null}
              </YStack>
              {!isTaken ? (
                <Pressable onPress={() => handleToggle(i, item)}>
                  <XStack
                    borderWidth={1}
                    borderColor={isMine ? '$red10' : colors.primary}
                    borderRadius="$2"
                    paddingHorizontal="$2"
                    paddingVertical="$1"
                  >
                    <Text color={isMine ? '$red10' : colors.primary} fontSize="$2">
                      {isMine ? 'Cancel' : 'Sign up'}
                    </Text>
                  </XStack>
                </Pressable>
              ) : null}
            </XStack>
          )
        })
      )}
    </YStack>
  )
}

export function CarpoolReadOnly({
  event,
  uid,
  isAdmin,
}: {
  event: EventInstance
  uid: string
  isAdmin: boolean
}) {
  const colors = useThemeColors()
  const { users } = useUsersStore()
  const getName = (u: string) => users.find((x) => sameId(x.uid, u))?.displayName ?? u
  const cars = event.carpoolCars ?? []
  const myCar = cars.find((c) => c.driver === uid || c.riders.includes(uid))

  const carsToShow = isAdmin ? cars : myCar ? [myCar] : []

  return (
    <YStack gap="$3">
      <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
        CARPOOL
      </Text>
      {carsToShow.map((car, idx) => {
        const isMycar = car.driver === uid || car.riders.includes(uid)
        const carIdx = isAdmin ? idx : cars.indexOf(car)
        return (
          <YStack
            key={car.id}
            backgroundColor={colors.surface}
            borderRadius="$2"
            padding="$3"
            borderWidth={1}
            borderColor={isMycar ? colors.primary : colors.border}
            gap="$1"
          >
            <Text color={colors.text} fontWeight="700" fontSize="$3">
              {car.label || `Car ${carIdx + 1}`}
              {isMycar ? ' ← Your car' : ''}
            </Text>
            {car.driver ? (
              <Text color={colors.text} fontSize="$3">
                🚗 {getName(car.driver)}
              </Text>
            ) : null}
            {car.riders.length > 0 ? (
              <Text color={colors.textMuted} fontSize="$2">
                Riders: {car.riders.map(getName).join(', ')}
              </Text>
            ) : null}
            {!car.driver && car.riders.length === 0 ? (
              <Text color={colors.textMuted} fontSize="$2">
                No one assigned yet
              </Text>
            ) : null}
          </YStack>
        )
      })}
      {!myCar && (
        <Text color={colors.textMuted} fontSize="$3">
          You have not been assigned to a car yet.
        </Text>
      )}
    </YStack>
  )
}

interface CarpoolCar {
  id: string
  driver: string
  riders: string[]
}

interface EventDetailModalProps {
  event: EventInstance | null
  uid: string
  isMember: boolean
  isAdmin: boolean
  open: boolean
  onClose: () => void
  onAvail?: () => void
  onEdit?: () => void
}

export function CarpoolPanel({
  event,
  uid,
  isAdmin,
}: {
  event: EventInstance
  uid: string
  isAdmin: boolean
}) {
  const colors = useThemeColors()
  const { users } = useUsersStore()
  const toast = useUIStore((s) => s.toast)
  const [cars, setCars] = useState<CarpoolCar[]>([])
  const [picker, setPicker] = useState<{ carId: string; role: 'driver' | 'rider' } | null>(null)

  const carpoolKey = `${event.templateId}_${event.date}`

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'carpool', carpoolKey), (snap) => {
      setCars((snap.data()?.cars as CarpoolCar[]) ?? [])
    })
    return () => unsub()
  }, [carpoolKey])

  const save = async (updated: CarpoolCar[]) => {
    try {
      await setDoc(doc(db, 'carpool', carpoolKey), { cars: updated })
    } catch {
      toast('Failed to save carpool', 'error')
    }
  }

  // UIDs of people assigned to this event
  const eventUids = (event.users ?? []).map(String)
  const getName = (u: string) => users.find((x) => String(x.uid) === u)?.displayName ?? u

  // Everyone already assigned (as driver or rider) across all cars
  const assignedUids = new Set(cars.flatMap((c) => [c.driver, ...c.riders].filter(Boolean)))

  // Unassigned event members
  const unassigned = eventUids.filter((u) => !assignedUids.has(u))

  // Available to pick for the current picker slot
  const availableForPick = picker
    ? eventUids.filter((u) => {
        if (assignedUids.has(u)) {
          // Allow replacing the current driver slot
          if (picker.role === 'driver') {
            const car = cars.find((c) => c.id === picker.carId)
            return car?.driver === u
          }
          return false
        }
        return true
      })
    : []

  const addCar = () => {
    const next: CarpoolCar[] = [...cars, { id: Date.now().toString(), driver: '', riders: [] }]
    save(next)
  }

  const removeCar = (carId: string) => {
    save(cars.filter((c) => c.id !== carId))
  }

  const setDriver = (carId: string, driverUid: string) => {
    save(cars.map((c) => (c.id === carId ? { ...c, driver: driverUid } : c)))
    setPicker(null)
  }

  const addRider = (carId: string, riderUid: string) => {
    save(cars.map((c) => (c.id === carId ? { ...c, riders: [...c.riders, riderUid] } : c)))
    setPicker(null)
  }

  const removeRider = (carId: string, riderUid: string) => {
    save(
      cars.map((c) =>
        c.id === carId ? { ...c, riders: c.riders.filter((r) => r !== riderUid) } : c
      )
    )
  }

  const clearDriver = (carId: string) => {
    save(cars.map((c) => (c.id === carId ? { ...c, driver: '' } : c)))
  }

  const handleFinalize = () => {
    if (unassigned.length === 0) {
      toast('All members assigned to carpool', 'success')
      return
    }
    const names = unassigned.map(getName).join(', ')
    const msg = `${unassigned.length} member(s) not yet in a car: ${names}\n\nFinalize anyway?`
    if (Platform.OS === 'web') {
      if (window.confirm(msg)) toast('Carpool finalized', 'success')
      return
    }
    Alert.alert('Unassigned Members', msg, [
      { text: 'Go Back', style: 'cancel' },
      { text: 'Finalize', onPress: () => toast('Carpool finalized', 'success') },
    ])
  }

  // Find the current user's car
  const myCarIndex = cars.findIndex((c) => c.driver === uid || c.riders.includes(uid))
  const myCar = myCarIndex >= 0 ? cars[myCarIndex] : null

  return (
    <YStack gap="$3">
      <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
        CARPOOL
      </Text>

      {/* Member view: show only their car */}
      {!isAdmin && (
        <YStack gap="$1">
          {myCar ? (
            <YStack
              backgroundColor={colors.surface}
              borderRadius="$2"
              padding="$3"
              borderWidth={1}
              borderColor={colors.border}
              gap="$1"
            >
              <Text color={colors.text} fontWeight="700" fontSize="$3">
                Car {myCarIndex + 1}
              </Text>
              <Text color={colors.text} fontSize="$3">
                🚗 Driver: {myCar.driver ? getName(myCar.driver) : '—'}
              </Text>
              {myCar.riders.length > 0 && (
                <Text color={colors.textMuted} fontSize="$2">
                  Riders: {myCar.riders.map(getName).join(', ')}
                </Text>
              )}
            </YStack>
          ) : (
            <Text color={colors.textMuted} fontSize="$3">
              You have not been assigned to a car yet.
            </Text>
          )}
        </YStack>
      )}

      {/* Admin view: manage all cars */}
      {isAdmin && (
        <YStack gap="$3">
          {cars.map((car, idx) => (
            <YStack
              key={car.id}
              backgroundColor={colors.surface}
              borderRadius="$3"
              padding="$3"
              borderWidth={1}
              borderColor={colors.border}
              gap="$2"
            >
              <XStack justifyContent="space-between" alignItems="center">
                <Text color={colors.text} fontWeight="700" fontSize="$3">
                  Car {idx + 1}
                </Text>
                <Pressable onPress={() => removeCar(car.id)}>
                  <Text color="$red10" fontSize="$2">
                    Remove
                  </Text>
                </Pressable>
              </XStack>

              {/* Driver row */}
              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                  DRIVER
                </Text>
                {car.driver ? (
                  <XStack gap="$2" alignItems="center">
                    <Text color={colors.text} fontSize="$3" flex={1}>
                      🚗 {getName(car.driver)}
                    </Text>
                    <Pressable onPress={() => clearDriver(car.id)}>
                      <Text color="$red10" fontSize="$2">
                        ✕
                      </Text>
                    </Pressable>
                  </XStack>
                ) : (
                  <Pressable onPress={() => setPicker({ carId: car.id, role: 'driver' })}>
                    <XStack
                      borderWidth={1}
                      borderColor={colors.border}
                      borderRadius="$2"
                      paddingHorizontal="$3"
                      paddingVertical="$2"
                      alignSelf="flex-start"
                    >
                      <Text color={colors.primary} fontSize="$3">
                        + Assign Driver
                      </Text>
                    </XStack>
                  </Pressable>
                )}
              </YStack>

              {/* Riders */}
              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                  RIDERS
                </Text>
                {car.riders.map((r) => (
                  <XStack key={r} gap="$2" alignItems="center">
                    <Text color={colors.text} fontSize="$3" flex={1}>
                      👤 {getName(r)}
                    </Text>
                    <Pressable onPress={() => removeRider(car.id, r)}>
                      <Text color="$red10" fontSize="$2">
                        ✕
                      </Text>
                    </Pressable>
                  </XStack>
                ))}
                {unassigned.length > 0 && (
                  <Pressable onPress={() => setPicker({ carId: car.id, role: 'rider' })}>
                    <XStack
                      borderWidth={1}
                      borderColor={colors.border}
                      borderRadius="$2"
                      paddingHorizontal="$3"
                      paddingVertical="$2"
                      alignSelf="flex-start"
                    >
                      <Text color={colors.primary} fontSize="$3">
                        + Add Rider
                      </Text>
                    </XStack>
                  </Pressable>
                )}
              </YStack>
            </YStack>
          ))}

          {/* Unassigned warning */}
          {unassigned.length > 0 && (
            <YStack
              backgroundColor="$yellow2"
              borderRadius="$2"
              padding="$3"
              borderWidth={1}
              borderColor="$yellow7"
              gap="$1"
            >
              <Text color="$yellow11" fontWeight="600" fontSize="$2">
                ⚠ {unassigned.length} Unassigned
              </Text>
              {unassigned.map((u) => (
                <Text key={u} color="$yellow11" fontSize="$2">
                  {getName(u)}
                </Text>
              ))}
            </YStack>
          )}

          <XStack gap="$2">
            <Pressable onPress={addCar}>
              <XStack
                borderWidth={1}
                borderColor={colors.primary}
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$2"
              >
                <Text color={colors.primary} fontWeight="600" fontSize="$3">
                  + Add Car
                </Text>
              </XStack>
            </Pressable>
            <Pressable onPress={handleFinalize}>
              <XStack
                backgroundColor={colors.primary}
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$2"
              >
                <Text color="white" fontWeight="600" fontSize="$3">
                  Finalize
                </Text>
              </XStack>
            </Pressable>
          </XStack>

          {/* Inline user picker */}
          {picker && (
            <YStack
              backgroundColor={colors.surface}
              borderRadius="$3"
              padding="$3"
              borderWidth={1}
              borderColor={colors.primary}
              gap="$2"
            >
              <XStack justifyContent="space-between" alignItems="center">
                <Text color={colors.text} fontWeight="700" fontSize="$3">
                  Select {picker.role === 'driver' ? 'Driver' : 'Rider'}
                </Text>
                <Pressable onPress={() => setPicker(null)}>
                  <Text color={colors.textMuted} fontSize="$3">
                    ✕
                  </Text>
                </Pressable>
              </XStack>
              {availableForPick.length === 0 ? (
                <Text color={colors.textMuted} fontSize="$3">
                  No unassigned members available.
                </Text>
              ) : (
                availableForPick.map((u) => (
                  <Pressable
                    key={u}
                    onPress={() =>
                      picker.role === 'driver'
                        ? setDriver(picker.carId, u)
                        : addRider(picker.carId, u)
                    }
                  >
                    <XStack
                      paddingHorizontal="$3"
                      paddingVertical="$2"
                      borderRadius="$2"
                      backgroundColor={colors.background}
                      borderWidth={1}
                      borderColor={colors.border}
                    >
                      <Text color={colors.text} fontSize="$3">
                        {getName(u)}
                      </Text>
                    </XStack>
                  </Pressable>
                ))
              )}
            </YStack>
          )}
        </YStack>
      )}
    </YStack>
  )
}

export function EventDetailModal({
  event,
  uid,
  isMember,
  isAdmin,
  open,
  onClose,
  onAvail,
  onEdit,
}: EventDetailModalProps) {
  const colors = useThemeColors()
  const toast = useUIStore((s) => s.toast)
  const { avail } = useEventsStore()
  // For recurring events, show instance response if set, else fall back to series response
  const myAvail = event ? effectiveAvail(avail, event, uid) : null
  const instanceAvail = event ? (avail[availKey(event)]?.[uid] ?? null) : null
  const hasSeriesResponse = event?.isRec
    ? getSeriesAvail(avail, event.templateId ?? event.id, uid) !== null
    : true
  const { users } = useUsersStore()
  const myDisplayName = users.find((u) => sameId(u.uid, uid))?.displayName ?? ''
  const { boards } = usePlanningStore()
  const linkedBoard = event?.planningBoardId
    ? boards.find((b) => sameId(b.id, event.planningBoardId!))
    : null
  const [showBoard, setShowBoard] = useState(false)
  const [weatherEntry, setWeatherEntry] = useState<{ key: string; data: WeatherData } | null>(null)
  const [alertsEntry, setAlertsEntry] = useState<{ key: string; data: NWSAlert[] } | null>(null)
  const [showWeather, setShowWeather] = useState(false)
  const eventWeatherKey = `${event?.templateId}_${event?.date}`
  const weather = weatherEntry?.key === eventWeatherKey ? weatherEntry.data : null
  const alerts = alertsEntry?.key === eventWeatherKey ? alertsEntry.data : []

  useEffect(() => {
    if (!open || !event?._geocodeLat || !event?._geocodeLng || !event?.date || event?.isVirtual)
      return
    if (!isMember && !isAdmin) return
    const key = `${event.templateId}_${event.date}`
    fetchWeather(event._geocodeLat, event._geocodeLng, event.date).then((w) => {
      if (w) setWeatherEntry({ key, data: w })
    })
    // Filtered to this event's day, so the badge counts what actually
    // applies rather than everything active in the area.
    const eventDate = event.date
    fetchNWSAlerts(event._geocodeLat, event._geocodeLng).then((a) =>
      setAlertsEntry({ key, data: alertsForDate(a, eventDate) })
    )
  }, [open, event?.date, event?._geocodeLat, event?._geocodeLng, isMember, isAdmin])

  const handleExportICS = async () => {
    if (!event) return
    try {
      await downloadICS(event)
    } catch {
      toast('Failed to export calendar file', 'error')
    }
  }

  if (!event) return null

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(v) => {
          if (!v) {
            setShowWeather(false)
            onClose()
          }
        }}
        title={event.title}
        scrollable
      >
        <YStack gap="$3" paddingBottom="$4">
          {/* Date & Time */}
          <YStack gap="$1">
            <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
              DATE & TIME
            </Text>
            <Text color={colors.text} fontSize="$3">
              {FD(event.date, { weekday: true })}
            </Text>
            {event.startTime ? (
              <Text color={colors.text} fontSize="$3">
                Start: {event.startTime}
              </Text>
            ) : null}
            {isMember && event.rtp ? (
              <Text color={colors.text} fontSize="$3">
                Report (Production): {event.rtp}
              </Text>
            ) : null}
            {isMember && event.rtm ? (
              <Text color={colors.text} fontSize="$3">
                Report (Mission): {event.rtm}
              </Text>
            ) : null}
          </YStack>

          {/* Weather forecast */}
          {weather ? (
            <Pressable onPress={() => setShowWeather(true)}>
              <XStack
                backgroundColor={colors.surface}
                borderRadius="$2"
                padding="$2"
                borderWidth={1}
                borderColor={alerts.length > 0 ? '#e74c3c' : colors.border}
                alignItems="center"
                gap="$3"
              >
                <Text fontSize={24}>{weather.icon}</Text>
                <YStack flex={1}>
                  <Text color={colors.text} fontSize="$3" fontWeight="600">
                    {weather.label}
                  </Text>
                  <Text color={colors.textMuted} fontSize="$2">
                    {weather.high}°F / {weather.low}°F · {weather.precipPct}% chance of rain
                  </Text>
                </YStack>
                {alerts.length > 0 ? (
                  <XStack
                    backgroundColor="#e74c3c"
                    borderRadius={99}
                    paddingHorizontal={8}
                    paddingVertical={3}
                    alignItems="center"
                    gap="$1"
                  >
                    <Text color="white" fontSize={11} fontWeight="700">
                      ⚠ {alerts.length}
                    </Text>
                  </XStack>
                ) : null}
                <Text color={colors.textMuted} fontSize="$2">
                  ›
                </Text>
              </XStack>
            </Pressable>
          ) : null}

          {/* Location */}
          {event.location || event.address || event.city ? (
            <YStack gap="$1">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                LOCATION
              </Text>
              {event.location ? (
                <Text color={colors.text} fontSize="$3">
                  {event.location}
                </Text>
              ) : null}
              {event.address ? (
                <Text color={colors.text} fontSize="$3">
                  {event.address}
                </Text>
              ) : null}
              {event.city ? (
                <Text color={colors.text} fontSize="$3">
                  {event.city}
                  {event.state ? `, ${event.state}` : ''}
                </Text>
              ) : null}
              <Pressable onPress={() => openLocationInMaps(eventMapQuery(event))}>
                <Text color={colors.primary} textDecorationLine="underline" fontSize="$2">
                  Get Directions →
                </Text>
              </Pressable>
            </YStack>
          ) : null}

          {/* Virtual join link */}
          {event.isVirtual ? (
            <YStack gap="$1">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                VIRTUAL EVENT
              </Text>
              <XStack gap="$2" alignItems="center">
                <Text fontSize="$3">🖥</Text>
                <Text color={colors.text} fontSize="$3">
                  Virtual Event
                </Text>
              </XStack>
              {event.virtualLink ? (
                <Pressable onPress={() => openExternalUrl(event.virtualLink)}>
                  <Text color={colors.primary} textDecorationLine="underline" fontSize="$3">
                    {event.virtualLink}
                  </Text>
                </Pressable>
              ) : null}
            </YStack>
          ) : null}

          {/* Dress Code — members only */}
          {isMember ? <DressCodeDisplay event={event} uid={uid} /> : null}

          {/* Food — members only */}
          {isMember && event.food ? (
            <FoodPanel event={event} uid={uid} myDisplayName={myDisplayName} />
          ) : null}

          {/* Carpool — members only */}
          {isMember && event.carpool ? (
            event.carpoolCars && event.carpoolCars.length > 0 ? (
              <CarpoolReadOnly event={event} uid={uid} isAdmin={isAdmin} />
            ) : (
              <CarpoolPanel event={event} uid={uid} isAdmin={isAdmin} />
            )
          ) : null}

          {/* Teams — members only */}
          {isMember && event.teams && event.teams.length > 0 ? (
            <TeamsDisplay event={event} uid={uid} />
          ) : null}

          {/* Lodging — members only */}
          {isMember && event.lodging && event.lodgingEntries && event.lodgingEntries.length > 0 ? (
            <LodgingDisplay event={event} uid={uid} isAdmin={isAdmin} />
          ) : null}

          {/* Flights — members only */}
          {isMember && event.flights && event.flightEntries && event.flightEntries.length > 0 ? (
            <FlightDisplay event={event} uid={uid} isAdmin={isAdmin} />
          ) : null}

          {/* Sign up link — visible to all */}
          {event.signUpLink ? (
            <Pressable onPress={() => openExternalUrl(event.signUpLink)}>
              <Text color={colors.primary} textDecorationLine="underline">
                Sign Up →
              </Text>
            </Pressable>
          ) : null}

          {/* Availability — members only */}
          {isMember ? (
            <YStack gap="$2">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                YOUR AVAILABILITY
              </Text>
              <XStack gap="$2" alignItems="center">
                <AvailBadge status={myAvail?.status} />
                {myAvail?.note ? (
                  <Text color={colors.textMuted} fontSize="$2">
                    {myAvail.note}
                  </Text>
                ) : null}
                {event.isRec && instanceAvail ? (
                  <Text color={colors.textMuted} fontSize={11}>
                    (this date only)
                  </Text>
                ) : event.isRec && myAvail ? (
                  <Text color={colors.textMuted} fontSize={11}>
                    (series)
                  </Text>
                ) : null}
              </XStack>
              {event.isRec && !hasSeriesResponse ? (
                <Text color={colors.textMuted} fontSize="$2">
                  Set your series availability in the banner above first.
                </Text>
              ) : onAvail ? (
                <Pressable onPress={onAvail}>
                  <XStack
                    borderWidth={1}
                    borderColor={colors.primary}
                    borderRadius="$2"
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    alignSelf="flex-start"
                  >
                    <Text color={colors.primary} fontWeight="600" fontSize="$3">
                      {instanceAvail
                        ? 'Change This Date'
                        : myAvail
                          ? 'Override This Date'
                          : 'Set RSVP'}
                    </Text>
                  </XStack>
                </Pressable>
              ) : null}
            </YStack>
          ) : null}

          {/* Planning Board — members only */}
          {isMember && linkedBoard ? (
            <YStack gap="$1">
              <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                PLANNING BOARD
              </Text>
              <Pressable onPress={() => setShowBoard(true)}>
                <XStack
                  backgroundColor={colors.surface}
                  borderWidth={1}
                  borderColor={colors.border}
                  borderRadius="$2"
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  alignSelf="flex-start"
                  gap="$2"
                >
                  <Text>📋</Text>
                  <Text color={colors.text} fontSize="$3">
                    {linkedBoard.name}
                  </Text>
                  <Text color={colors.primary} fontSize="$3">
                    →
                  </Text>
                </XStack>
              </Pressable>
            </YStack>
          ) : null}

          {/* ICS Export — visible to all */}
          <Pressable onPress={handleExportICS}>
            <XStack
              backgroundColor={colors.surface}
              borderWidth={1}
              borderColor={colors.border}
              borderRadius="$2"
              paddingHorizontal="$3"
              paddingVertical="$2"
              alignSelf="flex-start"
              gap="$2"
            >
              <Text>📅</Text>
              <Text color={colors.text} fontSize="$3">
                Add to Calendar (.ics)
              </Text>
            </XStack>
          </Pressable>

          {/* Admin Edit */}
          {onEdit ? (
            <Pressable onPress={onEdit}>
              <XStack
                backgroundColor={colors.primary}
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$2"
                alignSelf="flex-start"
                gap="$2"
              >
                <Text color="white" fontWeight="600" fontSize="$3">
                  ✎ Edit Event
                </Text>
              </XStack>
            </Pressable>
          ) : null}
        </YStack>

        <PlanningBoardCanvas
          boardId={linkedBoard?.id ?? null}
          readOnly
          visible={showBoard}
          onClose={() => setShowBoard(false)}
        />
      </Modal>

      {event ? (
        <WeatherDetailSheet
          open={open && showWeather}
          onClose={() => setShowWeather(false)}
          event={event}
        />
      ) : null}
    </>
  )
}
