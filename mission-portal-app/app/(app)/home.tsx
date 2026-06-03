import { useEffect, useMemo, useState } from 'react'
import { ScrollView, useWindowDimensions, Pressable, Linking, Image, View } from 'react-native'
import { YStack, XStack, Text, H3, Input } from 'tamagui'
import { Stack, useRouter } from 'expo-router'
import { useAuthStore } from '@/stores/authStore'
import { useEventsStore } from '@/stores/eventsStore'
import { useGroupsStore } from '@/stores/groupsStore'
import { useTasksStore } from '@/stores/tasksStore'
import { useUIStore } from '@/stores/uiStore'
import { useAnnounceStore } from '@/stores/announceStore'
import { useConfigStore } from '@/stores/configStore'
import { useMusicStore, youtubeThumbnail } from '@/stores/musicStore'
import { useThemeColors } from '@/theme/useThemeColors'
import { EventCard } from '@/components/ui/EventCard'
import { TaskCard } from '@/components/ui/TaskCard'
import { AnnouncementCard } from '@/components/ui/AnnouncementCard'
import { EventDetailModal } from '@/features/events/EventDetailModal'
import { AvailModal } from '@/features/events/AvailModal'
import { isAdmin, isSecurity, isMerch, isWorship } from '@/lib/roles'
import { AppLogo } from '@/components/ui/AppLogo'
import { todayStr, dateStr } from '@/lib/events'
import { FD, timeOfDay } from '@/lib/format'
import { haversineMiles, geocodeCity, estimatedDriveTime } from '@/lib/geocode'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { EventInstance, PostPage } from '@/types/events'
import type { MusicItem } from '@/stores/musicStore'

function isItemNew(item: MusicItem): boolean {
  if (!item.isNew) return false
  if (item.newUntil) return new Date(item.newUntil) >= new Date()
  return true
}

