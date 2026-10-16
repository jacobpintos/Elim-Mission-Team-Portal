import { useState } from 'react'
import { YStack, XStack, Text, Button } from 'tamagui'
import { confirmAsync } from '@/lib/confirm'
import { SKILL_NAMES } from './MiriamStats'

/**
 * Admin → Miriam: what she is learning from the requests Claude answered for
 * her (functions/src/miriam/own/learn). A lesson waits until Claude has read
 * the same request the same way twice, ten minutes or more apart, or an
 * admin approves it; only then does she answer by it. Here an admin sees
 * what waits, what she uses, and what was taken back — and approves, keeps
 * or forgets any of them.
 */

interface Lesson {
  /** Absent from an older server: the words stand in. */
  key?: string
  text: string
  skill: string
  at: number
}
export interface InUseLesson extends Lesson {
  last?: number
  flagged?: boolean
  approved?: boolean
}
export interface WaitingLesson extends Lesson {
  last: number
  y: number
  why: 'new' | 'unchecked' | 'corrected' | 'room'
}
export interface RetiredLesson extends Lesson {
  gone: number
  why: string
}
export interface Lessons {
  learned: InUseLesson[]
  learnedCount: number
  /** Absent from an older server, which uses all it learns. */
  waiting?: WaitingLesson[]
  waitingCount?: number
  retired?: RetiredLesson[]
  room?: { used: number; max: number }
}

/** Shown at first, of each list: the rest a tap away. */
const SHOWN = 20

const skillName = (s: string) => SKILL_NAMES[s] ?? s
const day = (at: number) => new Date(at).toLocaleDateString()

const WAITING_WHY: Record<WaitingLesson['why'], (l: WaitingLesson) => string> = {
  new: (l) => `Claude has read this once · ${day(l.last)}`,
  unchecked: () => 'Learned before checking began',
  corrected: () => 'Taken back: someone said an answer from it wasn’t what they meant',
  room: () => 'Let go to make room — back in use when it’s asked again',
}

