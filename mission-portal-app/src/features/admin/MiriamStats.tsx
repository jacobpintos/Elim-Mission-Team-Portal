import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, View } from 'react-native'
import { Spinner, Text, XStack, YStack } from 'tamagui'
import { FOOD_READY_AT, type Beside, type Summary } from '../../../functions/src/miriam/stats'

/**
 * Admin → Miriam: how she is doing over a span of days (functions/src/
 * miriam/stats) — where requests were handled, and how they went: on the
 * phone, by her own model, or by Claude; the changes she offered, confirmed
 * or cancelled; how her readings compare with Claude's; and her food
 * sign-ups beside Claude's, until she is switched on for them. Only what
 * happened is counted: never what was said, or who said it.
 */

type Api = (data: Record<string, unknown>) => Promise<unknown>

/** Her skills, and her other answers, as an admin would name them. */
export const SKILL_NAMES: Record<string, string> = {
  event_time: 'When an event is',
  event_place: 'Where an event is',
  event_dress: 'Dress code',
  event_schedule: 'An event’s schedule',
  event_team: 'Their team',
  event_car: 'Their car',
  event_lodging: 'Their room',
  event_flight: 'Their flight',
  event_weather: 'An event’s weather',
  my_events: 'What they have on',
  availability: 'Answering availability',
  reminder: 'A reminder',
  food_signup: 'Signing up to bring food',
  web: 'The web',
  faith: 'Faith (the church’s own answers)',
  taught: 'Answers you taught her',
  names: 'Where Elim and Miriam come from',
  leaders: 'Who leads the church',
  maps: 'Her offer of maps, answered',
  event_page: 'From the event’s own page',
  her_own: 'Something else she answered',
  public: 'Public accounts',
  other: 'Not hers — Claude’s',
}

const SPANS: [number, string][] = [
  [7, '7 days'],
  [30, '30 days'],
  [90, '90 days'],
]

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : '–')

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }}>
      <XStack
        paddingHorizontal="$3"
        paddingVertical="$1.5"
        borderRadius="$10"
        borderWidth={1}
        borderColor={on ? '$blue10' : '$borderColor'}
        backgroundColor={on ? '$blue10' : 'transparent'}
      >
        <Text fontSize="$2" fontWeight="600" color={on ? 'white' : '$color'}>
          {label}
        </Text>
      </XStack>
    </Pressable>
  )
}

/** One headline number: what it is, how many, and its share. */
function Tile({ label, value, share }: { label: string; value: number; share?: string }) {
  return (
    <YStack
      flexGrow={1}
      // Two to a row on a phone, four on a wider screen.
      flexBasis={150}
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$3"
      padding="$3"
      gap="$1"
    >
      <Text fontSize="$2" color="$gray10">
        {label}
      </Text>
      <XStack alignItems="baseline" gap="$2">
        <Text fontSize="$7" fontWeight="600">
          {value.toLocaleString()}
        </Text>
        {share ? (
          <Text fontSize="$3" color="$gray11">
            {share}
          </Text>
        ) : null}
      </XStack>
    </YStack>
  )
}

/** A line of what was counted, with its number at the end. */
function Row({ label, n, note }: { label: string; n: number | string; note?: string }) {
  return (
    <XStack gap="$3" paddingVertical="$1" alignItems="flex-start">
      <YStack flex={1}>
        <Text fontSize="$3">{label}</Text>
        {note ? (
          <Text fontSize="$2" color="$gray10">
            {note}
          </Text>
        ) : null}
      </YStack>
      <Text fontSize="$3" fontWeight="600" style={{ fontVariant: ['tabular-nums'] }}>
        {n}
      </Text>
    </XStack>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <YStack gap="$1" borderTopWidth={1} borderTopColor="$borderColor" paddingTop="$3">
      <Text fontSize="$4" fontWeight="700">
        {title}
      </Text>
      {children}
    </YStack>
  )
}

/**
 * How near her food sign-ups are to being switched on: agreeing with Claude
 * FOOD_READY_AT times, and never not. The fill is a stronger step of its
 * track's own colour; red once she has disagreed, which holds her back.
 */
