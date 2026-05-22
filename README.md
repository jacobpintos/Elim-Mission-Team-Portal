[README.md](https://github.com/user-attachments/files/28160722/README.md)
# The Well of Iowa — Mission Team Portal
## Multi-Collection Firestore Migration

---

### What changed

| Before | After |
|--------|-------|
| Everything in `appState/main` (one ~25-field document) | ~20 Firestore collections, one doc per entity |
| `appState/users` list doc | `users/{uid}` — one doc per Firebase UID |
| `room.msgs[]` embedded in the room doc | `rooms/{id}/messages/{ts_uid}` subcollection |
| Onboarding flag in `appState/onboarding_{uid}` | `onboarding/{uid}` collection |
| Audit log embedded in `appState/main` | `auditLog/{autoId}` append-only collection |

---

### File structure

```
mission-portal/
├── public/
│   └── index.html          ← shell only; paste CSS + remaining UI scripts here
├── src/
│   ├── firebase-init.js    ← Firebase SDK init (unchanged config)
│   ├── db.js               ← NEW: all Firestore read/write/listen logic
│   ├── migrate.js          ← NEW: one-time migration from appState/main
│   └── state.js            ← NEW: S{}, USERS, auth handler, room session patch
├── firestore.rules         ← NEW: paste into Firebase Console → Firestore → Rules
└── README.md
```

---

### How to integrate with the existing single HTML file

The original file is ~8,900 lines.  Only **four blocks** need to change.
Everything else — all CSS, all UI render functions — stays exactly as-is.

#### Step 1 — Replace the `<script>` block at the top

Remove this section from the original file (lines ~290–825):
```
var firebaseConfig = { … };
firebase.initializeApp(…);
var auth = …; var db = …; var storage = …;
…
var DB_SAVING … var STATE_LOADED …
function save() { … }
function _doSave() { … }
function saveUsers() { … }
function loadState(callback) { … }
function startRealtimeListener() { … }
```

Replace with script-tag references:
```html
<script src="js/firebase-init.js"></script>
<script src="js/db.js"></script>
<script src="js/migrate.js"></script>
```

#### Step 2 — Replace the `var USERS` / `var S = { … }` block

Remove lines ~620–691 (the global state declaration).
The new version is in `state.js`.

#### Step 3 — Replace the `auth.onAuthStateChanged` block

Remove lines ~8842–8991 (the boot block at the very bottom).
The new version is in `state.js`.

#### Step 4 — Add `state.js` last

```html
<script src="js/state.js"></script>
```
`state.js` must load **after** all UI/render scripts because it patches `render()`.

#### Step 5 — Patch `send()` in `msgsView` (one line change)

In the original `msgsView` function, find the `send()` closure (~line 5595):

```js
// BEFORE
function send(){
  if(!ti.value.trim()&&!pendingAtt) return;
  room.msgs.push({uid:u.id, text:ti.value.trim(), attachment:pendingAtt||null, ts:Date.now()});
  ti.value=''; pendingAtt=null; attPreviewArea.innerHTML='';
  save(); render();
}
```

Change to:
```js
// AFTER
function send(){
  if(!ti.value.trim()&&!pendingAtt) return;
  var msg = {uid:u.id, text:ti.value.trim(), attachment:pendingAtt||null, ts:Date.now()};
  ti.value=''; pendingAtt=null; attPreviewArea.innerHTML='';
  sendRoomMessage(room, msg);   // ← writes to subcollection + re-renders
}
```

#### Step 6 — Add "Load More" button to `msgsView` (optional but recommended)

After the `var ml = D({cls:'msg-list card'});` line in `msgsView`, add:
```js
var loadMoreBtn = BTN({cls:'btn bo bsm', style:{width:'100%', marginBottom:'8px'}}, 'Load older messages');
loadMoreBtn.addEventListener('click', function(){
  loadMoreBtn.disabled = true;
  loadMoreBtn.textContent = 'Loading…';
  loadMoreMessages(room, function(){ loadMoreBtn.remove(); });
});
w.appendChild(loadMoreBtn);
```

#### Step 7 — Replace `checkAndShowOnboarding` in the original file

Remove the old `checkAndShowOnboarding` function (~lines 602–618).
The new version is in `state.js` and uses the `onboarding/{uid}` collection.

---

### Deploying to GitHub Pages (jacobpintos/Elim-Mission-Team-Portal)

```bash
# Copy compiled js files into the repo's public directory
cp src/firebase-init.js public/js/
cp src/db.js             public/js/
cp src/migrate.js        public/js/
cp src/state.js          public/js/

# Commit and push
git add public/
git commit -m "chore: migrate to multi-collection Firestore schema"
git push origin main
```

Set GitHub Pages source to the `public/` directory (or root if `index.html` is at root).

---

### Firestore rules

1. Open Firebase Console → Firestore → Rules
2. Replace the existing rules with the contents of `firestore.rules`
3. Click **Publish**

---

### Migration behaviour

On first load after deployment:

1. `runMigrationIfNeeded()` checks `config/migration` for the sentinel doc.
2. If missing, it reads `appState/main` (legacy) and fans the data out to all
   new collections.  This takes 2–8 seconds depending on data size.
3. On success it writes `config/migration { version: "v2_multi_collection" }`.
4. Every subsequent load skips migration entirely (sentinel check is one read).

The legacy `appState/main` and `appState/users` docs are **not deleted** by the
migration; they stay as a backup.  You can delete them manually from the
Firebase Console after verifying the new data looks correct.

---

### Collection reference

| Collection | Key field | Notes |
|------------|-----------|-------|
| `config/main` | — | Counters, COMMON_TEAMS, connectConfig |
| `config/inputLists` | — | inputLists.sunday/event/wh2 |
| `config/migration` | — | Sentinel; do not delete |
| `users/{uid}` | uid | One doc per Firebase UID |
| `events/{id}` | id | Template + embedded overrides map |
| `tasks/{id}` | id | |
| `groups/{id}` | id | |
| `rooms/{id}` | id | Metadata only |
| `rooms/{id}/messages/{ts_uid}` | ts | Subcollection, ordered by ts |
| `reports/{id}` | id | |
| `announcements/{id}` | id | |
| `setlists/{id}` | id | |
| `taskTemplates/{id}` | id | |
| `issues/{id}` | id | |
| `kaizen/{id}` | id | |
| `planningBoards/{id}` | id | |
| `meetingRequests/{id}` | id | |
| `merch/inventory` | — | items[] + transactions[] |
| `inventory/production` | — | productionItems[] |
| `inventory/reorder` | — | reorderItems[] |
| `music/db` | — | musicDb[] |
| `avail/{instanceKey}` | — | { responses: { uid: {status,note,ts} } } |
| `notifs/{uid}` | uid | { items: [...] } |
| `onboarding/{uid}` | uid | { dismissed: bool } |
| `auditLog/{autoId}` | — | Append-only single entries |
| `appState/*` | — | **Legacy only** — safe to delete after verifying migration |
