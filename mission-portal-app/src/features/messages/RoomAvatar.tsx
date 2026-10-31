import { View } from 'react-native'
import { Text } from 'tamagui'
import { Image } from '@/components/ui/Image'
import { Avatar } from '@/components/ui/Avatar'
import { useThemeColors } from '@/theme/useThemeColors'
import { coverFaces, otherMember, roomKind } from '@/lib/rooms'
import type { Room } from '@/types/events'

interface Person {
  uid: string | number
  displayName?: string
  photoURL?: string
}

interface RoomAvatarProps {
  room: Pick<Room, 'members' | 'kind' | 'photoURL' | 'name'>
  /** Who is looking: a direct message shows the other person. */
  uid: string
  people: Person[]
  size?: number
}

/** Between the photos of a group chat without a cover. */
const DIVIDER = 2

const initialsOf = (name?: string) => {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? []
  if (words.length === 0) return '?'
  return words.length === 1
    ? words[0].slice(0, 2).toUpperCase()
    : (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/**
 * A conversation's picture: for a direct message, the other person's photo;
 * for a group chat, its cover photo — or, with none, some of the people in
 * it, side by side in the circle with a line between each (lib/rooms
 * coverFaces).
 */
export function RoomAvatar({ room, uid, people, size = 46 }: RoomAvatarProps) {
  const colors = useThemeColors()

  if (roomKind(room) === 'dm') {
    const otherUid = otherMember(room, uid)
    const other = people.find((p) => String(p.uid) === otherUid)
    return <Avatar uri={other?.photoURL} displayName={other?.displayName} size={size} />
  }

  const round = { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' as const }
  if (room.photoURL) {
    return (
      <Image
        source={{ uri: room.photoURL }}
        style={round}
        contentFit="cover"
        accessibilityLabel={`${room.name ?? 'Group chat'} cover photo`}
      />
    )
  }

  const faces = coverFaces(room, uid, people)
  if (faces.length <= 1) {
    return (
      <Avatar
        uri={faces[0]?.photoURL}
        displayName={room.name ?? faces[0]?.displayName}
        size={size}
      />
    )
  }

  // Two side by side; three as one beside two; four in quarters.
  const columns =
    faces.length === 2
      ? [[faces[0]], [faces[1]]]
      : faces.length === 3
        ? [[faces[0]], [faces[1], faces[2]]]
        : [
            [faces[0], faces[1]],
            [faces[2], faces[3]],
          ]
  const cellText = Math.max(9, Math.round(size * (faces.length === 2 ? 0.26 : 0.2)))
  return (
    <View
      style={{ ...round, flexDirection: 'row', gap: DIVIDER, backgroundColor: colors.background }}
      accessibilityLabel={`${room.name ?? 'Group chat'}: ${faces
        .map((f) => f.displayName ?? '')
        .filter(Boolean)
        .join(', ')}`}
    >
      {columns.map((column, i) => (
        <View key={i} style={{ flex: 1, gap: DIVIDER }}>
          {column.map((face) => (
            <View key={String(face.uid)} style={{ flex: 1, overflow: 'hidden' }}>
              {face.photoURL ? (
                <Image
                  source={{ uri: face.photoURL }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={{
                    flex: 1,
                    backgroundColor: colors.primary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text color="white" fontWeight="700" fontSize={cellText}>
                    {initialsOf(face.displayName)}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}
