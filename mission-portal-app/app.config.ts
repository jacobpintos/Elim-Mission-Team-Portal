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
    config: {
      usesNonExemptEncryption: false,
    },
    entitlements: {
      // Lets a notification marked time-sensitive break through Focus modes
      // and Do Not Disturb. Used for one thing only — a security incident
      // report reaching the people who answer them — and switchable off per
      // user in Settings.
      //
      // Freely available, unlike the critical-alerts entitlement, which is the
      // only way to override the physical silent switch and is granted by
      // Apple case by case on request.
      'com.apple.developer.usernotifications.time-sensitive': true,
    },
    infoPlist: {
      // Declares the app uses no non-exempt encryption, so App Store Connect
      // stops asking the export-compliance question on every submission.
      ITSAppUsesNonExemptEncryption: false,
      // Every route that reaches the photo library has to be named here.
      // Security reports attach a photo of the incident, and leaving that out
      // describes less than the app actually does with the permission.
      NSPhotoLibraryUsageDescription:
        'Mission Portal needs photo library access to let you upload a profile photo, share images in team chats, and attach a photo to a security report.',
      NSCameraUsageDescription:
        'Mission Portal needs camera access to let you take a profile photo.',
    },
    privacyManifests: {
      NSPrivacyAccessedAPITypes: [
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
          NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp',
          NSPrivacyAccessedAPITypeReasons: ['C617.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace',
          NSPrivacyAccessedAPITypeReasons: ['E174.1'],
        },
        {
          NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime',
          NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
        },
      ],
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      // Must stay in sync with the App Privacy answers in App Store Connect.
      NSPrivacyCollectedDataTypes: [
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeEmailAddress',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeName',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypePhotosorVideos',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeUserContent',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeCoarseLocation',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeCrashData',
          NSPrivacyCollectedDataTypeLinked: false,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAnalytics'],
        },
      ],
    },
  },
  android: {
    package: 'com.elim.missionportal',
    versionCode: 1,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    predictiveBackGestureEnabled: false,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
    permissions: ['android.permission.RECEIVE_BOOT_COMPLETED', 'android.permission.VIBRATE'],
  },
  web: {
    bundler: 'metro',
    output: 'single',
    favicon: './assets/favicon.png',
    themeColor: '#f56c5a',
    backgroundColor: '#14141e',
    name: 'Mission Portal',
    shortName: 'Portal',
    display: 'standalone',
    startUrl: '/',
    orientation: 'portrait',
    description: 'The Well of Iowa Mission Team Portal',
  },
  plugins: [
    'expo-router',
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 220,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
      },
    ],
    [
      'expo-notifications',
      {
        icon: './assets/notification-icon.png',
        color: '#f56c5a',
        sounds: [],
        iosDisplayInForeground: true,
      },
    ],
  ],
  scheme: 'mission',
  extra: {
    eas: {
      // eas.json exports EAS_PROJECT_ID during `eas build`, but nothing sets
      // it for `eas submit` — fall back to the literal ID so submit can
      // resolve which EAS project this is without that env var.
      projectId: process.env.EAS_PROJECT_ID ?? '79c8ec55-2787-4ed3-8813-2ed6758f9065',
    },
  },
})
