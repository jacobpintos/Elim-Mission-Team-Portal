# Phase 3 — Role-Specific Tools

**App**: The Well of Iowa Mission Team Portal (Expo SDK 51, Expo Router v3, TypeScript, Tamagui, Zustand, Firebase JS SDK v10 modular)  
**Branch**: `claude/backup-reset-e7b22b9-SUHKv`  
**Working directory**: `mission-portal-app/`

---

## 1. Purpose & Scope

Phase 3 builds the six role-gated screens that are *not* general team tools (those were Phase 2) but rather belong to specific roles:

| Screen | Route | Visible To |
|---|---|---|
| Security | `/(app)/security` | security, staff, admin |
| Worship | `/(app)/worship` | worship, admin |
| Music / Content | `/(app)/music` | all authenticated users |
| Inventory | `/(app)/inventory` | merch, admin |
| Announcements | `/(app)/announcements` | all authenticated users |
| Posts | `/(app)/posts` | all authenticated users (public too) |

After Phase 3, every tab in the nav that was visible in the original `index.html` for non-admin roles has a working Expo equivalent.

---

## 2. Prerequisites

- Phases 1 and 2 are **done and passing acceptance criteria**.
- `src/lib/roles.ts` exports `isSecurity`, `isWorship`, `isMerch`, `isAdmin`, `isVerified`, `isPublic`.
- `src/stores/authStore.ts` provides `user` (typed `UserProfile | null`).
- `nextId(counterKey)` is implemented in `src/lib/db.ts` (Phase 2).
- Firebase modular SDK imports work: `getDoc`, `setDoc`, `updateDoc`, `doc`, `collection`, `onSnapshot`.

---

## 3. New Files to Create

```
mission-portal-app/src/
  stores/
    securityStore.ts
    worshipStore.ts
    musicStore.ts
    inventoryStore.ts
    announcementStore.ts
    postsStore.ts
  screens/
    SecurityScreen.tsx
    WorshipScreen.tsx
    MusicScreen.tsx
    InventoryScreen.tsx
    AnnouncementScreen.tsx
    PostsScreen.tsx

mission-portal-app/app/(app)/
  security.tsx          ← thin route wrapper
  worship.tsx
  music.tsx
  inventory.tsx
  announcements.tsx
  posts.tsx
```

---

## 4. Firestore Collection Map for Phase 3

All collections are identical to the live app — do not rename or restructure them.

### 4.1 `reports/{id}` — Security Reports

Each document maps to one security report. The `id` field is a numeric counter stored in the document and also used as the document ID.

```typescript
interface SecurityReport {
  id: number;                // Firestore doc ID (string) = String(id)
  reporter: string;          // uid of submitter
  type: string;              // 'Safety Concern' | 'Medical Emergency' | 'Suspicious Activity' | 'Property Damage' | 'Child Safety' | 'Other'
  loc: string;               // location description
  desc: string;              // incident description
  witness?: string;          // optional witness name/description
  attachment?: Attachment | null; // see §4.7
  ts: number;                // Date.now() at submission
  ack: boolean;              // true = acknowledged / cleared
  ackNotes?: AckNote[];      // responses from security team
}

interface AckNote {
  note: string;              // response text
  attachment?: Attachment | null;
  by: string;                // uid of responder
  ts: number;
}
```

**Counter key**: `nReport` in `config/main`

### 4.2 `setlists/{id}` — Worship Setlists

```typescript
interface Setlist {
  id: number;                // Firestore doc ID = String(id)
  date: string;              // 'YYYY-MM-DD' (must be today or future — expired are pruned)
  eventId?: number | null;   // optional link to events/{id}
  songs: SetlistSong[];
  published: boolean;        // true = visible to all worship/admin users
}

interface SetlistSong {
  song: string;              // song title (or episode title for podcasts)
  key?: string;              // music key: 'G', 'Bb', 'C#m', etc.
  link?: string;             // URL (YouTube, Spotify, etc.)
  notes?: string;
}
```

**Firestore**: `setlists` collection, one doc per setlist.  
**Prune rule**: On worship screen load, delete all setlists where `date < TODAY()`.

### 4.3 `config/inputLists` — Audio Input Lists

Single Firestore doc (not a collection).

```typescript
// Document: config/inputLists
interface InputListsDoc {
  lists: {
    sunday: InputRow[];  // 44 rows
    event:  InputRow[];  // 44 rows
    wh2:    InputRow[];  // 32 rows
  };
}

interface InputRow {
  input:  string;  // channel label (e.g. "Lead Vocal", "Guitar L")
  output: string;  // destination (e.g. "FOH Ch 1", "IEM Mix 2")
}
```

**Write rule**: Debounce writes by 500 ms after any cell edit. Each list is always kept at exactly the fixed row count — pad with `{input:'',output:''}` if shorter.

### 4.4 `music/db` — Content Database

Single Firestore doc (not a collection).

```typescript
// Document: music/db
interface MusicDoc {
  items: MusicItem[];
}

interface MusicItem {
  id: number;                // numeric, used for keying in the array
  type: 'music' | 'podcast' | 'sermon';
  title: string;
  youtubeUrl: string;        // full YouTube URL, e.g. https://youtube.com/watch?v=xxxxx
  thumbnail?: string;        // auto-derived: https://img.youtube.com/vi/{videoId}/mqdefault.jpg
  album?: string;            // album, series, or podcast name
  year?: string;             // e.g. '2024'
  featured?: boolean;        // show in Featured row
  isNew?: boolean;           // show in 🔥 New row while newUntil > now
  newDays?: number;          // how many days from save to keep "new" badge (default 30)
  newUntil?: string;         // ISO date string (computed: now + newDays)
}
```

**YouTube ID extraction**:
```typescript
export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/))([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

export function youtubeThumbnail(url: string): string | null {
  const id = extractYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}
```

### 4.5 `merch/inventory` — Merchandise Inventory

Single Firestore doc (not a collection).

```typescript
// Document: merch/inventory
interface MerchDoc {
  items:        MerchItem[];
  transactions: MerchTransaction[];
  nItem:        number;  // next item ID counter
  nTx:          number;  // next transaction ID counter
}

interface MerchItem {
  id:       number;
  name:     string;
  category: 'books' | 'hats' | 'clothing';
  sub:      string | null;  // clothing subcategory only; null for others
  sizes:    Record<string, number>;
  // clothing sizes: S, M, L, XL, 2XL, 3XL → quantity
  // non-clothing: { one: quantity }
  price:    number;  // per unit price
}

interface MerchTransaction {
  id:             number;
  itemId:         number;
  itemName:       string;
  kind:           'cycle' | 'produce' | 'sale';
  size:           string;   // 'S' | 'M' | ... | 'one'
  qty:            number;
  price:          number;   // per unit (item.price at time of sale)
  notes?:         string;
  ts:             number;
  // sale-only context fields:
  eventName?:     string | null;
  eventLocation?: string | null;
  eventDate?:     string | null;  // 'YYYY-MM-DD'
}
```