export function MiriamLessons({
  data,
  busy,
  run,
}: {
  data: Lessons
  busy: boolean
  run: (data: Record<string, unknown>, done: string) => Promise<boolean>
}) {
  const which = (l: Lesson) =>
    l.key ? { key: l.key, skill: l.skill } : { text: l.text, skill: l.skill }
  const approve = (l: Lesson) =>
    run({ action: 'approve', ...which(l) }, 'Approved. She uses it from now on.')
  const forget = async (l: Lesson) => {
    if (
      await confirmAsync(`Forget “${l.text}”? She won’t use it, or learn it this way again.`, {
        title: 'Forget it',
        confirmLabel: 'Forget',
        destructive: true,
      })
    ) {
      await run({ action: 'forget', ...which(l) }, 'Forgotten.')
    }
  }
  const remove = async (l: Lesson) => {
    if (
      await confirmAsync(`Take “${l.text}” off this list? She may learn it again.`, {
        title: 'Take it off',
        confirmLabel: 'Take off',
        destructive: true,
      })
    ) {
      await run({ action: 'forget', ...which(l) }, 'Taken off.')
    }
  }

  // An older server: all it learns is in use, to forget.
  if (!data.waiting) {
    return (
      <Group title={`What she’s learned (${data.learnedCount})`} items={data.learned}>
        {(l) => (
          <Row
            key={`${l.text}-${l.at}`}
            text={l.text}
            note={`${skillName(l.skill)} · ${day(l.at)}`}
          >
            <Button size="$2" onPress={() => forget(l)} disabled={busy}>
              Forget
            </Button>
          </Row>
        )}
      </Group>
    )
  }

  const room = data.room
  return (
    <YStack gap="$3">
      <Text fontSize="$2" color="$gray10">
        Requests Claude answered for her, kept as she read them (event names as “the event”, never
        who asked). She uses one only once Claude has read the same request the same way twice, at
        least ten minutes apart, or you approve it. If Claude later reads it another way, or someone
        says an answer from it wasn’t what they meant, it’s taken back.
      </Text>

      <Group title={`Waiting (${data.waitingCount ?? data.waiting.length})`} items={data.waiting}>
        {(l) => (
          <Row
            key={`${l.key ?? l.text}-w`}
            text={l.text}
            note={`${skillName(l.skill)} · ${WAITING_WHY[l.why]?.(l) ?? day(l.last)}`}
          >
            <Button size="$2" onPress={() => approve(l)} disabled={busy}>
              Approve
            </Button>
            <Button size="$2" onPress={() => forget(l)} disabled={busy}>
              Forget
            </Button>
          </Row>
        )}
      </Group>

      <Group
        title={`In use (${data.learnedCount}${room ? ` of ${room.max.toLocaleString()}` : ''})`}
        items={data.learned}
        empty="Nothing yet — a lesson is used once Claude has read it the same way twice."
      >
        {(l) => (
          <Row
            key={`${l.key ?? l.text}-u`}
            text={l.text}
            note={[
              skillName(l.skill),
              l.approved ? 'Approved' : null,
              l.flagged
                ? l.approved
                  ? 'Someone said an answer from it wasn’t what they meant, or Claude read it another way — kept because you approved it'
                  : 'Someone said an answer from it wasn’t what they meant'
                : null,
              day(l.last ?? l.at),
            ]
              .filter(Boolean)
              .join(' · ')}
            flagged={l.flagged}
          >
            {!l.approved || l.flagged ? (
              <Button size="$2" onPress={() => approve(l)} disabled={busy}>
                {l.flagged ? 'Keep' : 'Approve'}
              </Button>
            ) : null}
            <Button size="$2" onPress={() => forget(l)} disabled={busy}>
              Forget
            </Button>
          </Row>
        )}
      </Group>

      <Group title={`Taken back (${data.retired?.length ?? 0})`} items={data.retired ?? []}>
        {(l) => (
          <Row
            key={`${l.key ?? l.text}-r`}
            text={l.text}
            note={`${skillName(l.skill)} · ${
              l.why === 'admin'
                ? 'You said it was wrong — she won’t learn it this way again'
                : l.why.startsWith('claude:')
                  ? `Claude read the same request as ${skillName(l.why.slice('claude:'.length))}`
                  : 'Taken back'
            } · ${day(l.gone)}`}
          >
            <Button size="$2" onPress={() => approve(l)} disabled={busy}>
              Approve
            </Button>
            <Button size="$2" onPress={() => remove(l)} disabled={busy}>
              Take off
            </Button>
          </Row>
        )}
      </Group>
    </YStack>
  )
}

/** A list, its first few shown and the rest a tap away. */
function Group<T>({
  title,
  items,
  empty = 'None.',
  children,
}: {
  title: string
  items: T[]
  empty?: string
  children: (item: T) => React.ReactNode
}) {
  const [all, setAll] = useState(false)
  return (
    <YStack gap="$2">
      <Text fontSize="$4" fontWeight="700">
        {title}
      </Text>
      {items.length === 0 ? (
        <Text fontSize="$3" color="$gray10">
          {empty}
        </Text>
      ) : (
        (all ? items : items.slice(0, SHOWN)).map(children)
      )}
      {items.length > SHOWN ? (
        <Button size="$2" chromeless alignSelf="flex-start" onPress={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${items.length}`}
        </Button>
      ) : null}
    </YStack>
  )
}

function Row({
  text,
  note,
  flagged,
  children,
}: {
  text: string
  note: string
  flagged?: boolean
  children: React.ReactNode
}) {
  return (
    <XStack
      borderTopWidth={1}
      borderTopColor="$borderColor"
      paddingTop="$2"
      gap="$2"
      alignItems="center"
      flexWrap="wrap"
    >
      <YStack flex={1} minWidth={180} gap="$0.5">
        <Text fontSize="$3">“{text}”</Text>
        <Text fontSize="$2" color={flagged ? '$red10' : '$gray10'}>
          {note}
        </Text>
      </YStack>
      <XStack gap="$2">{children}</XStack>
    </XStack>
  )
}
