# Phase 1 — Foundation (Implementation Brief)

> **Read this entire document before writing any code.** Then refer back to
> `OVERVIEW.md` for cross-section context. The architecture decisions in
> `OVERVIEW.md` are **locked** — do not redesign them. If a decision in this
> brief seems wrong, surface it to the user as a question before deviating.

## Mission

Stand up the foundation of the new Expo Mission Portal app so that:

1. A new user can register, complete onboarding, log in, log out, and reset
   their password.
2. The app boots into a role-gated tab shell with placeholder routes for every
   future feature.
3. Tamagui renders with a **dynamic** color palette driven by a Firestore
   `appSettings/theme` document — editing that doc live re-skins all connected
   clients.
4. Notification preferences are visible in the user profile (push toggles show
   "Coming soon").
5. `sendNotification(uid, type, payload)` Cloud Function exists, sends email
   via Resend, and is callable from app code (even though almost nothing calls
   it yet in phase 1).
6. Sentry + Crashlytics + Firebase Performance Monitoring all capture errors
   in development.
7. EAS Build profiles work for preview/staging/production.
8. CI runs typecheck, lint, and a Lighthouse bundle-size budget check on every
   PR.

**Phase 1 ships zero feature screens.** Every tab in the navigation shell is
a placeholder. Phase 2 fills in `dashboard`, `events`, etc.

---

## Prerequisites

The user must have these set up before you begin (ask if unclear):

1. **Node.js 20 LTS** installed
2. **Expo account** (free) — for EAS Build later
3. **Firebase project** for the new app — can be the same project as the
   existing app or a separate one (recommend separate Firebase project for the
   new app during dev to avoid polluting prod data; cutover swaps to prod
   project)
4. **Firebase Blaze plan** enabled (required for Cloud Functions)
5. **Resend account** with API key (free tier is fine)
6. **Sentry project** (free tier)
7. **GitHub repository** (already exists — `jacobpintos/Elim-Mission-Team-Portal`)

Environment variables the user will provide:

```
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_SENTRY_DSN=...

# Cloud Functions secrets (set via `firebase functions:secrets:set`)
RESEND_API_KEY=...
```

Do not commit any of these values. `.env` and `.env.local` go in
`.gitignore`. Use `EXPO_PUBLIC_` prefix for values the client needs.

---

## Step 0 — Repository hygiene

The Expo project lives in `mission-portal-app/` inside this repo. The old
`index.html` + `js/` files at root stay untouched during phase 1–5 and are
retired at phase 6 cutover.

```
/Elim-Mission-Team-Portal
├── index.html              # legacy, untouched
├── js/                     # legacy, untouched
├── docs/migration/         # this brief and overview
└── mission-portal-app/     # NEW — everything below
```

