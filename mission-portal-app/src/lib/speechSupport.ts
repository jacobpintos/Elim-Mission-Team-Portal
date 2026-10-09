import { Platform } from 'react-native'
import { getNetworkStateAsync } from 'expo-network'
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition'

/**
 * Whether speech can be turned into text on this phone, without sending it
 * anywhere. iPhones (and newer Android phones) can for many languages; a
 * browser cannot.
 */
export function canRecogniseOnDevice(): boolean {
  if (Platform.OS === 'web') return false
  try {
    return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()
  } catch {
    return false
  }
}

/** Whether there is no internet to send speech to — an auditorium with no signal. */
export async function isOffline(): Promise<boolean> {
  try {
    const state = await getNetworkStateAsync()
    return state.isConnected === false || state.isInternetReachable === false
  } catch {
    return false
  }
}
