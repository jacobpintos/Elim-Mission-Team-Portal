import { useState } from 'react'
import { Modal, View, ScrollView, Pressable, TextInput, StyleSheet, Image } from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import type { SecurityReport } from '@/types/security'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function formatTs(ts: unknown): string {
  if (!ts || typeof ts !== 'number') return '—'
  const d = new Date(ts)
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

interface ReportDetailModalProps {
  report: SecurityReport | null
  currentUserId: string
  currentUserName: string
  canAct: boolean
  onClose: () => void
  onMyWay: (report: SecurityReport) => Promise<void>
  onResolve: (report: SecurityReport, resolution: string) => Promise<void>
}

export function ReportDetailModal({
  report,
  currentUserId,
  currentUserName: _currentUserName,
  canAct,
  onClose,
  onMyWay,
  onResolve,
}: ReportDetailModalProps) {
  const colors = useThemeColors()
  const [showResolveForm, setShowResolveForm] = useState(false)
  const [resolution, setResolution] = useState('')
  const [acting, setActing] = useState(false)

  if (!report) return null

  const isResponding = report.status === 'responding'
  const isResolved = report.status === 'resolved'
  const responders = report.responders ?? []
  const iAmResponder = responders.some((r) => r.uid === currentUserId)

  const handleMyWay = async () => {
    setActing(true)
    try {
      await onMyWay(report)
    } finally {
      setActing(false)
    }
  }

  const handleResolve = async () => {
    if (!resolution.trim()) return
    setActing(true)
    try {
      await onResolve(report, resolution.trim())
      setShowResolveForm(false)
      setResolution('')
      onClose()
    } finally {
      setActing(false)
    }
  }

  const handleClose = () => {
    setShowResolveForm(false)
    setResolution('')
    onClose()
  }

  const statusColor =
    report.status === 'open' ? '#e74c3c' : report.status === 'responding' ? '#f39c12' : '#27ae60'
  const statusLabel =
    report.status === 'open' ? 'OPEN' : report.status === 'responding' ? 'RESPONDING' : 'RESOLVED'

  return (
    <Modal visible={!!report} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <YStack
          backgroundColor={colors.surface}
          borderRadius="$4"
          padding="$4"
          gap="$3"
          width="92%"
          maxWidth={560}
          maxHeight="92%"
        >
          <XStack justifyContent="space-between" alignItems="center">
            <XStack gap="$2" alignItems="center" flex={1}>
              <Text color={colors.text} fontSize="$5" fontWeight="700" flex={1}>
                Security Report
              </Text>
              <XStack
                backgroundColor={statusColor + '22'}
                borderRadius={99}
                paddingHorizontal="$2"
                paddingVertical={3}
              >
                <Text color={statusColor} fontSize={10} fontWeight="700">
                  {statusLabel}
                </Text>
              </XStack>
            </XStack>
            <Pressable onPress={handleClose}>
              <Text color={colors.textMuted} fontSize="$4" marginLeft="$2">
                ✕
              </Text>
            </Pressable>
          </XStack>

          <ScrollView showsVerticalScrollIndicator={false}>
            <YStack gap="$3">
              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                  REPORTED BY
                </Text>
                <Text color={colors.text} fontSize="$3">
                  {report.reporterName}
                </Text>
                <Text color={colors.textMuted} fontSize="$2">
                  {formatTs(
                    report.createdAt &&
                      typeof report.createdAt === 'object' &&
                      'toMillis' in (report.createdAt as object)
                      ? (report.createdAt as { toMillis: () => number }).toMillis()
                      : (report.createdAt as number)
                  )}
                </Text>
              </YStack>

              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                  DESCRIPTION
                </Text>
                <Text color={colors.text} fontSize="$3" lineHeight={20}>
                  {report.description}
                </Text>
              </YStack>

              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                  LOCATION
                </Text>
                <Text color={colors.text} fontSize="$3">
                  {report.location}
                </Text>
              </YStack>

              {report.witnesses ? (
                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    WITNESSES
                  </Text>
                  <Text color={colors.text} fontSize="$3">
                    {report.witnesses}
                  </Text>
                </YStack>
              ) : null}

              {report.photoURL ? (
                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    PHOTO
                  </Text>
                  <Image
                    source={{ uri: report.photoURL }}
                    style={styles.photo}
                    resizeMode="contain"
                  />
                </YStack>
              ) : null}

              {isResponding ? (
                <YStack backgroundColor="#f39c1222" borderRadius="$3" padding="$3" gap="$2">
                  {responders.length > 0 ? (
                    responders.map((r) => (
                      <XStack key={r.uid} gap="$2" alignItems="center">
                        <Text fontSize={16}>🚨</Text>
                        <Text color={colors.text} fontSize="$3">
                          <Text fontWeight="700">{r.name}</Text> is on the way
                        </Text>
                      </XStack>
                    ))
                  ) : report.responderName ? (
                    <XStack gap="$2" alignItems="center">
                      <Text fontSize={16}>🚨</Text>
                      <Text color={colors.text} fontSize="$3">
                        <Text fontWeight="700">{report.responderName}</Text> is on the way
                      </Text>
                    </XStack>
                  ) : null}
                </YStack>
              ) : null}

              {isResolved && report.resolution ? (
                <YStack gap="$1">
                  <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                    RESOLUTION
                  </Text>
                  <Text color={colors.text} fontSize="$3" lineHeight={20}>
                    {report.resolution}
                  </Text>
                  <Text color={colors.textMuted} fontSize="$2">
                    Resolved: {formatTs(report.completedAt ?? 0)}
                  </Text>
                </YStack>
              ) : null}

              {canAct && !isResolved ? (
                <YStack gap="$2" marginTop="$1">
                  <Pressable onPress={handleMyWay} disabled={acting || iAmResponder}>
                    <XStack
                      backgroundColor={iAmResponder ? colors.surface : '#f39c12'}
                      borderRadius="$2"
                      paddingVertical="$3"
                      justifyContent="center"
                      opacity={acting ? 0.5 : 1}
                      borderWidth={iAmResponder ? 1 : 0}
                      borderColor={iAmResponder ? colors.border : 'transparent'}
                      gap="$2"
                      alignItems="center"
                    >
                      <Text
                        color={iAmResponder ? colors.textMuted : 'white'}
                        fontWeight="700"
                        fontSize="$3"
                      >
                        {iAmResponder ? '✓ On My Way' : '🚨 On My Way'}
                      </Text>
                    </XStack>
                  </Pressable>

                  {showResolveForm ? (
                    <YStack gap="$2">
                      <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                        RESOLUTION NOTES *
                      </Text>
                      <TextInput
                        style={[
                          styles.textarea,
                          {
                            color: colors.text,
                            borderColor: colors.border,
                            backgroundColor: colors.background,
                          },
                        ]}
                        value={resolution}
                        onChangeText={setResolution}
                        placeholder="Describe what was done to address the concern…"
                        placeholderTextColor={colors.textMuted}
                        multiline
                        numberOfLines={4}
                        autoFocus
                      />
                      <XStack gap="$2">
                        <Pressable
                          onPress={() => {
                            setShowResolveForm(false)
                            setResolution('')
                          }}
                          style={{ flex: 1 }}
                        >
                          <XStack
                            borderRadius="$2"
                            paddingVertical="$2"
                            justifyContent="center"
                            borderWidth={1}
                            borderColor={colors.border}
                          >
                            <Text color={colors.textMuted} fontSize="$3">
                              Cancel
                            </Text>
                          </XStack>
                        </Pressable>
                        <Pressable
                          onPress={handleResolve}
                          disabled={acting || !resolution.trim()}
                          style={{ flex: 2 }}
                        >
                          <XStack
                            backgroundColor="#27ae60"
                            borderRadius="$2"
                            paddingVertical="$2"
                            justifyContent="center"
                            opacity={acting || !resolution.trim() ? 0.5 : 1}
                          >
                            <Text color="white" fontWeight="700" fontSize="$3">
                              {acting ? 'Resolving…' : 'Confirm Resolved'}
                            </Text>
                          </XStack>
                        </Pressable>
                      </XStack>
                    </YStack>
                  ) : (
                    <Pressable onPress={() => setShowResolveForm(true)} disabled={acting}>
                      <XStack
                        backgroundColor="#27ae60"
                        borderRadius="$2"
                        paddingVertical="$3"
                        justifyContent="center"
                        opacity={acting ? 0.5 : 1}
                      >
                        <Text color="white" fontWeight="700" fontSize="$3">
                          ✓ Mark Resolved
                        </Text>
                      </XStack>
                    </Pressable>
                  )}
                </YStack>
              ) : null}
            </YStack>
          </ScrollView>
        </YStack>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: {
    width: '100%',
    height: 220,
    borderRadius: 8,
    backgroundColor: '#000',
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    minHeight: 90,
    textAlignVertical: 'top',
  },
})
