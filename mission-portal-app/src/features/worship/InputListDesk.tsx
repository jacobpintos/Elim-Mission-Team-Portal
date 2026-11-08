import { useState } from 'react'
import { Platform, Pressable, View } from 'react-native'
import { Text, XStack, YStack } from 'tamagui'
import { useAuthStore } from '@/stores/authStore'
import { useConfigStore } from '@/stores/configStore'
import { useInputListStore, type InputListLocation } from '@/stores/inputListStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { confirmAsync } from '@/lib/confirm'
import { doesJob } from '@/lib/teamJobs'
import { canReachDesk } from '@/lib/mixer/link'
import { deskInfo, type DeskLink } from '@/lib/mixer/x32'
import {
  namesDiffering,
  readStripNames,
  rowsPastTheDesk,
  rowsWithDeskNames,
  sendNamesToDesk,
  stripsOf,
  type ListRow,
  type NameDifference,
} from '@/lib/mixer/inputListDesk'
import { deskAccess } from '@/features/miriam/equipmentAccess'

const ACCESS_SAID = {
  'not engineer': 'Only Sound Engineers can work the sound desk.',
  'no app': 'The sound desk can be reached only from the phone app.',
  'no address': 'Set the sound desk’s address in Settings → Sound desk first.',
} as const

const LOCATION_SAID: Record<InputListLocation, string> = {
  sunday: 'Sunday',
  event: 'Event',
  wh2: 'WH2',
}

/**
 * The input list beside the sound desk (lib/mixer/inputListDesk), for Sound
 * Engineers in the phone app: the rows line up with the board, so the list
 * is compared with the desk's names, and either side can be made to match
 * the other. Above the list in Worship → Input List.
 */
export function InputListDesk({ loc, rows }: { loc: InputListLocation; rows: ListRow[] }) {
  const colors = useThemeColors()
  const uid = String(useAuthStore((s) => s.profile?.uid) ?? '')
  const engineers = useConfigStore((s) => s.soundEngineers)
  const { setRow, saveLocation } = useInputListStore()
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState('')
  const [compared, setCompared] = useState<{
    loc: InputListLocation
    link: DeskLink
    desk: string
    differences: NameDifference[]
  } | null>(null)

  if (Platform.OS === 'web' || !canReachDesk() || !doesJob('soundEngineers', uid, engineers)) {
    return null
  }
  // A comparison is of one list: switching lists starts again.
  const shown = compared?.loc === loc ? compared : null

  const compare = async () => {
    setBusy(true)
    setCompared(null)
    setSaid('Reading the desk…')
    const access = await deskAccess(uid)
    if (access.kind !== 'ready') {
      setBusy(false)
      setSaid(ACCESS_SAID[access.kind])
      return
    }
    const info = await deskInfo(access.link)
    const names = info
      ? await readStripNames(
          access.link,
          stripsOf(rows, access.link.model).map((s) => s.strip.address)
        )
      : null
    setBusy(false)
    if (!info || !names) {
      setSaid('The sound desk didn’t answer. Is this phone on its Wi-Fi?')
      return
    }
    const differences = namesDiffering(rows, names, access.link.model)
    const desk = `${info.model || 'the desk'}${info.name ? ` “${info.name}”` : ''}`
    setCompared({ loc, link: access.link, desk, differences })
    const past = rowsPastTheDesk(rows, access.link.model)
    setSaid(
      (differences.length
        ? `${differences.length} ${differences.length === 1 ? 'name differs' : 'names differ'} from ${desk}.`
        : `The ${LOCATION_SAID[loc]} list matches ${desk}.`) +
        (past.length
          ? ` ${past.length} ${past.length === 1 ? 'row has' : 'rows have'} no strip on the desk to name: ${past
              .map((p) => `${p.side} ${p.row}`)
              .join(', ')}.`
          : '')
    )
  }

  const toDesk = async () => {
    if (!shown) return
    const sending = shown.differences.filter((d) => d.list)
    const sure = await confirmAsync(
      `${sending.length} of the desk’s strips get the ${LOCATION_SAID[loc]} list’s names. Rows the list leaves empty stay as the desk has them. Nothing else on the desk changes.`,
      { title: 'Send the names to the desk?', confirmLabel: 'Send them' }
    )
    if (!sure) return
    setBusy(true)
    const { sent, failed } = await sendNamesToDesk(shown.link, sending)
    setBusy(false)
    setCompared(null)
    setSaid(
      failed.length
        ? `${sent.length} sent. The desk didn’t take ${failed.map((f) => f.strip.label).join(', ')}: compare again to see.`
        : `${sent.length} ${sent.length === 1 ? 'name is' : 'names are'} on the desk now.`
    )
  }

  const toList = async () => {
    if (!shown) return
    const sure = await confirmAsync(
      `${shown.differences.length} rows of the ${LOCATION_SAID[loc]} list get the names on the desk.`,
      { title: 'Use the desk’s names?', confirmLabel: 'Use them' }
    )
    if (!sure) return
    const next = rowsWithDeskNames(rows, shown.differences)
    for (const d of shown.differences) setRow(loc, d.row - 1, d.side, next[d.row - 1][d.side])
    try {
      await saveLocation(loc)
      setSaid(`The ${LOCATION_SAID[loc]} list has the desk’s names now.`)
    } catch {
      setSaid('The list didn’t save. Try again.')
    }
    setCompared(null)
  }

  const button = (label: string, onPress: () => void, filled = false) => (
    <Pressable onPress={onPress} disabled={busy}>
      <View
        style={{
          minHeight: 36,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 6,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: colors.primary,
          backgroundColor: filled ? colors.primary : 'transparent',
          opacity: busy ? 0.5 : 1,
        }}
      >
        <Text color={filled ? 'white' : colors.primary} fontWeight="700" fontSize="$3">
          {label}
        </Text>
      </View>
    </Pressable>
  )

  const sendable = shown?.differences.filter((d) => d.list).length ?? 0

  return (
    <YStack paddingHorizontal="$3" paddingVertical="$2" gap="$2">
      <XStack gap="$2" flexWrap="wrap" alignItems="center">
        {button(busy ? 'Working…' : 'Compare with the sound desk', () => void compare())}
      </XStack>
      {said ? (
        <Text color={colors.textMuted} fontSize="$2">
          {said}
        </Text>
      ) : null}
      {shown && shown.differences.length ? (
        <YStack gap="$1">
          {shown.differences.map((d) => (
            <Text key={`${d.side}${d.row}`} color={colors.text} fontSize="$2">
              {d.strip.label} ({d.side} {d.row}): list “{d.list || '—'}”, desk “{d.desk || '—'}”
            </Text>
          ))}
          <XStack gap="$2" flexWrap="wrap" marginTop="$1">
            {sendable
              ? button(
                  `Send ${sendable} ${sendable === 1 ? 'name' : 'names'} to the desk`,
                  () => void toDesk(),
                  true
                )
              : null}
            {button('Use the desk’s names here', () => void toList())}
          </XStack>
        </YStack>
      ) : null}
    </YStack>
  )
}
