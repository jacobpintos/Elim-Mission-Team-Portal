import { config as baseConfig } from '@tamagui/config/v3'
import { createTamagui } from 'tamagui'

const config = createTamagui({
  ...baseConfig,
  // Themes are extended at runtime by src/theme/dynamicTheme.ts
})

export type AppConfig = typeof config
declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config