Add to root `.gitignore` (create the file if it doesn't exist):

```
node_modules/
.expo/
.env
.env.local
dist/
web-build/
ios/Pods/
android/.gradle/
*.log
.DS_Store
.superpowers/
```

---

## Step 1 — Bootstrap the Expo project

From the repo root:

```bash
npx create-expo-app@latest mission-portal-app --template blank-typescript
cd mission-portal-app
```

Then enable Expo Router and bare typescript strict mode:

```bash
npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar
```

Replace the generated `App.tsx`/`index.ts` entrypoint with Expo Router's:

```json
// package.json — add this top-level key
"main": "expo-router/entry"
```

Set `tsconfig.json` to `strict: true` and add path aliases:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@app/*": ["app/*"]
    }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

---

## Step 2 — Install dependencies

Run all installs in one block:

```bash
npx expo install \
  expo-router expo-linking expo-constants \
  expo-status-bar expo-system-ui expo-font expo-splash-screen \
  expo-image expo-image-picker expo-document-picker \
  expo-file-system expo-sharing expo-clipboard expo-print \
  expo-secure-store \
  react-native-safe-area-context react-native-screens \
  react-native-gesture-handler react-native-reanimated \
  react-native-svg \
  @react-native-async-storage/async-storage \
  @react-native-community/datetimepicker

npm install \
  firebase \
  zustand \
  @tanstack/react-query \
  react-hook-form zod @hookform/resolvers \
  tamagui @tamagui/config @tamagui/lucide-icons \
  @shopify/flash-list \
  date-fns \
  react-colorful \
  @sentry/react-native

npm install -D \
  typescript @types/react \
  eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin \
  eslint-config-expo prettier eslint-plugin-prettier eslint-config-prettier \
  @tamagui/babel-plugin
```

**Pin versions** before committing — run `npm ls --depth=0` and verify there
are no peer dependency warnings. If there are, resolve them before moving on.

---

## Step 3 — Tamagui setup

Create `mission-portal-app/tamagui.config.ts`:

```ts
import { config as baseConfig } from '@tamagui/config/v3'
import { createTamagui } from 'tamagui'

const config = createTamagui({
  ...baseConfig,
  // Themes are extended at runtime by src/theme/dynamicTheme.ts
})

export type AppConfig = typeof config
declare module 'tamagui' {
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config
```

Add the Tamagui Babel plugin and Reanimated plugin to `babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        '@tamagui/babel-plugin',
        {
          components: ['tamagui'],
          config: './tamagui.config.ts',
          logTimings: true,
        },
      ],
      'react-native-reanimated/plugin', // must be last
    ],
  }
}
```

---

## Step 4 — Theme engine (dynamic, runtime-swappable)

This is the most important piece of phase 1 because **every component built
afterward must use dynamic theme tokens**. Get this right first.

### Schema

`appSettings/theme` Firestore document:

```ts
// src/types/theme.ts
export interface ThemeDoc {
  primary: string             // e.g. "#e8624a"
  primaryDark: string         // computed or admin-set
  accent: string              // computed or admin-set
  dark: {
    background: string
    surface: string
    text: string
    textMuted: string
    border: string
  }
  light: {
    background: string
    surface: string
    text: string
    textMuted: string
    border: string
  }
  // Admin override; if null, derived from luminance
  onPrimaryOverride: string | null
  updatedAt: number
  updatedBy: string
}
```

### Files to create

`src/theme/defaults.ts` — hardcoded fallback values used if Firestore doc
missing or before first load.

`src/theme/contrast.ts`:

```ts
// WCAG 2.1 relative luminance
function srgbToLinear(c: number): number {
  c = c / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
}

export function autoTextColor(bg: string): '#ffffff' | '#1a1a2e' {
  return luminance(bg) > 0.5 ? '#1a1a2e' : '#ffffff'
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}
```

`src/stores/themeStore.ts` — Zustand store with Firestore subscription:

```ts
import { create } from 'zustand'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { defaults } from '@/theme/defaults'
import { autoTextColor } from '@/theme/contrast'
import type { ThemeDoc } from '@/types/theme'

type Mode = 'dark' | 'light'

interface ThemeStore {
  theme: ThemeDoc
  mode: Mode
  loading: boolean
  _unsub: (() => void) | null
  subscribe: () => void
  unsubscribe: () => void
  setMode: (mode: Mode) => void
  publishTheme: (patch: Partial<ThemeDoc>, uid: string) => Promise<void>
  onPrimary: () => string
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: defaults,
  mode: 'dark',
  loading: true,
  _unsub: null,

  subscribe: () => {
    if (get()._unsub) return
    const unsub = onSnapshot(doc(db, 'appSettings', 'theme'), (snap) => {
      const data = (snap.data() as ThemeDoc | undefined) ?? defaults
      set({ theme: data, loading: false })
    })
    set({ _unsub: unsub })
  },

  unsubscribe: () => {
    get()._unsub?.()
    set({ _unsub: null })
  },

  setMode: (mode) => set({ mode }),

  publishTheme: async (patch, uid) => {
    await setDoc(
      doc(db, 'appSettings', 'theme'),
      { ...patch, updatedAt: serverTimestamp(), updatedBy: uid },
      { merge: true }
    )
  },

  onPrimary: () => {
    const t = get().theme
    return t.onPrimaryOverride ?? autoTextColor(t.primary)
  },
}))
```

`src/theme/DynamicThemeProvider.tsx`:

```tsx
import { useEffect, useMemo } from 'react'
import { TamaguiProvider, createTheme } from 'tamagui'
import config from '../../tamagui.config'
import { useThemeStore } from '@/stores/themeStore'

export function DynamicThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, mode, subscribe, unsubscribe } = useThemeStore()
  useEffect(() => {
    subscribe()
    return () => unsubscribe()
  }, [])

  const dynamicConfig = useMemo(() => {
    // Build per-mode theme using the live Firestore values
    const palette = mode === 'dark' ? theme.dark : theme.light
    const dynamicThemes = {
      ...config.themes,
      dark: { ...config.themes.dark, ...palette, primary: theme.primary, accent: theme.accent },
      light: { ...config.themes.light, ...palette, primary: theme.primary, accent: theme.accent },
    }
    return { ...config, themes: dynamicThemes }
  }, [theme, mode])

  return (
    <TamaguiProvider config={dynamicConfig} defaultTheme={mode}>
      {children}
    </TamaguiProvider>
  )
}
```

**Acceptance check:** open Firebase console → Firestore →
`appSettings/theme` → edit `primary` to a different hex. The running app
re-skins within ~1 second without reload.

---

## Step 5 — Firebase init

`src/lib/firebase.ts`:

```ts
import { initializeApp } from 'firebase/app'
import { getAuth, initializeAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getFunctions } from 'firebase/functions'
import { Platform } from 'react-native'

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
}

export const app = initializeApp(config)

// Native needs AsyncStorage persistence; web uses default (IndexedDB).
let auth: ReturnType<typeof getAuth>
if (Platform.OS === 'web') {
  auth = getAuth(app)
} else {
  // Lazy-require to avoid pulling AsyncStorage into web bundle
  const { getReactNativePersistence } = require('firebase/auth')
  const AsyncStorage = require('@react-native-async-storage/async-storage').default
  auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
}
export { auth }
export const db = getFirestore(app)
export const storage = getStorage(app)
export const functions = getFunctions(app)
```

---

## Step 6 — Auth store

`src/stores/authStore.ts`:

```ts
import { create } from 'zustand'
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, sendEmailVerification, User as FBUser } from 'firebase/auth'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase'
import type { UserProfile } from '@/types/user'

interface AuthStore {
  fbUser: FBUser | null
  profile: UserProfile | null
  loading: boolean
  _unsubAuth: (() => void) | null
  _unsubProfile: (() => void) | null

  init: () => void
  teardown: () => void
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  signOutNow: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  resendVerification: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  fbUser: null,
  profile: null,
  loading: true,
  _unsubAuth: null,
  _unsubProfile: null,

  init: () => {
    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      get()._unsubProfile?.()
      if (!fbUser) {
        set({ fbUser: null, profile: null, loading: false, _unsubProfile: null })
        return
      }
      set({ fbUser, loading: true })
      const unsubProfile = onSnapshot(doc(db, 'users', fbUser.uid), (snap) => {
        set({ profile: (snap.data() as UserProfile) ?? null, loading: false })
      })
      set({ _unsubProfile: unsubProfile })
    })
    set({ _unsubAuth: unsubAuth })
  },

  teardown: () => {
    get()._unsubAuth?.()
    get()._unsubProfile?.()
    set({ _unsubAuth: null, _unsubProfile: null })
  },

  signIn: async (email, password) => {
    await signInWithEmailAndPassword(auth, email.trim(), password)
  },

  signUp: async (email, password, displayName) => {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
    await setDoc(doc(db, 'users', cred.user.uid), {
      uid: cred.user.uid,
      email: cred.user.email,
      displayName,
      roles: ['unverified'],
      onboardingComplete: false,
      notificationPrefs: defaultNotificationPrefs(),
      pushTokens: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await sendEmailVerification(cred.user)
  },

  signOutNow: async () => { await signOut(auth) },
  resetPassword: async (email) => { await sendPasswordResetEmail(auth, email.trim()) },
  resendVerification: async () => {
    if (auth.currentUser) await sendEmailVerification(auth.currentUser)
  },
}))

function defaultNotificationPrefs() {
  return {
    newAssignment: { push: true, email: false },
    newMessage: { push: true, email: false },
    eventReminder: { push: true, email: true },
    announcement: { push: true, email: false },
    issueAssigned: { push: true, email: false },
    weeklyDigest: true,
    monthlyDigest: false,
  }
}
```

---

## Step 7 — User profile + role types

`src/types/user.ts`:

```ts
export type Role = 'admin' | 'security' | 'regular' | 'merch' | 'worship' | 'public' | 'unverified'

export interface NotificationPrefs {
  newAssignment: { push: boolean; email: boolean }
  newMessage: { push: boolean; email: boolean }
  eventReminder: { push: boolean; email: boolean }
  announcement: { push: boolean; email: boolean }
  issueAssigned: { push: boolean; email: boolean }
  weeklyDigest: boolean
  monthlyDigest: boolean
}

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  photoURL?: string
  roles: Role[]
  onboardingComplete: boolean
  notificationPrefs: NotificationPrefs
  pushTokens: {
    ios?: { token: string; deviceId: string; lastSeen: number }
    android?: { token: string; deviceId: string; lastSeen: number }
    web?: { token: string; deviceId: string; lastSeen: number }
  }
  createdAt: any  // Firestore Timestamp
  updatedAt: any
}
```

`src/lib/roles.ts`:

```ts
import type { Role, UserProfile } from '@/types/user'

export const hasRole = (u: UserProfile | null, r: Role) => !!u?.roles?.includes(r)
export const isAdmin = (u: UserProfile | null) => hasRole(u, 'admin')
export const isSecurity = (u: UserProfile | null) => hasRole(u, 'security') || isAdmin(u)
export const isWorship = (u: UserProfile | null) => hasRole(u, 'worship') || isAdmin(u)
export const isMerch = (u: UserProfile | null) => hasRole(u, 'merch') || isAdmin(u)
export const isVerified = (u: UserProfile | null) => !!u && !hasRole(u, 'unverified')
export const isPublic = (u: UserProfile | null) => hasRole(u, 'public')

export type Tab = 'dashboard' | 'home' | 'events' | 'assignments' | 'messages' | 'issues' | 'security' | 'inventory' | 'announce' | 'worship' | 'music' | 'posts' | 'admin'

export function visibleTabs(u: UserProfile | null): Tab[] {
  if (!u || !isVerified(u)) return []
  const tabs: Tab[] = ['home', 'events', 'messages', 'posts']
  if (!isPublic(u)) tabs.unshift('dashboard')
  if (!isPublic(u)) tabs.push('assignments', 'issues')
  if (isSecurity(u)) tabs.push('security')
  if (isWorship(u)) tabs.push('worship', 'music')
  if (isMerch(u)) tabs.push('inventory')
  if (isAdmin(u)) tabs.push('announce', 'admin')
  return tabs
}
```

---

## Step 8 — Root layout + auth gate

`app/_layout.tsx`:

```tsx
import { useEffect } from 'react'
import { Slot, useRouter, useSegments } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Sentry from '@sentry/react-native'
import { DynamicThemeProvider } from '@/theme/DynamicThemeProvider'
import { useAuthStore } from '@/stores/authStore'
import { isVerified } from '@/lib/roles'

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enableInExpoDevelopment: true,
  debug: __DEV__,
})

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

function AuthGate({ children }: { children: React.ReactNode }) {
  const segments = useSegments()
  const router = useRouter()
  const { fbUser, profile, loading } = useAuthStore()

  useEffect(() => {
    if (loading) return
    const inAuth = segments[0] === '(auth)'
    const inOnboarding = segments[0] === '(onboarding)'

    if (!fbUser && !inAuth) router.replace('/(auth)/login')
    else if (fbUser && inAuth) router.replace('/')
    else if (fbUser && profile && !profile.onboardingComplete && !inOnboarding) {
      router.replace('/(onboarding)')
    } else if (fbUser && profile?.onboardingComplete && inOnboarding) {
      router.replace('/')
    }
  }, [fbUser, profile, loading, segments])

  return <>{children}</>
}

export default function RootLayout() {
  const init = useAuthStore((s) => s.init)
  const teardown = useAuthStore((s) => s.teardown)
  useEffect(() => { init(); return () => teardown() }, [])

  return (
    <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <DynamicThemeProvider>
              <AuthGate>
                <Slot />
              </AuthGate>
            </DynamicThemeProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </Sentry.ErrorBoundary>
  )
}

function ErrorFallback() { return null /* render a Tamagui-styled error UI */ }
```

---

## Step 9 — Route groups

Create these directories with `_layout.tsx` files:

### `app/(auth)/_layout.tsx`
Stack navigator for login, register, reset-password.

### `app/(onboarding)/_layout.tsx`
Stack for the onboarding flow.

### `app/(app)/_layout.tsx`
Tabs navigator (bottom on mobile, top on web ≥768px). Uses `visibleTabs(profile)`
from `src/lib/roles.ts` to render only the tabs the user has access to.

### `app/(public)/_layout.tsx`
For public-only routes (public home).

Each `app/(app)/<tab>.tsx` should be a placeholder for now:

```tsx
import { Stack } from 'expo-router'
import { YStack, H2, Paragraph } from 'tamagui'

