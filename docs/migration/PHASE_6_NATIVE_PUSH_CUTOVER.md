# Phase 6 — Native Apps, Push Notifications & Cutover

**Scope**: Fill in the push notification stubs from Phase 1, build native iOS and
Android binaries with EAS Build, polish the PWA, run a performance pass, and
cut over the main domain from `index.html` to the Expo app.

**Pre-conditions**: Phases 1–5 complete. The following stubs exist and are called
but do nothing:
- `src/lib/notifications.ts` — `registerForPushNotifications()`, `persistPushToken()`, `unsubscribeFromPushTopic()`
- `functions/src/notify.ts` — `// PHASE 6 STUB: push branch` comment
- `app/(app)/profile.tsx` — push toggles disabled with "Soon" labels
- `eas.json` — already configured; has not been used to produce a build

**Important**: Read `mission-portal-app/AGENTS.md` and `mission-portal-app/CLAUDE.md`
before writing any code. They contain version-specific guidance.

---

## 1. New Packages to Install

Inside `mission-portal-app/`:

```bash
npx expo install expo-notifications expo-device
```

**Do NOT install `@react-native-firebase/messaging`** — we are using Expo's managed
`expo-notifications` which handles FCM tokens internally. The Firebase JS SDK v10
modular (already installed) handles Firestore/Auth; `expo-notifications` handles push.

In `functions/package.json` (no new packages needed — `firebase-admin` already
includes the Messaging SDK).

---

## 2. `app.config.ts` — Push Notification Plugin

Add `expo-notifications` to the `plugins` array and set notification asset config:

```typescript
// app.config.ts
plugins: [
  'expo-router',
  'expo-font',
  'expo-splash-screen',
  [
    'expo-notifications',
    {
      icon: './assets/notification-icon.png',  // 96×96 white-on-transparent PNG
      color: '#e8624a',
      sounds: [],
      iosDisplayInForeground: true,
    },
  ],
  [
    '@sentry/react-native/expo',
    {
      url: 'https://sentry.io/',
      organization: 'the-well-of-iowa',
      project: 'react-native',
    },
  ],
],
```

Also add `updates` config for EAS Update (OTA JS updates):

```typescript
updates: {
  url: `https://u.expo.dev/${process.env.EAS_PROJECT_ID ?? ''}`,
},
runtimeVersion: {
  policy: 'appVersion',
},
```

---

## 3. Push Notification Implementation

### 3.1 `src/lib/notifications.ts` (replace stubs)

```typescript
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import { Platform } from 'react-native'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from './firebase'

// Configure how notifications appear when the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

export async function registerForPushNotifications(): Promise<{
  token: string
  platform: 'ios' | 'android' | 'web'
} | null> {
  // Web: expo-notifications does not support web push in managed workflow
  if (Platform.OS === 'web') return null

  // Physical device only (simulators/emulators cannot receive push)
  if (!Device.isDevice) {
    console.warn('Push notifications require a physical device')
    return null
  }

  // Request permission
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }
  if (finalStatus !== 'granted') return null

  // Android: create notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    })
  }

  // Get Expo push token (wraps FCM/APNs token internally)
  const tokenData = await Notifications.getExpoPushTokenAsync()
  return {
    token: tokenData.data,
    platform: Platform.OS as 'ios' | 'android',
  }
}

export async function persistPushToken(
  uid: string,
  token: string,
  platform: 'ios' | 'android' | 'web',
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    [`pushTokens.${platform}`]: token,
  })
}

export async function clearPushToken(
  uid: string,
  platform: 'ios' | 'android' | 'web',
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    [`pushTokens.${platform}`]: null,
  })
}

export async function unsubscribeFromPushTopic(_topic: string): Promise<void> {
  // Expo push tokens don't use topics client-side — topics are managed server-side
  // via Firebase Admin SDK. This is a no-op on the client.
}

