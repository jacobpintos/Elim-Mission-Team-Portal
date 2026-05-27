import type { ExpoConfig, ConfigContext } from 'expo/config'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Mission Portal',
  slug: 'mission-portal-app',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'com.elim.missionportal',
  },
  android: {
    package: 'com.elim.missionportal',
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#e8624a',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: 'metro',
    output: 'static',
    favicon: './assets/favicon.png',
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-splash-screen',
    [
      '@sentry/react-native/expo',
      {
        url: 'https://sentry.io/',
        organization: 'the-well-of-iowa',
        project: 'react-native',
      },
    ],
  ],
  scheme: 'mission',
  extra: {
    eas: {
      projectId: process.env.EAS_PROJECT_ID,
    },
  },
})