export default function DashboardScreen() {
  return (
    <YStack padding="$4" gap="$3">
      <Stack.Screen options={{ title: 'Dashboard' }} />
      <H2>Dashboard</H2>
      <Paragraph>Coming in phase 2.</Paragraph>
    </YStack>
  )
}
```

Required placeholder routes:
- `dashboard.tsx`, `home.tsx`
- `events/index.tsx`, `events/[id].tsx`
- `assignments.tsx`
- `messages/index.tsx`, `messages/[threadId].tsx`
- `issues/index.tsx`, `issues/[id].tsx`
- `security.tsx`, `inventory.tsx`, `announce.tsx`
- `worship.tsx`, `music.tsx`, `posts.tsx`
- `pages/[slug].tsx`
- `admin/_layout.tsx`, `admin/index.tsx`, `admin/users.tsx`, `admin/groups.tsx`, `admin/teams.tsx`, `admin/templates.tsx`, `admin/theme.tsx`, `admin/audit.tsx`, `admin/digests.tsx`
- `profile.tsx` (real screen — notification prefs UI ships here in phase 1)

---

## Step 10 — Auth screens (real, not placeholder)

These ARE part of phase 1. Build them with Tamagui + React Hook Form + Zod.

### `app/(auth)/login.tsx`
- Email + password fields with Zod validation
- "Sign in" button
- Link to register, link to forgot password
- Error toast on failure

### `app/(auth)/register.tsx`
- Display name, email, password, confirm password
- "Create account" → calls `signUp()`
- Sends verification email automatically
- Redirects to onboarding on success

### `app/(auth)/reset-password.tsx`
- Email field, "Send reset link" button
- Success message, link back to login

### `app/(auth)/verify-email.tsx`
- Shown if user is signed in but `fbUser.emailVerified === false`
- "Resend verification email" button
- "I've verified" button that reloads the user (`fbUser.reload()`)

---

## Step 11 — Onboarding flow

`app/(onboarding)/index.tsx`:

A 3-step flow:
1. Welcome / app overview
2. Notification preferences (push toggles show "Coming soon" badge but still
   capture the user's preference)
3. Profile photo upload (optional, skippable)

On completion: `setDoc(doc(db, 'users', uid), { onboardingComplete: true }, { merge: true })`.

---

## Step 12 — UI primitives

Build these in `src/components/ui/` — Tamagui-based, work on web/iOS/Android:

- `Button.tsx`
- `Card.tsx`
- `Input.tsx`
- `Modal.tsx` (bottom sheet on small screens, centered on large)
- `Sheet.tsx`
- `Toast.tsx` + `useToast()` hook backed by `uiStore`
- `Loader.tsx`
- `Avatar.tsx`
- `Header.tsx`
- `ColorPicker.tsx` (wraps `react-colorful` on web, custom on native — phase 5
  uses this in the theme editor; phase 1 only needs a working stub)
- `DateTimePicker.tsx` (Tamagui on web, `@react-native-community/datetimepicker`
  on native, single API)
- `Image.tsx` (wraps `expo-image`)

Every component must use Tamagui theme tokens (`$primary`, `$background`,
`$color`, `$borderColor`) — **no hardcoded colors anywhere**.

---

## Step 13 — Profile screen + notification prefs

`app/(app)/profile.tsx`:

- Avatar (with upload)
- Display name (editable)
- Email (readonly, with verification status)
- Dark/light mode toggle (writes to `useThemeStore.setMode`)
- Notification preferences section:
  - Per-event-type toggles (push + email columns)
  - Push toggles render as disabled + "Coming soon" badge
  - Email toggles are functional
  - Weekly digest toggle
  - Monthly digest toggle (visible only for public users)
- Sign out button
- Delete account button (calls a Cloud Function — scaffold only in phase 1)

Writes patch directly to `users/{uid}` via `updateDoc`.

---

## Step 14 — Zustand store skeletons

Create empty/scaffolded stores for every domain that phases 2+ will fill in.
Each should have:
- `subscribe()` / `unsubscribe()` methods (currently no-ops; phase 2+ wires Firestore)
- Empty state arrays
- Role-gated `subscribe()` — refuses to subscribe if the current user lacks the
  required role

Files: `src/stores/{users,events,tasks,messages,issues,security,inventory,announce,worship,music,pages,posts,ui}Store.ts`.

The `uiStore` ships real in phase 1 — handles toasts, active modals, and a
global save indicator:

```ts
interface UIStore {
  toasts: Toast[]
  toast: (message: string, kind?: 'info' | 'success' | 'error') => void
  dismissToast: (id: string) => void
  saving: boolean
  setSaving: (v: boolean) => void
}
```

---

## Step 15 — Cloud Functions scaffold

In `mission-portal-app/functions/` (initialized via `firebase init functions`
choosing TypeScript):

```
functions/
├── src/
│   ├── index.ts                  # exports
│   ├── notify.ts                 # sendNotification dispatcher
│   ├── email/
│   │   ├── client.ts             # Resend client
│   │   ├── sendContactForm.ts
│   │   └── sendTransactional.ts
│   ├── audit/
│   │   └── onUserDeleted.ts      # auth trigger writes audit entry
│   └── utils/
│       └── throttle.ts
├── package.json
└── tsconfig.json
```

### `functions/src/email/client.ts`

```ts
import { Resend } from 'resend'
import { defineSecret } from 'firebase-functions/params'

