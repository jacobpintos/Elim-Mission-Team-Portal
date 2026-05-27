# Phase 5 — Admin & Content

**Scope**: Admin screens (User Management, Groups, Common Teams, Task Templates,
Leadership Team, Audit Trail, Pending Deletions), Theme Editor, Digest Dashboard,
Page Builder (Our Story, Connect, Giving), and the Resend digest engine +
signed-token unsubscribe system (Cloud Functions).

**Pre-conditions**: Phases 1–4 complete. Firebase Auth, Firestore, users/{}
collection, `config/main`, `appSettings/theme`, and `auditLog/{}` collection are
all live. `notificationPrefs.weeklyDigest` and `notificationPrefs.monthlyDigest`
fields exist on all user documents (Phase 1).

---

## 1. Firestore Schemas

### 1.1 `config/main` (existing document — new/modified fields)

```
{
  // EXISTING from earlier phases (do NOT touch):
  COMMON_TEAMS:      string[],
  connectConfig:     ConnectConfig,
  publicPages:       Record<'ourstory'|'connect'|'giving', PageData>,
  postsConfig:       { pages: PostPage[] },
  pendingDel:        PendingDeletion[],   // ← stored here, NOT separate collection
  ...

  // ConnectConfig shape:
  connectConfig: {
    socialLinks:    SocialLink[],         // legacy (kept for backwards compat)
    leadershipTeam: string[],             // uid[]
  }

  // PageData shape:
  publicPages: {
    ourstory: { blocks: PageBlock[], bgImage: string|null, bgParallax: boolean },
    connect:  { blocks: PageBlock[], bgImage: string|null, bgParallax: boolean },
    giving:   { blocks: PageBlock[], bgImage: string|null, bgParallax: boolean },
  }

  // PendingDeletion shape:
  pendingDel: [
    {
      userId:      string,   // uid of user being deleted
      requestedBy: string,   // uid of requesting admin
      approvals:   string[], // uids of approving admins (includes requester)
    }
  ]
}
```

### 1.2 `users/{uid}` (existing — new field for leadership title)

```typescript
interface UserDoc {
  // All existing fields from Phase 1 ...
  title?: string;   // Leadership title/role shown on Connect page (e.g. "Lead Pastor")
}
```

### 1.3 `appSettings/theme` (new document)

```typescript
interface ThemeDoc {
  primaryColor:   string;   // hex e.g. "#e8624a"
  accentColor:    string;   // hex
  bgColor:        string;   // hex (page background)
  cardColor:      string;   // hex (card background)
  textColor:      string;   // hex (auto-computed or admin-overridden)
  textColorAuto:  boolean;  // if true, compute from bgColor luminance
  darkModeEnabled: boolean; // whether admin published a dark palette
  updatedAt:      Timestamp;
  updatedBy:      string;   // uid
}

// Default palette (matches existing CSS vars in index.html):
const DEFAULT_THEME: ThemeDoc = {
  primaryColor:   '#e8624a',
  accentColor:    '#f07d68',
  bgColor:        '#14141e',
  cardColor:      '#1f1f2e',
  textColor:      '#f0ece4',
  textColorAuto:  true,
  darkModeEnabled: true,
  updatedAt:      serverTimestamp(),
  updatedBy:      '',
};
```

### 1.4 `digestStats/{autoId}` (new collection)

Written by Resend webhook Cloud Function.

```typescript
interface DigestStatDoc {
  type:        'weekly' | 'monthly';
  sentAt:      Timestamp;
  recipients:  number;
  delivered:   number;
  bounced:     number;
  opened:      number;
  batchId:     string;   // Resend batch ID for cross-referencing
}
```

### 1.5 `pageBlocks` — inline types for Page Builder

```typescript
type PageBlockType =
  | 'hero' | 'text' | 'image' | 'twocol'
  | 'timeline' | 'button' | 'divider' | 'meeting' | 'social';

interface PageBlock {
  id:   number;   // Date.now() at creation
  type: PageBlockType;
  data: HeroData | TextData | ImageData | TwoColData | TimelineData
       | ButtonData | DividerData | MeetingData | SocialData;
}

// Per-block data shapes:
interface HeroData {
  heading?:      string;
  subheading?:   string;
  bgImage?:      string;
  parallax?:     boolean;
  overlayColor?: string;  // e.g. "rgba(0,0,0,0.4)"
  textColor?:    string;
}
interface TextData     { heading?: string; content?: string; }
interface ImageData    { src?: string; caption?: string; align?: 'left'|'center'|'right'; }
interface TwoColData   { leftHead?: string; leftContent?: string; rightImage?: string; rightContent?: string; }
interface TimelineData { entries?: Array<{ year: string; title: string; desc: string }>; }
interface ButtonData   { label?: string; url?: string; align?: 'left'|'center'|'right'; }
interface DividerData  {}
interface MeetingData  { heading?: string; intro?: string; }
interface SocialData   { heading?: string; links?: Array<{ icon: string; label: string; url: string }>; }
```

---

## 2. Zustand Stores

### 2.1 `adminStore` (`src/stores/adminStore.ts`)

```typescript
import { create } from 'zustand';

interface AdminStore {
  activeTab: 'users'|'groups'|'teams'|'taskTpl'|'leadership'|'audit'|'deletions';
  setActiveTab: (tab: AdminStore['activeTab']) => void;

  // Theme preview (local-only, not saved to Firestore until publishTheme)
  themePreview: ThemeDoc | null;
  setThemePreview: (theme: ThemeDoc | null) => void;
  publishTheme: () => Promise<void>;

  // Audit pagination
  auditPage: number;
  auditSearch: string;
  setAuditPage: (page: number) => void;
  setAuditSearch: (q: string) => void;
}

export const useAdminStore = create<AdminStore>((set, get) => ({
  activeTab: 'users',
  setActiveTab: (tab) => set({ activeTab: tab }),
  themePreview: null,
  setThemePreview: (theme) => set({ themePreview: theme }),
  publishTheme: async () => {
    const preview = get().themePreview;
    if (!preview) return;
    const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
    const { db } = await import('../lib/firebase');
    await setDoc(doc(db, 'appSettings', 'theme'), {
      ...preview,
      updatedAt: serverTimestamp(),
    });
    set({ themePreview: null });
  },
  auditPage: 0,
  auditSearch: '',
  setAuditPage: (page) => set({ auditPage: page }),
  setAuditSearch: (q) => set({ auditSearch: q, auditPage: 0 }),
}));
```

### 2.2 `themeStore` (`src/stores/themeStore.ts`)

```typescript
import { create } from 'zustand';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface ThemeStore {
  theme: ThemeDoc;
  loading: boolean;
  subscribe: () => () => void;
}

export const DEFAULT_THEME: ThemeDoc = {
  primaryColor:   '#e8624a',
  accentColor:    '#f07d68',
  bgColor:        '#14141e',
  cardColor:      '#1f1f2e',
  textColor:      '#f0ece4',
  textColorAuto:  true,
  darkModeEnabled: true,
};

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: DEFAULT_THEME,
  loading: true,
  subscribe: () => {
    const unsub = onSnapshot(doc(db, 'appSettings', 'theme'), (snap) => {
      if (snap.exists()) {
        set({ theme: snap.data() as ThemeDoc, loading: false });
      } else {
        set({ theme: DEFAULT_THEME, loading: false });
      }
    });
    return unsub;
  },
}));
```

