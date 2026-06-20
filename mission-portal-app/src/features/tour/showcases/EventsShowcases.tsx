import { useState } from 'react'
import { YStack, XStack, Text } from 'tamagui'
import { Pressable } from 'react-native'
import { useThemeColors } from '@/theme/useThemeColors'
import {
  ScCard,
  ScField,
  ScToggle,
  ScChip,
  ScButton,
  ScBadge,
  ScSection,
  ScNote,
  ScRow,
} from './primitives'

/** Mini month calendar with demo events; tap a day to see what's scheduled. */
export function CalendarShowcase() {
  const c = useThemeColors()
  const events: Record<number, { title: string; time: string; virtual?: boolean }[]> = {
    8: [{ title: 'Team Sync', time: '7:00 PM', virtual: true }],
    12: [{ title: 'Outreach @ Riverside', time: '9:00 AM' }],
    13: [{ title: 'Outreach @ Riverside', time: '9:00 AM' }],
    21: [{ title: 'Sunday Service', time: '10:00 AM' }],
    28: [{ title: 'Sunday Service', time: '10:00 AM' }],
  }
  const [sel, setSel] = useState(12)
  const days = Array.from({ length: 30 }, (_, i) => i + 1)
  return (
    <YStack gap="$2">
      <Text color={c.text} fontWeight="700" fontSize={15}>
        June 2026
      </Text>
      <XStack flexWrap="wrap">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <YStack key={i} width="14.28%" alignItems="center" paddingVertical="$1">
            <Text color={c.textMuted} fontSize={11} fontWeight="700">
              {d}
            </Text>
          </YStack>
        ))}
        {days.map((d) => {
          const evs = events[d]
          const isSel = d === sel
          return (
            <Pressable key={d} style={{ width: '14.28%' }} onPress={() => setSel(d)}>
              <YStack
                alignItems="center"
                paddingVertical="$1.5"
                borderRadius={8}
                backgroundColor={isSel ? c.primary + '22' : 'transparent'}
                borderWidth={d === 20 ? 2 : 0}
                borderColor={c.primary}
              >
                <Text color={c.text} fontSize={13}>
                  {d}
                </Text>
                <XStack gap={2} height={6} marginTop={2}>
                  {(evs ?? []).slice(0, 3).map((e, i) => (
                    <YStack
                      key={i}
                      width={5}
                      height={5}
                      borderRadius={3}
                      backgroundColor={e.virtual ? '#8e44ad' : c.primary}
                    />
                  ))}
                </XStack>
              </YStack>
            </Pressable>
          )
        })}
      </XStack>
      <XStack gap="$3" paddingTop="$1">
        <XStack alignItems="center" gap="$1.5">
          <YStack width={8} height={8} borderRadius={4} backgroundColor={c.primary} />
          <Text color={c.textMuted} fontSize={11}>
            In-person
          </Text>
        </XStack>
        <XStack alignItems="center" gap="$1.5">
          <YStack width={8} height={8} borderRadius={4} backgroundColor="#8e44ad" />
          <Text color={c.textMuted} fontSize={11}>
            Virtual
          </Text>
        </XStack>
      </XStack>
      <ScCard>
        <Text color={c.textMuted} fontSize={12} fontWeight="700">
          June {sel}
        </Text>
        {(events[sel] ?? []).length ? (
          events[sel].map((e, i) => (
            <XStack key={i} justifyContent="space-between">
              <Text color={c.text} fontSize={14} fontWeight="600">
                {e.virtual ? '💻 ' : '📍 '}
                {e.title}
              </Text>
              <Text color={c.textMuted} fontSize={13}>
                {e.time}
              </Text>
            </XStack>
          ))
        ) : (
          <ScNote>No events scheduled — tap another day.</ScNote>
        )}
      </ScCard>
    </YStack>
  )
}

