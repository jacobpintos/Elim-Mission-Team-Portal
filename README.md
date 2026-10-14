# The Well of Iowa — Mission Team Portal

The app the mission team uses to plan and run events and trips. It covers availability, teams, carpools, lodging and flights, food sign-ups, tasks, reimbursements, worship set lists and chord sheets, messaging, announcements and a public website. It also includes **Miriam**, a voice assistant that can do most of that by being asked.

It is one [Expo](https://docs.expo.dev/versions/v56.0.0/) (React Native) codebase that runs on iPhone, Android and the web, backed by Firebase: Auth, Firestore, Storage, Cloud Functions and Hosting.

---

## Repository layout

```
.
├── mission-portal-app/          The app
│   ├── app/                     Screens (expo-router: one file per route)
│   ├── src/
│   │   ├── features/            Larger features: events, worship, miriam, reimbursements, …
│   │   ├── components/ui/       Shared building blocks
│   │   ├── stores/              Zustand stores, one per kind of data, listening to Firestore
│   │   ├── lib/                 Pure logic and helpers (most of the unit tests live here)
│   │   └── types/               Shared TypeScript types
│   ├── functions/               Cloud Functions (separate TypeScript project, Node 24)
│   ├── firestore.rules          Who may read and write what in Firestore
│   ├── storage.rules            The same for uploaded files
│   ├── rules-tests/             Tests for both rule files, run against the emulators
│   └── modules/miriam-wake/     Native module for Miriam's on-device wake word
├── docs/
│   ├── migration/               History: how the original single-page app became this one
│   └── facebook-page-*          Setting up Facebook Page sync
├── firebase.json                Hosting, Functions, Firestore and Storage configuration
└── .github/workflows/           CI and deploys (see below)
```

---

## Working on it

```bash
cd mission-portal-app
npm ci --legacy-peer-deps
npm run web            # or: npm run ios / npm run android
```

The app reads its Firebase settings from `EXPO_PUBLIC_FIREBASE_*` environment variables. The values for each build are in `eas.json`, and for the web deploy in the repository's GitHub secrets.

### Checks

These are the same checks CI runs on every push:

```bash
npm run typecheck
npm run lint
npm test               # unit tests (vitest)
npm run test:rules     # Firestore and Storage rules, against the emulators (needs Java)
npm run export:web     # the web build bundles
```

For the functions, run `cd functions && npm ci && npm run build`.

---

## Deploying

| Workflow | When it runs | What it does |
|---|---|---|
| **CI** | Every push to `main` or `claude/**`, and on pull requests | Typecheck, lint, unit tests, rules tests, web build |
| **Deploy Web App** | A push to `main` that changes the app | Builds the web app and deploys it to Firebase Hosting, along with the Storage rules |
| **Deploy Firebase** | A push to `main` that changes `functions/` or the rules files (or by hand) | Deploys Cloud Functions, Firestore rules and Storage rules |
| **EAS Build** | By hand | Builds the iPhone and Android apps, and can submit them to the stores |

---

## Roles and who does what

- **Accounts are made by admins.** Nobody can sign up or make themselves an admin.
- **Roles:** `admin`, `worship`, `security`, `regular`, `intern`, `guest` (read-only, for one trip) and `public`.
- **Admin → Leadership** sets two jobs the app routes work to:
  - **Connections Coordinator:** receives the daily list of people asking to join the texting list.
  - **Accountant:** answers reimbursement requests. Until an admin chooses one, the first request goes to the account named **Sunny Singh**, who is then saved as the Accountant. Choosing someone else moves any open requests to them.

---

## Reimbursements

Anyone on the team can ask to be paid back for something they bought for an event. Use **$ Reimbursement** on Assignments, or **Request reimbursement** on an event's details. The request lists each item with its cost, names the event, and includes photos of the receipts.

1. The request becomes a task for the Accountant. The person who asked can follow the same task on their own list.
2. The Accountant **approves**, **partly approves** (giving the approved amount and why the rest wasn't approved), or **denies** (giving why). For an approval, they also set a **pay-by date**.
3. The Accountant can **ask to move the pay-by date**. The person who asked accepts the new date or keeps the current one.
4. When it's paid, the Accountant **marks it paid**. That completes the task and sends the person a notification and a message.

**Outside bills.** The Accountant can also log what is owed to someone outside the app, such as a van rental, a venue or a supplier. Use **+ Log an outside bill** in the Reimbursements section of Assignments. It records who is owed, the event, the items, the due date and, optionally, the invoice as a photo or PDF. It's approved as soon as it's logged, goes on the Accountant's task list with the due date as a reminder, and is closed by marking it paid. Its due date can be moved without asking anyone.

**The Reimbursements section** of Assignments holds everyone's own requests. For the Accountant, it also tallies every cost by event: what's waiting for a decision, what's owed and what's been paid. Team members' requests are green and outside bills are purple. Only the Accountant sees the tally. The Accountant's briefing from Miriam lists requests to decide, overdue payments and payments due this week.

Every step sends a push notification to the other person. Amounts and receipts are visible only to the person who asked, the Accountant and admins. The rest of the team sees only that the task exists. All steps run through callables in `functions/src/reimbursements/`, and clients can't write the requests directly.

---

## Backups

**Every night at 2:30 am Central**, `nightlyBackup` exports the whole Firestore database to the project's Storage bucket under `backups/firestore/YYYY-MM-DD/`. It keeps the last 30 nights. Older copies are removed only after a new one has succeeded. **Admin → Data** shows when the last backup ran, and shows it in red if it failed.

- If a backup logs `PERMISSION_DENIED`, give the Cloud Functions service account the **Cloud Datastore Import Export Admin** role in Google Cloud → IAM.
- To restore everything, or only some collections, use:
  ```bash
  gcloud firestore import gs://mission-team-portal.firebasestorage.app/backups/firestore/2026-10-14 \
    --collection-ids=events,avail   # leave this off to restore everything
  ```
  An import overwrites documents that have the same id and leaves other documents alone.
- Uploaded files (photos, receipts, audio) live in Storage and aren't part of the export. To protect them from accidental deletion, turn on Storage **soft delete** in the Google Cloud console.

**Admin → Data** also downloads People, Events, Availability, Tasks and Reimbursements as CSV files for Excel or Google Sheets.

---

## History

The portal started as a single 8,900-line `index.html`. It was rebuilt as this app in six phases, which are described in `docs/migration/`. The original files were removed from the repository once nothing used them, and they are still in git history if anyone needs them.