### 2.3 `pageBuilderStore` (`src/stores/pageBuilderStore.ts`)

```typescript
import { create } from 'zustand';

type PageKey = 'ourstory' | 'connect' | 'giving';

interface PageBuilderStore {
  buildModeKey: PageKey | null;
  setBuildMode: (key: PageKey | null) => void;
}

export const usePageBuilderStore = create<PageBuilderStore>((set) => ({
  buildModeKey: null,
  setBuildMode: (key) => set({ buildModeKey: key }),
}));
```

### 2.4 `digestStore` (`src/stores/digestStore.ts`)

```typescript
import { create } from 'zustand';

interface DigestStore {
  stats: DigestStatDoc[];
  loading: boolean;
  fetchStats: () => Promise<void>;
}

export const useDigestStore = create<DigestStore>((set) => ({
  stats: [],
  loading: false,
  fetchStats: async () => {
    set({ loading: true });
    const { collection, getDocs, orderBy, query, limit } = await import('firebase/firestore');
    const { db } = await import('../lib/firebase');
    const q = query(
      collection(db, 'digestStats'),
      orderBy('sentAt', 'desc'),
      limit(50),
    );
    const snap = await getDocs(q);
    set({ stats: snap.docs.map((d) => ({ id: d.id, ...d.data() } as DigestStatDoc)), loading: false });
  },
}));
```

---

## 3. Route & File Structure

```
mission-portal-app/
├── app/
│   └── (app)/
│       ├── admin/
│       │   ├── _layout.tsx          # tab navigator: users/groups/teams/taskTpl/leadership/audit
│       │   ├── index.tsx            # redirects to /admin/users
│       │   ├── users.tsx            # User Management tab
│       │   ├── groups.tsx           # Groups tab
│       │   ├── teams.tsx            # Common Teams tab
│       │   ├── task-templates.tsx   # Task Templates tab
│       │   ├── leadership.tsx       # Leadership Team tab
│       │   ├── audit.tsx            # Audit Trail tab
│       │   ├── theme.tsx            # Theme Editor
│       │   └── digests.tsx          # Digest Dashboard
│       ├── pages/
│       │   ├── our-story.tsx        # Page Builder — Our Story
│       │   ├── connect.tsx          # Page Builder — Connect
│       │   └── giving.tsx           # Page Builder — Giving
│       └── ...
├── src/
│   ├── features/
│   │   ├── admin/
│   │   │   ├── UserCard.tsx
│   │   │   ├── CreateUserSheet.tsx
│   │   │   ├── EditUserSheet.tsx
│   │   │   ├── GroupCard.tsx
│   │   │   ├── CreateGroupSheet.tsx
│   │   │   ├── EditGroupSheet.tsx
│   │   │   ├── RoleCheckboxes.tsx
│   │   │   ├── MemberPicker.tsx
│   │   │   ├── AuditEntry.tsx
│   │   │   ├── PendingDeletionCard.tsx
│   │   │   ├── TaskTemplateCard.tsx
│   │   │   └── EditTaskTemplateSheet.tsx
│   │   ├── theme/
│   │   │   ├── ColorPicker.tsx      # color wheel + RGB sliders
│   │   │   ├── ThemePreview.tsx     # live preview panel
│   │   │   └── contrastUtils.ts     # WCAG luminance helpers
│   │   └── page-builder/
│   │       ├── BlockPalette.tsx
│   │       ├── BlockCard.tsx
│   │       ├── BlockEditor/
│   │       │   ├── HeroEditor.tsx
│   │       │   ├── TextEditor.tsx
│   │       │   ├── ImageEditor.tsx
│   │       │   ├── TwoColEditor.tsx
│   │       │   ├── TimelineEditor.tsx
│   │       │   ├── ButtonEditor.tsx
│   │       │   ├── SocialEditor.tsx
│   │       │   └── MeetingEditor.tsx
│   │       ├── BlockRenderer/
│   │       │   ├── HeroBlock.tsx
│   │       │   ├── TextBlock.tsx
│   │       │   ├── ImageBlock.tsx
│   │       │   ├── TwoColBlock.tsx
│   │       │   ├── TimelineBlock.tsx
│   │       │   ├── ButtonBlock.tsx
│   │       │   ├── SocialBlock.tsx
│   │       │   ├── DividerBlock.tsx
│   │       │   └── MeetingBlock.tsx
│   │       └── PageBuilderScreen.tsx   # shared component wrapping all three pages
│   └── stores/
│       ├── adminStore.ts
│       ├── themeStore.ts
│       ├── pageBuilderStore.ts
│       └── digestStore.ts
├── functions/
│   └── src/
│       ├── digest.ts           # weeklyDigest + monthlyDigest scheduled functions
│       ├── webhooks.ts         # POST /resendWebhook handler
│       └── unsubscribe.ts      # GET /unsubscribe handler
```

---

## 4. Screen Specifications

### 4.1 Admin Layout (`app/(app)/admin/_layout.tsx`)

- **Guard**: `useAuthStore` — if `user.roles` does not include `'admin'`, redirect to
  `/(app)/dashboard`.
- Renders a horizontal scrollable tab bar at the top:
  `User Management | Groups | Common Teams | Task Templates | Leadership Team | Audit Trail`
- If `configStore.pendingDel.length > 0`, append a **"Pending Deletions (N)"** tab
  with a red badge.
- Active tab is stored in `useAdminStore().activeTab`. Navigating taps sets tab
  then routes to the matching route.
- On web: standard tab navigator. On native: ScrollView of pressable tabs +
  `Stack.Screen` children.

---

### 4.2 User Management (`app/(app)/admin/users.tsx`)

**List view**:
- Header row: "Team Members" + `+ Add User` button (opens `CreateUserSheet`).
- FlatList of `UserCard` for every document in `users/{}`.
- **UserCard** (`src/features/admin/UserCard.tsx`):
  - Left: initials avatar (2 chars from name, background `#1a1010`)
  - Centre: name (bold), email (muted)
  - Right: role badge — comma-joined display labels from `userRoleDisplay()` (see §4.2a)
  - Below: "Edit Role" + "Delete" buttons — **hidden if the card's uid === currentUser.uid**
    (you cannot edit or delete yourself)
  - "Edit Role" → opens `EditUserSheet`
  - "Delete" → calls `handleDeleteUser(uid)` (see §4.2b)

**§4.2a `userRoleDisplay(user)`**

```typescript
const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', staff: 'Staff', security: 'Security',
  merch: 'Merch', worship: 'Worship', regular: 'Member',
  public: 'Public', unverified: 'Unverified',
};
export function userRoleDisplay(user: UserDoc): string {
  const roles = user.roles ?? [user.role ?? 'regular'];
  return roles.map((r) => ROLE_LABELS[r] ?? (r.charAt(0).toUpperCase() + r.slice(1))).join(', ');
}
```