**Constants** (export from `src/lib/merch.ts`):
```typescript
export const MERCH_CATEGORIES  = ['books', 'hats', 'clothing'] as const;
export const CLOTHING_SUBS = ['t-shirts', 'sweaters', 'hoodies', 'crewnecks', 'jean jackets'] as const;
export const CLOTHING_SIZES = ['S', 'M', 'L', 'XL', '2XL', '3XL'] as const;
```

**Transaction kind logic**:
- `cycle` → set exact quantity: `item.sizes[sz] = Math.max(0, enteredQty)`
- `produce` → add stock: `item.sizes[sz] = prev + Math.abs(enteredQty)`
- `sale` → deduct: `item.sizes[sz] = Math.max(0, prev - Math.abs(enteredQty))`

### 4.6 `inventory/production` — AV/Production Equipment

Single Firestore doc.

```typescript
// Document: inventory/production
interface ProductionDoc {
  items: ProductionItem[];
}

interface ProductionItem {
  id:         number;    // Date.now() + random, used as key
  item:       string;    // e.g. "XLR Cable"
  type:       string;    // e.g. "Cable", "Stand", "Light"
  length:     string;    // e.g. "25" (feet), free text
  location:   string;    // one of PRODUCTION_LOCATIONS
  qty:        number;
  unitPrice:  number;
}

export const PRODUCTION_LOCATIONS = ['Big Trailer','Small Trailer','WH2','E1','E2'] as const;
```

### 4.7 `inventory/reorder` — Reorder Link List

Single Firestore doc.

```typescript
// Document: inventory/reorder
interface ReorderDoc {
  items: ReorderItem[];
}

interface ReorderItem {
  id:   number;   // Date.now() at creation
  name: string;
  link: string;   // must start with http:// or https://
}
```

### 4.8 `announcements/{id}` — Announcements

```typescript
interface Announcement {
  id:         number;         // Firestore doc ID = String(id)
  title:      string;
  body:       string;
  isPublic:   boolean;        // true = visible to public users in pubhome
  audience:   string[];       // uid list; empty = broadcast to ALL authenticated users
  attachment?: Attachment | null;
  by:         string;         // uid of creator
  ts:         number;
}
```

**Counter key**: `nNotif` in `config/main` (same counter as in-app notifications — they share it).  
**Visibility filter**: user sees announcement if `audience.length === 0` (broadcast) OR `audience.includes(user.uid)`.

### 4.9 `config/main` — Posts Config (nested in existing doc)

Posts data is stored inside `config/main` (no separate collection).

```typescript
// Part of config/main document
interface PostsConfig {
  postsConfig: {
    pages: PostPage[];
  };
  lastSeenPosts: Record<string, string>;  // pageId → last-seen post date string ('YYYY-MM-DD')
}

interface PostPage {
  id:       string;   // e.g. 'page_1718123456789'
  label:    string;   // display name
  bgImage?: string;   // URL for page thumbnail / avatar
  fbUrl?:   string;   // Facebook page URL (for "View on Facebook" link)
  desc?:    string;   // caption shown below page selector button
  posts:    Post[];
}

interface Post {
  id:     string;    // e.g. 'post_' + Date.now()
  date:   string;    // 'YYYY-MM-DD'
  url:    string;    // Facebook post URL (direct link, not oEmbed)
  title?: string;
  note?:  string;    // extra context shown in card
}
```

**Unseen logic**: A post is "unseen" if `post.date > lastSeenPosts[pageId]`. Update `lastSeenPosts[pageId]` to the latest post date when the user opens the page.

### 4.10 Attachment type (shared)

```typescript
// src/types/shared.ts
export interface Attachment {
  name: string;
  url:  string;   // Firebase Storage download URL
  type: string;   // MIME type, e.g. 'image/jpeg', 'application/pdf'
}
```

File upload for Phase 3 attachments uses `expo-image-picker` (native) or `<input type="file">` (web) → upload to Firebase Storage at path `attachments/{timestamp}_{filename}` → store download URL. Implement a shared `useFileUpload()` hook in `src/hooks/useFileUpload.ts`.

---

## 5. Zustand Store Interfaces

### 5.1 `src/stores/securityStore.ts`

```typescript
import { create } from 'zustand';
import { SecurityReport } from '../types/security';

interface SecurityState {
  reports: SecurityReport[];
  loading: boolean;

  // actions
  loadReports: () => Promise<void>;
  submitReport: (data: {
    type: string; loc: string; desc: string;
    witness?: string; attachment?: Attachment | null;
  }) => Promise<void>;
  acknowledgeReport: (reportId: number, note: string, attachment?: Attachment | null) => Promise<void>;
  clearAcknowledged: () => Promise<void>;  // admin only
}
```

**Implementation notes**:
- `loadReports`: `getDocs(collection(db, 'reports'))` → sort by `ts` descending in-memory.
- `submitReport`: call `nextId('nReport')` → build report object → `setDoc(doc(db, 'reports', String(id)), report)`.
- `acknowledgeReport`: find report in store → push to `ackNotes` → set `ack=true` → `setDoc` the doc → call `addInAppNotif(report.reporter, '...')` → write audit log entry.
- `clearAcknowledged`: delete all Firestore docs where `ack === true`, then reload.

### 5.2 `src/stores/worshipStore.ts`

```typescript
interface WorshipState {
  setlists:  Setlist[];
  inputLists: {
    sunday: InputRow[];
    event:  InputRow[];
    wh2:    InputRow[];
  };
  loading: boolean;

  // setlist actions
  loadSetlists:   () => Promise<void>;
  saveSetlist:    (sl: Setlist) => Promise<void>;
  deleteSetlist:  (id: number) => Promise<void>;
  pruneExpired:   () => Promise<void>;  // delete setlists where date < today

  // input list actions
  loadInputLists:    () => Promise<void>;
  updateInputLists:  (lists: WorshipState['inputLists']) => void;  // debounced write
  persistInputLists: () => Promise<void>;  // actual Firestore write
}
```