/** Event creation form — flip the toggles to reveal each sub-feature. Nothing saves. */
export function EventFormShowcase() {
  const c = useThemeColors()
  const [pub, setPub] = useState(true)
  const [virtual, setVirtual] = useState(false)
  const [food, setFood] = useState(false)
  const [carpool, setCarpool] = useState(false)
  const [flights, setFlights] = useState(false)
  const [lodging, setLodging] = useState(false)
  const [saved, setSaved] = useState(false)
  return (
    <YStack gap="$2.5">
      <ScField label="Title" value="Summer Outreach — Riverside" />
      <XStack gap="$2">
        <YStack flex={1}>
          <ScField label="Date" value="07/12/26" />
        </YStack>
        <YStack flex={1}>
          <ScField label="Start time" value="9:00 AM" />
        </YStack>
      </XStack>
      {!virtual ? (
        <XStack gap="$2">
          <YStack flex={1}>
            <ScField label="City" value="Austin" />
          </YStack>
          <YStack flex={1}>
            <ScField label="State" value="TX" />
          </YStack>
        </XStack>
      ) : (
        <ScField label="Meeting link" value="https://zoom.us/j/demo" />
      )}

      <ScCard>
        <Text color={c.text} fontWeight="700" fontSize={13}>
          Options
        </Text>
        <ScToggle label="Public event" on={pub} onToggle={() => setPub((v) => !v)} />
        <ScToggle label="Virtual" on={virtual} onToggle={() => setVirtual((v) => !v)} />
        <ScToggle label="Provide food" on={food} onToggle={() => setFood((v) => !v)} />
        {food ? <ScNote>Add items people can sign up to bring.</ScNote> : null}
        <ScToggle label="Carpool" on={carpool} onToggle={() => setCarpool((v) => !v)} />
        {carpool ? <ScNote>Add cars, assign a driver and riders to each.</ScNote> : null}
        <ScToggle label="Flights" on={flights} onToggle={() => setFlights((v) => !v)} />
        {flights ? <ScNote>Record each person’s outbound &amp; return legs.</ScNote> : null}
        <ScToggle label="Lodging" on={lodging} onToggle={() => setLodging((v) => !v)} />
        {lodging ? <ScNote>Add hotels/rooms and assign who stays where.</ScNote> : null}
      </ScCard>

      <YStack gap="$1">
        <Text color={c.textMuted} fontSize={12} fontWeight="600">
          Assign people
        </Text>
        <XStack gap="$2" flexWrap="wrap">
          <ScChip label="Group: All" active />
          <ScChip label="Team: Setup" active />
          <ScChip label="+ Add member" />
        </XStack>
        <ScNote>Teams &amp; groups come from the Admin panel and Common Teams.</ScNote>
      </YStack>

      {saved ? (
        <YStack backgroundColor={c.primary + '22'} borderRadius={8} padding="$2.5">
          <Text color={c.primary} fontSize={13} fontWeight="700">
            ✓ Saved in the demo — nothing was actually created.
          </Text>
        </YStack>
      ) : null}
      <ScButton label="Save event" onPress={() => setSaved(true)} />
    </YStack>
  )
}