export const RESEND_API_KEY = defineSecret('RESEND_API_KEY')

let _client: Resend | null = null
export function resend() {
  if (!_client) _client = new Resend(RESEND_API_KEY.value())
  return _client
}
```

### `functions/src/notify.ts`

```ts
import { onCall } from 'firebase-functions/v2/https'
import { logger } from 'firebase-functions'
import * as admin from 'firebase-admin'
import { resend, RESEND_API_KEY } from './email/client'
admin.initializeApp()

type NotificationType = 'newAssignment' | 'newMessage' | 'eventReminder' | 'announcement' | 'issueAssigned'

interface Payload { uid: string; type: NotificationType; data: Record<string, any> }

export const sendNotification = onCall(
  { secrets: [RESEND_API_KEY] },
  async (req) => {
    const { uid, type, data } = req.data as Payload

    // Verify caller is authenticated (and authorized — admin or self)
    if (!req.auth) throw new Error('unauthenticated')

    const userSnap = await admin.firestore().doc(`users/${uid}`).get()
    const profile = userSnap.data()
    if (!profile) throw new Error('user-not-found')

    const prefs = profile.notificationPrefs?.[type]

    // PHASE 1: email-only branch
    if (prefs?.email) {
      await resend().emails.send({
        from: 'Mission Portal <noreply@yourdomain.com>',
        to: profile.email,
        subject: subjectFor(type, data),
        html: bodyFor(type, data),
      })
    }

    // PHASE 6 STUB: push branch goes here
    // if (prefs?.push) { await sendPushToTokens(profile.pushTokens, type, data) }

    return { ok: true }
  }
)