**Implementation notes**:
- `pruneExpired`: call on worship screen mount; delete Firestore docs for past setlists, remove from store.
- `saveSetlist`: if new → `nextId('nSetlist')` (add counter if not present; safe to add); use `setDoc`; on publish (and not previously published), call `notifyWorshipUsers(setlist)`.
- `notifyWorshipUsers(setlist)`: get worship/admin users → filter to those assigned to the linked event (if `eventId` set) → call `addInAppNotif` for each. Do not email.
- Input lists: `debounce(persistInputLists, 500ms)` — call persist 500 ms after last edit.

### 5.3 `src/stores/musicStore.ts`

```typescript
interface MusicState {
  items:   MusicItem[];
  loading: boolean;

  loadItems:   () => Promise<void>;
  addItem:     (item: Omit<MusicItem, 'id'>) => Promise<void>;
  updateItem:  (id: number, patch: Partial<MusicItem>) => Promise<void>;
  deleteItem:  (id: number) => Promise<void>;
}
```

**Implementation**: Read/write `music/db` single doc. `addItem` generates `id = items.length > 0 ? Math.max(...items.map(i=>i.id)) + 1 : 1` (no shared counter needed — local to the doc). `newUntil` is computed in the store: `new Date(Date.now() + item.newDays * 86400000).toISOString()`.

### 5.4 `src/stores/inventoryStore.ts`

```typescript
interface InventoryState {
  // merch
  items:        MerchItem[];
  transactions: MerchTransaction[];
  nItem:        number;
  nTx:          number;

  // production
  productionItems: ProductionItem[];

  // reorder
  reorderItems: ReorderItem[];

  loading: boolean;

  // merch actions
  loadMerch:      () => Promise<void>;
  addMerchItem:   (item: Omit<MerchItem, 'id'>) => Promise<void>;
  deleteMerchItem:(id: number) => Promise<void>;
  recordAdj:      (item: MerchItem, kind: 'cycle'|'produce'|'sale', sizes: Record<string,number>, opts?: {
    notes?: string; eventName?: string; eventLocation?: string; eventDate?: string;
  }) => Promise<void>;

  // production actions
  loadProduction:       () => Promise<void>;
  addProductionRow:     () => Promise<void>;
  updateProductionRow:  (id: number, patch: Partial<ProductionItem>) => Promise<void>;
  deleteProductionRow:  (id: number) => Promise<void>;

  // reorder actions
  loadReorder:     () => Promise<void>;
  addReorderItem:  (name: string, link: string) => Promise<void>;
  updateReorderItem:(id: number, patch: {name?: string; link?: string}) => Promise<void>;
  deleteReorderItem:(id: number) => Promise<void>;
}
```

**Implementation notes**:
- All three datasets read/write their own Firestore docs; load them in parallel with `Promise.all`.
- `recordAdj`: mutate `item.sizes` in-store, push new `MerchTransaction` objects, then write `merch/inventory` doc.
- Production rows: use `Date.now() + Math.floor(Math.random()*1000)` as `id`.

### 5.5 `src/stores/announcementStore.ts`

```typescript
interface AnnouncementState {
  announcements: Announcement[];
  loading: boolean;

  loadAnnouncements: () => Promise<void>;
  createAnnouncement:(data: {
    title: string; body: string; isPublic: boolean;
    audience: string[]; attachment?: Attachment | null;
  }) => Promise<void>;
  deleteAnnouncement:(id: number) => Promise<void>;
}
```

**Implementation notes**:
- `createAnnouncement`: `nextId('nNotif')` → build object → `setDoc` → send in-app notifs to recipients → write audit entry.
- Recipient list: `audience.length > 0 ? audience : allUsers.map(u => u.uid)` (get all users from `usersStore` or from Firestore `users` collection).

### 5.6 `src/stores/postsStore.ts`

```typescript
interface PostsState {
  pages:        PostPage[];
  lastSeen:     Record<string, string>;  // pageId → date
  loading: boolean;

  loadPosts:     () => Promise<void>;
  markPageSeen:  (pageId: string, latestDate: string) => Promise<void>;
  // admin actions
  addPage:       (page: Omit<PostPage, 'id' | 'posts'>) => Promise<void>;
  updatePage:    (pageId: string, patch: Partial<PostPage>) => Promise<void>;
  deletePage:    (pageId: string) => Promise<void>;
  addPost:       (pageId: string, post: Omit<Post, 'id'>) => Promise<void>;
  deletePost:    (pageId: string, postId: string) => Promise<void>;
}
```