export function platformKey(): 'ios' | 'android' | 'web' {
  return Platform.OS === 'web' ? 'web' : (Platform.OS as 'ios' | 'android')
}
```

### 3.2 Wire registration into auth flow (`src/stores/authStore.ts`)

In the `signIn` success callback (or the `onAuthStateChanged` handler), after
writing the user profile, call:

```typescript
import { registerForPushNotifications, persistPushToken, platformKey } from '@/lib/notifications'

// After user profile is confirmed:
const pushResult = await registerForPushNotifications()
if (pushResult) {
  await persistPushToken(user.uid, pushResult.token, pushResult.platform)
}
```

On sign-out, clear the token:

```typescript
import { clearPushToken } from '@/lib/notifications'

// Before signing out:
const key = platformKey()
if (key !== 'web') {
  await clearPushToken(user.uid, key)
}
```

### 3.3 Listen for incoming notifications (`app/_layout.tsx`)

Add a notification listener at the root layout to handle taps on push
notifications and navigate to the relevant screen:

```typescript
import * as Notifications from 'expo-notifications'
import { useEffect, useRef } from 'react'
import { useRouter } from 'expo-router'

// Inside the root layout component:
const router = useRouter()
const notifListener = useRef<Notifications.EventSubscription>()
const responseListener = useRef<Notifications.EventSubscription>()

useEffect(() => {
  // Fires when a notification is received while app is foregrounded
  notifListener.current = Notifications.addNotificationReceivedListener((notification) => {
    console.log('Notification received:', notification)
  })

  // Fires when user taps a notification (foreground or background)
  responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { type?: string; link?: string }
    if (data.link) {
      router.push(data.link as any)
    }
  })

  return () => {
    notifListener.current?.remove()
    responseListener.current?.remove()
  }
}, [router])
```

---

## 4. Cloud Function — Push Branch

### 4.1 `functions/src/notify.ts` — fill in PHASE 6 STUB

Replace the comment with a real push send:

```typescript
// PHASE 6: push branch
if (prefs?.push && profile.pushTokens) {
  const tokens = Object.values(profile.pushTokens as Record<string, string | null>)
    .filter((t): t is string => typeof t === 'string' && t.length > 0)

  if (tokens.length > 0) {
    try {
      const messaging = admin.messaging()
      // sendEachForMulticast handles up to 500 tokens per call
      await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: subjectFor(type, data),
          body: inAppMessage(type, data),
        },
        data: {
          type,
          ...Object.fromEntries(
            Object.entries(data).map(([k, v]) => [k, String(v ?? '')])
          ),
        },
        apns: {
          payload: {
            aps: {
              badge: 1,
            },
          },
        },
      })
      logger.info(`Push sent to ${tokens.length} token(s) for uid=${uid} type=${type}`)
    } catch (err) {
      logger.error('Push send failed', err)
      // Don't throw — email already sent above; push failure is non-fatal
    }
  }
}
```

### 4.2 `functions/src/push/sendBroadcast.ts` (new file)

For global announcements — sends to ALL users with push enabled by using a
Cloud Messaging topic rather than iterating every token. Topic subscriptions
are managed separately when tokens are registered:

```typescript
import { onCall } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'
import { logger } from 'firebase-functions'

// Send a push notification to all non-public users (announcement broadcast)
export const broadcastAnnouncement = onCall(async (req) => {
  if (!req.auth?.token.admin) {
    throw new Error('admin-only')
  }

  const { title, body, link } = req.data as {
    title: string
    body: string
    link?: string
  }

  // Use topic messaging — all devices that have subscribed to 'announcements' topic
  await admin.messaging().send({
    topic: 'announcements',
    notification: { title, body },
    data: { type: 'announcement', link: link ?? '' },
    apns: { payload: { aps: { badge: 1 } } },
  })

  logger.info(`Broadcast announcement: "${title}"`)
  return { ok: true }
})
```

**Topic subscription**: When a user token is first registered (server-side
via a new `registerPushToken` callable function), subscribe the token to the
`announcements` topic:

```typescript
// functions/src/push/registerPushToken.ts
import { onCall } from 'firebase-functions/v2/https'
import * as admin from 'firebase-admin'