function subjectFor(_t: NotificationType, _d: any): string { return 'Mission Portal' }
function bodyFor(_t: NotificationType, _d: any): string { return '<p>Notification</p>' }
```

### `functions/src/email/sendContactForm.ts`

A simple callable for the public contact form. Required in phase 1 since the
existing app has a contact form.

### `functions/src/audit/onUserDeleted.ts`

`auth.user().onDelete(async (user) => { ... })` writes an audit entry.

### Deploy commands

```bash
firebase functions:secrets:set RESEND_API_KEY
firebase deploy --only functions
```

---

## Step 16 — Client-side notification stubs

`src/lib/notifications.ts`:

```ts
// PHASE 1 STUB. Phase 6 fills these in with expo-notifications.
import { Platform } from 'react-native'
import type { UserProfile } from '@/types/user'

export async function registerForPushNotifications(): Promise<{ token: string; platform: 'ios' | 'android' | 'web' } | null> {
  // Phase 6: request permission, get token, return it
  console.warn('registerForPushNotifications stubbed — phase 6 will implement')
  return null
}

export async function persistPushToken(_uid: string, _token: string, _platform: 'ios' | 'android' | 'web') {
  // Phase 6: write to users/{uid}/pushTokens
}

export async function unsubscribeFromPushTopic(_topic: string) {
  // Phase 6
}

