import { useState } from 'react'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { ScCard, ScField, ScToggle, ScChip, ScButton, ScBadge, ScNote, ScRow } from './primitives'

/** Compose an announcement with an audience picker and a public toggle. */
export function AnnounceShowcase() {
  const c = useThemeColors()
  const [pub, setPub] = useState(false)
  const [aud, setAud] = useState('Everyone')
  const [sent, setSent] = useState(false)
  return (
    <YStack gap="$2.5">
      <ScField label="Title" value="Volunteers needed Saturday" />
      <ScField
        label="Message"
        value="We’re short two people for setup at Riverside. Reply if you can help!"
      />
      <YStack gap="$1">
        <Text color={c.textMuted} fontSize={12} fontWeight="600">
          Audience
        </Text>
        <XStack gap="$2" flexWrap="wrap">
          {['Everyone', 'Setup Team', 'Worship', 'Security'].map((a) => (
            <ScChip key={a} label={a} active={aud === a} onPress={() => setAud(a)} />
          ))}
        </XStack>
      </YStack>
      <ScToggle label="Also post publicly" on={pub} onToggle={() => setPub((v) => !v)} />
      {pub ? <ScNote>Public announcements appear on the public home page too.</ScNote> : null}
      {sent ? (
        <YStack backgroundColor={c.primary + '22'} borderRadius={8} padding="$2.5">
          <Text color={c.primary} fontSize={13} fontWeight="700">
            ✓ Sent to “{aud}” in the demo — nothing was actually posted.
          </Text>
        </YStack>
      ) : null}
      <ScButton label="Send announcement" onPress={() => setSent(true)} />
    </YStack>
  )
}

/** Security incident report + responder status flow. */
export function SecurityReportShowcase() {
  const c = useThemeColors()
  const [status, setStatus] = useState<'open' | 'responding' | 'resolved'>('open')
  const color = status === 'open' ? '#c0392b' : status === 'responding' ? '#e67e22' : '#27ae60'
  return (
    <YStack gap="$2.5">
      <ScCard>
        <XStack justifyContent="space-between" alignItems="center">
          <Text color={c.text} fontWeight="800" fontSize={15}>
            Lost child — main stage
          </Text>
          <ScBadge label={status.toUpperCase()} color={color} />
        </XStack>
        <ScRow label="Location" value="Main stage, west gate" />
        <ScRow label="Reported by" value="Maria" />
        <ScRow label="Witnesses" value="2 (tap to view)" />
        <Text color={c.textMuted} fontSize={12}>
          📷 1 photo attached
        </Text>
      </ScCard>
      {status === 'open' ? (
        <ScButton label="🚗 On my way" onPress={() => setStatus('responding')} />
      ) : status === 'responding' ? (
        <ScButton label="✓ Mark resolved" onPress={() => setStatus('resolved')} />
      ) : (
        <ScNote>
          Resolved reports move to the archive. New reports notify all security staff.
        </ScNote>
      )}
      <ScNote>Anyone can file a report from the “Report a Concern” button in the menu.</ScNote>
    </YStack>
  )
}

/** Inventory item with quantity controls and a reorder threshold. */
export function InventoryShowcase() {
  const c = useThemeColors()
  const [qty, setQty] = useState(6)
  const low = qty <= 5
  return (
    <YStack gap="$2.5">
      <ScCard>
        <XStack justifyContent="space-between" alignItems="center">
          <Text color={c.text} fontWeight="800" fontSize={15}>
            Team T-Shirt — Black (L)
          </Text>
          {low ? (
            <ScBadge label="REORDER" color="#c0392b" />
          ) : (
            <ScBadge label="OK" color="#27ae60" />
          )}
        </XStack>
        <ScRow label="Reorder at" value="5 units" />
        <XStack alignItems="center" justifyContent="space-between" paddingTop="$1">
          <Text color={c.textMuted} fontSize={13}>
            On hand
          </Text>
          <XStack alignItems="center" gap="$3">
            <ScChip label="–" onPress={() => setQty((q) => Math.max(0, q - 1))} />
            <Text color={c.text} fontSize={16} fontWeight="800">
              {qty}
            </Text>
            <ScChip label="+" onPress={() => setQty((q) => q + 1)} />
          </XStack>
        </XStack>
      </ScCard>
      <ScNote>Drop to 5 or below and the item jumps to the Reorder tab automatically.</ScNote>
    </YStack>
  )
}

/** Worship set list builder with a chord-sheet preview. */
export function SetlistShowcase() {
  const c = useThemeColors()
  const [songs, setSongs] = useState(['Great Are You Lord', 'Goodness of God', 'Build My Life'])
  const pool = ['King of Kings', 'Way Maker', 'Living Hope']
  const [open, setOpen] = useState<number | null>(0)
  return (
    <YStack gap="$2.5">
      <ScField label="Set list" value="Sunday Service — Jun 21" />
      <ScCard>
        <Text color={c.text} fontWeight="700" fontSize={13}>
          Songs (tap to preview chords)
        </Text>
        {songs.map((s, i) => (
          <YStack key={s} gap="$1">
            <XStack
              justifyContent="space-between"
              alignItems="center"
              onPress={() => setOpen((o) => (o === i ? null : i))}
              cursor="pointer"
            >
              <Text color={c.text} fontSize={14}>
                {i + 1}. {s}
              </Text>
              <Text color={c.textMuted} fontSize={12}>
                {open === i ? '▾' : '▸'}
              </Text>
            </XStack>
            {open === i ? (
              <YStack
                backgroundColor={c.background}
                borderColor={c.border}
                borderWidth={1}
                borderRadius={8}
                padding="$2"
              >
                <Text color={c.primary} fontSize={13} fontFamily="monospace">
                  Verse: G D Em C
                </Text>
                <Text color={c.primary} fontSize={13} fontFamily="monospace">
                  Chorus: C G D Em
                </Text>
                <ScNote>Chord sheets transpose to any key and have a Chords-Only mode.</ScNote>
              </YStack>
            ) : null}
          </YStack>
        ))}
      </ScCard>
      <YStack gap="$1">
        <Text color={c.textMuted} fontSize={12} fontWeight="600">
          Add a song
        </Text>
        <XStack gap="$2" flexWrap="wrap">
          {pool
            .filter((p) => !songs.includes(p))
            .map((p) => (
              <ScChip key={p} label={`+ ${p}`} onPress={() => setSongs((arr) => [...arr, p])} />
            ))}
        </XStack>
      </YStack>
      <ScNote>Linking a set list to an event notifies the worship team automatically.</ScNote>
    </YStack>
  )
}