export const registerPushToken = onCall(async (req) => {
  if (!req.auth) throw new Error('unauthenticated')

  const { token, platform } = req.data as { token: string; platform: string }
  const uid = req.auth.uid

  // Save token to user doc
  await admin.firestore().doc(`users/${uid}`).update({
    [`pushTokens.${platform}`]: token,
  })

  // Subscribe to announcements topic (non-public users only)
  const userSnap = await admin.firestore().doc(`users/${uid}`).get()
  const roles: string[] = userSnap.data()?.roles ?? []
  if (!roles.includes('public')) {
    await admin.messaging().subscribeToTopic([token], 'announcements')
  }

  return { ok: true }
})
```

**Note**: Replace `persistPushToken` in `src/lib/notifications.ts` with a call
to this `registerPushToken` Cloud Function instead of writing directly to Firestore.
The function handles both the Firestore write AND the topic subscription atomically.

### 4.3 Update `functions/src/index.ts`

```typescript
export { sendNotification } from './notify'
export { sendContactForm } from './email/sendContactForm'
export { onUserDeleted } from './audit/onUserDeleted'
export { broadcastAnnouncement, registerPushToken } from './push/sendBroadcast'
// Phase 5 exports (if not already present):
export { weeklyDigest, monthlyDigest, sendDigestManual } from './digest'
export { resendWebhook } from './webhooks'
export { unsubscribe } from './unsubscribe'
export { createPortalUser } from './admin/createPortalUser'
```

---

## 5. Profile Screen — Enable Push Toggles

In `app/(app)/profile.tsx`, replace the disabled push toggle with a functional one:

**Remove** the "Coming soon" / `disabled` + `opacity={0.4}` implementation:

```tsx
// BEFORE (Phase 1 stub):
<YStack flex={1} alignItems="center" gap="$1">
  <Switch checked={prefs[key].push} disabled opacity={0.4} onCheckedChange={() => {}}>
    <Switch.Thumb />
  </Switch>
  <Text fontSize="$1" color="$colorMuted">Soon</Text>
