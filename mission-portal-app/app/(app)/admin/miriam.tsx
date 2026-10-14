import { useCallback, useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { YStack, XStack, Text, Button, Spinner, Input, TextArea } from 'tamagui'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase'
import { useUIStore } from '@/stores/uiStore'
import { confirmAsync } from '@/lib/confirm'
import { ScreenTitle } from '@/components/ui/ScreenTitle'

/**
 * Admin → Miriam: what she knows that is the church's own. Answers taught
 * to her (said as written when someone asks the same thing), what she has
 * learned from the requests Claude answered for her (each one hers to answer
 * from then on — to forget if it was learned wrong), and her web search.
 * All of it kept on the server (functions/src/miriam/ownAdmin).
 */

interface Learned {
  text: string
  skill: string
  at: number
}
interface Taught {
  id: string
  q: string
  a: string
  at: number
}
interface Listing {
  learned: Learned[]
  learnedCount: number
  taught: Taught[]
  web: { brave: boolean; setAt: number | null }
  /** The church's website, as she last read it, for questions of faith. */
  site?: { url: string; readAt: number | null; pages: number; passages: number }
}

/** Her skills, as an admin reads them. */
const SKILL_NAMES: Record<string, string> = {
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
  web: 'The web',
  faith: 'Faith (the church’s own answers)',
  other: 'Not hers — Claude’s',
}

type Api = (data: Record<string, unknown>) => Promise<unknown>

const callServer: Api = (data) =>
  httpsCallable<Record<string, unknown>, unknown>(functions, 'miriamOwnAdmin', {
    // Reading the church's website takes a minute or two.
    timeout: 540_000,
  })(data).then((r) => r.data)

const card = {
  backgroundColor: '$background',
  borderRadius: '$3',
  padding: '$3',
  borderWidth: 1,
  borderColor: '$borderColor',
  gap: '$2',
} as const

export default function AdminMiriam() {
  return <MiriamAdmin call={callServer} />
}

/** The page, given the server to ask: the real one, or one with sample answers to look at it. */
export function MiriamAdmin({ call }: { call: Api }) {
  const { toast } = useUIStore()
  const [data, setData] = useState<Listing | null>(null)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    () =>
      call({ action: 'list' })
        .then((listing) => setData(listing as Listing))
        .catch((err: unknown) =>
          toast(err instanceof Error ? err.message : 'Couldn’t load what Miriam knows', 'error')
        ),
    [call, toast]
  )

  useEffect(() => {
    void load()
  }, [load])

  const run = async (data: Record<string, unknown>, done: string) => {
    setBusy(true)
    try {
      await call(data)
      toast(done, 'success')
      await load()
      return true
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That didn’t work', 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  const teach = async () => {
    if (!question.trim() || !answer.trim()) return
    if (await run({ action: 'teach', question, answer }, 'Taught. She’ll answer it from now on.')) {
      setQuestion('')
      setAnswer('')
    }
  }

  const untaught = async (t: Taught) => {
    if (
      await confirmAsync(`Take away her answer to “${t.q}”?`, {
        title: 'Take it away',
        confirmLabel: 'Take away',
        destructive: true,
      })
    ) {
      await run({ action: 'untaught', id: t.id }, 'Taken away.')
    }
  }

  const forget = async (l: Learned) => {
    if (
      await confirmAsync(`Forget “${l.text}”?`, {
        title: 'Forget it',
        confirmLabel: 'Forget',
        destructive: true,
      })
    ) {
      await run({ action: 'forget', text: l.text }, 'Forgotten.')
    }
  }

  const readSite = async () => {
    await run({ action: 'readSite' }, 'Read. She answers from what it says now.')
  }

  const saveKey = async (clear = false) => {
    if (
      await run(
        { action: 'setWebKey', key: clear ? '' : key },
        clear ? 'Web search key removed.' : 'Web search key saved.'
      )
    ) {
      setKey('')
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <ScreenTitle options={{ title: 'Miriam', headerShown: false }} />
      <Text fontSize="$6" fontWeight="700">
        Miriam
      </Text>
      <Text fontSize="$3" color="$gray11">
        Miriam answers what she understands herself, with her own language model, and hands the rest
        to Claude. She learns from every request Claude answers for her, and from the answers you
        teach her here.
      </Text>

      {!data ? (
        <YStack padding="$6" alignItems="center">
          <Spinner size="large" />
        </YStack>
      ) : (
        <>
          <YStack {...card}>
            <Text fontSize="$5" fontWeight="700">
              Answers you’ve taught her ({data.taught.length})
            </Text>
            <Text fontSize="$2" color="$gray10">
              When someone asks something that means the same as one of these questions, however
              they word it, she says your answer just as you wrote it — what the church believes,
              where to park, what to bring. Your answers come before anything else she knows.
            </Text>
            <Input
              placeholder="A question people ask — “What do we believe about baptism?”"
              value={question}
              onChangeText={setQuestion}
              size="$3"
            />
            <TextArea
              placeholder="Her answer, as she should say it"
              value={answer}
              onChangeText={setAnswer}
              numberOfLines={4}
              size="$3"
            />
            <XStack>
              <Button
                size="$3"
                theme="active"
                onPress={teach}
                disabled={busy || !question.trim() || !answer.trim()}
              >
                Teach her
              </Button>
            </XStack>
            {data.taught.map((t) => (
              <YStack
                key={t.id}
                borderTopWidth={1}
                borderTopColor="$borderColor"
                paddingTop="$2"
                gap="$1"
              >
                <Text fontSize="$3" fontWeight="600">
                  {t.q}
                </Text>
                <Text fontSize="$3" color="$gray11">
                  {t.a}
                </Text>
                {t.a.length === 1200 ? (
                  // Taught when answers were cut at 1,200 characters.
                  <Text fontSize="$2" color="$orange10">
                    This answer was cut short when it was taught. Take it away and teach it again to
                    keep all of it.
                  </Text>
                ) : null}
                <XStack>
                  <Button size="$2" theme="red" onPress={() => untaught(t)} disabled={busy}>
                    Take away
                  </Button>
                </XStack>
              </YStack>
            ))}
          </YStack>

          <YStack {...card}>
            <Text fontSize="$5" fontWeight="700">
              Questions of faith
            </Text>
            <Text fontSize="$2" color="$gray10">
              She answers a question of faith only from an answer you’ve taught her, or from what
              thewellofiowa.com says on any of its pages — in its words, with a link to the page.
              Nothing else: not the web, not Claude. The one thing built in is where the names Elim
              and Miriam come from, as the church gave them; teach her your own answer to either to
              replace it. If none of these says enough to answer confidently, she asks them to reach
              out to church leadership, and anything more asked about it goes there too.
            </Text>
            <Text fontSize="$3" fontWeight="600">
              {data.site?.readAt
                ? `thewellofiowa.com, read ${new Date(data.site.readAt).toLocaleString()}: ${data.site.pages} pages, ${data.site.passages} passages`
                : 'thewellofiowa.com: not read yet — she reads it every night'}
            </Text>
            <XStack>
              <Button size="$3" onPress={readSite} disabled={busy}>
                {busy ? <Spinner size="small" /> : 'Read it now'}
              </Button>
            </XStack>
          </YStack>

          <YStack {...card}>
            <Text fontSize="$5" fontWeight="700">
              Web search
            </Text>
            <Text fontSize="$2" color="$gray10">
              {data.web.brave
                ? 'She searches the whole web with Brave, reads the pages it finds, and says where her answer came from.'
                : 'She looks things up on Wikipedia, and the weather anywhere. For the whole web — store hours, news — add a Brave Search key: brave.com/search/api gives about 1,000 searches a month free (a card is needed).'}
            </Text>
            <Text fontSize="$3" fontWeight="600">
              {data.web.brave ? 'Brave key: set' : 'Brave key: not set'}
            </Text>
            <Input
              placeholder={data.web.brave ? 'A new key, to replace it' : 'Brave Search API key'}
              value={key}
              onChangeText={setKey}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              size="$3"
            />
            <XStack gap="$2">
              <Button
                size="$3"
                theme="active"
                onPress={() => saveKey()}
                disabled={busy || !key.trim()}
              >
                Save key
              </Button>
              {data.web.brave ? (
                <Button size="$3" theme="red" onPress={() => saveKey(true)} disabled={busy}>
                  Remove key
                </Button>
              ) : null}
            </XStack>
            <Text fontSize="$1" color="$gray10">
              Kept on the server, never shown again. Takes effect within a few minutes.
            </Text>
          </YStack>

          <YStack {...card}>
            <Text fontSize="$5" fontWeight="700">
              What she’s learned ({data.learnedCount})
            </Text>
            <Text fontSize="$2" color="$gray10">
              Requests Claude answered for her, kept as she read them (event names as “the event”,
              never who asked) — each one hers to answer herself from then on. Forget any that were
              learned wrong.
            </Text>
            {data.learned.length === 0 ? (
              <Text fontSize="$3" color="$gray10">
                Nothing yet — she learns as people use her.
              </Text>
            ) : (
              data.learned.map((l) => (
                <XStack
                  key={`${l.text}-${l.at}`}
                  borderTopWidth={1}
                  borderTopColor="$borderColor"
                  paddingTop="$2"
                  gap="$2"
                  alignItems="center"
                >
                  <YStack flex={1} gap="$0.5">
                    <Text fontSize="$3">“{l.text}”</Text>
                    <Text fontSize="$2" color="$gray10">
                      {SKILL_NAMES[l.skill] ?? l.skill} · {new Date(l.at).toLocaleDateString()}
                    </Text>
                  </YStack>
                  <Button size="$2" onPress={() => forget(l)} disabled={busy}>
                    Forget
                  </Button>
                </XStack>
              ))
            )}
          </YStack>
        </>
      )}
    </ScrollView>
  )
}
