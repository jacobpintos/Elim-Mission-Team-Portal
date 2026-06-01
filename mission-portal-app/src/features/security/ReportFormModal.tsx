import { useState, useRef } from 'react'
import {
  Modal,
  View,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Image,
  Platform,
} from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'

interface ReportFormModalProps {
  visible: boolean
  onClose: () => void
  onSubmit: (data: {
    description: string
    location: string
    witnesses: string
    photoFile: File | null
  }) => Promise<void>
}

export function ReportFormModal({ visible, onClose, onSubmit }: ReportFormModalProps) {
  const colors = useThemeColors()
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [witnesses, setWitnesses] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const reset = () => {
    setDescription('')
    setLocation('')
    setWitnesses('')
    setPhotoFile(null)
    setPhotoPreview(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const pickPhoto = () => {
    if (Platform.OS === 'web') {
      fileInputRef.current?.click()
    }
  }

  const handleFileChange = (e: Event) => {
    const target = e.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    const url = URL.createObjectURL(file)
    setPhotoPreview(url)
    target.value = ''
  }

  const handleSubmit = async () => {
    if (!description.trim() || !location.trim()) return
    setSubmitting(true)
    try {
      await onSubmit({
        description: description.trim(),
        location: location.trim(),
        witnesses: witnesses.trim(),
        photoFile,
      })
      reset()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
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
            <Text color={colors.text} fontSize="$5" fontWeight="700">
              Report Security Concern
            </Text>
            <Pressable onPress={handleClose}>
              <Text color={colors.textMuted} fontSize="$4">
                ✕
              </Text>
            </Pressable>
          </XStack>

          <ScrollView showsVerticalScrollIndicator={false}>
            <YStack gap="$3">
              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                  DESCRIPTION *
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
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Describe the security concern in detail…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={4}
                />
              </YStack>

              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                  LOCATION *
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
                  value={location}
                  onChangeText={setLocation}
                  placeholder="Where did this occur?"
                  placeholderTextColor={colors.textMuted}
                />
              </YStack>

              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                  WITNESSES (optional)
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
                  value={witnesses}
                  onChangeText={setWitnesses}
                  placeholder="Names of any witnesses…"
                  placeholderTextColor={colors.textMuted}
                  multiline
                  numberOfLines={2}
                />
              </YStack>

              <YStack gap="$1">
                <Text color={colors.textMuted} fontSize="$2" fontWeight="600">
                  PHOTO (optional)
                </Text>
                {photoPreview ? (
                  <YStack gap="$2">
                    <Image
                      source={{ uri: photoPreview }}
                      style={styles.preview}
                      resizeMode="cover"
                    />
                    <Pressable
                      onPress={() => {
                        setPhotoFile(null)
                        setPhotoPreview(null)
                      }}
                    >
                      <Text color="#c0392b" fontSize="$2">
                        ✕ Remove photo
                      </Text>
                    </Pressable>
                  </YStack>
                ) : (
                  <Pressable onPress={pickPhoto}>
                    <XStack
                      backgroundColor={colors.background}
                      borderRadius="$2"
                      borderWidth={1}
                      borderColor={colors.border}
                      borderStyle="dashed"
                      paddingVertical="$4"
                      justifyContent="center"
                      alignItems="center"
                      gap="$2"
                    >
                      <Text color={colors.textMuted} fontSize="$3">
                        📷 Attach a photo
                      </Text>
                    </XStack>
                  </Pressable>
                )}
              </YStack>

              <Pressable
                onPress={handleSubmit}
                disabled={submitting || !description.trim() || !location.trim()}
              >
                <XStack
                  backgroundColor="#c0392b"
                  borderRadius="$2"
                  paddingVertical="$3"
                  justifyContent="center"
                  opacity={submitting || !description.trim() || !location.trim() ? 0.5 : 1}
                >
                  <Text color="white" fontWeight="700" fontSize="$3">
                    {submitting ? 'Submitting…' : 'Submit Report'}
                  </Text>
                </XStack>
              </Pressable>
            </YStack>
          </ScrollView>
        </YStack>
      </View>

      {Platform.OS === 'web' ? (
        <input
          ref={(el) => {
            fileInputRef.current = el
            if (el) el.onchange = handleFileChange
          }}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
        />
      ) : null}
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
    minHeight: 90,
    textAlignVertical: 'top',
  },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
  },
})