/** A fully filled-out event detail card. Sections expand; food &amp; availability are interactive. */
export function EventDetailShowcase() {
  const c = useThemeColors()
  const [open, setOpen] = useState<string | null>('food')
  const [signedUp, setSignedUp] = useState(false)
  const [rsvp, setRsvp] = useState<string | null>('yes')
  const toggle = (k: string) => setOpen((o) => (o === k ? null : k))
  const AV: Record<string, string> = {
    yes: '#27ae60',
    no: '#c0392b',
    partial: '#e67e22',
    tbd: '#7f8c8d',
  }
  return (
    <YStack gap="$2">
      <YStack>
        <Text color={c.text} fontWeight="800" fontSize={18}>
          Summer Outreach — Riverside
        </Text>
        <Text color={c.textMuted} fontSize={13}>
          Sat, Jul 12, 2026
        </Text>
      </YStack>

      <ScSection
        icon="🕘"
        label="Date & Time"
        open={open === 'time'}
        onToggle={() => toggle('time')}
      >
        <ScRow label="Starts" value="9:00 AM" />
        <ScRow label="Report (production)" value="7:30 AM" />
        <ScRow label="Report (mission)" value="8:15 AM" />
      </ScSection>

      <ScSection icon="⛅" label="Weather" open={open === 'wx'} onToggle={() => toggle('wx')}>
        <ScRow label="Forecast" value="Sunny · 95° / 74°" />
        <ScRow label="Rain" value="10%" />
        <ScNote>Pulled automatically from the location; alerts show a warning badge.</ScNote>
      </ScSection>

      <ScSection icon="📍" label="Location" open={open === 'loc'} onToggle={() => toggle('loc')}>
        <Text color={c.text} fontSize={13}>
          Riverside Park, 200 River Rd, Austin, TX
        </Text>
        <Text color={c.primary} fontSize={13} fontWeight="700">
          ↗ Get directions
        </Text>
      </ScSection>

      <ScSection
        icon="👕"
        label="Dress Code"
        open={open === 'dress'}
        onToggle={() => toggle('dress')}
      >
        <Text color={c.text} fontSize={13}>
          Setup team: comfortable closed-toe shoes, team shirt.
        </Text>
      </ScSection>

      <ScSection icon="🍔" label="Food" open={open === 'food'} onToggle={() => toggle('food')}>
        <XStack justifyContent="space-between" alignItems="center">
          <Text color={c.text} fontSize={13}>
            Waters (x3)
          </Text>
          <Text color={c.textMuted} fontSize={12}>
            Maria
          </Text>
        </XStack>
        <XStack justifyContent="space-between" alignItems="center">
          <Text color={c.text} fontSize={13}>
            Sandwiches
          </Text>
          {signedUp ? (
            <ScBadge label="You" color={c.primary} />
          ) : (
            <Text color={c.textMuted} fontSize={12}>
              open
            </Text>
          )}
        </XStack>
        <ScButton
          label={signedUp ? 'Cancel my signup' : 'Sign up to bring sandwiches'}
          kind={signedUp ? 'outline' : 'primary'}
          onPress={() => setSignedUp((v) => !v)}
        />
      </ScSection>

      <ScSection icon="🚗" label="Carpool" open={open === 'car'} onToggle={() => toggle('car')}>
        <ScRow label="Car 1 (driver)" value="James" />
        <ScRow label="Riders" value="You, Priya" />
        <ScNote>Admins assign drivers/riders; unassigned people get a warning.</ScNote>
      </ScSection>

      <ScSection icon="👥" label="Teams" open={open === 'teams'} onToggle={() => toggle('teams')}>
        <Text color={c.text} fontSize={13} fontWeight="700">
          Setup Team
        </Text>
        <Text color={c.textMuted} fontSize={12}>
          Leader: James · Members: You, Priya, Maria
        </Text>
      </ScSection>

      <ScSection icon="🏨" label="Lodging" open={open === 'lodge'} onToggle={() => toggle('lodge')}>
        <ScRow label="Hotel" value="Hampton Inn — Rm 214" />
        <ScRow label="With" value="Priya" />
      </ScSection>

      <ScSection icon="✈️" label="Flights" open={open === 'fly'} onToggle={() => toggle('fly')}>
        <ScRow label="Outbound" value="Jul 11 · AA1234 · 6:05 AM" />
        <ScRow label="Return" value="Jul 13 · AA2200 · 8:40 PM" />
      </ScSection>

      <ScSection
        icon="📌"
        label="Planning Board"
        open={open === 'plan'}
        onToggle={() => toggle('plan')}
      >
        <Text color={c.primary} fontSize={13} fontWeight="700">
          Open “Riverside Logistics” board ↗
        </Text>
      </ScSection>

      <ScCard>
        <Text color={c.text} fontWeight="700" fontSize={13}>
          Your availability
        </Text>
        <XStack gap="$2" flexWrap="wrap">
          {(['yes', 'no', 'partial', 'tbd'] as const).map((s) => (
            <ScChip
              key={s}
              label={s.toUpperCase()}
              active={rsvp === s}
              tint={AV[s]}
              onPress={() => setRsvp(s)}
            />
          ))}
        </XStack>
      </ScCard>

      <XStack gap="$2">
        <ScButton label="⬇ Export to calendar" kind="outline" flex />
        <ScButton label="✎ Edit (admin)" kind="outline" flex />
      </XStack>
    </YStack>
  )
}

