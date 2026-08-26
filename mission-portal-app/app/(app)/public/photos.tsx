import { useState, useEffect, useMemo } from 'react'
import { ScrollView, Pressable } from 'react-native'
import { YStack, XStack, Text, Input, Spinner } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { useAuthStore } from '@/stores/authStore'
import { usePhotoAlbumsStore } from '@/stores/photoAlbumsStore'
import { useUIStore } from '@/stores/uiStore'
import { audit } from '@/lib/audit'
import { confirmAsync } from '@/lib/confirm'
import { PhotoAlbumCard } from '@/features/photos/PhotoAlbumCard'
import { PhotoGalleryModal } from '@/features/photos/PhotoGalleryModal'
import { PhotoAlbumFormModal } from '@/features/photos/PhotoAlbumFormModal'
import type { PhotoAlbum } from '@/types/photos'

type View = 'main' | 'baptisms'

export default function PhotosPage() {
  const colors = useThemeColors()
  const { profile } = useAuthStore()
  const { albums, loading, subscribe, unsubscribe, deleteAlbum } = usePhotoAlbumsStore()
  const { toast } = useUIStore()

  const isAdmin = profile?.roles?.includes('admin') ?? false

  const [view, setView] = useState<View>('main')
  const [search, setSearch] = useState('')
  const [baptismsSearch, setBaptismsSearch] = useState('')
  const [galleryAlbum, setGalleryAlbum] = useState<PhotoAlbum | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editAlbum, setEditAlbum] = useState<PhotoAlbum | null>(null)

  useEffect(() => {
    subscribe()
    return () => unsubscribe()
    // subscribe/unsubscribe refs are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const generalAlbums = useMemo(() => albums.filter((a) => a.category === 'general'), [albums])
  const baptismAlbums = useMemo(() => albums.filter((a) => a.category === 'baptisms'), [albums])

  const filterAlbums = (list: PhotoAlbum[], q: string) => {
    if (!q.trim()) return list
    const lq = q.toLowerCase()
    return list.filter(
      (a) =>
        a.title.toLowerCase().includes(lq) ||
        a.city.toLowerCase().includes(lq) ||
        a.state.toLowerCase().includes(lq) ||
        a.date.toLowerCase().includes(lq) ||
        (a.description ?? '').toLowerCase().includes(lq)
    )
  }

  const visibleGeneral = useMemo(() => filterAlbums(generalAlbums, search), [generalAlbums, search])
  const visibleBaptisms = useMemo(
    () => filterAlbums(baptismAlbums, baptismsSearch),
    [baptismAlbums, baptismsSearch]
  )

  const handleDelete = async (album: PhotoAlbum) => {
    const ok = await confirmAsync(`Delete "${album.title}"? This cannot be undone.`, {
      title: 'Delete Album',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteAlbum(album.id)
      await audit(
        'photoAlbum.deleted',
        `Deleted album "${album.title}"`,
        profile?.displayName ?? ''
      )
      toast('Album deleted', 'success')
    } catch {
      toast('Failed to delete album', 'error')
    }
  }

  const openCreate = () => {
    setEditAlbum(null)
    setShowForm(true)
  }

  const openEdit = (album: PhotoAlbum) => {
    setEditAlbum(album)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditAlbum(null)
  }

  if (view === 'baptisms') {
    return (
      <YStack flex={1} backgroundColor={colors.background}>
        <XStack
          backgroundColor={colors.surface}
          borderBottomWidth={1}
          borderBottomColor={colors.border}
          paddingHorizontal="$4"
          paddingVertical="$3"
          alignItems="center"
          gap="$3"
        >
          <Pressable
            onPress={() => {
              setView('main')
              setBaptismsSearch('')
            }}
          >
            <Text color={colors.primary} fontSize="$3" fontWeight="600">
              ← Photos
            </Text>
          </Pressable>
          <Text color={colors.text} fontSize="$5" fontWeight="700" flex={1}>
            Baptisms
          </Text>
          {isAdmin && (
            <Pressable onPress={() => openCreate()}>
              <XStack
                backgroundColor={colors.primary}
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$1"
              >
                <Text color="white" fontSize="$2" fontWeight="600">
                  + New
                </Text>
              </XStack>
            </Pressable>
          )}
        </XStack>

        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <Input
            placeholder="Search baptisms..."
            value={baptismsSearch}
            onChangeText={setBaptismsSearch}
            size="$3"
            marginBottom={16}
          />

          {loading ? (
            <YStack alignItems="center" paddingVertical="$8">
              <Spinner size="large" />
            </YStack>
          ) : visibleBaptisms.length === 0 ? (
            <YStack alignItems="center" paddingVertical="$8">
              <Text color={colors.textMuted} fontSize="$3">
                {baptismsSearch ? 'No results found' : 'No baptism albums yet'}
              </Text>
            </YStack>
          ) : (
            visibleBaptisms.map((album) => (
              <PhotoAlbumCard
                key={album.id}
                album={album}
                onPress={() => setGalleryAlbum(album)}
                onEdit={isAdmin ? () => openEdit(album) : undefined}
                onDelete={isAdmin ? () => handleDelete(album) : undefined}
              />
            ))
          )}
        </ScrollView>

        <PhotoGalleryModal
          album={galleryAlbum}
          isAdmin={isAdmin}
          onClose={() => setGalleryAlbum(null)}
        />
        {showForm && (
          <PhotoAlbumFormModal
            open={showForm}
            onClose={closeForm}
            editAlbum={editAlbum}
            defaultCategory="baptisms"
          />
        )}
      </YStack>
    )
  }

  return (
    <YStack flex={1} backgroundColor={colors.background}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <XStack alignItems="center" justifyContent="space-between" marginBottom={12}>
          <Text color={colors.text} fontSize="$6" fontWeight="700">
            Photos
          </Text>
          {isAdmin && (
            <Pressable onPress={() => openCreate()}>
              <XStack
                backgroundColor={colors.primary}
                borderRadius="$2"
                paddingHorizontal="$3"
                paddingVertical="$1"
              >
                <Text color="white" fontSize="$2" fontWeight="600">
                  + New Album
                </Text>
              </XStack>
            </Pressable>
          )}
        </XStack>

        <Input
          placeholder="Search by title, location, or date..."
          value={search}
          onChangeText={setSearch}
          size="$3"
          marginBottom={16}
        />

        {/* Baptisms special card */}
        <Pressable onPress={() => setView('baptisms')}>
          <YStack
            borderRadius="$3"
            overflow="hidden"
            marginBottom={16}
            borderWidth={2}
            borderColor={colors.primary}
          >
            <YStack
              backgroundColor={colors.primary}
              height={100}
              alignItems="center"
              justifyContent="center"
            >
              <Text color="white" fontSize={40}>
                🕊
              </Text>
            </YStack>
            <YStack
              backgroundColor={colors.surface}
              padding="$3"
              flexDirection="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <YStack>
                <Text color={colors.text} fontWeight="700" fontSize="$4">
                  Baptisms
                </Text>
                <Text color={colors.textMuted} fontSize="$2">
                  {baptismAlbums.length} album{baptismAlbums.length !== 1 ? 's' : ''}
                </Text>
              </YStack>
              <Text color={colors.primary} fontSize="$4">
                →
              </Text>
            </YStack>
          </YStack>
        </Pressable>

        {loading ? (
          <YStack alignItems="center" paddingVertical="$8">
            <Spinner size="large" />
          </YStack>
        ) : visibleGeneral.length === 0 ? (
          <YStack alignItems="center" paddingVertical="$8">
            <Text color={colors.textMuted} fontSize="$3">
              {search ? 'No results found' : 'No albums yet'}
            </Text>
          </YStack>
        ) : (
          visibleGeneral.map((album) => (
            <PhotoAlbumCard
              key={album.id}
              album={album}
              onPress={() => setGalleryAlbum(album)}
              onEdit={isAdmin ? () => openEdit(album) : undefined}
              onDelete={isAdmin ? () => handleDelete(album) : undefined}
            />
          ))
        )}
      </ScrollView>

      <PhotoGalleryModal
        album={galleryAlbum}
        isAdmin={isAdmin}
        onClose={() => setGalleryAlbum(null)}
      />
      {showForm && (
        <PhotoAlbumFormModal
          open={showForm}
          onClose={closeForm}
          editAlbum={editAlbum}
          defaultCategory="general"
        />
      )}
    </YStack>
  )
}