**§4.2b Admin deletion workflow**

```typescript
async function handleDeleteUser(targetUid: string) {
  const confirmed = await confirm(`Remove this user from the portal?`);
  if (!confirmed) return;

  const target = users.find((u) => u.id === targetUid)!;
  const currentUser = useAuthStore.getState().user!;
  const allAdmins = users.filter((u) => u.roles?.includes('admin'));

  if (target.roles?.includes('admin')) {
    // Admin deletion requires approval from all OTHER admins
    const existing = pendingDel.find((d) => d.userId === targetUid);
    if (existing) { toast('Deletion already pending.'); return; }

    const others = allAdmins.filter((a) => a.id !== currentUser.uid);
    if (others.length === 0) {
      // Sole admin — execute immediately
      await execDelete(targetUid);
    } else {
      const newEntry: PendingDeletion = {
        userId: targetUid,
        requestedBy: currentUser.uid,
        approvals: [currentUser.uid],
      };
      // Write pendingDel to config/main
      await updateDoc(doc(db, 'config', 'main'), {
        pendingDel: arrayUnion(newEntry),
      });
      // Notify other admins
      for (const admin of others) {
        await addDoc(collection(db, 'notifs', admin.id, 'items'), {
          msg: `Approval needed: Delete admin account for ${target.name}.`,
          ts: serverTimestamp(), read: false, type: 'info',
        });
      }
      audit('Admin Deletion Requested', `${currentUser.displayName} requested deletion of ${target.name}`);
    }
  } else {
    // Non-admin users deleted immediately
    await execDelete(targetUid);
  }
}

async function execDelete(uid: string) {
  const batch = writeBatch(db);
  // 1. Delete user document
  batch.delete(doc(db, 'users', uid));
  // 2. Remove from pendingDel
  // 3. Remove from all groups (read groups, filter, write batch)
  // 4. Remove from event template users arrays (read events, filter, write batch)
  // 5. Remove from task assignees (read tasks, filter, write batch)
  // 6. Remove from rooms (read rooms, filter, write batch)
  // 7. Remove from config/main pendingDel
  // Write audit entry
  await batch.commit();
  audit('User Deleted', `${uid}`);
}
```

**CreateUserSheet** (`src/features/admin/CreateUserSheet.tsx`):

Fields:
- Full Name (required)
- Login Email (required, must be unique)
- Recovery Email (optional; defaults to login email if blank)
- Initial Password (required, min 8 chars)
- Role checkboxes (see §4.2c)

On submit:
1. Create Firebase Auth user via **Admin SDK Cloud Function** (the client-side
   secondary-app trick from `index.html` is fragile — use a callable Function
   `createPortalUser({ name, email, password, recoveryEmail, roles })` instead).
   The function creates the Auth account and writes the `users/{uid}` document.
2. On success: add uid to "All" group members array in `config/main.groups`.
3. Show success toast "User created!".
4. Audit: `'User Created', name`.

> **Cloud Function**: `exports.createPortalUser = functions.https.onCall(async (data, context) => { ... })`
> Guard: `context.auth?.token.admin === true` (custom claim set in Phase 1).

**EditUserSheet** (`src/features/admin/EditUserSheet.tsx`):

Fields:
- Email Address (pre-filled, editable)
- Role checkboxes (pre-filled from user.roles)

On save:
1. `updateDoc(doc(db, 'users', uid), { email, roles, role: roles[0] })`
2. Toast "User updated."
3. Audit: `'User Role Updated', name`.

**§4.2c `RoleCheckboxes`** (`src/features/admin/RoleCheckboxes.tsx`)

All available roles — render in 2-column grid of checkboxes:
```typescript
export const ALL_ROLES = ['admin', 'staff', 'security', 'merch', 'worship', 'regular', 'public', 'unverified'];
```
Each role label is `ALL_ROLES[i].charAt(0).toUpperCase() + ALL_ROLES[i].slice(1)`.

---

### 4.3 Pending Deletions (`deletions` tab — rendered inline on users screen when `pendingDel.length > 0`)

- Show a card per pending deletion entry.
- Card: "Delete: {name}" + "{N} of {total} admin approvals"
- If current user has NOT approved: show "Approve Deletion" button (green)
  - On tap: add current uid to `approvals` array in `config/main.pendingDel`
  - If `approvals.length >= required` (all other admins): call `execDelete`
- If current user HAS approved: show "You approved this deletion." (muted)
- "Cancel Request" button (red) — removes entry from `pendingDel`

**Required approval count**:
- If target is admin: `allAdmins.length - 1` (all other admins)
- The requester's approval is included in `approvals[]` at creation time

---

### 4.4 Groups (`app/(app)/admin/groups.tsx`)

**List view**:
- Header: "Groups" + `+ New Group` button
- FlatList of `GroupCard`
- **GroupCard**:
  - Name (title) + member count chip
  - Member name tags (flex-wrap row of `<Chip>`)
  - "Edit" button — opens `EditGroupSheet`
  - "Delete" button — **hidden for "All" group** (protected)
  - Delete: confirm → remove group doc from `groups/{}` → audit

**CreateGroupSheet**:
- Group Name (required)
- `MemberPicker` (multi-select from all users)
- On create: `addDoc(collection(db, 'groups'), { name, members: memberIds })`
- Audit: `'Group Created', name`

**EditGroupSheet**:
- `MemberPicker` pre-filled with current members
- On save:
  1. Compute `added = newMembers.filter(id => !oldMembers.includes(id))`
  2. Compute `removed = oldMembers.filter(id => !newMembers.includes(id))`
  3. `updateDoc(doc(db, 'groups', groupId), { members: newMembers })`
  4. Call `syncGroupMembership(group, added, removed)` — see §4.4a
  5. Audit: `'Group Updated', name`

**§4.4a `syncGroupMembership(group, added, removed)`**

When a group's membership changes, propagate to linked entities in a batch write:

```typescript
async function syncGroupMembership(
  group: GroupDoc,
  added: string[],
  removed: string[],
): Promise<void> {
  // 1. Events: add/remove users from template user lists and team members
  //    For added: if event has this group as source, push uid to template.users
  //    For removed: filter uid out of template.users and team members/leaders
  // 2. Tasks (group-sourced): add/remove assignees for tasks with sourceGroupIds containing this group
  // 3. Rooms: sync membership for any room that has a member from this group
  // Use a batch write, committing all changes atomically
  const batch = writeBatch(db);
  // ... build batch operations ...
  await batch.commit();
}
```

**MemberPicker** (`src/features/admin/MemberPicker.tsx`):
- Dropdown/searchable select showing users NOT already in the list
- Selected members shown as removable chips below
- Tap chip's × to remove

---

### 4.5 Common Teams (`app/(app)/admin/teams.tsx`)