**Implementation notes**:
- All data lives in `config/main` as `postsConfig` and `lastSeenPosts` fields. Read from existing `config/main` doc (already loaded by Phase 2's `loadState`). Write with `updateDoc(doc(db,'config','main'), {postsConfig: ..., lastSeenPosts: ...})`.
- `markPageSeen`: update `lastSeen[pageId]` to the `date` of the newest post in that page. Write to Firestore debounced 1s.
- `hasUnseenPost(pageId)`: `posts.some(p => p.date > (lastSeen[pageId] ?? ''))`.

---

## 6. Screen Specifications

### 6.1 Security Screen — `src/screens/SecurityScreen.tsx`

**Access guard**: redirect to home if `!isSecurity(user) && !isAdmin(user)`.

**Tab structure**:
```
Tab bar: [Report a Concern] [Queue (N)] [All Reports]
         (all users)        (security/admin) (admin only)
```
The "Queue (N)" badge shows count of unacknowledged reports (`ack === false`).

**Report a Concern sub-tab** (everyone can file):
- Form fields (all validated before submit):
  - Type (Picker/Select): `Safety Concern`, `Medical Emergency`, `Suspicious Activity`, `Property Damage`, `Child Safety`, `Other` — required
  - Location (TextInput) — required
  - Description (multiline TextInput, min 3 lines) — required
  - Witness (TextInput) — optional
  - Attach photo/file (optional, via `useFileUpload`)
- On submit:
  - Validate all required fields
  - `securityStore.submitReport(...)`
  - Show success toast "Report submitted. Security team notified."
  - Send in-app notification to all `isSecurity` or `isAdmin` users: `"New security report: {type} at {loc}"`
  - Write audit: `'Security Report Submitted'`, detail: `'{type} at {loc}'`

**Queue sub-tab** (security + admin):
- Shows all reports where `ack === false`, sorted newest first
- Each card shows: type (badge), timestamp, location, description, witness (if any), attachment (if any), reporter name, existing ack notes (if any), **Acknowledge** button
- Pressing **Acknowledge** opens the Ack Note bottom sheet/modal (§7.1)

**All Reports sub-tab** (admin only):
- Shows all reports (acknowledged and pending), sorted newest first
- Cards show status dot: green = Cleared, amber = Pending
- Admin only: "Clear Completed Reports (N)" button — deletes all `ack=true` docs from Firestore

**State**: use `securityStore`. Subscribe to real-time updates via `onSnapshot` on the `reports` collection (start listener when screen mounts, stop when unmounts).

---

### 6.2 Worship Screen — `src/screens/WorshipScreen.tsx`

**Access guard**: redirect to home if `!isWorship(user) && !isAdmin(user)`.

**Tab structure**:
```
Tab bar: [Setlist] [Input List]
```

#### Setlist Sub-Tab

- Load setlists from `worshipStore`. Call `pruneExpired()` on mount.
- Sort setlists ascending by `date`.
- Header row: "Setlists" title + "+ New Setlist" button (opens Edit Setlist bottom sheet).
- Empty state: "No setlists yet. Create one to get started."
- Each setlist card:
  - Header: "Setlist for {FD(date)}" + "{N} songs · Published/Draft"
  - Buttons: Edit, Delete (with confirm)
  - Song table columns: Song, Key, Link (tappable), Notes
  - Empty song state: "No songs added yet."

**Edit Setlist bottom sheet** (§7.2)

#### Input List Sub-Tab

- Three sub-tabs: **Sunday** (44 rows), **Event** (44 rows), **WH2** (32 rows)
- Each tab renders a scrollable table with columns: **Row#**, **Input**, **Output**
- All cells are editable inline (TextInput in each cell)
- Debounce writes 500 ms after last edit
- Rows are fixed-length — never add/remove rows, only edit content
- Display columns with fixed widths using a horizontal ScrollView wrapper to handle narrow screens

**State**: `worshipStore`. Load input lists on mount if not already loaded.

---

### 6.3 Music / Content Screen — `src/screens/MusicScreen.tsx`

**Access**: all authenticated users (not role-gated).

**Admin build mode toggle**: If `isAdmin(user)`, show a "Build Mode" button (top-right). Toggling enters admin mode.

#### View Mode (everyone)

Header:
```
"Content"  (large, accent color)
"Music, podcasts, and sermons from The Well of Iowa"
```

Search bar at top. On entering text, filter all items and show results grouped by type (Music / Podcasts / Sermons). If no results: "No results found."

When no search query, show scrollable rows:
1. **🔥 New** — items where `isNew && new Date(newUntil) >= now`
2. **Featured** — items where `featured === true`
3. **Music** — items where `type === 'music'`
4. **Podcasts** — items where `type === 'podcast'`
5. **Sermons** — items where `type === 'sermon'`

Skip rows that are empty. Each row:
- Header: "{row label}" (accent color) + "See All" button (if > 6 items)
- Horizontal scroll strip of cards (6 visible before "See More" card)
- Each card (140×auto): thumbnail (100px tall), title (12px bold), album (10px secondary)
- "NEW" badge in top-right corner if item is new
- Tapping a card → **Play Music bottom sheet** (§7.3)

"See All" → shows a full-screen grid (all items of that type), with a back button.

#### Admin Build Mode

List view of all items:
- Each row: thumbnail (48×48), title + type badge (MUSIC/PODCAST/SERMON) + NEW badge if applicable, album/year, edit (✎) + delete (×) buttons
- "+ Add Song / Podcast" button at top
- Tapping edit → **Edit Song bottom sheet** (§7.4)

**State**: `musicStore`. Load on mount.

---

### 6.4 Inventory Screen — `src/screens/InventoryScreen.tsx`

**Access guard**: redirect to home if `!isMerch(user) && !isAdmin(user)`.

**Tab structure** (role-dependent):
```
[Merch]                  ← visible to merch + admin
[Reorder]                ← admin only
[Production]             ← admin only
```
Default to first available tab.

#### Merch Sub-Tab (`MerchView`)

Three inner sub-tabs: Inventory, Transactions, Analysis & Trends

**Inventory inner tab**:
- "+ Add Item" button (admin only)
- Items grouped by category (books, hats, clothing), then by sub-category for clothing
- Category header: category name in accent color
- Sub-category header: sub name in secondary color
- Each item card:
  - Header: item name (bold) + price + delete button (admin) + sub label
  - Size/qty display:
    - Clothing: grid of size pills (`S`, `M`, `L`, `XL`, `2XL`, `3XL`), label above quantity; quantity in red if 0
    - Non-clothing: single "Stock" pill with quantity
  - Action buttons: "Cycle Count", "+ Produce", "Record Sale"
  - Each button opens an adjustment bottom sheet (§7.5) with the appropriate `kind`

**Transactions inner tab**:
- Search bar (filter by itemName, eventName, notes)
- "All events" / "Direct sales only" filter picker
- Count label: "N transactions (filtered)"
- Cards in reverse chronological order:
  - Header: item name + kind badge (color-coded: blue=Cycle Count, green=Production, red=Sale)
  - Size: qty line with `±qty` (- for sale, + for produce/cycle)
  - Revenue line for sales: `$XX.XX`
  - Event context for sales: event name badge, date, location (or "Direct sale" in italic)
  - Recorded timestamp

**Analysis inner tab**: see §6.4.1.

#### Reorder Sub-Tab (admin)

- "+ Add Item" form at top: Item Name input + Reorder URL input + Add button
- Validation: name required, URL required and must start with `http://` or `https://`, no duplicate names
- Search/filter input
- List of items, each row:
  - Item name (tappable to edit inline)
  - Reorder link (tappable to open, long-press or right-click to edit inline on web)
  - "Order ↗" button to open URL
  - Delete (×) button

#### Production Sub-Tab (admin)

Two inner sub-tabs: **Inventory**, **Analysis**

**Inventory inner tab**:
- Filter row: Item (text), Type (text), Length (text), Location (picker from `PRODUCTION_LOCATIONS`)
- "+ Add Row" button
- Spreadsheet table (horizontal scroll): Item | Qty | Type | Length (ft) | Location | Unit Price | Total Value | (delete)
- All cells are editable inline
- Location cell is a picker (Select from `PRODUCTION_LOCATIONS`)
- `Total Value = qty × unitPrice`
- Subtotal row at bottom (sum of filtered rows)
- Auto-save on cell blur (debounced 250 ms)

**Analysis inner tab**:
- "View by Type" picker (Aggregate / or individual type)
- Bar charts: "Total Value by Item" + "Quantity by Item" (top 20 items each)
- Summary cards: Total Quantity, Total Value, Unique Items

#### 6.4.1 Merch Analysis Details

This is a rich analytics view. Port the following data aggregations:

```typescript
function buildMerchAnalysis(txs: MerchTransaction[], items: MerchItem[]) {
  const sales = txs.filter(t => t.kind === 'sale');
  
  // Revenue and units per item
  const revenueByItem: Record<string, number> = {};
  const unitsByItem:   Record<string, number> = {};
  
  // Revenue and units by season (Spring=Mar-May, Summer=Jun-Aug, Fall=Sep-Nov, Winter=Dec-Feb)
  const seasons = ['Spring','Summer','Fall','Winter'] as const;
  const revBySeason:   Record<string, number> = { Spring:0, Summer:0, Fall:0, Winter:0 };
  const unitsBySeason: Record<string, number> = { Spring:0, Summer:0, Fall:0, Winter:0 };
  
  // Revenue and units by month (0-11)
  const revByMonth:   number[] = Array(12).fill(0);
  const unitsByMonth: number[] = Array(12).fill(0);
  
  // Revenue by event location and event name
  const revByLocation:  Record<string, number> = {};
  const revByEventName: Record<string, number> = {};
  
  // Clothing size sales by season and month
  const clothingBySeason: Record<string, Record<string, number>> = {};
  
  // ... aggregation loop similar to original
  
  // Display sections:
  // 1. Summary stat cards: Total Revenue, Units Sold, Transactions, Products, Avg Sale
  // 2. Top Sellers by Revenue (bar chart, top 7)
  // 3. Sales by Season (bar chart)
  // 4. Monthly Trend (bar chart, all 12 months)
  // 5. Location Intelligence (bar chart by location, top 10)
  // 6. Event Performance (bar chart by event name)
  // 7. Size Intelligence (if clothing items exist): most popular, least popular, zero sizes
  // 8. Trend Analysis (linear regression on monthly revenue → rising/falling/stable + R² confidence)
  // 9. AI-style insights (string observations, e.g. "Best season: Summer")
}
```

Summary stat cards (5 in a grid): Total Revenue ($), Units Sold, Transactions, Products (unique items), Avg Sale ($).

Insights are pre-computed text strings displayed in styled boxes, e.g.:
- "Best performing season: {season} with ${rev}"
- "Top seller: {item} — ${rev} revenue ({units} units)"
- "Trending {up/down}: Revenue {increasing/declining} at ${|slope|}/month (R²={r2})"

Bar charts are native React Native views (no external chart library needed — use `View` with percentage-width fills, same pattern as the original inline bar charts).

---

### 6.5 Announcements Screen — `src/screens/AnnouncementScreen.tsx`

**Access**: all authenticated users can view; admin only can create.

Layout:
- Header row: "Announcements" title + "+ New Announcement" button (admin only)
- Empty state: "No announcements yet."
- Cards (newest first), filtered to user's audience:
  - Title (bold, accent-adjacent color)
  - Date (short format: "May 27, 2026")
  - Body text (normal, ~80% opacity, line-height 1.7)
  - Attachment preview (if present): image or file link
  - "From: {user name}"
  - Delete button (admin only, with `onLongPress` or trash icon)

**Audience filter** (applied in store or screen):
```typescript
const myAnnouncements = announcements.filter(a =>
  !a.audience || a.audience.length === 0 ||
  a.audience.some(id => id === user.uid)
);
```

**Create Announcement bottom sheet** (admin, §7.6).

**State**: `announcementStore`. Load on mount. No realtime subscription needed — pull-to-refresh is sufficient.

---

### 6.6 Posts Screen — `src/screens/PostsScreen.tsx`

**Access**: all authenticated users, including public users.

**Page selector** (horizontal scroll row):
- Each page shown as a "card button" (rounded rectangle):
  - Background image (or fallback icon if no image)
  - Label bar at bottom (white text, accent background if active)
  - Unseen dot in top-right if there are unseen posts
- Tapping sets active page and marks it seen

**Posts display**:
- Empty state if no pages, or "No posts yet. View on Facebook" link if page has fbUrl.
- Navigation: "← Newer" / "Older →" buttons with current date and "· Latest" badge on newest
- Post card:
  - Avatar (page thumbnail or letter-avatar)
  - Page name + date
  - Title (if any)
  - Note/context text (if any)
  - "View on Facebook" button (blue, opens URL in browser)
  - Caption: "Full post with likes and comments on Facebook"

**Archive**:
- "Browse Archive (N posts)" expand button
- List of all post dates + titles, tap to navigate to that post

**Admin build mode**:
- Toggle "Build Mode" button
- Section per page:
  - Edit page label, background image URL, description, Facebook page URL
  - "Save Page Settings" button
  - Existing posts list with delete (×) per post
  - "Add Post" form: date, Facebook post URL (required), title (optional), note (optional)
  - Delete Page button (with confirm)
- "+ Add Facebook Page" button

**Seen state**: when user opens a page, call `postsStore.markPageSeen(pageId, latestPostDate)`.

---

## 7. Modal / Bottom Sheet Specifications

Use a bottom sheet component (e.g. `@gorhom/bottom-sheet`) for all of these. On web, render as a centered modal with backdrop.

### 7.1 Acknowledge Report

Triggered by: "Acknowledge" button on a queue report card.

```
Header: "Acknowledge Report"
Sub-header: "{report.type} at {report.loc}" (secondary color)
Body text: "Describe what was done to address this concern..."

Fields:
  - Response Notes (multiline TextInput, required, min 3 lines tall)
  - Attach Photo/File button + preview

Note: "These notes are visible to security team and admins only." (small italic)

Footer: [Cancel] [Acknowledge & Submit Note]
```

On submit:
- Validate: note text required
- Push `{note, attachment, by: user.uid, ts: Date.now()}` to `report.ackNotes`
- Set `report.ack = true`
- `securityStore.acknowledgeReport(report.id, note, attachment)`
- Send in-app notif to `report.reporter`: `"Your {type} report ("{loc}") has been acknowledged by the security team."`
- Write audit: `'Security Report Acknowledged'`, detail: `'{type} at {loc}'`

### 7.2 Edit Setlist

Triggered by: "+ New Setlist" or "Edit" button on setlist card.

```
Header: "New Setlist" or "Edit Setlist"

Fields:
  - Date (DatePicker, required, must be today or future)
  - Linked Event: 
      - Show linked event as a dismissible tag (tap to remove)
      - Searchable combo-box of events (from eventsStore.allTemplates)
      - "📅 Pick from Calendar" toggle → mini calendar showing event days
  
  - Songs section:
      (for each song)
      - Song title (TextInput)
      - Key (TextInput, max ~100px wide, placeholder "G, Bb, C#m")
      - Link (URL TextInput)
      - Notes (TextInput)
      - [Remove Song] button
    [+ Add Song / Podcast] button
  
  - "Published automatically on save" checkbox (default: true)

Footer: [Cancel] [Save]
```

Validation: date required; date cannot be in the past. Filter out songs with empty title before saving.

On save: if published and was draft before → call `notifyWorshipUsers(setlist)`.

**Mini calendar in setlist picker**:
- Shows current month grid
- Days with events highlighted (accent color background)
- Tapping an event day sets `date` and `eventId` in the form
- Back/forward month navigation

### 7.3 Play Music

Triggered by: tapping a music card.

```
Header: song.title
Sub-header: "{album} · {year}" (if present)

Body:
  - YouTube embed (WebView on native, <iframe> on web)
  - URL: https://www.youtube.com/embed/{videoId}?rel=0
  - 16:9 aspect ratio
  - "Open in YouTube" link below embed

Footer: [Close]
```

On native, use `react-native-webview` to render the embed. If the video cannot be embedded (private/restricted), fall back to opening the YouTube URL in the device browser.

### 7.4 Edit Song / Add Song

Triggered by: "+ Add Song / Podcast" or edit (✎) button in build mode.

```
Header: "Add Song" or "Edit Song"

Type selector (3 toggle buttons): Music | Podcast | Sermon

Fields:
  - Title (TextInput, label changes: "Song Title *" / "Episode Title *" / "Sermon Title *")
  - YouTube URL * (URL input)
  - Thumbnail preview (auto-generated from YouTube URL — show 120px wide image)
  - Album / Series (optional, label adjusts per type)
  - Year (optional)
  - "Featured" checkbox
  - "Mark as New" checkbox → expands "Show as New for (days)" number input (default 30)

Footer: [Cancel] [Save]
```

Validation: title required, YouTube URL required.

On save:
- Extract YouTube ID → generate thumbnail URL
- If `isNew && newDays > 0`: compute `newUntil = new Date(Date.now() + newDays * 86400000).toISOString()`
- `musicStore.addItem(...)` or `musicStore.updateItem(...)`

### 7.5 Merch Adjustment

Triggered by: "Cycle Count", "+ Produce", or "Record Sale" buttons on merch item card.

```
Header: "Cycle Count (Set Exact Qty)" | "Record Production (Add Stock)" | "Record Sale (Deduct Stock)"
Sub-header: item.name

For clothing items:
  Current stock hint: "Current stock in parentheses"
  3-column grid of size inputs:
    S (N)  |  M (N)  |  L (N)
    XL (N) | 2XL (N) | 3XL (N)
  Each: label shows size + current qty, TextInput for new qty

For non-clothing:
  Single: "Quantity (current: N)"

Sale only — Event Context section (optional):
  Quick-pick dropdown from recent events (90 days back to 30 days forward)
  Manual fields: Event Name, Event Location, Event Date

Notes (optional, all kinds)

Footer: [Cancel] [Save]
```

Validation: at least one quantity entered.

Logic per kind (applied per size):
- `cycle`: `item.sizes[sz] = Math.max(0, enteredQty)`
- `produce`: `item.sizes[sz] = prev + Math.abs(enteredQty)`
- `sale`: `item.sizes[sz] = Math.max(0, prev - Math.abs(enteredQty))`

For each size with an entered quantity > 0, create a `MerchTransaction`:
```typescript
{
  id: inventoryStore.nTx++,
  itemId: item.id, itemName: item.name,
  kind, size: sz, qty: Math.abs(enteredQty),
  price: item.price, notes,
  ts: Date.now(),
  // sale only:
  eventName: eventName || null,
  eventLocation: eventLocation || null,
  eventDate: eventDate || null,
}
```

### 7.6 Create Announcement

Triggered by: "+ New Announcement" button (admin only).

```
Header: (no title bar — fits as bottomsheet)

Fields:
  - Title (TextInput, required)
  - Message (multiline TextInput, required, minHeight 100)
  - "Send To" section:
      Note: "No one selected = broadcast to ALL users"
      Audience tags (dismissible, one per selected user)
      Picker: "Add person or group..." → lists all users + groups
        Groups expand to their members when added
      Selected audience count updates note label
  - Attach Image/File (optional, with preview + [Remove] button)
  - "Public Announcement" checkbox: visible to public users in pubhome

Footer: [Cancel] [Post Announcement]
```

Validation: title and body required.

On submit:
- `nextId('nNotif')` → build `Announcement` object
- `announcementStore.createAnnouncement(...)`
- Send in-app notif to all recipients: `"New announcement: {title}"` (type: `'announce'`)
- Write audit: `'Create Announcement'`, detail: `title`
- Show toast: "Announcement posted!"

**Groups expansion**: when a group is selected from the picker, add all group members to the audience array (deduplicated). Show individual user tags, not group tags.

---

## 8. Utility Functions to Port

### 8.1 `FD(dateStr)` — date formatter

Already implemented in Phase 2 (`src/lib/date.ts`). Re-use it.

### 8.2 `sameId(a, b)` — UID comparator

Already implemented in Phase 2. Re-use it.

### 8.3 `nextId(key)` — Firestore counter

Already implemented in Phase 2. Re-use it.

### 8.4 `extractYouTubeId` and `youtubeThumbnail`

New for Phase 3. Add to `src/lib/media.ts`:

```typescript
// src/lib/media.ts

export function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/))([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

export function youtubeThumbnail(url: string): string | null {
  const id = extractYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}
```

### 8.5 `useFileUpload` — shared file picker + Storage upload hook

Create `src/hooks/useFileUpload.ts`:

```typescript
// src/hooks/useFileUpload.ts
import * as ImagePicker from 'expo-image-picker';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Attachment } from '../types/shared';

export function useFileUpload() {
  const storage = getStorage();

  async function pickAndUpload(): Promise<Attachment | null> {
    // Request permissions
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return null;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      quality: 0.8,
      allowsEditing: false,
    });

    if (result.canceled || !result.assets.length) return null;

    const asset = result.assets[0];
    const filename = `${Date.now()}_${asset.fileName ?? 'upload'}`;
    const storageRef = ref(storage, `attachments/${filename}`);

    // Convert URI to blob
    const response = await fetch(asset.uri);
    const blob = await response.blob();

    await uploadBytes(storageRef, blob);
    const url = await getDownloadURL(storageRef);

    return {
      name: asset.fileName ?? filename,
      url,
      type: asset.mimeType ?? 'application/octet-stream',
    };
  }

  return { pickAndUpload };
}
```

For web, use `<input type="file">` via a ref and `uploadBytes` directly.

### 8.6 `getSeason(ts)` — for merch analysis

```typescript
export function getSeason(ts: number): 'Spring' | 'Summer' | 'Fall' | 'Winter' {
  const m = new Date(ts).getMonth();
  if (m >= 2 && m <= 4) return 'Spring';
  if (m >= 5 && m <= 7) return 'Summer';
  if (m >= 8 && m <= 10) return 'Fall';
  return 'Winter';
}
```

### 8.7 `linReg(xVals, yVals)` — linear regression for merch trend

```typescript
export function linReg(xVals: number[], yVals: number[]) {
  const n = xVals.length;
  if (n < 2) return { m: 0, b: yVals[0] ?? 0, r2: 0 };
  const xm = xVals.reduce((s, v) => s + v, 0) / n;
  const ym = yVals.reduce((s, v) => s + v, 0) / n;
  let num = 0, den = 0, ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    num += (xVals[i] - xm) * (yVals[i] - ym);
    den += (xVals[i] - xm) ** 2;
  }
  const m = den > 0 ? num / den : 0;
  const b = ym - m * xm;
  yVals.forEach((y, i) => {
    ssRes += (y - (m * xVals[i] + b)) ** 2;
    ssTot += (y - ym) ** 2;
  });
  const r2 = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 0;
  return { m, b, r2 };
}
```

---

## 9. Navigation Integration

Phase 2 set up the tab bar in `app/(app)/_layout.tsx`. Add the six new routes to the appropriate tab sections.

**Tab visibility rules** (add to `src/lib/roles.ts` if not already present):

```typescript
export function canSeeSecurity(u: UserProfile | null) {
  return !u ? false : isAdmin(u) || hasRole(u,'security') || hasRole(u,'staff');
}
export function canSeeWorship(u: UserProfile | null) {
  return !u ? false : isAdmin(u) || hasRole(u,'worship');
}
export function canSeeMerch(u: UserProfile | null) {
  return !u ? false : isAdmin(u) || hasRole(u,'merch');
}
```

In the tab/nav setup, conditionally include tabs:
- Security: if `canSeeSecurity(user)` — show badge count if pending reports > 0
- Worship: if `canSeeWorship(user)` && `!isAdmin(user)` (admins see it via admin tabs)
- Inventory: if `canSeeMerch(user)` && `!isAdmin(user)`
- Music: always show (all authenticated)
- Announcements: always show (all authenticated)
- Posts: always show (including public users)

---

## 10. Firestore Security Rules Additions

Add to the existing rules file (extending Phase 1 and Phase 2 rules):

```javascript
// Security reports
match /reports/{reportId} {
  // Any authenticated user can create a report
  allow create: if request.auth != null;
  // Security/admin can read and update (acknowledge)
  allow read, update: if request.auth != null &&
    (isAdmin() || hasRole('security') || hasRole('staff'));
  // Only admin can delete
  allow delete: if isAdmin();
}

// Setlists
match /setlists/{setlistId} {
  allow read: if request.auth != null &&
    (isAdmin() || hasRole('worship'));
  allow write: if request.auth != null &&
    (isAdmin() || hasRole('worship'));
}

// Announcements
match /announcements/{annId} {
  allow read: if request.auth != null;
  allow create, update, delete: if isAdmin();
}

// Merch — single doc access
match /merch/{docId} {
  allow read: if request.auth != null &&
    (isAdmin() || hasRole('merch'));
  allow write: if request.auth != null &&
    (isAdmin() || hasRole('merch'));
}

// Inventory (production + reorder) — admin only
match /inventory/{docId} {
  allow read, write: if isAdmin();
}

// Music — all authenticated can read, admin can write
match /music/{docId} {
  allow read: if request.auth != null;
  allow write: if isAdmin();
}
```

These rules depend on helper functions defined in Phase 1 rules (`isAdmin()`, `hasRole(role)`). Ensure those helpers are present.

---

## 11. Acceptance Criteria

The following must all pass before Phase 3 is signed off:

### Security
- [ ] AC-3-01: A user with no security role cannot navigate to `/security` — they are redirected to home.
- [ ] AC-3-02: Any authenticated user can submit a security report with type, location, description, and optional witness + attachment.
- [ ] AC-3-03: Submitting a report creates a Firestore doc in `reports/{id}` with `ack: false` and correct fields.
- [ ] AC-3-04: On report submit, all users with security or admin roles receive an in-app notification.
- [ ] AC-3-05: The Queue tab shows only `ack: false` reports; the count in the tab badge matches.
- [ ] AC-3-06: A security user can acknowledge a report — it requires a non-empty note; on save `ack` becomes `true`.
- [ ] AC-3-07: After acknowledging, the reporter receives an in-app notification.
- [ ] AC-3-08: Admin can see All Reports (both pending and cleared).
- [ ] AC-3-09: Admin "Clear Completed Reports" button deletes all `ack: true` Firestore docs.

### Worship
- [ ] AC-3-10: A user without worship or admin role is redirected from `/worship`.
- [ ] AC-3-11: Expired setlists (date < today) are deleted from Firestore on worship screen load.
- [ ] AC-3-12: Creating a setlist with a past date shows a validation error.
- [ ] AC-3-13: A new published setlist creates a Firestore doc with correct fields and triggers in-app notifications for eligible worship/admin users.
- [ ] AC-3-14: If the setlist is linked to an event, only worship/admin users assigned to that event are notified.
- [ ] AC-3-15: Input list edits are debounced 500 ms before writing to `config/inputLists`.
- [ ] AC-3-16: Sunday, Event, and WH2 lists always maintain their fixed row counts (44/44/32).

### Music
- [ ] AC-3-17: All authenticated users (including public) can browse the Music screen.
- [ ] AC-3-18: Song rows (New, Featured, Music, Podcasts, Sermons) only appear if they have items.
- [ ] AC-3-19: Searching by title or album filters across all types correctly.
- [ ] AC-3-20: Entering a YouTube URL auto-generates the thumbnail preview in the Edit Song form.
- [ ] AC-3-21: "Mark as New" with 30 days sets `newUntil` to now + 30 days; the 🔥 New row shows the item until that date.
- [ ] AC-3-22: On native, the Play Music sheet renders a WebView embed; "Open in YouTube" link works.
- [ ] AC-3-23: Admin can add, edit, and delete songs in Build Mode; changes persist to `music/db`.

### Inventory
- [ ] AC-3-24: A user without merch or admin role is redirected from `/inventory`.
- [ ] AC-3-25: Merch user (non-admin) sees only the Merch tab; admin sees Merch + Reorder + Production.
- [ ] AC-3-26: Adding a clothing item creates it with `sizes: {S:0, M:0, L:0, XL:0, '2XL':0, '3XL':0}`.
- [ ] AC-3-27: Adding a non-clothing item creates it with `sizes: {one: 0}`.
- [ ] AC-3-28: Cycle Count sets exact quantity; Produce adds; Sale deducts (minimum 0).
- [ ] AC-3-29: Each adjustment creates a correct `MerchTransaction` in `transactions[]`.
- [ ] AC-3-30: Sale transactions with event context store `eventName`, `eventLocation`, `eventDate`.
- [ ] AC-3-31: Merch Analysis shows summary stat cards and at least one bar chart when sales exist.
- [ ] AC-3-32: Production inventory rows are editable inline; changes save to `inventory/production`.
- [ ] AC-3-33: Production Analysis bar charts group by item key (`item + length`) correctly.
- [ ] AC-3-34: Reorder items can be added with a valid URL; duplicate names are rejected.

### Announcements
- [ ] AC-3-35: All authenticated users see announcements addressed to them (audience contains their uid or audience is empty).
- [ ] AC-3-36: Public-flagged announcements (`isPublic: true`) are visible to public users on their home screen.
- [ ] AC-3-37: Admin creates an announcement → Firestore doc created → in-app notifications sent to all recipients.
- [ ] AC-3-38: Broadcast (empty audience) sends notifications to all users.
- [ ] AC-3-39: Targeted announcement (audience non-empty) sends notifications only to those users.
- [ ] AC-3-40: Admin can delete an announcement; it is removed from Firestore and from all users' views.

### Posts
- [ ] AC-3-41: Page selector shows unseen dots for pages with posts newer than `lastSeenPosts[pageId]`.
- [ ] AC-3-42: Opening a page clears the unseen dot (updates `lastSeenPosts`).
- [ ] AC-3-43: "Newer" / "Older" navigation works correctly; "Latest" badge appears on the newest post.
- [ ] AC-3-44: "View on Facebook" button opens the post URL in the device browser.
- [ ] AC-3-45: Admin build mode can add a page, add a post to it, and delete both.
- [ ] AC-3-46: Posts data persists in `config/main.postsConfig` — visible after reload.

---

## 12. Common Pitfalls

1. **Security reports use `nReport` counter** — this counter lives in `config/main`. Call `nextId('nReport')` (the Phase 2 helper using Firestore transaction on `config/main`), same as `nEv`, `nTask`, etc.

2. **`nNotif` is shared** between announcements and in-app notifications (the original app used the same counter for both). Use `nextId('nNotif')` for announcement IDs. If you've already set up a separate counter for in-app notifs in Phase 2, reconcile: there should be a single `nNotif` field in `config/main`.

3. **Setlist pruning deletes Firestore docs** — not just removes from the store. After pruning, do a `getDocs(query(collection(db,'setlists'), where('date','<',today)))` and `deleteDoc` each. Then reload.

4. **Input lists write the entire `config/inputLists` doc** — not a subcollection. Use `setDoc(doc(db,'config','inputLists'), { lists: {...} }, { merge: true })`.

5. **Music items use a local ID counter**, not a shared Firestore counter. The `id` field in music items is a numeric index into the `items` array stored in the `music/db` doc. Use `Math.max(...items.map(i=>i.id)) + 1` (or `1` if empty).

6. **Merch and production are single-doc writes** — always write the entire doc (`setDoc` with `{merge:true}`). Do NOT try to update individual fields inside arrays. The arrays can get large (especially transactions), but they're bounded by what was already in production.

7. **Production row IDs are `Date.now() + random`** — not from a shared counter. That is intentional — production rows have no cross-reference anywhere else in the app.

8. **Merch adjustment modal shows current stock in labels** — the format is `"S (10)"` where 10 is the current qty. These labels must update from the live store value at modal open time, not from local state.

9. **YouTube embed on native** — use `react-native-webview` (`expo-webview`). The `<WebView>` must have `allowsInlineMediaPlayback={true}` and `mediaPlaybackRequiresUserAction={false}` to autoplay correctly on iOS.

10. **Posts data is nested in `config/main`** — not its own collection. When writing, use `updateDoc(doc(db,'config','main'), { postsConfig: newConfig, lastSeenPosts: newLastSeen })` and merge carefully. Do not overwrite unrelated `config/main` fields.

11. **Announcement audience is an array of uid strings** — when the user selects a Group, expand it to individual member UIDs at selection time. Store UIDs, never group IDs, in `announcement.audience`.

---

## 13. Handoff Instructions for Implementation Session

Give a fresh session exactly this prompt:

> Read `docs/migration/OVERVIEW.md` for architecture context, then execute `docs/migration/PHASE_3_ROLE_SPECIFIC_TOOLS.md` end-to-end.
>
> The existing Expo app lives in `mission-portal-app/`. Do not touch `index.html`. All work goes into `mission-portal-app/`.
>
> Phases 1 and 2 are complete. The app boots, authenticates users, and renders the following screens: Dashboard, Home, Events, Tasks, Coordination, Improvement, Messages, and Public Home. Those screens work. Do not modify them unless a Phase 3 change explicitly requires it.
>
> **Your only job** is to implement the six screens described in Phase 3: Security, Worship, Music, Inventory, Announcements, and Posts — following the exact Firestore schemas and role rules in the brief.
>
> Before writing any code, read the brief carefully. Note every Firestore collection and document structure. Note which are true collections (one doc per item) vs. single-document stores. Note which screens are role-gated and which are public.
>
> Implementation order (suggested):
> 1. Add type files (`src/types/security.ts`, `src/types/worship.ts`, `src/types/music.ts`, `src/types/inventory.ts`, `src/types/announcements.ts`, `src/types/posts.ts`)
> 2. Add utility functions (`src/lib/media.ts`, `src/lib/merch.ts`, `src/hooks/useFileUpload.ts`)
> 3. Build stores one at a time, testing each with a simple screen placeholder before moving to the next
> 4. Build screens in order: Security → Worship → Music → Inventory → Announcements → Posts
> 5. Wire routes in `app/(app)/` and update nav visibility in `_layout.tsx`
> 6. Add Firestore rules (merge with existing rules, do not replace them)
> 7. Run through every acceptance criterion in §11
>
> Do not start Phase 4. When all 46 acceptance criteria in §11 pass (or you have verified each manually), stop and report completion.

---

*Document ends. Commit this file as the Phase 3 brief and push to `claude/backup-reset-e7b22b9-SUHKv`.*
