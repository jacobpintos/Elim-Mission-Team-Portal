import { useEffect, useState } from 'react'
import { Platform } from 'react-native'

export function usePWAInstallPrompt() {
  const [prompt, setPrompt] = useState<any>(null)

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const handler = (e: any) => {
      e.preventDefault()
      setPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = async () => {
    if (!prompt) return
    prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') setPrompt(null)
  }

  return { canInstall: !!prompt, install }
}