- Section title: "Common Team Names"
- Hint: "These appear as quick-picks when creating event teams."
- FlatList of editable rows:
  - Each row: `TextInput` (pre-filled with team name) + `×` delete button
  - On input change: update `COMMON_TEAMS[i]`
  - On blur: write `updateDoc(doc(db, 'config', 'main'), { COMMON_TEAMS })`
  - `×` delete: splice from array, save
- Bottom: "New team name..." input + `+ Add` button
  - Validates non-empty, no duplicate (case-insensitive)
  - On add: push to array, save

Data source: `useConfigStore().commonTeams` (from `config/main.COMMON_TEAMS`).
Write: direct `updateDoc` (no debounce needed — only fires on blur/submit).

---

### 4.6 Task Templates (`app/(app)/admin/task-templates.tsx`)

**Constants** (match the original `TASK_SECTIONS` from `index.html`):

```typescript
export const TASK_SECTIONS = [
  { id: 'production',  label: 'Production',  color: '#e8624a' },
  { id: 'setup',       label: 'Setup',       color: '#2980b9' },
  { id: 'teardown',    label: 'Teardown',    color: '#27ae60' },
  { id: 'food',        label: 'Food',        color: '#f39c12' },
  { id: 'other',       label: 'Other',       color: '#9b59b6' },
];
```

**List view**:
- Header: "Task Templates" + `+ New Template`
- Each `TaskTemplateCard`:
  - Name (bold) + "{N} tasks across {M} sections" (muted)
  - Section chips: `{section.label}: {count}` colored per section
  - "Edit" + "Delete" buttons

**EditTaskTemplateSheet**:

A full-screen sheet (or modal on web) with:

1. **Template Name** field (required)

2. **Per-section panels** — one accordion/section per `TASK_SECTION`:
   - Section header with colored dot + label + task count + "Assign All" button
   - List of task items in that section
   - Each task item row:
     - Title input (required)
     - Assignee display: click to open assignee picker
       - Options: `All Attendees`, `All Leaders`, separator, Groups (`group:{id}`), separator, Individual users (`user:{uid}`)
     - Days Before field (number, default 7)
     - `Remove` button
   - `+ Add Task` button at bottom of section

3. **Save** validates:
   - Template name non-empty
   - At least one task item
   - All items have at least one assignee

**Assignee format** (stored in `item.assignToRoles: string[]`):
- `'all'` — all attendees
- `'leaders'` — all team leaders
- `'group:{groupId}'` — specific group
- `'user:{uid}'` — specific individual

Firestore: stored in `taskTemplates/{id}` collection.

---

### 4.7 Leadership Team (`app/(app)/admin/leadership.tsx`)

- Title: "Leadership Team"
- Subtitle: "These people appear in the Connect page meeting request form."
- FlatList of all users (from `useUsersStore().users`):
  - Each row:
    - Initials avatar (filled with `primaryColor` if member, faded if not)
    - Name + inline `TextInput` for title/role (e.g. "Lead Pastor")
      - On blur: `updateDoc(doc(db, 'users', uid), { title: value })`
    - "Add" or "Remove" button
  - Tap "Add": push uid to `config/main.connectConfig.leadershipTeam`
  - Tap "Remove": filter uid out of `config/main.connectConfig.leadershipTeam`
  - Write: `updateDoc(doc(db, 'config', 'main'), { 'connectConfig.leadershipTeam': updatedArray })`

---

### 4.8 Audit Trail (`app/(app)/admin/audit.tsx`)

- Header: "Audit Trail ({total} entries)" + "Clear Log" button (red)
  - Clear: confirm → batch-delete all docs in `auditLog/{}` → audit `'Audit Log Cleared'`
- Search bar (debounced 300ms) — filters by `action`, `detail`, `name` fields
- Paginated list: 25 per page
  - Each `AuditEntry`:
    - `action` (bold) + timestamp (right, formatted relative or absolute)
    - `detail` line (muted, if present)
    - "By: {name}" line (small)
- Pagination controls: `←` Prev / `Page X of Y (N results)` / `→` Next

Data: TanStack Query paginated `getDocs` on `auditLog` collection, ordered by `ts` desc.
Search is client-side (query returns last 1,000 entries; search filters in-memory).

---

### 4.9 Theme Editor (`app/(app)/admin/theme.tsx`)

**Guard**: admin only.

**Layout** (two-column on tablet/web, single-column on phone):
- Left: color editor controls
- Right: live preview panel

**Color fields** (5 pickers):
| Field | Label | Purpose |
|-------|-------|---------|
| `primaryColor` | Primary / Brand Color | Buttons, accents, nav active |
| `accentColor` | Accent Color | Secondary buttons, hover states |
| `bgColor` | Background Color | Page background |
| `cardColor` | Card Color | Card surfaces |
| `textColor` | Text Color | Body text (overrides auto) |

**Each ColorPicker** (`src/features/theme/ColorPicker.tsx`):
- Hex input field (6-char validated)
- Hue slider (0–360)
- Saturation + Lightness sliders
- Live color swatch

**Auto Text Color toggle** ("Auto-compute text color from background luminance"):
- When ON: `textColor` = `computeTextColor(bgColor)` (WCAG)
- When OFF: manual text color picker is shown

**`computeTextColor(hexBg: string): '#f0ece4' | '#1a1a2e'`**:

```typescript
export function hexToRelativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function computeTextColor(hexBg: string): '#f0ece4' | '#1a1a2e' {
  return hexToRelativeLuminance(hexBg) < 0.4 ? '#f0ece4' : '#1a1a2e';
}
```

**Contrast Checker** (below pickers):
- Shows WCAG contrast ratio between `textColor` and `bgColor`
- Pass/fail badge: AA (4.5:1), AAA (7:1)
- Formula: `(L1 + 0.05) / (L2 + 0.05)` where L1 > L2

**Preview panel** (`src/features/theme/ThemePreview.tsx`):
- Renders a miniature version of the app using the **current preview theme**
- Shows: nav bar, a card, a button, a badge — all using preview colors
- Updates live as sliders change (no debounce, just `useState`)

**Action buttons**:
- **"Preview"**: sets `useAdminStore().themePreview` — only this admin sees it
- **"Publish"**: calls `useAdminStore().publishTheme()` → writes to `appSettings/theme`
  → live for all users instantly via `themeStore`'s `onSnapshot`
- **"Reset to Defaults"**: `useAdminStore().setThemePreview(DEFAULT_THEME)` then publish

**Applying the theme at runtime**:

`themeStore` holds the live `ThemeDoc`. Inject into Tamagui config at the
`_layout.tsx` root provider:

```tsx
// app/_layout.tsx
const { theme } = useThemeStore();
// Override Tamagui tokens dynamically:
const tokens = useMemo(() => buildTokensFromTheme(theme), [theme]);
```

Alternatively, inject CSS variables on web, or use Tamagui's `createTheme`
dynamic API. The key is that `onSnapshot` in `themeStore.subscribe()` triggers
a re-render whenever an admin publishes — all connected clients update within ~1s.

---

### 4.10 Digest Dashboard (`app/(app)/admin/digests.tsx`)

