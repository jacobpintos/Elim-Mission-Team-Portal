# The Well of Iowa — Mission Team Portal

The app the mission team uses to plan and run events and trips. It covers availability, teams, carpools, lodging and flights, food sign-ups, tasks, reimbursements, worship set lists and chord sheets, messaging, announcements and a public website. It also includes **Miriam**, a voice assistant that can do most of that by being asked.

Where it's headed, from The Well's own operational platform to a subscription app for other churches, ministries and bands, is in [docs/ROADMAP.md](docs/ROADMAP.md).

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
│   ├── modules/miriam-wake/     Native module for Miriam's on-device wake word
│   └── modules/desk-link/       Native module for the sound desk, the video switcher and the local network
├── docs/
│   ├── ROADMAP.md               The five stages, where the app is, and the groundwork for what's next
│   ├── migration/               History: how the original single-page app became this one
│   └── facebook-page-*          Setting up Facebook Page sync
├── firebase.json                Hosting, Functions, Firestore and Storage configuration
├── LICENSE                      Who owns this: The Well of Iowa, all rights reserved
├── THIRD_PARTY_NOTICES.md       The licences of what it includes: Expo's template, Miriam's models
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
RULES_WITH_CLAIMS=1 npm run test:rules   # the same, with roles in the sign-in token
npm run export:web     # the web build bundles
```

For the functions, run `cd functions && npm ci && npm run build`.

---

## Deploying

| Workflow | When it runs | What it does |
|---|---|---|
| **CI** | Every push to `main` or `claude/**`, and on pull requests | Typecheck, lint, unit tests, rules tests, web build |
| **Deploy Web App** | A push to `main` that changes the app | Builds the web app and deploys it to Firebase Hosting |
| **Deploy Firebase** | A push to `main` that changes `functions/` or the rules files (or by hand) | Uploads Miriam's model to Cloud Storage, deletes any retired functions (below), then deploys Cloud Functions, Firestore rules and Storage rules. The Storage rules are held back if they couldn't read Firestore (below) |
| **Ship to iPhones** | A push to `main` that changes the app; Mondays; or by hand | Gets what's on `main` onto the team's iPhones by itself. App code goes out as an over-the-air update once the unit tests pass. A native change, which no build can take as an update, gets a new build sent to TestFlight instead. On Mondays it makes a new build when the newest is 75 days old, before TestFlight's 90 days run out |
| **EAS Build** | By hand, or from Ship to iPhones | Builds the iPhone and Android apps, and can submit them to the stores |
| **EAS Update** | By hand | Sends the app's JavaScript to installed apps, with no store build: for staging, or Android, or sending something without waiting. Builds whose native side matches take it; a change that needs native code still needs EAS Build |

### Taking a function out

The deploy stops, changing nothing, when the project has a function that the source no longer has: it won't delete one unasked. So a function removed from `functions/src/index.ts` is also added to the list in **Deploy Firebase**'s **Delete retired functions** step, which deletes it by name before the deploy. Once it is gone the step does nothing, and the name can stay on the list.

The app sends no email of its own. Its email functions (digests, the contact form, the Resend webhook and the unsubscribe link) were never switched on and have been removed this way. Verifying an email address and resetting a password still send email, through Firebase Authentication.

### Storage rules and Firestore

The Storage rules decide who may upload, delete and look up files by each person's role, which they read from Firestore. Google allows that only once the project's Storage service agent holds the role **Firebase Rules Firestore Service Agent**. Without it, every rule that reads a role refuses everyone.

**Deploy Firebase** looks for the role before it deploys the Storage rules and grants it if its account is allowed to. If it can't, it stops with an error and leaves the rules that were already deployed, so the app keeps working. To grant it by hand, once, do either of these:

- In the Firebase console, open **Storage → Rules**, paste in `mission-portal-app/storage.rules` and publish. The console offers to turn this on.
- Or run this in Google Cloud Shell:
  ```bash
  gcloud projects add-iam-policy-binding mission-team-portal \
    --member=serviceAccount:service-222865106764@gcp-sa-firebasestorage.iam.gserviceaccount.com \
    --role=roles/firebaserules.firestoreServiceAgent
  ```

Then run **Deploy Firebase** by hand with **Deploy Storage Rules** ticked. If it still reports that it can't see the grant, its account isn't allowed to read the project's access list: set the repository variable `STORAGE_RULES_READ_FIRESTORE` to `granted` (GitHub → Settings → Secrets and variables → Actions → Variables) and run it again.

---

## Roles and who does what

- **Accounts are made by admins.** Nobody can sign up or make themselves an admin.
- **Roles:** `admin`, `worship`, `security`, `regular`, `intern`, `guest` (read-only, for one trip) and `public`.
- **Where roles are read:** each person's roles are kept in `users/{uid}.roles`, and copied into their sign-in token by `syncRoleClaims` whenever that record is written (which the app does each time it opens). The Firestore and Storage rules read roles from the token, so most requests read no record at all. A token made before it carried roles falls back to reading the record.
  - **Admin power** is always confirmed from the record as well, so taking someone's admin role away works at once.
  - **Other roles** taken away still count for someone until their token is renewed, within the hour. The app asks for a new token as soon as a person's roles change and shows the change once the token agrees, so in practice this only matters for a session someone keeps open on purpose.
  - The rules tests run both ways: `npm run test:rules` reads the record, and `RULES_WITH_CLAIMS=1 npm run test:rules` reads the token. CI runs both.
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

**The Reimbursements section** of Assignments holds everyone's own requests. Team members' requests are green and outside bills are purple. The Accountant's briefing from Miriam lists requests to decide, overdue payments and payments due this week.

**Admin → Finance** is the Accountant's alone, whether or not they're an admin. Nobody else sees the tab, and the screen refuses anyone else. A non-admin Accountant can open Finance and nothing else in the admin area, from their Reimbursements section.
- Search events by name and choose a date range ("This year", "Last 12 months" and so on).
- The matching events are reported together: total cost, what's to decide, owed and paid, and team members against outside bills.
- Tap an event to see its own costs, each with the receipts or invoice it came with.
- The list downloads as a spreadsheet.

**Receipts and invoices are kept for two years** from when a request was made. After that, once the request is paid or denied, `purgeOldReceipts` removes the files each night. The request, its amounts and its history stay, and Finance notes when the files were removed.

Every step sends a push notification to the other person. Amounts and receipts are visible only to the person who asked, the Accountant and admins. The rest of the team sees only that the task exists. All steps run through callables in `functions/src/reimbursements/`, and clients can't write the requests directly.

---

## Event history

**Every night at 3:15 am Central**, `eventHistoryCleanup` (`functions/src/eventHistory.ts`) clears what's no longer needed:

- **Availability** for a date is cleared the day after it. For a one-off event, that's the day after its last day, so a multi-day event keeps every day's answers until it's over. For a repeating event, each date's answers are cleared the day after that date. Its standing answer for the whole series stays.
- **Food sign-ups** for dates of a repeating event are cleared after 12 months.
- **Events** are deleted 12 months after their last day. For a one-off event that's its last date; for a repeating event it's the end date it was given. A repeating event with no end date, and a draft with no date, are never deleted.
- **Invitation records** (who invited someone, to which date) are cleared 90 days after their date.
- **Blocked-off dates** are cleared the day after the last blocked day.

Deleting an event, whether an admin does it or it's past its 12 months, also removes its tasks, availability, food sign-ups, private details (teams, cars, rooms, flights) and invitation records. Its cover photo goes too, unless another event uses the same one, along with its flight and hotel pictures. Anything removed by mistake can be restored from the nightly backups for 30 days.

---

## Blocked-off dates

Anyone on the team can block off days they can't make, for any reason, from **Events → Block off dates** or by telling Miriam ("I'm away November 17 through 21"). Each block is a record of its own in `blockedDates`, holding the person, the first and last day, and an optional reason.

`onBlockedDatesWritten` (`functions/src/blockedDatesSync.ts`) answers **Not Available** for them on every event they're on in those days, from today on, with the reason as the note:

- **A new block** replaces whatever they had answered for those dates. The earlier answer is kept with it.
- **An event added, moved, or given new people** (directly, by group or by team) is answered too, through the event triggers in `eventPrivateSync.ts`. This happens only where they haven't already answered that date.
- **Removing a block** takes back its answers and puts back any it replaced. An answer they changed by hand since is left alone, and so are days already past.

Admins see these answers like any other, with the reason as the note.

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
