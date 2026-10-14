import { useEffect, useState } from 'react'
import { Pressable } from 'react-native'
import { YStack, XStack, Text, Spinner } from 'tamagui'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'

/**
 * Admin → Analytics: the questions Miriam is asked most, over a span of days,
 * by what kind of account asked (src/lib/miriamAsked) — grouped by what they
 * mean (functions/src/miriam/own/asked), so the same question asked in other
 * words counts once. The words only: never who asked.
 */

type Audience = 'public' | 'member' | 'guest' | 'all'

interface Asked {
  days: number
  audience: Audience
  total: number
  groups: { text: string; count: number; also: string[] }[]
  /** More were asked than were read: these are the latest. */
  more: boolean
}

const SPANS: [number, string][] = [
  [7, '7 days'],
  [30, '30 days'],
  [90, '90 days'],
  [365, '12 months'],
]
const WHO: [Audience, string][] = [
  ['public', 'Public accounts'],
  ['member', 'Members'],
  ['guest', 'Guests'],
  ['all', 'Everyone'],
]

type Api = (data: Record<string, unknown>) => Promise<unknown>

const callServer: Api = (data) =>
  httpsCallable<Record<string, unknown>, unknown>(functions, 'miriamOwnAdmin', {
    // Questions not looked at before have their meaning worked out first.
    timeout: 540_000,
  })(data).then((r) => r.data)

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

export function MostAsked({ call = callServer }: { call?: Api }) {
  const [days, setDays] = useState(30)
  const [audience, setAudience] = useState<Audience>('public')
  const [data, setData] = useState<Asked | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    call({ action: 'asked', days, audience })
      .then((r) => {
        if (!live) return
        setData(r as Asked)
        setFailed(null)
      })
      .catch(() => live && setFailed(`${days}:${audience}`))
    return () => {
      live = false
    }
  }, [call, days, audience])

  // What is shown is for the span and accounts picked — else, still coming.
  const shown = data && data.days === days && data.audience === audience ? data : null
  const broke = failed === `${days}:${audience}`
  const spanSaid = SPANS.find(([d]) => d === days)?.[1] ?? `${days} days`

  return (
    <YStack
      backgroundColor="$background"
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$3"
      padding="$4"
      gap="$3"
    >
      <YStack gap="$1">
        <Text fontSize="$5" fontWeight="700">
          What people ask Miriam
        </Text>
        <Text fontSize="$2" color="$gray10">
          The questions asked most, with the same question in other words counted together. Only the
          words are kept — never who asked.
        </Text>
      </YStack>

      <XStack gap="$2" flexWrap="wrap">
        {SPANS.map(([d, label]) => (
          <Chip key={d} label={label} on={days === d} onPress={() => setDays(d)} />
        ))}
      </XStack>
      <XStack gap="$2" flexWrap="wrap">
        {WHO.map(([who, label]) => (
          <Chip key={who} label={label} on={audience === who} onPress={() => setAudience(who)} />
        ))}
      </XStack>

      {broke ? (
        <Text fontSize="$3" color="$red10">
          Couldn’t load them just now. Try again in a moment.
        </Text>
      ) : !shown ? (
        <XStack paddingVertical="$4" justifyContent="center">
          <Spinner />
        </XStack>
      ) : shown.groups.length === 0 ? (
        <YStack gap="$2">
          <Text fontSize="$3" color="$gray10">
            {audience === 'public'
              ? `No questions from public accounts in the last ${spanSaid}.`
              : `No questions in the last ${spanSaid}.`}
          </Text>
          {audience === 'public' ? (
            <Text fontSize="$2" color="$gray10">
              Public accounts can ask Miriam questions now, on the web app and the newest phone app.{' '}
              <Text fontSize="$2" color="$blue10" onPress={() => setAudience('all')}>
                See everyone’s
              </Text>
            </Text>
          ) : null}
        </YStack>
      ) : (
        <YStack gap="$2">
          <Text fontSize="$2" color="$gray10">
            {shown.total} {shown.total === 1 ? 'question' : 'questions'} in the last {spanSaid}
            {shown.more ? ' (the latest of them)' : ''}.
          </Text>
          {shown.groups.map((g, i) => (
            <XStack
              key={`${i}-${g.text}`}
              gap="$3"
              paddingVertical="$2"
              borderTopWidth={i === 0 ? 0 : 1}
              borderTopColor="$borderColor"
              alignItems="flex-start"
            >
              <Text fontSize="$3" fontWeight="700" color="$gray10" width={24} textAlign="right">
                {i + 1}
              </Text>
              <YStack flex={1} gap="$0.5">
                <Text fontSize="$3" fontWeight="600">
                  {g.text}
                </Text>
                {g.also.length ? (
                  <Text fontSize="$2" color="$gray10">
                    Also asked as {g.also.map((a) => `“${a}”`).join(', ')}
                  </Text>
                ) : null}
              </YStack>
              <Text fontSize="$3" fontWeight="700">
                {g.count}×
              </Text>
            </XStack>
          ))}
        </YStack>
      )}
    </YStack>
  )
}