export function platformKey(): 'ios' | 'android' | 'web' {
  return Platform.OS === 'web' ? 'web' : (Platform.OS as 'ios' | 'android')
}
```

These stubs are called at login but do nothing. Phase 6 swaps the bodies in
without changing callers.

---

## Step 17 — Sentry, Crashlytics, Performance

- **Sentry**: already initialized in `app/_layout.tsx`. Add
  `@sentry/react-native` plugin to `app.config.ts` `plugins`. Confirm a
  thrown error in dev shows up in Sentry dashboard.
- **Crashlytics**: native-only. Add `@react-native-firebase/crashlytics` after
  EAS Build is wired (it needs native config). For phase 1, install but
  defer initialization until first EAS build.
- **Firebase Performance Monitoring**: import
  `firebase/performance` and call `getPerformance(app)` in `firebase.ts` for
  web. Native enables automatically with `@react-native-firebase/perf`
  installed (defer to EAS Build phase).

---

## Step 18 — EAS Build configuration

`eas.json`:

```json
{
  "cli": { "version": ">= 7.0.0" },
  "build": {
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "ios": { "simulator": true },
      "env": { "EXPO_PUBLIC_ENV": "preview" }
    },
    "staging": {
      "distribution": "internal",
      "channel": "staging",
      "env": { "EXPO_PUBLIC_ENV": "staging" }
    },
    "production": {
      "channel": "production",
      "autoIncrement": true,
      "env": { "EXPO_PUBLIC_ENV": "production" }
    }
  },
  "submit": { "production": {} }
}
```

Bundle identifiers:
- iOS: `com.elim.missionportal`
- Android: `com.elim.missionportal`

Do **not** run `eas build` in phase 1 unless requested — config only.

---

## Step 19 — Web build setup

```bash
npx expo export -p web --output-dir dist
```

Should produce a static site. Deploy target: Firebase Hosting preview channel.

Add to `firebase.json`:

```json
{
  "hosting": [
    {
      "target": "new-app-staging",
      "public": "mission-portal-app/dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    }
  ]
}
```

The old `index.html` stays on the existing hosting target. The new app gets
its own subdomain (e.g. `next.yourapp.com`) until cutover.

---

## Step 20 — CI

`.github/workflows/ci.yml`:

- Trigger: PR to main, push to main
- Steps:
  1. Checkout
  2. Node 20 setup
  3. `npm ci` in `mission-portal-app/`
  4. `npm run typecheck` (`tsc --noEmit`)
  5. `npm run lint`
  6. `npx expo export -p web --output-dir dist`
  7. Bundle-size budget check: fail if any single chunk > 250 KB compressed
     or initial bundle > 200 KB compressed
  8. (Optional) Lighthouse CI run against the exported site, fail on
     performance score < 80

---

## Step 21 — Firestore security rules

Update or create `mission-portal-app/firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isAdmin() {
      return isSignedIn() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.roles.hasAny(['admin']);
    }
    function isSelf(uid) { return isSignedIn() && request.auth.uid == uid; }

    match /appSettings/theme {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /users/{uid} {
      allow read: if isSelf(uid) || isAdmin();
      allow create: if isSelf(uid);
      allow update: if (isSelf(uid) &&
        !request.resource.data.diff(resource.data).affectedKeys()
          .hasAny(['roles', 'createdAt'])) || isAdmin();
      allow delete: if isAdmin();
    }

    match /auditLog/{doc} {
      allow read: if isAdmin();
      allow create: if isSignedIn();
      allow update, delete: if false;
    }

    // Phase 2+ adds more collections
  }
}
```

Deploy: `firebase deploy --only firestore:rules`.

---

## Acceptance Criteria (Phase 1 Definition of Done)

Each must be verified manually before moving to phase 2:

- [ ] `npx expo start --web` boots, lands on `/login` for unauthenticated user
- [ ] Register a new account → email verification sent → land on
      `/verify-email` until verified
- [ ] After verification, land on onboarding → complete 3 steps → land on
      `/dashboard` (or first visible tab)
- [ ] Sign out returns to `/login`
- [ ] Forgot password sends an email
- [ ] Dark/light mode toggle in profile switches all UI immediately
- [ ] Editing `appSettings/theme.primary` in Firebase console live-updates all
      open clients within ~1 s
- [ ] Profile screen shows notification preferences; push toggles are visible
      but disabled with "Coming soon" badge
- [ ] Role-gating: a user with only `['regular']` role does not see Admin tab
- [ ] Tab shell renders correctly on web ≥768 px (top nav), web <768 px
      (bottom tabs), iOS simulator (bottom tabs), Android simulator (bottom tabs)
- [ ] Throwing an error in dev triggers Sentry capture
- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run lint` passes with zero errors
- [ ] CI workflow passes on a test PR
- [ ] Web bundle initial JS ≤ 200 KB compressed (check
      `dist/_expo/static/js/` sizes)
