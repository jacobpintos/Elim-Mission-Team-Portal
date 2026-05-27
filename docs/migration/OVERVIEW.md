# Mission Portal — React Native Migration Overview

This document captures the high-level architectural decisions for migrating the
current single-file `index.html` web app to a cross-platform Expo project that
ships to web, iOS, and Android from one codebase.

---

## 1. Goal & Strategy

**Goal.** Rebuild the Mission Portal as a native iOS app, native Android app,
and progressive web app from one TypeScript codebase, with substantially
faster page loads and the ability to ship JS-only updates without app-store
review.

**Strategy.** Parallel build alongside the existing app. The old `index.html`
stays in production until **Phase 6**, when we hard-cutover to the new app.
The new app lives in `mission-portal-app/` inside this repo until cutover,
then either stays as a subdirectory or graduates to its own repo (decision
deferred to phase 6).

---

## 2. Stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Framework | **Expo SDK 51+** | Latest stable |
| Routing | **Expo Router v3** | File-based, automatic per-route code splitting on web |
| Language | **TypeScript** | Strict mode |
| UI | **Tamagui** | Cross-platform styling with dynamic theming |
| State | **Zustand** | Domain-scoped stores replace the global `S` object |
| Server reads | **TanStack Query** | Wraps `getDocs` reads (background refetch, dedupe) |
| Backend | **Firebase JS SDK v10 modular** | Auth + Firestore + Storage; same SDK on web/iOS/Android |
| Server logic | **Firebase Cloud Functions** | On Blaze plan, within free tier |
| Email | **Resend** | Replaces EmailJS for both transactional and digest sends |
| Push | **FCM via Expo Notifications** | Schema in phase 1, implementation in phase 6 |
| Forms | **React Hook Form + Zod** | Type-safe validation |
| Errors | **Sentry** (JS) + **Crashlytics** (native) + **Firebase Perf Monitoring** | All three, complementary |
| Build/Ship | **EAS Build + EAS Update** | Native binaries + OTA JS updates |

---

## 3. Project Layout

```
mission-portal-app/
├── app/                          # Expo Router routes
│   ├── _layout.tsx               # Root: providers, auth gate
│   ├── (auth)/                   # login, register, reset-password
│   ├── (app)/                    # authenticated tabs
│   │   ├── _layout.tsx
│   │   ├── dashboard.tsx
│   │   ├── home.tsx
│   │   ├── events/[id].tsx
│   │   ├── assignments.tsx
│   │   ├── messages/[threadId].tsx
│   │   ├── issues/[id].tsx
│   │   ├── security.tsx
│   │   ├── inventory.tsx
│   │   ├── announce.tsx
│   │   ├── worship.tsx
│   │   ├── music.tsx
│   │   ├── pages/[slug].tsx      # ourstory, connect, giving
│   │   ├── posts.tsx
│   │   └── admin/                # users, groups, teams, templates, theme, audit, digests
│   ├── (public)/                 # public-only routes
│   └── +not-found.tsx
├── src/
│   ├── components/ui/            # Tamagui primitives (Button, Card, Modal, …)
│   ├── features/                 # Domain logic per feature
│   ├── stores/                   # Zustand stores (auth, users, events, …)
│   ├── lib/                      # firebase, roles, ics, email, notifications, audit
│   └── theme/                    # tamagui config + dynamic theme switcher
├── functions/                    # Cloud Functions (sendEmail, notify, digests, audit)
├── assets/
├── app.config.ts
├── tamagui.config.ts
├── tsconfig.json
├── package.json
└── eas.json
```

---

## 4. Theming

- Static design tokens (spacing, fonts, radii) compile-time
- **Dynamic color palette** stored in Firestore `appSettings/theme`, propagated
  live via `onSnapshot`
- Admin theme editor (phase 5): color wheel + RGB picker, contrast checker,
  preview mode, explicit publish
- Text color is admin-editable, defaults to white/black based on background
  luminance (WCAG 2.1)
- Per-user dark/light mode independent of admin's palette

---

## 5. State & Data

- Domain-scoped Zustand stores (auth, users, events, tasks, messages, issues,
  security, inventory, announce, worship, music, pages, posts, theme, ui)
- Each store owns its Firestore subscription; subscriptions are role-gated and
  torn down on logout
- Real-time `onSnapshot` for high-urgency collections (events, tasks, messages,
  issues, announcements, security, worship, music)
- Paginated `getDocs` + TanStack Query for lower-urgency reads (posts,
  inventory, audit log)
- Optimistic updates for RSVP, task complete, status changes (rollback + toast
  on failure)

---

## 6. Cross-Platform Strategy

| Capability | Web | Native |
| --- | --- | --- |
| ICS calendar export | Blob URL download | `expo-file-system` + `expo-sharing` |
| File upload | `<input type=file>` | `expo-image-picker` / `expo-document-picker` |
| QR code | `react-native-qrcode-svg` | `react-native-qrcode-svg` |
| Date picker | Tamagui DatePicker | `@react-native-community/datetimepicker` |
| PDF export | `expo-print` | `expo-print` |
| Deep links | Expo Router URL | Expo Router `mission://` scheme |
| Keyboard shortcuts | Yes | No (gated by `Platform.OS`) |
| Drag/drop | `react-native-gesture-handler` | `react-native-gesture-handler` |

