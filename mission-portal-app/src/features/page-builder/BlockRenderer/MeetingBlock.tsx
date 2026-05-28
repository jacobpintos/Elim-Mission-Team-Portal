import { useState, useEffect } from 'react'
import { useWindowDimensions } from 'react-native'
import { YStack, XStack, Text, Input, Button, TextArea, Spinner } from 'tamagui'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/stores/authStore'
import { useUsersStore } from '@/stores/usersStore'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { Avatar } from '@/components/ui/Avatar'
import type { MeetingData } from '@/types/pages'
import type { UserProfile } from '@/types/user'

interface MeetingBlockProps {
  data: MeetingData
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function MeetingBlock({ data }: MeetingBlockProps) {
  const { profile } = useAuthStore()
  const { users, subscribe, unsubscribe } = useUsersStore()
  const { width } = useWindowDimensions()
  const isWide = width >= 640

  const [leadershipTeam, setLeadershipTeam] = useState<string[]>([])

  useEffect(() => {
    subscribe()
    const unsub = onSnapshot(doc(db, 'config', 'main'), (snap) => {
      const d = snap.data()
      const team = d?.connectConfig?.leadershipTeam ?? []
      setLeadershipTeam(team.map((v: unknown) => String(v)))
    })
    return () => {
      unsubscribe()
      unsub()
    }
  }, [])

  const leaders = users.filter((u) => leadershipTeam.includes(u.uid))

  const [selectedLeaders, setSelectedLeaders] = useState<string[]>([])
  const [availability, setAvailability] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const toggleLeader = (uid: string) => {
    if (selectedLeaders.includes(uid)) {
      setSelectedLeaders(selectedLeaders.filter((id) => id !== uid))
    } else {
      setSelectedLeaders([...selectedLeaders, uid])
    }
  }

  const handleSubmit = async () => {
    if (!profile) {
      setError('Please sign in to submit a meeting request.')
      return
    }

    // Rate limit check
    const profileWithReq = profile as UserProfile & { lastMeetingRequest?: number }
    if (profileWithReq.lastMeetingRequest) {
      const lastReq = new Date(profileWithReq.lastMeetingRequest)
      if (isSameDay(lastReq, new Date())) {
        setError("You've already submitted a request today.")
        return
      }
    }

    if (selectedLeaders.length === 0) {
      setError('Please select at least one leader to meet with.')
      return
    }

    if (!availability.trim()) {
      setError('Please provide your availability.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const functions = getFunctions()
      const sendMeetingRequest = httpsCallable(functions, 'sendMeetingRequest')
      await sendMeetingRequest({
        leaders: selectedLeaders,
        name: profile.displayName,
        email: profile.email,
        availability: availability.trim(),
        message: message.trim(),
      })

      // Update lastMeetingRequest timestamp
      await updateDoc(doc(db, 'users', profile.uid), {
        lastMeetingRequest: Date.now(),
      })

      setSubmitted(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to submit request'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const numCols = isWide ? 4 : 2

  return (
    <YStack padding="$4" gap="$4">
      {data.heading ? (
        <Text fontSize="$6" fontWeight="700">
          {data.heading}
        </Text>
      ) : null}

      {data.intro ? (
        <Text fontSize="$4" color="$gray10" lineHeight={22}>
          {data.intro}
        </Text>
      ) : null}

      {/* Leadership grid */}
      {leaders.length > 0 && (
        <YStack gap="$2">
          <Text fontWeight="700" fontSize="$4">
            Our Leadership
          </Text>
          <XStack flexWrap="wrap" gap="$3">
            {leaders.map((leader) => {
              const leaderWithTitle = leader as UserProfile & { title?: string }
              return (
                <YStack
                  key={leader.uid}
                  alignItems="center"
                  gap="$1"
                  width={`${100 / numCols - 4}%`}
                >
                  <Avatar uri={leader.photoURL} displayName={leader.displayName} size={56} />
                  <Text fontSize="$3" fontWeight="600" textAlign="center">
                    {leader.displayName}
                  </Text>
                  {leaderWithTitle.title ? (
                    <Text fontSize="$2" color="$gray10" textAlign="center">
                      {leaderWithTitle.title}
                    </Text>
                  ) : null}
                </YStack>
              )
            })}
          </XStack>
        </YStack>
      )}

      {/* Meeting request form */}
      <YStack gap="$3" backgroundColor="$gray2" borderRadius="$3" padding="$3">
        <Text fontWeight="700" fontSize="$4">
          Request a Meeting
        </Text>

        {submitted ? (
          <YStack padding="$4" alignItems="center" gap="$2">
            <Text fontSize="$5" fontWeight="700" color="$green10">
              Request Submitted!
            </Text>
            <Text color="$gray10" textAlign="center">
              {"We'll be in touch to schedule your meeting."}
            </Text>
          </YStack>
        ) : (
          <>
            {profile && (
              <XStack gap="$3">
                <YStack flex={1} gap="$1">
                  <Text fontSize="$2" color="$gray10">
                    Name
                  </Text>
                  <Input value={profile.displayName} size="$3" readOnly />
                </YStack>
                <YStack flex={1} gap="$1">
                  <Text fontSize="$2" color="$gray10">
                    Email
                  </Text>
                  <Input value={profile.email} size="$3" readOnly />
                </YStack>
              </XStack>
            )}

            {leaders.length > 0 && (
              <YStack gap="$1">
                <Text fontSize="$3" fontWeight="600">
                  Who to meet with
                </Text>
                <XStack flexWrap="wrap" gap="$2">
                  {leaders.map((leader) => {
                    const isSelected = selectedLeaders.includes(leader.uid)
                    return (
                      <XStack
                        key={leader.uid}
                        paddingHorizontal="$3"
                        paddingVertical="$1"
                        borderRadius="$4"
                        borderWidth={1}
                        borderColor={isSelected ? '$primary' : '$borderColor'}
                        backgroundColor={isSelected ? '$primary' : 'transparent'}
                        onPress={() => toggleLeader(leader.uid)}
                      >
                        <Text
                          fontSize="$3"
                          color={isSelected ? 'white' : '$color'}
                          fontWeight={isSelected ? '700' : '400'}
                        >
                          {leader.displayName}
                        </Text>
                      </XStack>
                    )
                  })}
                </XStack>
              </YStack>
            )}

            <YStack gap="$1">
              <Text fontSize="$3" fontWeight="600">
                Your Availability *
              </Text>
              <TextArea
                placeholder="When are you available? (days, times)"
                value={availability}
                onChangeText={setAvailability}
                numberOfLines={3}
                size="$3"
              />
            </YStack>

            <YStack gap="$1">
              <Text fontSize="$3" fontWeight="600">
                Message (optional)
              </Text>
              <TextArea
                placeholder="What would you like to discuss?"
                value={message}
                onChangeText={setMessage}
                numberOfLines={3}
                size="$3"
              />
            </YStack>

            {error ? (
              <Text color="$red10" fontSize="$2">
                {error}
              </Text>
            ) : null}

            <Button
              size="$3"
              onPress={handleSubmit}
              disabled={submitting}
              theme="active"
            >
              {submitting ? <Spinner size="small" /> : 'Submit Request'}
            </Button>
          </>
        )}
      </YStack>
    </YStack>
  )
}