**Guard**: admin only.

**Layout**:
- Title: "Email Digests"
- Stats cards row (2 cards):
  - **Weekly Digest**: last delivery date, recipients, delivered %, bounce %, open %
  - **Monthly Digest**: same fields
- **History table**: sorted by `sentAt` desc, columns:
  `Type | Sent | Recipients | Delivered | Bounced | Opened`
- **Manual Send** section (for testing):
  - "Send Weekly Digest Now" button → calls `sendWeeklyDigest` HTTP Function
  - "Send Monthly Digest Now" button → calls `sendMonthlyDigest` HTTP Function
  - Both require admin confirmation before firing

**Data**: `useDigestStore().fetchStats()` runs `getDocs` on `digestStats/{}` collection.
Use TanStack Query for caching and background refetch.

---

### 4.11 Page Builder Screens

All three pages share a single `PageBuilderScreen` component
(`src/features/page-builder/PageBuilderScreen.tsx`) parameterized by `pageKey`.

**Routes**:
- `app/(app)/pages/our-story.tsx` → `<PageBuilderScreen pageKey="ourstory" pageTitle="Our Story" />`
- `app/(app)/pages/connect.tsx` → `<PageBuilderScreen pageKey="connect" pageTitle="Connect" />`
- `app/(app)/pages/giving.tsx` → `<PageBuilderScreen pageKey="giving" pageTitle="Giving" />`

#### `PageBuilderScreen` behavior:

**View mode** (all users):
- Reads `configStore.publicPages[pageKey]`
- Renders blocks in order using `BlockRenderer/*` components
- Optional page background image (absolute positioned behind content)
- If no blocks and admin: "Click Build Mode to start building this page."
- If no blocks and not admin: "{pageTitle} page coming soon."

**Admin controls** (when user is admin):
- "Build Mode" toggle button (top-right) — sets `pageBuilderStore.buildModeKey`
- When build mode is ON for this page:
  - **Block palette** (top): `+ Hero/Banner | + Text | + Image | + Two Column | + Timeline | + Button | + Divider | + Meeting Request Form | + Social Links`
  - **Page background bar**: URL input + "Parallax scroll" checkbox + "Save Page" button
  - **Block list**: each block rendered as an editor card:
    - Block type label (uppercase, colored)
    - ↑ / ↓ reorder buttons (hidden for first/last respectively)
    - "Save" button (writes block changes to Firestore)
    - "Delete" button
    - Block-specific editor fields (`BlockEditor/*` component)

**Save mechanics**:
- Inline changes to block `data` are held in local component state
- "Save" on each block card writes the entire `publicPages[pageKey]` back to
  `config/main` via `updateDoc`
- "Save Page" in the background bar also writes `bgImage` + `bgParallax`

#### Block Editors (`src/features/page-builder/BlockEditor/`)

| Block | Editor Fields |
|-------|--------------|
| `hero` | Heading, Subheading, Background Image URL, Parallax checkbox, Overlay Color, Text Color |
| `text` | Heading (optional), Content (multiline) |
| `image` | Image URL, Caption (optional), Alignment (left/center/right) |
| `twocol` | Left Heading, Left Content, Right Image URL, Right Content |
| `timeline` | Entries list: each has Year/Label, Title, Description. Add/Remove entry buttons |
| `button` | Button Text, URL, Alignment |
| `divider` | (no fields — just a separator) |
| `meeting` | Heading (optional), Intro Text (optional) |
| `social` | Section Heading, Links list: each has emoji icon, label, URL. Add/Remove link buttons |

#### Block Renderers (`src/features/page-builder/BlockRenderer/`)

| Block | Render output |
|-------|--------------|
| `hero` | Full-width section with bg image, overlay, heading + subheading centered |
| `text` | Optional heading + paragraphs (newline-split) |
| `image` | `<Image>` with optional caption, respecting alignment |
| `twocol` | 2-column flex/grid: left text + right image/text |
| `timeline` | Vertical timeline: year dot → line → title + description |
| `button` | Centered/aligned link button opening in browser |
| `divider` | Horizontal rule |
| `meeting` | Heading + intro text + leader grid + meeting request form (see §4.11a) |
| `social` | Heading + row of icon+label link buttons |

**§4.11a Meeting Request Block**

The meeting block renders a form that lets users request a meeting with
leadership team members. Uses `connectConfig.leadershipTeam` user IDs.

Form fields:
- Your Name (pre-filled from auth user if logged in)
- Your Email (pre-filled)
- Who to meet with (checkbox per leadership team member)
- Your Availability (multiline text)
- Message (optional multiline)
- Rate limit: one request per calendar day per user (enforced client-side via
  `user.lastMeetingRequest` timestamp; also enforced server-side in the
  Cloud Function)

On submit: calls `sendMeetingRequest` Cloud Function which:
1. Stores `meetingRequests/{id}` in Firestore
2. Sends email via Resend to each selected leader

---

## 5. Cloud Functions — Digest Engine

### 5.1 File: `functions/src/digest.ts`

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import * as crypto from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);
const UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_HMAC_SECRET!;

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildUnsubscribeToken(uid: string, type: 'weekly' | 'monthly'): string {
  return crypto
    .createHmac('sha256', UNSUBSCRIBE_SECRET)
    .update(`${uid}:${type}`)
    .digest('hex');
}

function buildUnsubscribeUrl(uid: string, type: 'weekly' | 'monthly'): string {
  const token = buildUnsubscribeToken(uid, type);
  const base = process.env.FUNCTIONS_BASE_URL; // e.g. https://us-central1-project.cloudfunctions.net
  return `${base}/unsubscribe?uid=${uid}&type=${type}&token=${token}`;
}

async function getDigestRecipients(
  digestType: 'weekly' | 'monthly',
): Promise<Array<{ uid: string; name: string; email: string }>> {
  const db = admin.firestore();
  const snap = await db.collection('users').get();
  return snap.docs
    .map((d) => ({ uid: d.id, ...(d.data() as any) }))
    .filter((u) => {
      const prefs = u.notificationPrefs ?? {};
      if (digestType === 'weekly') {
        // Non-public users, opt-in default ON
        const isPublic = (u.roles ?? []).includes('public');
        return !isPublic && (prefs.weeklyDigest !== false);
      } else {
        // Public users, opt-in default OFF
        const isPublic = (u.roles ?? []).includes('public');
        return isPublic && (prefs.monthlyDigest === true);
      }
    })
    .map((u) => ({ uid: u.uid ?? u.id, name: u.name ?? 'Friend', email: u.email }))
    .filter((u) => !!u.email);
}

async function gatherDigestContent(db: admin.firestore.Firestore) {
  // Gather recent content for inclusion in the digest:
  // - Upcoming events (next 2 weeks)
  // - Recent announcements (last 7 days)
  // - New posts (last 7 days)
  const now = new Date();
  const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const oneWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [eventsSnap, announcementsSnap] = await Promise.all([
    db.collection('events')
      .where('date', '>=', now.toISOString().split('T')[0])
      .where('date', '<=', twoWeeks.toISOString().split('T')[0])
      .limit(5)
      .get(),
    db.collection('announcements')
      .where('ts', '>=', oneWeek.getTime())
      .orderBy('ts', 'desc')
      .limit(5)
      .get(),
  ]);

  return {
    upcomingEvents: eventsSnap.docs.map((d) => d.data()),
    recentAnnouncements: announcementsSnap.docs.map((d) => d.data()),
  };
}