**Sandbox Planning Board** (replaces Excalidraw): plain React Native views +
gesture handlers, persisted to Firestore. Toolbar:
`[Sticky] [Text] [Box] [Arrow] [Pin] [Pen] [Image] [Select] [Pan]`.
Per-element Firestore writes (no clobbering), 500 ms debounce, real-time
multi-user collab. Pen tool = decimated point stream rendered as smoothed SVG
path with thickness/color and optional pressure.

---

## 7. Performance

- Per-route code splitting (Expo Router) — initial web bundle ≤ 200 KB
- Lazy-load heavy features (planning board, page builder, PDF export) via
  dynamic `import()`
- Bundle budget enforced in CI (Lighthouse + bundle analyzer)
- List virtualization (`@shopify/flash-list`)
- Atomic Zustand selectors + `React.memo`
- 60 fps via `react-native-reanimated` v3 worklets on UI thread
- Optimistic updates for instant write feel

---

## 8. Notifications

**Push** (FCM): architected in phase 1, implemented in phase 6.

- `user.notificationPrefs` + `user.pushTokens` schemas live from phase 1
- `sendNotification(uid, type, payload)` dispatcher Cloud Function exists in
  phase 1 with email-only branch; phase 6 adds push branch
- `registerForPushNotifications()` stub returns `null` in phase 1; phase 6
  fills it in with Expo Notifications token capture
- Notification preferences UI shipped in phase 1 with "Coming soon" badges on
  push toggles (collects opt-ins early)
- Phase 6: FCM topics for global announcements (1 invocation → all
  subscribers), FCM multicast for role/group-targeted (batched 500/call)

**Email** (Resend): all email goes through one provider.

| Use case | Volume | Mechanism |
| --- | --- | --- |
| Contact form | Low | Cloud Function → Resend single send |
| Transactional (assignment, RSVP, message notif) | Low | Cloud Function → Resend single send |
| Weekly digest (non-public users, opt-in default ON) | ~800/mo | Cloud Scheduler → Function → Resend batch |
| Monthly digest (public users, opt-in default OFF) | ~2,000/mo | Cloud Scheduler → Function → Resend batch |

- React Email for templates
- Signed-token unsubscribe (no login required, CAN-SPAM compliant)
- Resend webhooks → admin Digests dashboard (delivery, bounce, open rates)
- Cloud Scheduler: 2 jobs (weekly + monthly), within 3-job free tier

---

## 9. Audit Log

- **Most entries** = client-direct Firestore writes to `auditLog/` collection
  (0 Cloud Function invocations, governed by Firestore security rules)
- **Auth events and server-driven mutations** = Cloud Function triggers write
  audit entries (~600 invocations/month estimated)

---

## 10. Migration Phases

| Phase | Scope | Size |
| --- | --- | --- |
| **1 — Foundation** | Project scaffold, auth, onboarding, theme engine, navigation shell, Zustand skeletons, Functions scaffold, observability, notification prefs UI + push stubs, EAS configured | Large |
| **2 — Daily-Use Core** | Dashboard, Home, Public Home, Events (CRUD + RSVP + ICS), Assignments, Messages, Posts | Large |
| **3 — Role-Specific Tools** | Security, Worship, Music, Inventory, Announcements | Medium |
| **4 — Issues & Planning** | Issues, Kaizen, Sandbox Planning Boards (with pen + image embed, real-time collab) | Large |
| **5 — Admin & Content** | Admin (Users, Groups, Teams, Templates, Audit, Theme Editor, Digests), Page Builder pages, Resend digest engine + unsubscribe | Medium |
| **6 — Native Apps + Push + Cutover** | iOS build + App Store, Android build + Play Store, push notifications implementation, PWA polish, performance pass, cutover from `index.html` | Medium |

Each phase ships to a staging URL (Firebase Hosting preview channel) for
testing. Phase 6 = hard cutover; old `index.html` archived to `legacy.`
subdomain read-only for 30 days as safety net.

---

## 11. Branch state note

The branch `claude/backup-reset-e7b22b9-SUHKv` already contains partial
in-place refactor work (`js/db.js`, `js/firebase-init.js`, `js/migrate.js`,
`js/state.js`). That work represents an earlier in-place migration approach
and is **superseded** by this Expo rewrite. Treat those files as legacy
reference material until cutover.

---

## 12. Locked Decisions

- Target: web + iOS + Android via Expo
- Backend unchanged: Firebase Auth + Firestore + Storage
- Strategy: parallel build, hard cutover at phase 6
- TypeScript throughout
- Tamagui + Zustand + TanStack Query
- Firebase JS SDK v10 modular (not React Native Firebase)
- Cloud Functions on Blaze plan (within free tier for this app's scale)
- Resend for all email (replaces EmailJS)
- Weekly digest for non-public users (opt-in default ON)
- Monthly digest for public users (opt-in default OFF)
- Sandbox planning board (no Excalidraw migration; start fresh)
- Pen tool with smoothed SVG paths
- Image embedding on planning boards (v1)
- FCM push notifications (phase 6 implementation, schema + dispatcher in phase 1)
- Sentry + Crashlytics + Firebase Performance Monitoring
- Audit log split: client-direct for most entries, Cloud Function trigger for auth events
- Dynamic theme: live across all logged-in users, with admin preview before publish
- Theme color wheel + RGB picker, text color overridable, defaults to white/black by luminance