// Public Home sub-component
function PubHomeContent() {
  const colors = useThemeColors()
  const router = useRouter()
  const toast = useUIStore((s) => s.toast)
  const { profile, prevLoginAt } = useAuthStore()
  const { instances } = useEventsStore()
  const { publicAnnouncements } = useAnnounceStore()
  const { subscribe: subEvents, unsubscribe: unsubEvents } = useEventsStore()
  const { subscribe: subAnnounce, unsubscribe: unsubAnnounce } = useAnnounceStore()
  const configStore = useConfigStore()
  const musicStore = useMusicStore()

  const [city, setCity] = useState(profile?.locationPref?.city ?? '')
  const [stateVal, setStateVal] = useState(profile?.locationPref?.state ?? '')
  const [radius, setRadius] = useState(profile?.locationPref?.radius ?? 50)
  const [saving, setSaving] = useState(false)
  const [showLocForm, setShowLocForm] = useState(false)

  useEffect(() => {
    subEvents()
    subAnnounce()
    configStore.subscribe()
    musicStore.load()
    return () => {
      unsubEvents()
      unsubAnnounce()
      configStore.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const uid = profile?.uid ?? ''
  const today = todayStr()
  const in60 = dateStr(60)
  const in30 = dateStr(30)

  const allPublic60 = instances(today, in60).filter((ev) => ev.isPublic)
  const allPublic30 = instances(today, in30).filter((ev) => ev.isPublic)

  // Events Near Me — virtual events always included, physical filtered by radius
  const nearMe = (() => {
    const locPref = profile?.locationPref
    if (!locPref?.lat || !locPref?.lng) return []
    return allPublic60.filter((ev) => {
      if (ev.isVirtual) return true
      if (!ev._geocodeLat || !ev._geocodeLng) return false
      return (
        haversineMiles(locPref.lat!, locPref.lng!, ev._geocodeLat, ev._geocodeLng) <= locPref.radius
      )
    })
  })()

  const nearMeKeys = new Set(nearMe.map((ev) => ev.instanceKey))

  // Upcoming Stops: public events not in nearMe, within 30 days
  const upcomingStops = allPublic30.filter((ev) => !nearMeKeys.has(ev.instanceKey))

  // Announcements: public, within last 30 days OR newer than previous login
  const thirtyDaysAgo = useMemo(() => +new Date() - 30 * 24 * 60 * 60 * 1000, [])
  const cutoff = prevLoginAt ?? thirtyDaysAgo
  const unseenAnns = publicAnnouncements().filter(
    (ann) => ann.ts >= thirtyDaysAgo || ann.ts > cutoff
  )

  // New & Featured Releases
  const featuredItems = musicStore.items.filter((item) => isItemNew(item) || item.featured)

  // New Posts
  const pages: PostPage[] = configStore.postsConfig.pages
  const hasUnseen = (page: PostPage): boolean => {
    if (!uid) return false
    const lastSeen = configStore.lastSeenPosts[`${uid}_${page.id}`] ?? 0
    return page.posts.some((p) => p.ts > lastSeen)
  }

  const handleSaveLocation = async () => {
    if (!uid) return
    setSaving(true)
    try {
      const coords = await geocodeCity(city, stateVal)
      const prevCoords =
        profile?.locationPref?.lat !== undefined
          ? { lat: profile.locationPref.lat, lng: profile.locationPref.lng }
          : {}
      const locationPref = { city, state: stateVal, radius, ...prevCoords, ...(coords ?? {}) }
      await updateDoc(doc(db, 'users', uid), { locationPref })
      setShowLocForm(false)
      if (coords) {
        toast('Location saved — nearby events will appear below.', 'success')
      } else {
        toast('Location saved. Could not geocode city — Events Near Me may not update until a valid city/state is set.', 'error')
      }
    } catch {
      toast('Failed to save location', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <YStack padding="$4" gap="$4">
        {/* Welcome */}
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$3"
          padding="$4"
          borderWidth={1}
          borderColor={colors.border}
          gap="$3"
          alignItems="center"
        >
          <AppLogo size="lg" showSlogan />
          <Text color={colors.text} fontSize="$4" fontWeight="600" textAlign="center">
            Welcome{profile?.displayName ? `, ${profile.displayName.split(' ')[0]}` : ', friend'}!
          </Text>
        </YStack>

        {/* Announcements */}
        <YStack gap="$2">
          <H3 color={colors.text}>Announcements</H3>
          {unseenAnns.length === 0 ? (
            <YStack
              backgroundColor={colors.surface}
              borderRadius="$3"
              padding="$3"
              borderWidth={1}
              borderColor={colors.border}
            >
              <Text color={colors.textMuted}>No recent announcements.</Text>
            </YStack>
          ) : unseenAnns.length <= 3 ? (
            unseenAnns.map((ann) => <AnnouncementCard key={String(ann.id)} announcement={ann} />)
          ) : (
            <Pressable onPress={() => router.push('/announce')}>
              <AnnouncementCard announcement={unseenAnns[0]} />
              <YStack
                backgroundColor={colors.surface}
                borderRadius="$3"
                padding="$3"
                borderWidth={1}
                borderColor={colors.primary}
                marginTop="$1"
                alignItems="center"
              >
                <Text color={colors.primary} fontWeight="600">
                  {unseenAnns.length - 1} more Unseen Announcements
                </Text>
              </YStack>
            </Pressable>
          )}
        </YStack>

        {/* Events Near Me */}
        <YStack gap="$2">
          <XStack justifyContent="space-between" alignItems="center">
            <H3 color={colors.text}>Events Near Me</H3>
            <Pressable onPress={() => setShowLocForm((v) => !v)}>
              <Text color={colors.primary} fontSize="$3">
                {profile?.locationPref ? 'Edit Location' : 'Set Location'}
              </Text>
            </Pressable>
          </XStack>

          {showLocForm ? (
            <YStack
              backgroundColor={colors.surface}
              borderRadius="$3"
              padding="$3"
              borderWidth={1}
              borderColor={colors.border}
              gap="$2"
            >
              <XStack gap="$2">
                <Input
                  flex={1}
                  value={city}
                  onChangeText={(v: string) => setCity(v)}
                  placeholder="City"
                  backgroundColor={colors.surface}
                  color={colors.text}
                  borderColor={colors.border}
                />
                <Input
                  width={80}
                  value={stateVal}
                  onChangeText={(v: string) => setStateVal(v)}
                  placeholder="State"
                  backgroundColor={colors.surface}
                  color={colors.text}
                  borderColor={colors.border}
                />
              </XStack>
              <XStack gap="$2" alignItems="center">
                <Text color={colors.textMuted} fontSize="$3">
                  Radius (miles):
                </Text>
                <Input
                  width={80}
                  value={String(radius)}
                  onChangeText={(v: string) => setRadius(Number(v) || 50)}
                  keyboardType="numeric"
                  backgroundColor={colors.surface}
                  color={colors.text}
                  borderColor={colors.border}
                />
              </XStack>
              <Pressable onPress={handleSaveLocation} disabled={saving}>
                <XStack
                  backgroundColor={colors.primary}
                  borderRadius="$2"
                  paddingHorizontal="$4"
                  paddingVertical="$2"
                  alignSelf="flex-start"
                  opacity={saving ? 0.6 : 1}
                >
                  <Text color="white" fontWeight="600">
                    {saving ? 'Saving…' : 'Save Location'}
                  </Text>
                </XStack>
              </Pressable>
            </YStack>
          ) : null}

          {nearMe.length === 0 ? (
            <YStack
              backgroundColor={colors.surface}
              borderRadius="$3"
              padding="$3"
              borderWidth={1}
              borderColor={colors.border}
            >
              <Text color={colors.textMuted}>
                {profile?.locationPref
                  ? 'No events near your location in the next 60 days.'
                  : 'Set your location to see nearby events.'}
              </Text>
            </YStack>
          ) : (
            nearMe.map((ev) => (
              <YStack
                key={ev.instanceKey}
                backgroundColor={colors.surface}
                borderRadius="$3"
                padding="$3"
                borderWidth={1}
                borderColor={colors.border}
                gap="$1"
              >
                <Text color={colors.text} fontWeight="700">
                  {ev.title}
                </Text>
                <Text color={colors.textMuted} fontSize="$2">
                  {FD(ev.date)} {ev.startTime ? `· ${ev.startTime}` : ''}
                  {ev.isVirtual ? ' · Virtual' : ''}
                </Text>
                {ev.location ? (
                  <Text color={colors.textMuted} fontSize="$2">
                    {ev.location}
                  </Text>
                ) : null}
                {!ev.isVirtual && ev._geocodeLat && ev._geocodeLng && profile?.locationPref?.lat ? (
                  <Text color={colors.textMuted} fontSize="$2">
                    {Math.round(
                      haversineMiles(
                        profile.locationPref.lat,
                        profile.locationPref.lng!,
                        ev._geocodeLat,
                        ev._geocodeLng
                      )
                    )} mi · {estimatedDriveTime(
                      haversineMiles(
                        profile.locationPref.lat,
                        profile.locationPref.lng!,
                        ev._geocodeLat,
                        ev._geocodeLng
                      )
                    )} (est.)
                  </Text>
                ) : null}
                {ev.isVirtual && ev.virtualLink ? (
                  <Pressable onPress={() => Linking.openURL(ev.virtualLink!)}>
                    <Text color="#8e44ad" fontSize="$2" textDecorationLine="underline">
                      Join Here
                    </Text>
                  </Pressable>
                ) : null}
              </YStack>
            ))
          )}
        </YStack>

        {/* New & Featured Releases */}
        <YStack gap="$2">
          <H3 color={colors.text}>New &amp; Featured Releases</H3>
          {featuredItems.length === 0 ? (
            <YStack
              backgroundColor={colors.surface}
              borderRadius="$3"
              padding="$3"
              borderWidth={1}
              borderColor={colors.border}
            >
              <Text color={colors.textMuted}>No new or featured releases.</Text>
            </YStack>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
              <XStack gap="$3" paddingVertical="$1">
                {featuredItems.map((item) => {
                  const thumb = youtubeThumbnail(item.youtubeUrl)
                  const itemIsNew = isItemNew(item)
                  return (
                    <Pressable key={item.id} onPress={() => Linking.openURL(item.youtubeUrl)}>
                      <YStack width={140} gap="$1">
                        <YStack borderRadius="$2" overflow="hidden" position="relative">
                          {thumb ? (
                            <Image
                              source={{ uri: thumb }}
                              style={{ width: 140, height: 90 }}
                              resizeMode="cover"
                            />
                          ) : (
                            <YStack
                              width={140}
                              height={90}
                              backgroundColor={colors.surface}
                              borderWidth={1}
                              borderColor={colors.border}
                              alignItems="center"
                              justifyContent="center"
                            >
                              <Text color={colors.textMuted} fontSize="$2">
                                No preview
                              </Text>
                            </YStack>
                          )}
                          {itemIsNew ? (
                            <YStack
                              position="absolute"
                              top={4}
                              left={4}
                              backgroundColor={colors.primary}
                              borderRadius="$1"
                              paddingHorizontal={6}
                              paddingVertical={2}
                            >
                              <Text color="white" fontSize={10} fontWeight="700">
                                NEW
                              </Text>
                            </YStack>
                          ) : null}
                          {item.featured ? (
                            <YStack
                              position="absolute"
                              top={4}
                              right={4}
                              backgroundColor="#f39c12"
                              borderRadius="$1"
                              paddingHorizontal={6}
                              paddingVertical={2}
                            >
                              <Text color="white" fontSize={10} fontWeight="700">
                                ★
                              </Text>
                            </YStack>
                          ) : null}
                        </YStack>
                        <Text color={colors.text} fontSize="$2" numberOfLines={2}>
                          {item.title}
                        </Text>
                      </YStack>
                    </Pressable>
                  )
                })}
              </XStack>
            </ScrollView>
          )}
        </YStack>

        {/* Posts */}
        <YStack gap="$2">
          <H3 color={colors.text}>Posts</H3>
          {pages.length === 0 ? (
            <YStack
              backgroundColor={colors.surface}
              borderRadius="$3"
              padding="$3"
              borderWidth={1}
              borderColor={colors.border}
            >
              <Text color={colors.textMuted}>No post directories configured.</Text>
            </YStack>
          ) : (
            <YStack gap={10}>
              {pages.map((page) => {
                const unseen = hasUnseen(page)
                return (
                  <Pressable key={page.id} onPress={() => router.push(`/posts/${page.id}` as never)}>
                    <View style={{ borderRadius: 14, overflow: 'hidden', minHeight: 82, flexDirection: 'row', borderWidth: 1, borderColor: unseen ? colors.primary : colors.border }}>
                      {/* Left: photo panel */}
                      <View style={{ width: 90, alignSelf: 'stretch', overflow: 'hidden', position: 'relative' }}>
                        {page.bgImage ? (
                          <img src={page.bgImage} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' } as object} />
                        ) : (
                          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.primary + '77' }} />
                        )}
                      </View>
                      {/* Right: text panel */}
                      <View style={{ flex: 1, minWidth: 0, overflow: 'hidden', paddingHorizontal: 16, paddingVertical: 14, justifyContent: 'center', backgroundColor: colors.surface }}>
                        {unseen ? (
                          <XStack gap={4} alignItems="center" marginBottom={2}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary }} />
                            <Text color={colors.primary} fontSize={11} fontWeight="600">New</Text>
                          </XStack>
                        ) : null}
                        <Text color={colors.text} fontWeight="700" fontSize={15} numberOfLines={1}>{page.label}</Text>
                        {page.desc ? (
                          <Text color={colors.textMuted} fontSize={12} numberOfLines={1} marginTop={2}>{page.desc}</Text>
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                )
              })}
            </YStack>
          )}
        </YStack>

        {/* Upcoming Stops */}
        <YStack gap="$2">
          <H3 color={colors.text}>Upcoming Stops</H3>
          {upcomingStops.length === 0 ? (
            <YStack
              backgroundColor={colors.surface}
              borderRadius="$3"
              padding="$3"
              borderWidth={1}
              borderColor={colors.border}
            >
              <Text color={colors.textMuted}>No upcoming stops in the next 30 days.</Text>
            </YStack>
          ) : (
            upcomingStops.map((ev) => (
              <YStack
                key={ev.instanceKey}
                backgroundColor={colors.surface}
                borderRadius="$3"
                padding="$3"
                borderWidth={1}
                borderColor={colors.border}
                gap="$1"
              >
                <Text color={colors.text} fontWeight="700">
                  {ev.title}
                </Text>
                <Text color={colors.textMuted} fontSize="$2">
                  {FD(ev.date, { weekday: true })} {ev.startTime ? `· ${ev.startTime}` : ''}
                </Text>
                {ev.location ? (
                  <Text color={colors.textMuted} fontSize="$2">
                    {ev.location}
                  </Text>
                ) : null}
                {ev.isVirtual && ev.signUpLink ? (
                  <Pressable onPress={() => Linking.openURL(ev.signUpLink!)}>
                    <Text color="#8e44ad" fontSize="$2" textDecorationLine="underline">
                      Join Here
                    </Text>
                  </Pressable>
                ) : null}
              </YStack>
            ))
          )}
        </YStack>
      </YStack>
    </ScrollView>
  )
}

// Main Home for team members (non-admin, non-public)
function TeamHomeContent() {
  const colors = useThemeColors()
  const { width } = useWindowDimensions()
  const isWide = width >= 768

  const { profile } = useAuthStore()
  const uid = profile?.uid ?? ''

  const { avail } = useEventsStore()
  const eventsStore = useEventsStore()
  const tasksStore = useTasksStore()
  const announceStore = useAnnounceStore()
  const { subscribe: subEvents, unsubscribe: unsubEvents } = useEventsStore()
  const { subscribe: subGroups, unsubscribe: unsubGroups } = useGroupsStore()
  const { subscribe: subTasks, unsubscribe: unsubTasks } = useTasksStore()
  const { subscribe: subAnnounce, unsubscribe: unsubAnnounce } = useAnnounceStore()

  const [detailEvent, setDetailEvent] = useState<EventInstance | null>(null)
  const [availEvent, setAvailEvent] = useState<EventInstance | null>(null)

  useEffect(() => {
    subEvents()
    subGroups()
    subTasks()
    subAnnounce()
    return () => {
      unsubEvents()
      unsubGroups()
      unsubTasks()
      unsubAnnounce()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const today = todayStr()
  const in7 = dateStr(7)

  const myEvents = eventsStore.myInstances(uid, today, in7)
  const overdueTasks = tasksStore.overdueTasks(uid)
  const behindTasks = tasksStore.behindTasks(uid)
  const dueSoonTasks = tasksStore.dueThisWeekTasks(uid)
  const myAnns = announceStore.myAnnouncements(uid).slice(0, 3)

  const greeting = `Good ${timeOfDay()}, ${profile?.displayName?.split(' ')[0] ?? 'there'}!`
  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  const myAvail = (ev: EventInstance) => {
    const key = String(ev.instanceKey ?? `${ev.templateId}_${ev.date}`)
    return avail[key]?.[uid] ?? null
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }}>
      <YStack padding="$4" gap="$4">
        <YStack gap="$1">
          <Text color={colors.text} fontSize="$6" fontWeight="700">
            {greeting}
          </Text>
          <Text color={colors.textMuted} fontSize="$3">
            {todayLabel}
          </Text>
        </YStack>

        <XStack gap="$4" flexDirection={isWide ? 'row' : 'column'} alignItems="flex-start">
          {/* Left: Events + Tasks */}
          <YStack flex={1} gap="$3">
            <H3 color={colors.text}>My Upcoming Events</H3>
            {myEvents.length === 0 ? (
              <YStack
                backgroundColor={colors.surface}
                borderRadius="$3"
                padding="$3"
                borderWidth={1}
                borderColor={colors.border}
              >
                <Text color={colors.textMuted}>No events assigned to you this week.</Text>
              </YStack>
            ) : (
              myEvents.map((ev) => (
                <EventCard
                  key={ev.instanceKey}
                  event={ev}
                  myAvail={myAvail(ev)}
                  onDetail={() => setDetailEvent(ev)}
                  onAvail={() => setAvailEvent(ev)}
                />
              ))
            )}

            <H3 color={colors.text} marginTop="$2">
              My Tasks
            </H3>

            {overdueTasks.length > 0 ? (
              <YStack
                backgroundColor="#c0392b22"
                borderRadius="$3"
                padding="$2"
                borderWidth={1}
                borderColor="#c0392b"
                gap="$1"
              >
                <Text color="#c0392b" fontWeight="700" fontSize="$3">
                  ⚠ {overdueTasks.length} Overdue
                </Text>
                {overdueTasks.map((t) => (
                  <TaskCard key={String(t.id)} task={t} />
                ))}
              </YStack>
            ) : null}

            {behindTasks.length > 0 ? (
              <YStack
                backgroundColor="#e67e2222"
                borderRadius="$3"
                padding="$2"
                borderWidth={1}
                borderColor="#e67e22"
                gap="$1"
              >
                <Text color="#e67e22" fontWeight="700" fontSize="$3">
                  ⏰ {behindTasks.length} Behind
                </Text>
                {behindTasks.map((t) => (
                  <TaskCard key={String(t.id)} task={t} />
                ))}
              </YStack>
            ) : null}

            {dueSoonTasks.length > 0 ? (
              <YStack gap="$1">
                <Text color={colors.textMuted} fontWeight="600" fontSize="$3">
                  → {dueSoonTasks.length} Due This Week
                </Text>
                {dueSoonTasks.map((t) => (
                  <TaskCard key={String(t.id)} task={t} />
                ))}
              </YStack>
            ) : null}

            {overdueTasks.length === 0 && behindTasks.length === 0 && dueSoonTasks.length === 0 ? (
              <YStack
                backgroundColor={colors.surface}
                borderRadius="$3"
                padding="$3"
                borderWidth={1}
                borderColor={colors.border}
              >
                <Text color={colors.textMuted}>No urgent tasks this week.</Text>
              </YStack>
            ) : null}
          </YStack>

          {/* Right: Announcements */}
          <YStack width={isWide ? 300 : '100%'} gap="$3">
            <H3 color={colors.text}>Recent Announcements</H3>
            {myAnns.length === 0 ? (
              <YStack
                backgroundColor={colors.surface}
                borderRadius="$3"
                padding="$3"
                borderWidth={1}
                borderColor={colors.border}
              >
                <Text color={colors.textMuted}>No announcements.</Text>
              </YStack>
            ) : (
              myAnns.map((ann) => <AnnouncementCard key={String(ann.id)} announcement={ann} />)
            )}
          </YStack>
        </XStack>
      </YStack>

      <EventDetailModal
        event={detailEvent}
        uid={uid}
        isMember
        isAdmin={false}
        open={!!detailEvent}
        onClose={() => setDetailEvent(null)}
        onAvail={() => {
          setAvailEvent(detailEvent)
          setDetailEvent(null)
        }}
      />
      <AvailModal
        event={availEvent}
        uid={uid}
        open={!!availEvent}
        onClose={() => setAvailEvent(null)}
      />
    </ScrollView>
  )
}

export default function Home() {
  const { profile } = useAuthStore()

  const isMember =
    isAdmin(profile) ||
    isSecurity(profile) ||
    isWorship(profile) ||
    isMerch(profile) ||
    profile?.roles?.includes('regular')

  if (!isMember) {
    return (
      <>
        <Stack.Screen options={{ title: 'Home' }} />
        <PubHomeContent />
      </>
    )
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Home' }} />
      <TeamHomeContent />
    </>
  )
}