async function sendDigestBatch(
  recipients: Array<{ uid: string; name: string; email: string }>,
  digestType: 'weekly' | 'monthly',
  content: any,
  db: admin.firestore.Firestore,
): Promise<void> {
  // Resend batch: up to 100 per call
  const BATCH_SIZE = 100;
  const { WeeklyDigestEmail, MonthlyDigestEmail } = await import('./emails');

  let totalDelivered = 0;
  let batchId = `digest_${digestType}_${Date.now()}`;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);
    const emails = chunk.map((r) => ({
      from: 'The Well of Iowa <noreply@thewellofiowa.com>',
      to: r.email,
      subject: digestType === 'weekly'
        ? `The Well — Weekly Update`
        : `The Well — Monthly Update`,
      react: digestType === 'weekly'
        ? WeeklyDigestEmail({ name: r.name, ...content, unsubscribeUrl: buildUnsubscribeUrl(r.uid, 'weekly') })
        : MonthlyDigestEmail({ name: r.name, ...content, unsubscribeUrl: buildUnsubscribeUrl(r.uid, 'monthly') }),
    }));
    await resend.batch.send(emails);
    totalDelivered += chunk.length;
  }

  // Record initial stats (webhook will update delivered/bounce/open counts)
  await db.collection('digestStats').add({
    type: digestType,
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    recipients: recipients.length,
    delivered: totalDelivered,
    bounced: 0,
    opened: 0,
    batchId,
  });
}

// ── Scheduled Functions ───────────────────────────────────────────────────────

// Weekly digest: Mondays at 8am Central Time = 13:00 UTC
export const weeklyDigest = functions.pubsub
  .schedule('0 13 * * 1')
  .timeZone('America/Chicago')
  .onRun(async () => {
    const db = admin.firestore();
    const recipients = await getDigestRecipients('weekly');
    if (!recipients.length) return;
    const content = await gatherDigestContent(db);
    await sendDigestBatch(recipients, 'weekly', content, db);
    functions.logger.info(`Weekly digest sent to ${recipients.length} recipients`);
  });

// Monthly digest: 1st of month at 8am Central Time
export const monthlyDigest = functions.pubsub
  .schedule('0 13 1 * *')
  .timeZone('America/Chicago')
  .onRun(async () => {
    const db = admin.firestore();
    const recipients = await getDigestRecipients('monthly');
    if (!recipients.length) return;
    const content = await gatherDigestContent(db);
    await sendDigestBatch(recipients, 'monthly', content, db);
    functions.logger.info(`Monthly digest sent to ${recipients.length} recipients`);
  });

// Manual trigger (admin-only callable)
export const sendDigestManual = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token.admin) throw new functions.https.HttpsError('permission-denied', 'Admins only');
  const type = data.type as 'weekly' | 'monthly';
  const db = admin.firestore();
  const recipients = await getDigestRecipients(type);
  const content = await gatherDigestContent(db);
  await sendDigestBatch(recipients, type, content, db);
  return { sent: recipients.length };
});
```

---

### 5.2 Resend Webhook Handler (`functions/src/webhooks.ts`)

Resend sends POST events to `{functionsUrl}/resendWebhook`.

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

export const resendWebhook = functions.https.onRequest(async (req, res) => {
  // 1. Verify Resend webhook signature
  const signingSecret = process.env.RESEND_WEBHOOK_SECRET!;
  const signature = req.headers['resend-signature'] as string;
  const body = JSON.stringify(req.body);
  const expected = crypto.createHmac('sha256', signingSecret).update(body).digest('hex');
  if (signature !== `sha256=${expected}`) {
    res.status(401).send('Invalid signature');
    return;
  }

  const event = req.body;
  const db = admin.firestore();

  // 2. Parse event type and update digestStats
  // Resend event types: 'email.delivered', 'email.bounced', 'email.opened'
  if (['email.delivered', 'email.bounced', 'email.opened'].includes(event.type)) {
    const batchId = event.data?.tags?.batchId;
    if (batchId) {
      const snap = await db.collection('digestStats')
        .where('batchId', '==', batchId)
        .limit(1)
        .get();
      if (!snap.empty) {
        const ref = snap.docs[0].ref;
        const field = event.type === 'email.delivered' ? 'delivered'
                    : event.type === 'email.bounced'   ? 'bounced'
                    :                                    'opened';
        await ref.update({
          [field]: admin.firestore.FieldValue.increment(1),
        });
      }
    }
  }

  res.status(200).send('ok');
});
```

**Resend dashboard setup**:
1. In Resend dashboard → Webhooks → Add endpoint: `{functionsUrl}/resendWebhook`
2. Events to listen to: `email.delivered`, `email.bounced`, `email.opened`
3. Copy signing secret → set as `RESEND_WEBHOOK_SECRET` env var in Functions

---

### 5.3 Unsubscribe Handler (`functions/src/unsubscribe.ts`)

One-click unsubscribe — no login required, CAN-SPAM compliant.

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

