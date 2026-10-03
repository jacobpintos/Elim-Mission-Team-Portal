import { useEffect, useRef, useState } from 'react'
import {
  View,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { FullScreenOverlay } from '@/components/ui/FullScreenOverlay'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { EventPickerModal } from './EventPickerModal'
import { useChordSheetsStore } from '@/stores/chordSheetsStore'
import { useUIStore } from '@/stores/uiStore'
import { useMusicStore, type MusicItem } from '@/stores/musicStore'
import { NNS_KEYS, keyLabel } from '@/lib/nashvilleNumbers'
import { matchContentByTitle, contentItemForUrl, uniqueTitleMatch } from '@/lib/contentMatch'
import { ContentPickerModal } from './ContentPickerModal'
import { pickAndUploadSetListAudio, deleteSetListAudio } from '@/lib/setListAudioUpload'
import type { SetList, SetListSong } from '@/types/worship'
import type { ChordSheet } from '@/types/chordSheet'
import type { EventInstance } from '@/types/events'
import { WithDictation } from '@/components/ui/Dictation'

function makeSong(): SetListSong {
  return {
    id: String(Date.now() + Math.random()),
    name: '',
    key: '',
    link: '',
    notes: '',
    chordSheetId: null,
  }
}

interface SetListFormModalProps {
  visible: boolean
  onClose: () => void
  onSave: (data: Omit<SetList, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>
  createdBy: string | number
  /** The set list being changed, or null to build a new one. */
  editSetList?: SetList | null
  /** Events the set list may be linked to, for showing the one it already has. */
  eventFor?: (setList: SetList) => EventInstance | null
}

interface ChordSheetPickerProps {
  chordSheets: ChordSheet[]
  selectedId: string | number | null | undefined
  onSelect: (id: string | number | null) => void
  colors: ReturnType<typeof useThemeColors>
}

function ChordSheetPicker({ chordSheets, selectedId, onSelect, colors }: ChordSheetPickerProps) {
  const [open, setOpen] = useState(false)
  const selected = chordSheets.find((c) => String(c.id) === String(selectedId))
  return (
    <YStack gap="$1">
      <Text color={colors.textMuted} fontSize={11} fontWeight="600">
        CHORD SHEET
      </Text>
      <Pressable onPress={() => setOpen((v) => !v)}>
        <XStack
          backgroundColor={colors.surface}
          borderRadius="$2"
          borderWidth={1}
          borderColor={colors.border}
          paddingHorizontal="$3"
          paddingVertical="$2"
          alignItems="center"
          justifyContent="space-between"
        >
          <Text
            color={selected ? colors.primary : colors.textMuted}
            fontSize={13}
            numberOfLines={1}
            flex={1}
          >
            {selected
              ? `${selected.title}${selected.artist ? ` — ${selected.artist}` : ''}`
              : 'None'}
          </Text>
          <Text color={colors.textMuted} fontSize={11}>
            {open ? '▲' : '▼'}
          </Text>
        </XStack>
      </Pressable>
      {open ? (
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$2"
          borderWidth={1}
          borderColor={colors.border}
          maxHeight={160}
          overflow="hidden"
        >
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
            <Pressable
              onPress={() => {
                onSelect(null)
                setOpen(false)
              }}
            >
              <XStack
                paddingHorizontal="$3"
                paddingVertical="$2"
                backgroundColor={selectedId == null ? colors.primary + '22' : 'transparent'}
              >
                <Text color={selectedId == null ? colors.primary : colors.textMuted} fontSize={13}>
                  None
                </Text>
              </XStack>
            </Pressable>
            {chordSheets.map((cs) => (
              <Pressable
                key={String(cs.id)}
                onPress={() => {
                  onSelect(cs.id)
                  setOpen(false)
                }}
              >
                <XStack
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  backgroundColor={
                    String(selectedId) === String(cs.id) ? colors.primary + '22' : 'transparent'
                  }
                >
                  <Text
                    color={String(selectedId) === String(cs.id) ? colors.primary : colors.text}
                    fontSize={13}
                    numberOfLines={1}
                  >
                    {cs.title}
                    {cs.artist ? ` — ${cs.artist}` : ''}
                  </Text>
                </XStack>
              </Pressable>
            ))}
          </ScrollView>
        </YStack>
      ) : null}
    </YStack>
  )
}

interface SongNameComboBoxProps {
  value: string
  chordSheets: ChordSheet[]
  onChangeName: (name: string) => void
  onSelectSheet: (id: string | number | null) => void
  colors: ReturnType<typeof useThemeColors>
  inputStyle: object | object[]
}

function SongNameComboBox({
  value,
  chordSheets,
  onChangeName,
  onSelectSheet,
  colors,
  inputStyle,
}: SongNameComboBoxProps) {
  const [focused, setFocused] = useState(false)

  const suggestions =
    value.trim().length > 0
      ? chordSheets.filter((cs) => cs.title.toLowerCase().includes(value.toLowerCase())).slice(0, 6)
      : []

  const showDropdown = focused && suggestions.length > 0

  const handleChangeText = (v: string) => {
    onChangeName(v)
    if (!v.trim()) {
      onSelectSheet(null)
      return
    }
    const lower = v.toLowerCase()
    const exact = chordSheets.filter((cs) => cs.title.toLowerCase() === lower)
    if (exact.length === 1) onSelectSheet(exact[0].id)
    else if (exact.length === 0) onSelectSheet(null)
    // Multiple exact matches: leave existing selection
  }

  return (
    <YStack>
      <TextInput
        style={inputStyle as object}
        value={value}
        onChangeText={handleChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 200)}
        placeholder="Song name"
        placeholderTextColor={colors.textMuted}
      />
      {showDropdown ? (
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$2"
          borderWidth={1}
          borderColor={colors.border}
          maxHeight={180}
          overflow="hidden"
        >
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {suggestions.map((cs) => (
              <Pressable
                key={String(cs.id)}
                onPress={() => {
                  onChangeName(cs.title)
                  onSelectSheet(cs.id)
                  setFocused(false)
                }}
              >
                <XStack paddingHorizontal="$3" paddingVertical="$2" backgroundColor="transparent">
                  <Text color={colors.text} fontSize={13} numberOfLines={1}>
                    {cs.title}
                    {cs.artist ? ` — ${cs.artist}` : ''}
                  </Text>
                </XStack>
              </Pressable>
            ))}
          </ScrollView>
        </YStack>
      ) : null}
    </YStack>
  )
}

/**
 * Pick the key a song is being played in.
 *
 * A text box took anything — "Bb", "bb", "B flat", "G maj", a stray space —
 * and the key is not decoration: ChordSheetViewer transposes the sheet into
 * it, and it only recognises the twelve names in NNS_KEYS. Everything else was
 * accepted here, shown on the card, and then silently ignored when the sheet
 * opened. A list of the twelve is the whole fix.
 */
function KeyPicker({
  value,
  onChange,
  colors,
}: {
  value: string
  onChange: (key: string) => void
  colors: ReturnType<typeof useThemeColors>
}) {
  const [open, setOpen] = useState(false)
  return (
    <YStack gap="$1">
      <Text color={colors.textMuted} fontSize={11} fontWeight="600">
        KEY
      </Text>
      <Pressable onPress={() => setOpen((v) => !v)}>
        <XStack
          backgroundColor={colors.surface}
          borderRadius="$2"
          borderWidth={1}
          borderColor={colors.border}
          paddingHorizontal="$3"
          paddingVertical="$2"
          alignItems="center"
          justifyContent="space-between"
        >
          <Text color={value ? colors.primary : colors.textMuted} fontSize={13}>
            {value ? keyLabel(value) : 'No key'}
          </Text>
          <Text color={colors.textMuted} fontSize={11}>
            {open ? '▲' : '▼'}
          </Text>
        </XStack>
      </Pressable>
      {open ? (
        <XStack flexWrap="wrap" gap="$1" paddingTop="$1">
          {['', ...NNS_KEYS].map((key) => {
            const selected = key === value
            return (
              <Pressable
                key={key || 'none'}
                onPress={() => {
                  onChange(key)
                  setOpen(false)
                }}
              >
                <XStack
                  backgroundColor={selected ? colors.primary : colors.surface}
                  borderWidth={1}
                  borderColor={selected ? colors.primary : colors.border}
                  borderRadius={99}
                  paddingHorizontal="$3"
                  paddingVertical="$1"
                  minWidth={44}
                  justifyContent="center"
                >
                  <Text color={selected ? 'white' : colors.text} fontSize={13}>
                    {key ? keyLabel(key) : 'None'}
                  </Text>
                </XStack>
              </Pressable>
            )
          })}
        </XStack>
      ) : null}
    </YStack>
  )
}

/**
 * The video a song points at, chosen from Content or typed in.
 *
 * Content is where the recordings already live, so picking from it is the
 * short path and the one that guarantees the link is the arrangement the team
 * has been given. The text box stays for everything Content does not hold —
 * a Spotify link, somebody's Drive file.
 */
function SongLinkField({
  song,
  onChange,
  onPickContent,
  colors,
  inputStyle,
}: {
  song: SetListSong
  onChange: (patch: Partial<SetListSong>) => void
  onPickContent: (item: MusicItem) => void
  colors: ReturnType<typeof useThemeColors>
  inputStyle: object
}) {
  const [picking, setPicking] = useState(false)
  const items = useMusicStore((s) => s.items)
  const fromContent = contentItemForUrl(song.link, items)

  return (
    <>
      <YStack gap="$1">
        <XStack gap="$2" alignItems="center">
          <TextInput
            style={[inputStyle, { flex: 1 }]}
            value={song.link}
            onChangeText={(v) => onChange({ link: v })}
            placeholder="Link (YouTube, Spotify, etc.)"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
          />
          <Pressable onPress={() => setPicking(true)}>
            <XStack
              borderRadius="$2"
              borderWidth={1}
              borderColor={colors.primary}
              paddingHorizontal="$3"
              paddingVertical="$2"
            >
              <Text color={colors.primary} fontSize={13}>
                Content
              </Text>
            </XStack>
          </Pressable>
        </XStack>
        {fromContent ? (
          <Text color={colors.textMuted} fontSize={11} numberOfLines={1}>
            ♪ {fromContent.title}
            {fromContent.album ? ` — ${fromContent.album}` : ''}
          </Text>
        ) : null}
      </YStack>

      <ContentPickerModal
        visible={picking}
        onClose={() => setPicking(false)}
        onSelect={(item) => {
          onPickContent(item)
          setPicking(false)
        }}
      />
    </>
  )
}

/**
 * Attach a reference track to one song.
 *
 * The file goes to Storage as soon as it is picked rather than waiting for the
 * set list to be saved: a picked file lives in a cache directory the OS is
 * free to empty, so holding on to the path and uploading later is a race the
 * app loses silently. The cost is that abandoning the form leaves an object
 * behind, which is why closing without saving deletes what this uploaded.
 */
function SongAudioField({
  song,
  onChange,
  onUploaded,
  onDropped,
  colors,
}: {
  song: SetListSong
  onChange: (patch: Partial<SetListSong>) => void
  /** A file now exists in Storage that only this form knows about. */
  onUploaded: (path: string) => void
  /** A file the set list used to point at, to delete once the save lands. */
  onDropped: (path: string | undefined) => void
  colors: ReturnType<typeof useThemeColors>
}) {
  const [busy, setBusy] = useState(false)
  const [percent, setPercent] = useState(0)
  const toast = useUIStore((s) => s.toast)

  const pick = async () => {
    setBusy(true)
    setPercent(0)
    try {
      const picked = await pickAndUploadSetListAudio(song.id, setPercent)
      if (!picked) return
      onUploaded(picked.path)
      // The track being replaced is not deleted here: on an edit it is still
      // the saved set list's until this form is saved.
      onDropped(song.audioPath)
      onChange({ audioUrl: picked.url, audioName: picked.name, audioPath: picked.path })
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not add that audio file', 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = () => {
    onDropped(song.audioPath)
    onChange({ audioUrl: undefined, audioName: undefined, audioPath: undefined })
  }

  return (
    <YStack gap="$1">
      <Text color={colors.textMuted} fontSize={11} fontWeight="600">
        AUDIO (optional)
      </Text>
      {song.audioUrl ? (
        <XStack
          backgroundColor={colors.surface}
          borderRadius="$2"
          borderWidth={1}
          borderColor={colors.border}
          paddingHorizontal="$3"
          paddingVertical="$2"
          alignItems="center"
          gap="$2"
        >
          <Text color={colors.text} fontSize={13} flex={1} numberOfLines={1}>
            ♪ {song.audioName ?? 'Audio file'}
          </Text>
          <Pressable onPress={pick} disabled={busy}>
            <Text color={colors.primary} fontSize={12}>
              {busy ? `${percent}%` : 'Replace'}
            </Text>
          </Pressable>
          <Pressable onPress={remove} disabled={busy}>
            <Text color="$red10" fontSize={12}>
              Remove
            </Text>
          </Pressable>
        </XStack>
      ) : (
        <Pressable onPress={pick} disabled={busy}>
          <XStack
            borderRadius="$2"
            borderWidth={1}
            borderColor={colors.primary}
            paddingHorizontal="$3"
            paddingVertical="$2"
            alignItems="center"
            justifyContent="center"
            opacity={busy ? 0.6 : 1}
          >
            <Text color={colors.primary} fontSize={13}>
              {busy ? `Uploading… ${percent}%` : '+ Add audio file'}
            </Text>
          </XStack>
        </Pressable>
      )}

      {/* The number says it is moving; the bar says how much is left. A
          full-length track on church wifi is a minute of neither, otherwise. */}
      {busy ? (
        <View
          style={{
            height: 3,
            borderRadius: 2,
            backgroundColor: colors.border,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${percent}%`,
              height: '100%',
              backgroundColor: colors.primary,
            }}
          />
        </View>
      ) : null}
    </YStack>
  )
}

export function SetListFormModal({
  visible,
  onClose,
  onSave,
  createdBy,
  editSetList = null,
  eventFor,
}: SetListFormModalProps) {
  const colors = useThemeColors()
  const chordSheets = useChordSheetsStore((s) => s.chordSheets)
  const [title, setTitle] = useState('')
  const [songs, setSongs] = useState<SetListSong[]>([makeSong()])
  const [selectedEvent, setSelectedEvent] = useState<EventInstance | null>(null)
  const [showEventPicker, setShowEventPicker] = useState(false)
  const [saving, setSaving] = useState(false)

  /**
   * Audio uploaded while this form has been open, and audio the save will
   * orphan.
   *
   * Editing is what forces the distinction. A track is uploaded the moment it
   * is picked, so abandoning the form has to take those files with it — but
   * the files already on the set list being edited belong to it, and deleting
   * one because somebody opened the form and changed their mind would be
   * losing data nobody asked to lose. So nothing existing is deleted until a
   * save actually succeeds, and only what this session created is swept on the
   * way out.
   */
  const uploadedHere = useRef<string[]>([])
  const orphanedBySave = useRef<string[]>([])
  const musicItems = useMusicStore((s) => s.items)
  const loadMusic = useMusicStore((s) => s.load)

  // Content is a single document loaded on demand rather than subscribed to,
  // so opening the builder is the moment to make sure it is here — the video
  // match below has nothing to match against otherwise.
  useEffect(() => {
    if (visible && musicItems.length === 0) loadMusic().catch(() => {})
  }, [visible, musicItems.length, loadMusic])

  const reset = () => {
    setTitle('')
    setSongs([makeSong()])
    setSelectedEvent(null)
    uploadedHere.current = []
    orphanedBySave.current = []
  }

  /**
   * Load whatever the form was opened on.
   *
   * Set during render rather than in an effect, which is React's own answer
   * for state derived from props: an effect would paint one frame of the
   * previous set list's songs before correcting itself, and the frame in
   * question is the one the modal animates in on.
   */
  const identity = visible ? String(editSetList?.id ?? 'new') : 'closed'
  const [loadedFor, setLoadedFor] = useState(identity)
  if (identity !== loadedFor) {
    setLoadedFor(identity)
    if (visible) {
      setTitle(editSetList?.title ?? '')
      setSongs(editSetList?.songs?.length ? editSetList.songs : [makeSong()])
      setSelectedEvent(editSetList && eventFor ? eventFor(editSetList) : null)
    }
  }

  // The two lists belong to whatever the form was last opened on. Cleared in
  // an effect rather than beside the state above, because a ref written during
  // render is a ref that can be written twice for one render.
  useEffect(() => {
    uploadedHere.current = []
    orphanedBySave.current = []
  }, [loadedFor])

  const handleClose = () => {
    // Only what this session uploaded. Those files are referenced by nothing
    // once the form closes unsaved — but the ones already on the set list
    // being edited are still its own.
    uploadedHere.current.forEach((path) => deleteSetListAudio(path))
    reset()
    onClose()
  }

  const updateSong = (id: string, field: keyof SetListSong, value: string | number | null) => {
    setSongs((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)))
  }

  /** Several fields at once — attaching audio sets three of them together. */
  const patchSong = (id: string, patch: Partial<SetListSong>) => {
    setSongs((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  /**
   * Choose a chord sheet, and take the Content video with it.
   *
   * A chord sheet and a video of the same song are usually both on file under
   * the same name, and typing the name into the builder is already how the
   * sheet gets attached — so the video that shares that name is one nobody
   * should have to go and find. Only fills an empty link: a video chosen by
   * hand is a deliberate choice about which recording, and a name match is
   * not a good enough reason to overrule it.
   */
  /**
   * Take a video from Content, and the chord sheet that goes with it.
   *
   * The mirror of selectChordSheet below: a sheet and a video of the same song
   * are filed under the same name, so choosing either should find the other.
   * Both only fill what is empty — whichever the person chose first is the
   * deliberate one.
   */
  const selectContentVideo = (songId: string, item: MusicItem) => {
    const song = songs.find((s) => s.id === songId)
    const patch: Partial<SetListSong> = { link: item.youtubeUrl }

    if (song && !song.name.trim()) patch.name = item.title
    if (song && song.chordSheetId == null) {
      const sheet = uniqueTitleMatch(item.title, chordSheets)
      if (sheet) patch.chordSheetId = sheet.id
    }
    patchSong(songId, patch)
  }

  const selectChordSheet = (songId: string, sheetId: string | number | null) => {
    const sheet = chordSheets.find((c) => String(c.id) === String(sheetId))
    const song = songs.find((s) => s.id === songId)
    const patch: Partial<SetListSong> = { chordSheetId: sheetId }

    if (sheet && song && !song.link.trim()) {
      const video = matchContentByTitle(sheet.title, musicItems)
      if (video) patch.link = video.youtubeUrl
    }
    patchSong(songId, patch)
  }

  const addSong = () => {
    setSongs((prev) => [...prev, makeSong()])
  }

  /** One place earlier (-1) or later (+1) in the set. */
  const moveSong = (id: string, by: -1 | 1) => {
    setSongs((prev) => {
      const from = prev.findIndex((s) => s.id === id)
      const to = from + by
      if (from < 0 || to < 0 || to >= prev.length) return prev
      const next = [...prev]
      ;[next[from], next[to]] = [next[to], next[from]]
      return next
    })
  }

  const removeSong = (id: string) => {
    setSongs((prev) => {
      if (prev.length <= 1) return prev
      // The song's track goes when the save does, not now: until then the set
      // list on file still points at it.
      dropAudio(prev.find((s) => s.id === id)?.audioPath)
      return prev.filter((s) => s.id !== id)
    })
  }

  /** Remember a file to delete once the save succeeds. */
  const dropAudio = (path: string | undefined) => {
    if (path) orphanedBySave.current.push(path)
  }

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    try {
      await onSave({
        title: title.trim(),
        songs,
        createdBy,
        eventTemplateId: selectedEvent?.templateId ?? null,
        eventDate: selectedEvent?.date ?? null,
      })
      // Saved, so the tracks this form replaced or dropped are referenced by
      // nothing. Deliberately after onSave: had it failed, they are still the
      // set list's.
      orphanedBySave.current.forEach((path) => deleteSetListAudio(path))
      reset()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <FullScreenOverlay
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={handleClose}
      >
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <YStack
            backgroundColor={colors.surface}
            borderRadius="$4"
            padding="$4"
            gap="$3"
            width="92%"
            maxWidth={560}
            maxHeight="90%"
          >
            <XStack justifyContent="space-between" alignItems="center">
              <Text color={colors.text} fontSize="$5" fontWeight="700">
                {editSetList ? 'Edit Set List' : 'New Set List'}
              </Text>
              <Pressable onPress={handleClose}>
                <Text color={colors.textMuted} fontSize="$4">
                  ✕
                </Text>
              </Pressable>
            </XStack>

            <ScrollView showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }}>
              <YStack gap="$3">
                {/* Title */}
                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    TITLE
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    value={title}
                    onChangeText={setTitle}
                    placeholder="e.g. Sunday Morning Worship"
                    placeholderTextColor={colors.textMuted}
                  />
                </YStack>

                {/* Event picker */}
                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    LINKED EVENT (optional)
                  </Text>
                  <Pressable onPress={() => setShowEventPicker(true)}>
                    <XStack
                      backgroundColor={colors.background}
                      borderRadius="$2"
                      borderWidth={1}
                      borderColor={colors.border}
                      padding="$3"
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      {selectedEvent ? (
                        <YStack flex={1}>
                          <Text color={colors.text} fontSize="$3" fontWeight="600">
                            {selectedEvent.title}
                          </Text>
                          <Text color={colors.textMuted} fontSize="$2">
                            {selectedEvent.date}
                          </Text>
                        </YStack>
                      ) : (
                        <Text color={colors.textMuted} fontSize="$3">
                          Tap to pick an event instance…
                        </Text>
                      )}
                      <Text color={colors.primary} fontSize="$3">
                        📅
                      </Text>
                    </XStack>
                  </Pressable>
                  {selectedEvent ? (
                    <Pressable onPress={() => setSelectedEvent(null)}>
                      <Text color={colors.textMuted} fontSize="$2">
                        ✕ Clear event
                      </Text>
                    </Pressable>
                  ) : null}
                </YStack>

                {/* Songs */}
                <YStack gap="$2">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    SONGS
                  </Text>
                  {songs.map((song, i) => (
                    <YStack
                      key={song.id}
                      backgroundColor={colors.background}
                      borderRadius="$3"
                      borderWidth={1}
                      borderColor={colors.border}
                      padding="$3"
                      gap="$2"
                    >
                      <XStack justifyContent="space-between" alignItems="center">
                        <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                          SONG {i + 1}
                        </Text>
                        {songs.length > 1 ? (
                          <XStack alignItems="center" gap="$1">
                            {/* Its place in the set: one step at a time. */}
                            {(
                              [
                                [-1, '▲', 'Move song up', i === 0],
                                [1, '▼', 'Move song down', i === songs.length - 1],
                              ] as const
                            ).map(([by, arrow, label, atEnd]) => (
                              <Pressable
                                key={label}
                                onPress={() => moveSong(song.id, by)}
                                disabled={atEnd}
                                accessibilityRole="button"
                                accessibilityLabel={`${label}: ${song.name || `song ${i + 1}`}`}
                                style={styles.moveBtn}
                              >
                                <Text color={atEnd ? colors.border : colors.primary} fontSize="$3">
                                  {arrow}
                                </Text>
                              </Pressable>
                            ))}
                            <Pressable onPress={() => removeSong(song.id)} style={styles.moveBtn}>
                              <Text color="#c0392b" fontSize="$2">
                                Remove
                              </Text>
                            </Pressable>
                          </XStack>
                        ) : null}
                      </XStack>

                      <SongNameComboBox
                        value={song.name}
                        chordSheets={chordSheets}
                        onChangeName={(v) => updateSong(song.id, 'name', v)}
                        onSelectSheet={(id) => selectChordSheet(song.id, id)}
                        colors={colors}
                        inputStyle={[
                          styles.input,
                          {
                            color: colors.text,
                            borderColor: colors.border,
                            backgroundColor: colors.surface,
                          },
                        ]}
                      />

                      <KeyPicker
                        value={song.key}
                        onChange={(v) => updateSong(song.id, 'key', v)}
                        colors={colors}
                      />

                      <SongLinkField
                        song={song}
                        colors={colors}
                        onChange={(patch) => patchSong(song.id, patch)}
                        onPickContent={(item) => selectContentVideo(song.id, item)}
                        inputStyle={{
                          ...StyleSheet.flatten(styles.input),
                          color: colors.text,
                          borderColor: colors.border,
                          backgroundColor: colors.surface,
                        }}
                      />

                      <SongAudioField
                        song={song}
                        colors={colors}
                        onChange={(patch) => patchSong(song.id, patch)}
                        onUploaded={(path) => uploadedHere.current.push(path)}
                        onDropped={dropAudio}
                      />

                      <WithDictation
                        value={song.notes}
                        onChangeText={(v) => updateSong(song.id, 'notes', v)}
                        multiline
                      >
                        <TextInput
                          style={[
                            styles.textarea,
                            {
                              color: colors.text,
                              borderColor: colors.border,
                              backgroundColor: colors.surface,
                            },
                          ]}
                          value={song.notes}
                          onChangeText={(v) => updateSong(song.id, 'notes', v)}
                          placeholder="Notes (optional)"
                          placeholderTextColor={colors.textMuted}
                          multiline
                          numberOfLines={2}
                        />
                      </WithDictation>

                      <ChordSheetPicker
                        chordSheets={chordSheets}
                        selectedId={song.chordSheetId}
                        onSelect={(id) => updateSong(song.id, 'chordSheetId', id)}
                        colors={colors}
                      />
                    </YStack>
                  ))}

                  <Pressable onPress={addSong}>
                    <XStack
                      borderRadius="$2"
                      borderWidth={1}
                      borderColor={colors.primary}
                      paddingVertical="$2"
                      justifyContent="center"
                      alignItems="center"
                      gap="$1"
                    >
                      <Text color={colors.primary} fontSize="$3" fontWeight="600">
                        + Add Song
                      </Text>
                    </XStack>
                  </Pressable>
                </YStack>
              </YStack>
            </ScrollView>

            <Pressable onPress={handleSave} disabled={saving || !title.trim()}>
              <XStack
                backgroundColor={colors.primary}
                borderRadius="$2"
                paddingVertical="$3"
                justifyContent="center"
                opacity={saving || !title.trim() ? 0.5 : 1}
              >
                <Text color="white" fontWeight="700" fontSize="$3">
                  {saving ? 'Saving…' : editSetList ? 'Save Changes' : 'Save Set List'}
                </Text>
              </XStack>
            </Pressable>
          </YStack>
        </KeyboardAvoidingView>
      </FullScreenOverlay>

      <EventPickerModal
        visible={showEventPicker}
        onClose={() => setShowEventPicker(false)}
        onSelect={(ev: EventInstance) => {
          setSelectedEvent(ev)
          setShowEventPicker(false)
        }}
      />
    </>
  )
}

const styles = StyleSheet.create({
  /** The song's ▲ ▼ and Remove: small to look at, a thumb's width to press. */
  moveBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },
})
