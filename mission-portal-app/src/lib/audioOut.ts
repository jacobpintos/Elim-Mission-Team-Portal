import { Platform } from 'react-native'
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition'
import { speechFree } from './speechOwner'

/**
 * The iPhone's sound, made ready for Miriam's chime and voice, at full
 * volume and out of the speaker even with the ringer switched off.
 *
 * Left alone, a sound plays however the app's audio was last set: as an
 * app starts, silenced by the ringer switch; after listening (for "Hey
 * Miriam", or a request), as a call, quiet. Not while something is
 * listening: changing it then would cut that listening off.
 */
export function readySpeaker(): void {
  if (Platform.OS !== 'ios' || !speechFree()) return
  try {
    ExpoSpeechRecognitionModule.setCategoryIOS({
      category: 'playAndRecord',
      categoryOptions: ['defaultToSpeaker', 'allowBluetooth', 'duckOthers'],
      mode: 'default',
    })
    ExpoSpeechRecognitionModule.setAudioSessionActiveIOS(true)
  } catch {
    // Played as it is, then.
  }
}