export const unsubscribe = functions.https.onRequest(async (req, res) => {
  const { uid, type, token } = req.query as {
    uid: string; type: 'weekly' | 'monthly'; token: string;
  };

  // 1. Validate token (HMAC-SHA256)
  const secret = process.env.UNSUBSCRIBE_HMAC_SECRET!;
  const expected = crypto.createHmac('sha256', secret).update(`${uid}:${type}`).digest('hex');
  if (token !== expected) {
    res.status(400).send('Invalid unsubscribe link.');
    return;
  }

  // 2. Update user preferences
  const db = admin.firestore();
  const field = type === 'weekly'
    ? 'notificationPrefs.weeklyDigest'
    : 'notificationPrefs.monthlyDigest';
  await db.collection('users').doc(uid).update({ [field]: false });

  // 3. Return confirmation page (simple HTML)
  res.status(200).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head><title>Unsubscribed</title></head>
    <body style="font-family:sans-serif;max-width:400px;margin:60px auto;text-align:center;color:#333">
      <h2>You've been unsubscribed.</h2>
      <p>You will no longer receive ${type} email digests from The Well of Iowa.</p>
      <p style="margin-top:24px;font-size:13px;color:#888">
        Changed your mind? Update your notification preferences in the portal.
      </p>
    </body>
    </html>
  `);
});
```

**Env vars required** (set in Firebase Functions config):
```bash
firebase functions:config:set \
  resend.api_key="re_..." \
  resend.webhook_secret="whsec_..." \
  unsubscribe.hmac_secret="some-random-32-char-secret" \
  functions.base_url="https://us-central1-your-project.cloudfunctions.net"
```

---

### 5.4 React Email Templates (`functions/src/emails/`)

#### `WeeklyDigestEmail.tsx`

```tsx
import { Html, Head, Body, Container, Section, Text, Link, Hr } from '@react-email/components';

interface WeeklyDigestProps {
  name: string;
  upcomingEvents: any[];
  recentAnnouncements: any[];
  unsubscribeUrl: string;
}

export function WeeklyDigestEmail({ name, upcomingEvents, recentAnnouncements, unsubscribeUrl }: WeeklyDigestProps) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'sans-serif', background: '#f5f5f5' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', background: '#fff', borderRadius: '8px', overflow: 'hidden' }}>
          {/* Header */}
          <Section style={{ background: '#14141e', padding: '24px', textAlign: 'center' }}>
            <Text style={{ color: '#e8624a', fontSize: '24px', fontWeight: '700', margin: '0' }}>The Well of Iowa</Text>
            <Text style={{ color: '#b0adc4', fontSize: '13px', margin: '4px 0 0' }}>Weekly Update</Text>
          </Section>

          {/* Greeting */}
          <Section style={{ padding: '24px' }}>
            <Text>Hi {name},</Text>
            <Text>Here's what's happening this week at The Well of Iowa.</Text>
          </Section>

          {/* Upcoming Events */}
          {upcomingEvents.length > 0 && (
            <Section style={{ padding: '0 24px 24px' }}>
              <Text style={{ fontWeight: '700', color: '#e8624a', fontSize: '16px' }}>Upcoming Events</Text>
              {upcomingEvents.map((ev: any, i: number) => (
                <Section key={i} style={{ borderLeft: '3px solid #e8624a', paddingLeft: '12px', marginBottom: '12px' }}>
                  <Text style={{ fontWeight: '600', margin: '0' }}>{ev.title}</Text>
                  <Text style={{ color: '#666', margin: '2px 0 0', fontSize: '13px' }}>{ev.date} · {ev.startTime}</Text>
                </Section>
              ))}
            </Section>
          )}

          {/* Announcements */}
          {recentAnnouncements.length > 0 && (
            <Section style={{ padding: '0 24px 24px' }}>
              <Text style={{ fontWeight: '700', color: '#e8624a', fontSize: '16px' }}>Announcements</Text>
              {recentAnnouncements.map((a: any, i: number) => (
                <Section key={i} style={{ marginBottom: '12px' }}>
                  <Text style={{ fontWeight: '600', margin: '0' }}>{a.title}</Text>
                  <Text style={{ color: '#444', margin: '2px 0 0', fontSize: '13px' }}>{a.body?.slice(0, 120)}...</Text>
                </Section>
              ))}
            </Section>
          )}

          <Hr />

          {/* Footer */}
          <Section style={{ padding: '16px 24px', textAlign: 'center' }}>
            <Text style={{ fontSize: '12px', color: '#999' }}>
              You received this because you're a member of The Well of Iowa Mission Team.{' '}
              <Link href={unsubscribeUrl} style={{ color: '#e8624a' }}>Unsubscribe</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

#### `MonthlyDigestEmail.tsx`

Same structure as `WeeklyDigestEmail` but:
- Subject: "The Well — Monthly Update"
- Intro text: "Here's a summary of the past month at The Well of Iowa."
- Unsubscribe link uses `type='monthly'`

---

## 6. Firestore Security Rules Additions

```javascript
// appSettings/theme — any authenticated user can read; only admins can write
match /appSettings/{docId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null &&
    get(/databases/$(database)/documents/users/$(request.auth.uid))
      .data.roles.hasAny(['admin']);
}

// digestStats — admin read only
match /digestStats/{docId} {
  allow read: if request.auth != null &&
    get(/databases/$(database)/documents/users/$(request.auth.uid))
      .data.roles.hasAny(['admin']);
  allow write: if false; // Cloud Functions only
}

// config/main — write allows pendingDel updates by admins
// (already allow-all for admins from Phase 1; no change needed if rules are:
//  "admin can write config/main" — but specifically pendingDel should be admin-only)
```

---

## 7. Environment Variables (Functions)

Add to `functions/.env` and Firebase Functions config:

```env
RESEND_API_KEY=re_...
RESEND_WEBHOOK_SECRET=whsec_...
UNSUBSCRIBE_HMAC_SECRET=<32-char random secret>
FUNCTIONS_BASE_URL=https://us-central1-<project-id>.cloudfunctions.net
```

---

## 8. Acceptance Criteria

### Admin — User Management
- [ ] AC-01: Admin can view all users with name, email, and role badge.
- [ ] AC-02: "Edit Role" button is hidden for the currently logged-in admin's own card.
- [ ] AC-03: "Delete" button is hidden for the currently logged-in admin's own card.
- [ ] AC-04: Deleting a non-admin user immediately removes their `users/{}` doc and
           removes them from groups, events, tasks, and rooms.
- [ ] AC-05: Deleting an admin user creates a `pendingDel` entry and notifies other admins.
- [ ] AC-06: Admin deletion requires all other admins to approve before `execDelete` runs.
- [ ] AC-07: "Cancel Request" removes the `pendingDel` entry without deleting the user.
- [ ] AC-08: "Pending Deletions" tab only appears when there is at least one pending deletion.
- [ ] AC-09: Creating a user via "Add User" creates a Firebase Auth account and
           a `users/{uid}` document.
- [ ] AC-10: New users are automatically added to the "All" group.
- [ ] AC-11: Role checkboxes correctly display all 8 roles.

### Admin — Groups
- [ ] AC-12: Admin can create a group with a name and members.
- [ ] AC-13: Admin can edit a group's members.
- [ ] AC-14: Editing group membership syncs to linked events, tasks, and rooms.
- [ ] AC-15: "All" group shows no Delete button and no Edit button.
- [ ] AC-16: Deleting a group removes it from Firestore.

### Admin — Common Teams
- [ ] AC-17: All current `COMMON_TEAMS` entries are displayed as editable inputs.
- [ ] AC-18: Editing a team name and blurring saves to `config/main.COMMON_TEAMS`.
- [ ] AC-19: Adding a new team name with a non-empty, non-duplicate value appends it.
- [ ] AC-20: Deleting a team name removes it from the list.

### Admin — Task Templates
- [ ] AC-21: Task templates list shows name, task count, and section chips.
- [ ] AC-22: Creating a template requires name and at least one assigned task item.
- [ ] AC-23: Saving a template with any unassigned task items shows an error.
- [ ] AC-24: "Assign All" bulk-assigns all tasks in a section at once.
- [ ] AC-25: Template items support `all`, `leaders`, `group:{id}`, and `user:{uid}` assignees.

### Admin — Leadership Team
- [ ] AC-26: All users are listed with their current leadership status.
- [ ] AC-27: "Add" toggles a user into `connectConfig.leadershipTeam`.
- [ ] AC-28: "Remove" toggles a user out of `connectConfig.leadershipTeam`.
- [ ] AC-29: Inline title field saves `user.title` to `users/{uid}` on blur.

### Admin — Audit Trail
- [ ] AC-30: Audit trail shows all entries ordered by timestamp descending.
- [ ] AC-31: Search filters entries matching action, detail, or name fields (case-insensitive).
- [ ] AC-32: Pagination shows 25 entries per page with Prev/Next controls.
- [ ] AC-33: "Clear Log" with confirmation deletes all entries in `auditLog/{}`.

### Theme Editor
- [ ] AC-34: All 5 color fields (primary, accent, bg, card, text) have a working color picker.
- [ ] AC-35: "Auto text color" toggle computes WCAG-appropriate text color from bg luminance.
- [ ] AC-36: Contrast checker shows ratio and AA/AAA pass/fail badges.
- [ ] AC-37: Preview panel reflects current picker values live without publishing.
- [ ] AC-38: "Publish" writes to `appSettings/theme` and live-updates all connected clients
           within 1 second via `onSnapshot`.
- [ ] AC-39: "Reset to Defaults" restores and publishes the default palette.

### Digest Dashboard
- [ ] AC-40: Dashboard shows last delivery stats for weekly and monthly digests.
- [ ] AC-41: History table lists all past sends with type, date, and delivery metrics.
- [ ] AC-42: "Send Weekly Digest Now" triggers the `sendDigestManual` callable Function.
- [ ] AC-43: Resend webhook updates `digestStats` delivered/bounced/opened counts.

### Page Builder
- [ ] AC-44: Non-admin users see the rendered page (or "coming soon" if no blocks).
- [ ] AC-45: Admin "Build Mode" toggle shows the block palette and editor.
- [ ] AC-46: All 9 block types can be added, edited, reordered, and deleted.
- [ ] AC-47: Hero block renders with background image and parallax effect.
- [ ] AC-48: Timeline block supports multiple entries with year, title, and description.
- [ ] AC-49: Meeting block shows leadership team grid and meeting request form.
- [ ] AC-50: Social block renders icon+label link buttons.
- [ ] AC-51: Page background URL + parallax setting save and apply on view mode.
- [ ] AC-52: Meeting request form is rate-limited to one submission per calendar day.

### Digest Engine (Cloud Functions)
- [ ] AC-53: Weekly digest function runs on Mondays at 8am Central Time.
- [ ] AC-54: Weekly digest sends only to non-public users with `weeklyDigest !== false`.
- [ ] AC-55: Monthly digest runs on the 1st at 8am Central Time.
- [ ] AC-56: Monthly digest sends only to public users with `monthlyDigest === true`.
- [ ] AC-57: Each email contains the signed unsubscribe URL.
- [ ] AC-58: Clicking unsubscribe link sets the appropriate `notificationPrefs` field to `false`
           without requiring login.
- [ ] AC-59: Unsubscribe rejects invalid or tampered tokens with HTTP 400.
- [ ] AC-60: `digestStats` is written after each digest batch completes.

---

## 9. Common Pitfalls

1. **Secondary Firebase app for user creation**: The `index.html` creates a
   secondary Firebase app to avoid logging out the admin. In React Native / Expo,
   **do not replicate this pattern**. Use a `createPortalUser` Cloud Function with
   the Admin SDK. The function calls `admin.auth().createUser(...)`, which doesn't
   disturb the client session.

2. **`pendingDel` is stored in `config/main`**: It is an array field on the
   `config/main` document — not a separate collection. Use `arrayUnion` /
   `arrayRemove` for atomic updates.

3. **"All" group protection**: The "All" group must never be deleted. Identify it
   by `name === 'All'` (not by id). Guard the delete action in both UI and
   Firestore rules.

4. **Theme `onSnapshot` loop**: `themeStore.subscribe()` must be called once from
   the root `_layout.tsx` providers and cleaned up on unmount. Do not call it from
   inside screen components — it creates duplicate listeners.

5. **Dynamic theme injection into Tamagui**: Tamagui tokens are normally static.
   For dynamic colors, use React context to pass `themeStore.theme` down and apply
   colors as inline `style` props or via a `ThemeContext` — do not try to call
   Tamagui's `createTheme()` at runtime (it's compile-time). Alternatively, use
   CSS variables on web and Tamagui's `<Theme>` component variant switching.

6. **Resend `batch.send` limit**: Maximum 100 emails per batch call. The digest
   engine already handles this — always use the chunking loop.

7. **Unsubscribe HMAC secret rotation**: If `UNSUBSCRIBE_HMAC_SECRET` is rotated,
   all existing unsubscribe links in sent emails become invalid. Treat it as
   permanent. Store in Firebase Secret Manager (not `functions.config`).

8. **Audit `auditLog/{}` clear performance**: The `auditLog` collection may have
   thousands of entries. Do NOT `getDocs` + batch-delete on the client — it will
   timeout. Call a `clearAuditLog` Cloud Function that deletes in chunks of 500.

9. **Leadership title field on blur**: The `leadershipTeamView` in `index.html`
   stores `user.title` directly on the user object and calls `saveUsers()`. In the
   new app, write to `users/{uid}` directly via `updateDoc` on blur. Do not include
   `title` in the user's auth custom claims.

10. **Page builder block IDs**: Blocks use `Date.now()` as IDs. This is fine since
    blocks are stored in an array (not a Firestore sub-collection) and reordering
    is by array index. Do not use block IDs as Firestore doc IDs.

11. **Meeting request rate limit**: The rate limit (one per day) is enforced
    client-side using `user.lastMeetingRequest` timestamp. Also enforce it in the
    `sendMeetingRequest` Cloud Function by reading the `meetingRequests` collection
    for requests from that uid in the last 24 hours.

---

## 10. Dependencies to Add

```json
{
  "dependencies": {
    "resend": "^3.0.0",
    "@react-email/components": "^0.0.22"
  },
  "devDependencies": {
    "@types/crypto": "^0.0.4"
  }
}
```

In `functions/package.json`:
```json
{
  "dependencies": {
    "resend": "^3.0.0",
    "@react-email/components": "^0.0.22",
    "firebase-admin": "^12.0.0",
    "firebase-functions": "^4.9.0"
  }
}
```

---

## 11. Handoff Checklist for Implementation Session

Before starting Phase 5:

- [ ] Read `docs/migration/OVERVIEW.md` for full stack and collection map.
- [ ] Phase 1 `notificationPrefs.weeklyDigest` and `notificationPrefs.monthlyDigest`
      fields exist on all user documents.
- [ ] Phase 1 `auditLog/{autoId}` collection is live and Phase 1–4 code is
      writing to it.
- [ ] `appSettings/theme` Firestore document may or may not exist yet — create it
      with `DEFAULT_THEME` values on first write.
- [ ] Set all required environment variables in Functions before deploying digest.
- [ ] Configure Resend webhook in Resend dashboard pointing to `{functionsUrl}/resendWebhook`.
- [ ] Run `firebase deploy --only functions` after implementing digest.ts, webhooks.ts,
      unsubscribe.ts, and createPortalUser.
- [ ] Manually trigger `sendDigestManual` from the Digest Dashboard to test end-to-end
      before relying on the schedule.
