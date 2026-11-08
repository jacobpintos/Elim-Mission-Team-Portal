import { useEffect, useState } from 'react'
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { useAuthStore } from '@/stores/authStore'
import { WithDictation } from '@/components/ui/Dictation'
import { deskHere } from '@/features/miriam/equipmentAccess'
import { findDesks } from '@/lib/mixer/find'
import { saveDeskAddress } from '@/lib/mixer/deskAddress'
import { canLookAround, phoneNetwork, udpExchange } from '@/lib/localNetwork'
import { networkSaid } from '@/lib/netScan'
import { readDeskNames, type DeskLink, type DeskNames } from '@/lib/mixer/x32'
import type { DeskChange } from '@/lib/mixer/desk'
import { aimInEar, inEarAsked, inEarChange, type InEarAsk, type Pack } from '@/lib/mixer/inEars'
import { loadPack, savePack } from '@/lib/mixer/packStore'

const EXAMPLES = '“more vocals”, “less bass”, “mute the click”, “more me”, “my mix louder”'

interface Reached {
  reach: 'ready' | 'no app' | 'no address' | 'quiet'
  link: DeskLink | null
  names: DeskNames | null
}

/** The desk from this phone, and its names: its buses are the packs. */
async function reachDesk(): Promise<Reached> {
  const here = await deskHere()
  if (here.kind !== 'ready') return { reach: here.kind, link: null, names: null }
  const names = await readDeskNames(here.link)
  return { reach: names ? 'ready' : 'quiet', link: here.link, names }
}

/**
 * Worship → In-ear Adjustment (lib/mixer/inEars): the worship team and guests
 * change their own in-ears. They pick the pack they have on, which is a mix
 * bus on the desk, then say or type what they need; it changes that bus only.
 * Turning up or unmuting is asked first; every change has Undo.
 */