/** Kaizen / operations Kanban — tap a card to advance it across columns. */
export function KanbanShowcase() {
  const c = useThemeColors()
  const cols = ['Idea', 'In Progress', 'Implementing', 'Done']
  const [stage, setStage] = useState(1)
  return (
    <YStack gap="$2.5">
      <XStack gap="$2">
        {cols.map((col, i) => (
          <YStack
            key={col}
            flex={1}
            backgroundColor={c.background}
            borderColor={i === stage ? c.primary : c.border}
            borderWidth={1}
            borderRadius={8}
            padding="$1.5"
            minHeight={110}
            gap="$1.5"
          >
            <Text color={c.textMuted} fontSize={10} fontWeight="800" textAlign="center">
              {col.toUpperCase()}
            </Text>
            {i === stage ? (
              <YStack
                backgroundColor={c.surface}
                borderColor={c.primary}
                borderWidth={1}
                borderRadius={6}
                padding="$1.5"
                onPress={() => setStage((s) => Math.min(cols.length - 1, s + 1))}
                cursor="pointer"
              >
                <Text color={c.text} fontSize={11} fontWeight="700">
                  Faster check-in
                </Text>
                <Text color={c.textMuted} fontSize={10}>
                  ▲ 4 upvotes
                </Text>
              </YStack>
            ) : null}
          </YStack>
        ))}
      </XStack>
      <ScNote>
        Tap the card to move it forward. Issues become root-cause analyses, corrective actions, and
        Kaizen improvements — admins verify the result.
      </ScNote>
    </YStack>
  )
}

/** Messaging room mock. */
export function MessagesShowcase() {
  const c = useThemeColors()
  const msgs = [
    { me: false, who: 'James', text: 'Setup crew, doors at 8am sharp.' },
    { me: false, who: 'Priya', text: 'On it 👍' },
    { me: true, who: 'You', text: 'Bringing the extra tables.' },
  ]
  return (
    <YStack gap="$2">
      <ScCard>
        <Text color={c.text} fontWeight="700" fontSize={13}>
          # Setup Crew
        </Text>
        {msgs.map((m, i) => (
          <XStack key={i} justifyContent={m.me ? 'flex-end' : 'flex-start'}>
            <YStack
              maxWidth="80%"
              backgroundColor={m.me ? c.primary : c.background}
              borderColor={c.border}
              borderWidth={m.me ? 0 : 1}
              borderRadius={12}
              paddingHorizontal="$3"
              paddingVertical="$2"
            >
              {!m.me ? (
                <Text color={c.textMuted} fontSize={10} fontWeight="700">
                  {m.who}
                </Text>
              ) : null}
              <Text color={m.me ? c.onPrimary : c.text} fontSize={13}>
                {m.text}
              </Text>
            </YStack>
          </XStack>
        ))}
      </ScCard>
      <ScNote>Admins can create rooms, add members, and review flagged conversations.</ScNote>
    </YStack>
  )
}

/** Assignment / task list mock with statuses. */
export function TasksShowcase() {
  const c = useThemeColors()
  const [done, setDone] = useState<Record<number, boolean>>({})
  const tasks = [
    { t: 'Confirm sound check', due: 'Overdue', color: '#c0392b' },
    { t: 'Print name tags', due: 'Due today', color: '#e67e22' },
    { t: 'Email volunteers', due: 'This week', color: '#27ae60' },
  ]
  return (
    <YStack gap="$2">
      {tasks.map((task, i) => (
        <ScCard key={i}>
          <XStack alignItems="center" justifyContent="space-between">
            <XStack alignItems="center" gap="$2.5" flex={1}>
              <YStack
                width={22}
                height={22}
                borderRadius={6}
                borderWidth={2}
                borderColor={done[i] ? c.primary : c.border}
                backgroundColor={done[i] ? c.primary : 'transparent'}
                alignItems="center"
                justifyContent="center"
                onPress={() => setDone((d) => ({ ...d, [i]: !d[i] }))}
                cursor="pointer"
              >
                {done[i] ? (
                  <Text color={c.onPrimary} fontSize={13} fontWeight="900">
                    ✓
                  </Text>
                ) : null}
              </YStack>
              <Text
                color={done[i] ? c.textMuted : c.text}
                fontSize={14}
                textDecorationLine={done[i] ? 'line-through' : 'none'}
              >
                {task.t}
              </Text>
            </XStack>
            {!done[i] ? <ScBadge label={task.due} color={task.color} /> : null}
          </XStack>
        </ScCard>
      ))}
      <ScNote>Tasks are generated from event templates and tracked here per person.</ScNote>
    </YStack>
  )
}