</YStack>
```

**Replace with** a functional toggle:

```tsx
// AFTER (Phase 6):
const togglePushPref = async (key: NotifKey, value: boolean) => {
  const updated = {
    ...prefs,
    [key]: { ...prefs[key], push: value },
  }
  try {
    await updateDoc(doc(db, 'users', fbUser.uid), {
      notificationPrefs: updated,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update preferences'
    toast(message, 'error')
  }
}

// In the render:
<YStack flex={1} alignItems="center">
  <Switch
    checked={prefs[key].push}
    onCheckedChange={(v) => togglePushPref(key, v)}
  >
    <Switch.Thumb />
  </Switch>
</YStack>
```

Also remove the "Soon" label from the onboarding screen (`app/(onboarding)/index.tsx`)
if it references push notifications.

---

## 6. EAS Build

### 6.1 Pre-build checklist

Before running `eas build`, confirm:
- [ ] `EAS_PROJECT_ID` env var is set (from Expo dashboard)
- [ ] Apple Developer account with active membership (for iOS)
- [ ] Google Play Console account with app created (for Android)
- [ ] `assets/notification-icon.png` exists (96×96 white icon on transparent background)
- [ ] `assets/icon.png` exists (1024×1024)
- [ ] `assets/splash.png` exists (2048×2048 or `splash-icon.png` per Expo docs)
- [ ] `assets/adaptive-icon.png` exists (Android adaptive icon foreground)

### 6.2 iOS build

```bash
# From mission-portal-app/
eas build --platform ios --profile production
```

EAS will:
1. Prompt for or use stored Apple credentials (App Store Connect API key recommended)
2. Generate a provisioning profile and signing certificate automatically
3. Build and upload — produces a `.ipa` archived in EAS

**Info.plist additions** (add to `app.config.ts` `ios` section):

```typescript
ios: {
  supportsTablet: true,
  bundleIdentifier: 'com.elim.missionportal',
  infoPlist: {
    NSUserNotificationUsageDescription:
      'Mission Portal uses notifications to alert you about events, assignments, and messages.',
    NSPhotoLibraryUsageDescription:
      'Mission Portal needs photo library access to let you upload a profile photo.',
    NSCameraUsageDescription:
      'Mission Portal needs camera access to let you take a profile photo.',
  },
  // Privacy manifest (required for App Store Review as of May 2024):
  privacyManifests: {
    NSPrivacyAccessedAPITypes: [
      {
        NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults',
        NSPrivacyAccessedAPITypeReasons: ['CA92.1'],
      },
    ],
  },
},
```

### 6.3 iOS App Store submission

```bash
eas submit --platform ios --profile production
```

Requires App Store Connect API key (set `EXPO_APPLE_APP_SPECIFIC_PASSWORD` or
use `eas credentials`). Fill in App Store listing:
- App name: "Mission Portal – The Well of Iowa"
- Category: Business
- Age rating: 4+
- Privacy policy URL (create a simple one if none exists)

### 6.4 Android build

```bash
eas build --platform android --profile production
```

EAS manages the keystore automatically on first build. **Download and store
the keystore backup** from the EAS dashboard — losing it means you can never
update the app.

**`app.config.ts` Android additions**:

```typescript
android: {
  package: 'com.elim.missionportal',
  versionCode: 1,
  adaptiveIcon: {
    foregroundImage: './assets/adaptive-icon.png',
    backgroundColor: '#e8624a',
  },
  predictiveBackGestureEnabled: false,
  googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
  permissions: [
    'android.permission.RECEIVE_BOOT_COMPLETED',
    'android.permission.VIBRATE',
  ],
},
```

**`google-services.json`**: Download from Firebase console → Project Settings →
Your Android app → Download `google-services.json`. Store it as an EAS secret:

```bash
eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type file --value google-services.json
```

### 6.5 Android Play Store submission

```bash
eas submit --platform android --profile production
```

Requires a Google Play service account key. Set `EXPO_GOOGLE_PLAY_JSON_KEY_PATH`
or use `eas credentials`.

---

## 7. EAS Update (OTA JS Updates)

After any JS-only change (no native module changes), ship without App Store review:

```bash
eas update --channel production --message "Fix: <describe change>"
```

This publishes an OTA update. The app checks for updates on launch (configured
by `updates.url` in `app.config.ts`).

**When OTA is safe**: any change that does not add or remove native modules,
does not change `app.config.ts` native settings, does not change native Expo
SDK versions.

**When a full build is required**: adding a new Expo SDK package with native
code, changing `ios.infoPlist`, changing bundle identifier or package name,
updating Expo SDK major version.

---

## 8. PWA Polish

Expo SDK 56 generates a web manifest automatically. Ensure these fields are
set in `app.config.ts`:

```typescript
web: {
  bundler: 'metro',
  output: 'static',
  favicon: './assets/favicon.png',
  themeColor: '#e8624a',
  backgroundColor: '#14141e',
  name: 'Mission Portal',
  shortName: 'Portal',
  display: 'standalone',
  startUrl: '/',
  orientation: 'portrait',
  description: 'The Well of Iowa Mission Team Portal',
},
```

**Install prompt** (web only, gated by `Platform.OS === 'web'`):

Add a `useBeforeInstallPrompt` hook that listens for the browser's
`beforeinstallprompt` event and surfaces an "Add to Home Screen" banner
on the dashboard screen. This only fires on Chrome/Edge Android and some
desktop browsers.

```typescript
// src/lib/pwaInstall.ts
import { useEffect, useState } from 'react'
import { Platform } from 'react-native'

export function usePWAInstallPrompt() {
  const [prompt, setPrompt] = useState<any>(null)

  useEffect(() => {
    if (Platform.OS !== 'web') return
    const handler = (e: any) => { e.preventDefault(); setPrompt(e) }
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
```

Show the install banner in `app/(app)/dashboard.tsx` only when `canInstall`
is true.

---

## 9. Performance Pass

### 9.1 Bundle budget

Target: **initial web bundle ≤ 200 KB compressed** (per OVERVIEW.md §7).

Check current bundle size:
```bash
npx expo export --platform web
# Then inspect dist/_expo/static/js/ — sum the main chunk sizes
```

If over budget, apply in order:
1. **Lazy-load the planning board** — `const PlanningBoard = lazy(() => import('@/features/planning-board/PlanningBoardCanvas'))`
2. **Lazy-load the page builder** — same pattern for BlockPalette + all BlockEditor/* components
3. **Lazy-load PDF export** — wrap `expo-print` calls in a dynamic import
4. **Check for accidental full-library imports** — e.g. `import _ from 'lodash'` vs named imports

### 9.2 Lighthouse in CI

The CI workflow from Phase 1 already checks the bundle. Verify `/.github/workflows/ci.yml`
has a step like:

```yaml
- name: Bundle size check
  run: |
    npx expo export --platform web --output-dir dist 2>&1 | tail -5
    BUNDLE_SIZE=$(find dist/_expo/static/js -name "*.js" | head -1 | xargs wc -c | awk '{print $1}')
    echo "Main bundle: ${BUNDLE_SIZE} bytes"
    if [ "$BUNDLE_SIZE" -gt 204800 ]; then
      echo "::error::Bundle exceeds 200 KB limit"
      exit 1
    fi
```

### 9.3 Flash list verification

Every long list screen (Events, Tasks, Messages, Users, Audit) should already
use `@shopify/flash-list`. Verify no screen uses `FlatList` from `react-native`
directly — replace any found with `FlashList`.

### 9.4 Image optimization

All images displayed from Firestore URLs should use `expo-image` (already
installed as `expo-image`), not React Native's `<Image>` — `expo-image` handles
caching, blurhash placeholders, and format negotiation.

---

## 10. Cutover from `index.html`

### 10.1 Firebase Hosting config (`firebase.json`)

After Expo web export:

```json
{
  "hosting": [
    {
      "target": "production",
      "public": "mission-portal-app/dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }],
      "headers": [
        {
          "source": "**/*.@(js|css)",
          "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
        },
        {
          "source": "**",
          "headers": [{ "key": "Cache-Control", "value": "no-cache" }]
        }
      ]
    },
    {
      "target": "legacy",
      "public": "legacy",
      "ignore": ["firebase.json", "**/.*"],
      "headers": [
        {
          "source": "**",
          "headers": [{ "key": "X-Robots-Tag", "value": "noindex" }]
        }
      ]
    }
  ]
}
```

### 10.2 Legacy archive steps

1. Create a `legacy/` directory at the repo root
2. Copy `index.html`, `js/`, and any assets into `legacy/`
3. Add a banner to `legacy/index.html`:
   ```html
   <div style="background:#e8624a;color:#fff;text-align:center;padding:8px;font-family:sans-serif;font-size:13px">
     This is an archived version. 
     <a href="https://portal.thewellofiowa.com" style="color:#fff;font-weight:700">Use the new app →</a>
   </div>
   ```
4. Point the `legacy` Firebase Hosting target at `legacy.portal.thewellofiowa.com` (or similar subdomain)
5. After 30 days, redirect legacy subdomain to the production app

### 10.3 Cutover sequence

```bash
# 1. Build and export the web app
cd mission-portal-app
npx expo export --platform web

# 2. Deploy to Firebase Hosting production target
firebase deploy --only hosting:production

# 3. Test the production URL
# 4. If all good, remove the old hosting rule pointing to index.html

# 5. Deploy legacy archive
firebase deploy --only hosting:legacy
```

---

## 11. Firestore Security Rules Update

Add a rule allowing push token writes from authenticated users only:

```javascript
// users/{uid} — allow user to update their own pushTokens
match /users/{uid} {
  allow read: if request.auth != null;
  allow update: if request.auth.uid == uid
    || get(/databases/$(database)/documents/users/$(request.auth.uid))
         .data.roles.hasAny(['admin']);
}
```

(This should already exist from Phase 1; confirm `pushTokens.*` fields are
not blocked by an overly restrictive rule.)

---

## 12. Acceptance Criteria

### Push Notifications
- [ ] AC-01: On first launch on a physical iOS device, the system permission prompt appears.
- [ ] AC-02: On first launch on a physical Android device, the notification permission is granted silently (Android 12 and below) or prompts the user (Android 13+).
- [ ] AC-03: After permission grant, the Expo push token is written to `users/{uid}.pushTokens.{platform}`.
- [ ] AC-04: Push tokens are removed from Firestore on sign-out.
- [ ] AC-05: A notification sent via `sendNotification` Cloud Function with `prefs.push: true` delivers a visible push notification to the target user's device within 30 seconds.
- [ ] AC-06: Tapping a push notification that includes a `link` field navigates the user to that screen.
- [ ] AC-07: Push toggle in profile screen is no longer disabled — toggling saves to `notificationPrefs[key].push`.
- [ ] AC-08: "Soon" badge is removed from all push toggle UI elements.
- [ ] AC-09: `broadcastAnnouncement` callable function sends to all subscribed devices via `announcements` topic.
- [ ] AC-10: `registerPushToken` callable subscribes the token to the `announcements` topic for non-public users.

### EAS Build — iOS
- [ ] AC-11: `eas build --platform ios --profile production` completes without errors.
- [ ] AC-12: Resulting `.ipa` can be submitted to App Store Connect via `eas submit`.
- [ ] AC-13: Push notifications work on a TestFlight build (not just a simulator).
- [ ] AC-14: `NSUserNotificationUsageDescription` is present in Info.plist.

### EAS Build — Android
- [ ] AC-15: `eas build --platform android --profile production` completes without errors.
- [ ] AC-16: Resulting `.aab` can be submitted to Play Store via `eas submit`.
- [ ] AC-17: Push notifications work on a physical Android device from the signed build.
- [ ] AC-18: Keystore backup is downloaded and stored securely.

### EAS Update
- [ ] AC-19: `eas update --channel production` successfully publishes an OTA update.
- [ ] AC-20: A running production app picks up the OTA update on next launch.

### PWA
- [ ] AC-21: Chrome on Android shows the "Add to Home Screen" banner when `canInstall` is true.
- [ ] AC-22: Web app manifest has `name`, `short_name`, `theme_color`, `display: standalone`.
- [ ] AC-23: The installed PWA opens without browser chrome.

### Performance
- [ ] AC-24: Initial web bundle (largest single JS chunk) is ≤ 200 KB compressed.
- [ ] AC-25: Planning board component is lazy-loaded (not in the initial bundle).
- [ ] AC-26: No `FlatList` from `react-native` is used in any long-list screen.

### Cutover
- [ ] AC-27: Firebase Hosting `production` target serves `mission-portal-app/dist`.
- [ ] AC-28: The old `index.html` is accessible at the `legacy` subdomain.
- [ ] AC-29: Legacy page displays a banner linking to the new app.
- [ ] AC-30: All existing deep links (`mission://` scheme) resolve correctly in the native apps.

---

## 13. Common Pitfalls

1. **`expo-notifications` on simulator**: Push tokens cannot be obtained on iOS
   simulators. `registerForPushNotifications()` correctly returns `null` when
   `!Device.isDevice`. Do not throw an error — treat a null token as "push not
   available" and skip `persistPushToken`.

2. **FCM vs APNs tokens**: `Notifications.getExpoPushTokenAsync()` returns an
   Expo-wrapped token (e.g. `ExponentPushToken[...]`). This is NOT the raw FCM/APNs
   token. The Admin SDK's `sendEachForMulticast` accepts raw FCM tokens, not Expo
   tokens. **You must use the Expo Push API OR convert to native FCM tokens**.
   
   **Recommended approach**: Use the [Expo Push API](https://docs.expo.dev/push-notifications/sending-notifications/)
   from the Cloud Function instead of `admin.messaging()` directly:

   ```typescript
   // functions/src/push/expoPush.ts
   import fetch from 'node-fetch'

   export async function sendExpoPush(tokens: string[], title: string, body: string, data: object) {
     const messages = tokens
       .filter((t) => t.startsWith('ExponentPushToken'))
       .map((to) => ({ to, title, body, data, sound: 'default', badge: 1 }))
     if (!messages.length) return

     const response = await fetch('https://exp.host/--/api/v2/push/send', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(messages),
     })
     const result = await response.json() as any
     if (result.errors) {
       console.error('Expo push errors:', result.errors)
     }
   }
   ```

   Replace the `admin.messaging().sendEachForMulticast(...)` call in `notify.ts`
   with `sendExpoPush(tokens, title, body, data)`.

3. **EAS `GOOGLE_SERVICES_JSON` secret**: The value must be the file contents
   (not the file path). Store it as a secret, not an env var, and reference it
   with `process.env.GOOGLE_SERVICES_JSON` in `app.config.ts`.

4. **OTA update runtime version**: The `runtimeVersion.policy: 'appVersion'`
   in `app.config.ts` ties OTA updates to the `version` field. Increment
   `version` (e.g. `1.0.1`) with every full build; leave it unchanged for
   OTA-only updates. Mismatched runtime versions cause OTA updates to be ignored.

5. **Topic subscription idempotency**: `subscribeToTopic` is idempotent — calling
   it multiple times for the same token+topic is safe and will not create
   duplicate subscriptions.

6. **`broadcastAnnouncement` vs `sendNotification`**: The announce screen in
   Phase 3 currently calls `sendNotification` for each user individually.
   Update it to call `broadcastAnnouncement` for the push channel
   (and keep `sendNotification` for the in-app + email channels). This reduces
   invocations from N → 1 for push.

7. **Privacy manifest**: Apple requires a `NSPrivacyManifests` entry for apps
   using `NSUserDefaults` (which Expo uses internally for persisted state).
   The `privacyManifests` config in `app.config.ts` above handles this.
   Missing it will cause App Store review rejection.

8. **Cutover timing**: Do the cutover during a low-traffic window (e.g. Monday
   morning before Sunday service). Have the legacy archive deployed first so
   rollback is instant if needed.

---

## 14. Handoff Checklist for Implementation Session

Before starting Phase 6:

- [ ] An Apple Developer account with active membership is available.
- [ ] A Google Play Console account with an app created at `com.elim.missionportal` is available.
- [ ] EAS CLI is installed and logged in: `npm install -g eas-cli && eas login`
- [ ] `EAS_PROJECT_ID` is obtained from the Expo dashboard and available as an env var.
- [ ] `google-services.json` is downloaded from Firebase console and available locally.
- [ ] A physical iOS or Android device is available for push notification testing.
- [ ] `assets/notification-icon.png` (96×96 white on transparent) has been created.
- [ ] Phases 1–5 are fully implemented and committed on `claude/backup-reset-e7b22b9-SUHKv`.
- [ ] All Cloud Functions from Phases 1–5 are deployed (`firebase deploy --only functions`).
- [ ] RESEND_API_KEY, UNSUBSCRIBE_HMAC_SECRET, and RESEND_WEBHOOK_SECRET are set as Firebase secrets.
- [ ] The domain `portal.thewellofiowa.com` (or equivalent) DNS is pointing to Firebase Hosting.