export function InEarTab() {
  const colors = useThemeColors()
  const me = (useAuthStore((s) => s.profile?.displayName) ?? '').trim().split(/\s+/)[0] ?? ''
  const [link, setLink] = useState<DeskLink | null>(null)
  const [reach, setReach] = useState<'checking' | 'ready' | 'no app' | 'no address' | 'quiet'>(
    'checking'
  )
  const [names, setNames] = useState<DeskNames | null>(null)
  const [pack, setPack] = useState<Pack | null>(null)
  const [choosing, setChoosing] = useState(false)
  const [said, setSaid] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [pending, setPending] = useState<DeskChange | null>(null)
  const [which, setWhich] = useState<{
    ask: InEarAsk
    said: string
    options: { n: number; name: string }[]
  } | null>(null)
  const [undo, setUndo] = useState<(() => Promise<string>) | null>(null)

  const reached = (r: Reached) => {
    setLink(r.link)
    setNames(r.names)
    setReach(r.reach)
  }
  const connect = async () => {
    setReach('checking')
    reached(await reachDesk())
  }

  useEffect(() => {
    reachDesk().then(reached)
    loadPack().then((p) => {
      setPack(p)
      setChoosing(!p)
    })
  }, [])

  const find = async () => {
    const net = phoneNetwork()
    if (!net) {
      setNote('This phone isn’t on Wi-Fi. Join the sound desk’s Wi-Fi first.')
      return
    }
    setBusy(true)
    setNote(`Looking on ${networkSaid(net.address)}…`)
    const found = await findDesks(udpExchange, net)
    setBusy(false)
    if (!found.length) {
      setNote('No sound desk answered. Is this phone on the desk’s Wi-Fi?')
      return
    }
    await saveDeskAddress(found[0].host)
    setNote('')
    await connect()
  }

  const choose = async (bus: number, name: string) => {
    const p = { bus, name: name || `Bus ${bus}` }
    await savePack(p)
    setPack(p)
    setChoosing(false)
    setNote('')
    setUndo(null)
  }

  const made = async (change: DeskChange) => {
    setBusy(true)
    const text = await change.make()
    setBusy(false)
    setPending(null)
    if (text === null) {
      setNote('The desk didn’t take that. Try again.')
      return
    }
    setNote(text)
    setUndo(() => change.undo)
  }

  const work = async (ask: InEarAsk, channels: { n: number; name: string }[]) => {
    if (!link || !pack) return
    setBusy(true)
    const worked = await inEarChange(link, pack, ask, channels)
    setBusy(false)
    if (worked.kind === 'unreachable') {
      setNote('I can’t reach the sound desk. Is this phone on its Wi-Fi?')
      return
    }
    if (worked.kind === 'said') {
      setNote(worked.text)
      return
    }
    if (worked.change.askFirst) {
      setPending(worked.change)
      setNote('')
      return
    }
    await made(worked.change)
  }

  const send = async () => {
    const text = said.trim()
    if (!text || !link || !pack || !names) return
    setPending(null)
    setWhich(null)
    setUndo(null)
    const ask = inEarAsked(text)
    if (!ask) {
      setNote(`I didn’t catch that. Try ${EXAMPLES}.`)
      return
    }
    if (ask.kind === 'elsewhere') {
      setNote('Only your in-ears change here. Ask a Sound Engineer about the house or the stream.')
      return
    }
    setSaid('')
    if (ask.kind === 'mix') return work(ask, [])
    // The names as they are now: a scene may have changed them.
    const fresh = (await readDeskNames(link)) ?? names
    setNames(fresh)
    const aimed = aimInEar(ask.ask.channel, fresh, me)
    if (aimed.kind === 'none') {
      setNote(`There’s no “${aimed.said}” on the desk.`)
      return
    }
    if (aimed.kind === 'which') {
      setWhich({ ask, said: aimed.said, options: aimed.options })
      setNote(`Which ${aimed.said}?`)
      return
    }
    await work(ask, aimed.channels)
  }

  const button = (label: string, onPress: () => void, filled = false, disabled = busy) => (
    <Pressable key={label} onPress={onPress} disabled={disabled}>
      <View
        style={{
          minHeight: 40,
          borderRadius: 8,
          paddingHorizontal: 14,
          paddingVertical: 8,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: colors.primary,
          backgroundColor: filled ? colors.primary : 'transparent',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text color={filled ? 'white' : colors.primary} fontWeight="700">
          {label}
        </Text>
      </View>
    </Pressable>
  )

  if (Platform.OS === 'web') {
    return (
      <YStack padding="$4">
        <Text color={colors.textMuted}>
          In-ears can be changed only from the phone app, on the sound desk’s Wi-Fi.
        </Text>
      </YStack>
    )
  }

  return (
    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
      <YStack padding="$4" gap="$4">
        <Text color={colors.textMuted} fontSize="$2">
          Change your own in-ears: choose the pack you have on, then say what you need. Only your
          mix changes.
        </Text>

        {reach === 'checking' ? <Text color={colors.textMuted}>Reaching the desk…</Text> : null}
        {reach === 'no app' ? (
          <Text color={colors.textMuted}>Update the app to change your in-ears.</Text>
        ) : null}
        {reach === 'no address' || reach === 'quiet' ? (
          <YStack gap="$2">
            <Text color={colors.textMuted}>
              {reach === 'quiet'
                ? 'The sound desk didn’t answer. Is this phone on its Wi-Fi?'
                : 'Join the sound desk’s Wi-Fi, then find the desk.'}
            </Text>
            <XStack gap="$2" flexWrap="wrap">
              {canLookAround() ? button('Find the desk on this Wi-Fi', () => void find()) : null}
              {reach === 'quiet' ? button('Try again', () => void connect()) : null}
            </XStack>
          </YStack>
        ) : null}

        {reach === 'ready' && names ? (
          <>
            {choosing || !pack ? (
              <YStack gap="$2">
                <Text fontWeight="700" color={colors.text}>
                  Which pack do you have?
                </Text>
                <XStack gap="$2" flexWrap="wrap">
                  {names.buses.map((name, i) =>
                    name ? button(name, () => void choose(i + 1, name), pack?.bus === i + 1) : null
                  )}
                </XStack>
                {names.buses.every((n) => !n) ? (
                  <Text color={colors.textMuted} fontSize="$2">
                    The desk’s in-ear mixes have no names yet. Ask a Sound Engineer to name them.
                  </Text>
                ) : null}
              </YStack>
            ) : (
              <XStack alignItems="center" justifyContent="space-between" gap="$2">
                <Text color={colors.text}>
                  Your pack: <Text fontWeight="700">{pack.name}</Text>
                </Text>
                {button('Change', () => setChoosing(true), false, false)}
              </XStack>
            )}

            {pack && !choosing ? (
              <YStack gap="$3">
                <WithDictation value={said} onChangeText={setSaid} onDevice>
                  <TextInput
                    value={said}
                    onChangeText={setSaid}
                    onSubmitEditing={() => void send()}
                    returnKeyType="send"
                    placeholder="What do you need? “more vocals”"
                    placeholderTextColor={colors.textMuted}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: colors.text,
                      backgroundColor: colors.surface,
                    }}
                  />
                </WithDictation>
                <XStack gap="$2" flexWrap="wrap">
                  {button('Change it', () => void send(), true, busy || !said.trim())}
                  {button(
                    'My mix louder',
                    () =>
                      void work({ kind: 'mix', up: true, by: { unit: 'step', size: 'little' } }, [])
                  )}
                  {button(
                    'My mix quieter',
                    () =>
                      void work(
                        { kind: 'mix', up: false, by: { unit: 'step', size: 'little' } },
                        []
                      )
                  )}
                </XStack>
                <Text color={colors.textMuted} fontSize="$2">
                  Say or type things like {EXAMPLES}.
                </Text>

                {note ? <Text color={colors.text}>{note}</Text> : null}

                {which ? (
                  <XStack gap="$2" flexWrap="wrap">
                    {which.options.map((o) =>
                      button(o.name || `Channel ${o.n}`, () => {
                        setWhich(null)
                        void work(which.ask, [o])
                      })
                    )}
                    {button('All of them', () => {
                      setWhich(null)
                      void work(which.ask, which.options)
                    })}
                  </XStack>
                ) : null}

                {pending ? (
                  <YStack gap="$2">
                    <Text color={colors.text} fontWeight="600">
                      {pending.question}
                    </Text>
                    <XStack gap="$2">
                      {button('Yes', () => void made(pending), true)}
                      {button('No', () => {
                        setPending(null)
                        setNote('Okay — left as it is.')
                      })}
                    </XStack>
                  </YStack>
                ) : null}

                {undo && !pending
                  ? button('Undo', async () => {
                      setBusy(true)
                      const text = await undo()
                      setBusy(false)
                      setUndo(null)
                      setNote(text)
                    })
                  : null}
              </YStack>
            ) : null}
          </>
        ) : null}
      </YStack>
    </ScrollView>
  )
}