- [ ] Cloud Function `sendNotification` is deployed and callable; sending a
      test call delivers an email via Resend
- [ ] Firestore rules deployed; manual test confirms a regular user cannot
      write to `appSettings/theme`

---

## Common Pitfalls

1. **Tamagui Babel plugin order** — must be before reanimated plugin in
   `babel.config.js`. Reanimated must be last.
2. **Expo Router entry point** — `package.json#main` must be
   `"expo-router/entry"`, not `index.ts`.
3. **Firebase auth persistence on native** — `getAuth(app)` on native will
   warn about no persistence. Use `initializeAuth` + AsyncStorage as shown.
4. **Hardcoded colors** — every color must be a theme token. Code review
   should flag any hex literal in component files (allowed only in
   `src/theme/`).
5. **Cloud Function secrets** — `RESEND_API_KEY` must be set via
   `firebase functions:secrets:set`, not env vars. Don't commit it.
6. **Untracked `.env.local`** — must be in `.gitignore`. Verify with
   `git check-ignore -v .env.local`.
7. **Web-only imports inside shared code** — wrap with
   `Platform.OS === 'web'` or use `.web.ts` / `.native.ts` file suffixes for
   platform splits. Don't import DOM types in shared files.
8. **TanStack Query inside Zustand stores** — don't. Use TanStack Query at
   the component layer for `getDocs` reads, and let Zustand stores own
   `onSnapshot` subscriptions. Two different concerns, two different layers.
9. **Onboarding loop** — make sure the auth gate handles the case where a
   user signs out from inside onboarding (must redirect to `/login`).
10. **Firestore subscription leaks** — every store must clean up its
    listener on `teardown` and on user sign-out. Verify with the React
    DevTools profiler that listener counts don't grow on repeat sign-ins.

---

## When Phase 1 is Done

1. Commit and push to the development branch (`claude/backup-reset-e7b22b9-SUHKv`).
2. Deploy a preview to Firebase Hosting (`next.yourapp.com` or similar).
3. Walk through every Acceptance Criteria checkbox with the user on the
   preview deploy.
4. Get explicit sign-off before starting Phase 2.

The user will provide the Phase 2 brief once Phase 1 is signed off.
