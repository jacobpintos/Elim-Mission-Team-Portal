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
  KeyboardAvoidingView,
} from 'react-native'
import { YStack, XStack, Text } from 'tamagui'
import { useThemeColors } from '@/theme/useThemeColors'
import { uriToBlob } from '@/lib/uriToBlob'

export interface ReportPhoto {
  /** A web `File` or, on native, a Blob read back off the picked file's URI. */
  blob: Blob
  /** The Storage rule requires image/*, which a native Blob may not carry. */
  contentType: string
}

interface ReportFormModalProps {
  visible: boolean
  onClose: () => void
  onSubmit: (data: {
    description: string
    location: string
    witnesses: string
    photo: ReportPhoto | null
  }) => Promise<void>
}

export function ReportFormModal({ visible, onClose, onSubmit }: ReportFormModalProps) {
  const colors = useThemeColors()
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [witnesses, setWitnesses] = useState('')
  const [photo, setPhoto] = useState<ReportPhoto | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const reset = () => {
    setDescription('')
    setLocation('')
    setWitnesses('')
    setPhoto(null)
    setPhotoPreview(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  // Was web-only, which left the picker below rendered but inert on iOS and
  // Android — tapping it did nothing at all.
  const pickPhoto = async () => {
    if (Platform.OS === 'web') {
      fileInputRef.current?.click()
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ImagePicker = require('expo-image-picker')
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      setPhotoError('Enable photo access for Mission Portal in your device settings')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.6,
    })
    if (result.canceled) return
    const asset = result.assets?.[0]
    if (!asset?.uri) return

    try {
      setPhoto({
        blob: await uriToBlob(asset.uri),
        contentType: asset.mimeType ?? 'image/jpeg',
      })
      setPhotoPreview(asset.uri)
      setPhotoError(null)
    } catch (err: unknown) {
      setPhotoError(err instanceof Error ? err.message : 'Could not attach that photo')
    }
  }

  const handleFileChange = (e: Event) => {
    const target = e.target as HTMLInputElement
    const file = target.files?.[0]
    if (!file) return
    setPhoto({ blob: file, contentType: file.type || 'image/jpeg' })
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
        photo,
      })
      reset()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      {/* The card is vertically centered in the overlay, so on iOS the
          keyboard covered the lower fields and the Submit button with no way
          to scroll to them. Lifting the overlay keeps them reachable. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
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
                          setPhoto(null)
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
                  {photoError ? (
                    <Text color="#c0392b" fontSize="$2">
                      {photoError}
                    </Text>
                  ) : null}
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
      </KeyboardAvoidingView>

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