function ReadyMeter({ offered }: { offered: Beside }) {
  const against = offered.different + offered.otherwise
  const done = Math.min(offered.same, FOOD_READY_AT)
  return (
    <YStack gap="$1.5">
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Food sign-ups agreeing with Claude"
        accessibilityValue={{ min: 0, max: FOOD_READY_AT, now: done }}
      >
        <XStack height={8} borderRadius={4} backgroundColor={against ? '$red4' : '$blue4'}>
          {done > 0 ? (
            <XStack
              height={8}
              borderRadius={4}
              width={`${(done / FOOD_READY_AT) * 100}%`}
              backgroundColor={against ? '$red9' : '$blue9'}
            />
          ) : null}
        </XStack>
      </View>
      <Text fontSize="$2" color="$gray11">
        {offered.same} of {FOOD_READY_AT} sign-ups the same as Claude’s
        {against ? ` · ${against} not` : ''}
      </Text>
    </YStack>
  )
}

function FoodSection({ food }: { food: Summary['food'] }) {
  const { offered, dishOnly } = food
  const against = offered.different + offered.otherwise
  return (
    <Section
      title={`Signing up to bring food (not switched on yet)${food.allTime ? ' — since counting began' : ''}`}
    >
      <Text fontSize="$2" color="$gray10">
        When someone offers to bring food in words the phone doesn’t know, she works out the sign-up
        herself and it is kept beside what Claude does with it — Claude still answers. Once she
        agrees with Claude {FOOD_READY_AT} times, and never doesn’t, she can be switched on to
        answer them herself.
      </Text>
      {food.worked === 0 ? (
        <Text fontSize="$3" color="$gray10">
          None yet.
        </Text>
      ) : (
        <>
          <ReadyMeter offered={offered} />
          <Text fontSize="$3" fontWeight="600" color={food.ready ? '$green10' : '$color'}>
            {food.ready
              ? 'Ready to switch on.'
              : against
                ? 'Not ready: she has disagreed with Claude. Each one is worth a look.'
                : `Not ready yet: ${FOOD_READY_AT - offered.same} more to go.`}
          </Text>
          <Row label="The same event and item as Claude" n={offered.same} />
          <Row label="A different event or item" n={offered.different} />
          <Row label="Claude asked them something first" n={offered.askedBack} />
          <Row
            label="Claude did something else"
            n={offered.otherwise}
            note="Answered, or made another change: not a sign-up after all."
          />
          {dishOnly.same + dishOnly.different + dishOnly.askedBack + dishOnly.otherwise > 0 ? (
            <Row
              label="Told only by the dish (“I’ll bring chips”)"
              n={`${dishOnly.same} of ${dishOnly.same + dishOnly.different + dishOnly.askedBack + dishOnly.otherwise}`}
              note="The only event whose sheet has that dish. Kept apart: she doesn’t offer these, even once switched on. This is how often she would have been right."
            />
          ) : null}
        </>
      )}
    </Section>
  )
}

export function MiriamStats({ call }: { call: Api }) {
  const [days, setDays] = useState(30)
  const [data, setData] = useState<Summary | null>(null)
  const [failed, setFailed] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    call({ action: 'stats', days })
      .then((r) => {
        if (!live) return
        setData(r as Summary)
        setFailed(null)
      })
      .catch(() => live && setFailed(days))
    return () => {
      live = false
    }
  }, [call, days])

  const shown = data && data.days === days ? data : null
  const spanSaid = SPANS.find(([d]) => d === days)?.[1] ?? `${days} days`

  return (
    <YStack
      backgroundColor="$background"
      borderRadius="$3"
      padding="$3"
      borderWidth={1}
      borderColor="$borderColor"
      gap="$3"
    >
      <YStack gap="$1">
        <Text fontSize="$5" fontWeight="700">
          How she’s doing
        </Text>
        <Text fontSize="$2" color="$gray10">
          Where each request was handled, and how it went. Only what happened is counted — never
          what was said, or who said it.
        </Text>
      </YStack>
      <XStack gap="$2" flexWrap="wrap">
        {SPANS.map(([d, label]) => (
          <Chip key={d} label={label} on={days === d} onPress={() => setDays(d)} />
        ))}
      </XStack>

      {failed === days ? (
        <Text fontSize="$3" color="$red10">
          Couldn’t load this just now. Try again in a moment.
        </Text>
      ) : !shown ? (
        <XStack paddingVertical="$4" justifyContent="center">
          <Spinner />
        </XStack>
      ) : shown.turns.total === 0 ? (
        <Text fontSize="$3" color="$gray10">
          Nothing counted in the last {spanSaid}. Counting starts once this version of the app and
          the server are in use.
        </Text>
      ) : (
        <Body s={shown} spanSaid={spanSaid} />
      )}
    </YStack>
  )
}