/** Availability — member RSVP and the admin who's-available matrix. */
export function AvailabilityShowcase() {
  const c = useThemeColors()
  const [adminView, setAdminView] = useState(false)
  const AV: Record<string, string> = { Y: '#27ae60', N: '#c0392b', P: '#e67e22', '?': '#7f8c8d' }
  const people = [
    { name: 'James', cells: ['Y', 'Y', 'N'] },
    { name: 'Priya', cells: ['Y', 'P', 'Y'] },
    { name: 'Maria', cells: ['N', 'Y', '?'] },
  ]
  return (
    <YStack gap="$2.5">
      <XStack gap="$2">
        <ScChip label="Member view" active={!adminView} onPress={() => setAdminView(false)} />
        <ScChip label="Admin view" active={adminView} onPress={() => setAdminView(true)} />
      </XStack>
      {!adminView ? (
        <ScCard>
          <Text color={c.text} fontWeight="700" fontSize={13}>
            Are you available for Sunday Service?
          </Text>
          <XStack gap="$2" flexWrap="wrap">
            <ScChip label="YES" tint="#27ae60" active />
            <ScChip label="NO" tint="#c0392b" />
            <ScChip label="PARTIAL" tint="#e67e22" />
            <ScChip label="TBD" tint="#7f8c8d" />
          </XStack>
          <ScNote>
            Recurring events let you answer the whole series or just one date. Admins are notified.
          </ScNote>
        </ScCard>
      ) : (
        <ScCard>
          <Text color={c.text} fontWeight="700" fontSize={13}>
            Who’s available
          </Text>
          <XStack>
            <YStack flex={2} />
            {['Jun 21', 'Jun 28', 'Jul 5'].map((d) => (
              <YStack key={d} flex={1} alignItems="center">
                <Text color={c.textMuted} fontSize={10} fontWeight="700">
                  {d}
                </Text>
              </YStack>
            ))}
          </XStack>
          {people.map((p) => (
            <XStack key={p.name} alignItems="center">
              <Text color={c.text} fontSize={13} flex={2}>
                {p.name}
              </Text>
              {p.cells.map((cell, i) => (
                <YStack key={i} flex={1} alignItems="center">
                  <YStack
                    width={22}
                    height={22}
                    borderRadius={6}
                    backgroundColor={AV[cell] + '33'}
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Text color={AV[cell]} fontSize={11} fontWeight="800">
                      {cell}
                    </Text>
                  </YStack>
                </YStack>
              ))}
            </XStack>
          ))}
          <ScNote>The Admin → Availability screen shows this for every event and role.</ScNote>
        </ScCard>
      )}
    </YStack>
  )
}

/** A mini planning board canvas; tap a tool to drop an item. */
export function PlanningBoardShowcase() {
  const c = useThemeColors()
  const [items, setItems] = useState([
    { kind: 'Goal', text: 'Serve 200 meals', color: '#8e44ad' },
    { kind: 'Note', text: 'Pick up tables 8am', color: '#e67e22' },
    { kind: 'Checklist', text: '☑ Permits ☐ Tents', color: '#27ae60' },
  ])
  const tools = [
    { kind: 'Note', color: '#e67e22' },
    { kind: 'Goal', color: '#8e44ad' },
    { kind: 'Checklist', color: '#27ae60' },
  ]
  return (
    <YStack gap="$2">
      <XStack gap="$2">
        {tools.map((t) => (
          <ScChip
            key={t.kind}
            label={`+ ${t.kind}`}
            tint={t.color}
            onPress={() =>
              setItems((arr) => [
                ...arr,
                { kind: t.kind, text: `New ${t.kind.toLowerCase()}`, color: t.color },
              ])
            }
          />
        ))}
      </XStack>
      <YStack
        backgroundColor={c.background}
        borderColor={c.border}
        borderWidth={1}
        borderRadius={10}
        padding="$2"
        gap="$2"
        minHeight={140}
      >
        <XStack flexWrap="wrap" gap="$2">
          {items.map((it, i) => (
            <YStack
              key={i}
              backgroundColor={it.color + '22'}
              borderColor={it.color}
              borderWidth={1}
              borderRadius={8}
              padding="$2"
              maxWidth={150}
            >
              <Text color={it.color} fontSize={10} fontWeight="800">
                {it.kind.toUpperCase()}
              </Text>
              <Text color={c.text} fontSize={12}>
                {it.text}
              </Text>
            </YStack>
          ))}
        </XStack>
      </YStack>
      <ScNote>Boards link to an event so the whole team plans logistics together.</ScNote>
    </YStack>
  )
}