function Body({ s, spanSaid }: { s: Summary; spanSaid: string }) {
  const { turns, outcomes, cards, labels } = s
  const own = turns.own + turns.public
  const reached = turns.own + turns.public + turns.claude
  const shown = cards.confirmed + cards.cancelled
  const read = labels.agreed + labels.differed
  return (
    <YStack gap="$3">
      <XStack gap="$2" flexWrap="wrap">
        <Tile label="Requests" value={turns.total} />
        <Tile label="On the phone" value={turns.phone} share={pct(turns.phone, turns.total)} />
        <Tile label="Her own model" value={own} share={pct(own, turns.total)} />
        <Tile label="Claude" value={turns.claude} share={pct(turns.claude, turns.total)} />
      </XStack>
      <Text fontSize="$2" color="$gray10">
        In the last {spanSaid}
        {s.capped ? ', the latest of them' : ''}. On the phone: worked out by the app itself, with
        nothing sent. Her own model: answered on the server without Claude. Every request Claude
        answers costs a little and takes a few seconds — the fewer, the better.
      </Text>

      <Section title="Requests that reached the server">
        <Row label="Answered" n={outcomes.answered} />
        <Row label="Asked them something back" n={outcomes.askedBack} />
        <Row label="Offered a change to confirm" n={outcomes.change} />
        <Row
          label="Couldn’t do it"
          n={outcomes.couldnt}
          note={`${reached ? `${pct(outcomes.couldnt, reached)} of what reached the server: ` : ''}refused, or not understood. When Claude says something can’t be done in the app yet, it counts as answered.`}
        />
        {outcomes.error ? <Row label="Went wrong" n={outcomes.error} /> : null}
        {turns.none ? (
          <Row
            label="Turned away before anything was done"
            n={turns.none}
            note="Too many at once, or too long — counted in Requests, not on the phone, by her or by Claude."
          />
        ) : null}
        {outcomes.limited ? (
          <Row label="Too many at once (asked to wait)" n={outcomes.limited} />
        ) : null}
      </Section>

      <Section title="Changes she offered">
        {shown === 0 ? (
          <Text fontSize="$3" color="$gray10">
            None confirmed or cancelled.
          </Text>
        ) : (
          <>
            <Row label="Confirmed" n={cards.confirmed} />
            <Row
              label="Cancelled"
              n={cards.cancelled}
              note={`${pct(cards.cancelled, shown)} cancelled — often a sign she took a request the wrong way.`}
            />
          </>
        )}
      </Section>

      {s.ownBy.length ? (
        <Section title="What her own model answered">
          {s.ownBy.slice(0, 8).map((o) => (
            <Row key={o.skill} label={SKILL_NAMES[o.skill] ?? o.skill} n={o.n} />
          ))}
        </Section>
      ) : null}

      <Section title="Her reading, beside Claude’s">
        {read === 0 ? (
          <Text fontSize="$3" color="$gray10">
            Nothing handed to Claude to compare.
          </Text>
        ) : (
          <>
            <Text fontSize="$2" color="$gray10">
              Of the requests she handed to Claude, how often she had read them as Claude did. Where
              she didn’t, Claude’s reading is what she learns from.
            </Text>
            <Row label="Read as Claude did" n={`${labels.agreed} of ${read}`} />
            {labels.differences.map((d) => (
              <Row
                key={`${d.read}-${d.label}`}
                label={`Read as ${SKILL_NAMES[d.read] ?? d.read}`}
                note={`Claude: ${d.label === 'other' ? 'something only Claude does' : (SKILL_NAMES[d.label] ?? d.label)}`}
                n={d.n}
              />
            ))}
          </>
        )}
      </Section>

      <FoodSection food={s.food} />
    </YStack>
  )
}
