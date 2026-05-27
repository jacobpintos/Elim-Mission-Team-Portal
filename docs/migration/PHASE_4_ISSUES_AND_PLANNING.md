# Phase 4 — Issues & Planning

**App**: The Well of Iowa Mission Team Portal (Expo SDK 51, Expo Router v3, TypeScript, Tamagui, Zustand, Firebase JS SDK v10 modular)  
**Branch**: `claude/backup-reset-e7b22b9-SUHKv`  
**Working directory**: `mission-portal-app/`

---

## 1. Purpose & Scope

Phase 4 builds the Operations screen and everything under it:

| Tab | Route | Access |
|---|---|---|
| Operations (wrapper) | `/(app)/issues` | all authenticated |
| ↳ Production Issues | sub-tab | all authenticated |
| ↳ Kaizen Board | sub-tab | all authenticated |
| ↳ Planning Boards | sub-tab | **admin only** |

The Operations screen is already in the nav from Phase 2 — it is the `/(app)/issues` route with a pending placeholder. Replace that placeholder with the full implementation described here.

The Planning Board is a **fully custom canvas** built with React Native views + `react-native-gesture-handler` + `react-native-svg`. The original app used an Excalidraw iframe; that is replaced entirely. Do not reference Excalidraw anywhere in the new code.

---

## 2. Prerequisites

- Phases 1–3 complete and passing.
- `src/lib/roles.ts` exports `isAdmin`, `sameId`.
- `src/stores/authStore.ts` provides `user`.
- `nextId(key)` and `addInAppNotif(uid, msg)` are implemented.
- `react-native-gesture-handler`, `react-native-svg`, and `react-native-reanimated` v3 are installed (they are Expo SDK 51 dependencies; confirm they are in `package.json`).
- `@react-native-community/datetimepicker` is available for date inputs on native.
- Firebase Storage SDK is imported from `firebase/storage`.

---

## 3. New Files to Create

```
mission-portal-app/src/
  types/
    issues.ts
    kaizen.ts
    planning.ts
  stores/
    issuesStore.ts
    kaizenStore.ts
    planningStore.ts
  screens/
    OperationsScreen.tsx          ← wrapper with 3 tabs
    IssuesScreen.tsx
    KaizenScreen.tsx
    PlanningScreen.tsx            ← board list
    PlanningBoardCanvas.tsx       ← full-screen canvas
  components/board/
    BoardCanvas.tsx               ← SVG canvas + gesture layer
    BoardToolbar.tsx
    elements/
      StickyElement.tsx
      TextElement.tsx
      BoxElement.tsx
      ArrowElement.tsx
      PinElement.tsx
      PenElement.tsx
      ImageElement.tsx
    SelectionOverlay.tsx
  lib/
    boardUtils.ts                 ← pen decimation, bezier smoothing, hit-testing

mission-portal-app/app/(app)/
  issues.tsx                      ← replace existing placeholder
```

---

## 4. Firestore Schemas

### 4.1 `issues/{id}` — Production Issues

Each document is one production issue. The `id` is numeric (counter-based) and also the document ID as a string.

```typescript
interface ProductionIssue {
  id:          number;          // Firestore doc ID = String(id)
  title:       string;          // required
  date:        string;          // 'YYYY-MM-DD' of the incident
  eventTitle?: string;          // optional related event name (free text)
  problem:     string;          // "What happened?" — required
  why1?:       string;          // "Why did this happen?"
  why2?:       string;          // "Why? (2nd level)"
  why3?:       string;          // "Why? (3rd level)"
  why4?:       string;          // "Why? (4th level)"
  why5?:       string;          // "Why? (Root cause)"
  ca?:         string;          // Corrective action description
  caOwner?:    string;          // uid of person responsible for CA
  caDueDate?:  string;          // 'YYYY-MM-DD' due date for CA
  caDueTaskId?: number | null;  // id of generated task in tasks/{id}
  status:      'open' | 'in_progress' | 'closed';
  verif?:      string;          // Verification notes (did CA work?)
  verifDate?:  string;          // 'YYYY-MM-DD' when verified
  reporter:    string;          // uid
  ts:          number;          // Date.now() at creation
}
```

**Counter key**: `nIssue` — add to `config/main` counters (same pattern as `nTask`, `nEv`, etc.). Use `nextId('nIssue')`. If this counter doesn't exist yet, it will be created the first time `nextId('nIssue')` is called (the helper creates it if missing).

**CA task generation**: When `caOwner` and `ca` are both set on save:
- If `caDueTaskId` exists and that task still exists → update its `title`, `dueDate`, `assignees`, and `lead` in-place.
- If no `caDueTaskId` → create a new task: `{ title: 'CA: ' + ca.slice(0,60), assignees: [caOwner], lead: caOwner, by: user.uid, status: 'pending', issueId: issue.id, issueTitle: issue.title, dueDate: caDueDate || null, kaizenId: null, evId: null, evDate: null, overdueNotified: false, sourceGroupIds: [] }` → store resulting task id back into `issue.caDueTaskId`.
- Notify `caOwner`: `"New corrective action task for issue: "{title}"`

### 4.2 `kaizen/{id}` — Kaizen Board Items

```typescript
interface KaizenItem {
  id:              number;       // Firestore doc ID = String(id)
  title:           string;       // required
  category:        string;       // one of KAIZEN_CATS
  description?:    string;
  linkedIssueId?:  number | null;
  stage:           'idea' | 'review' | 'action' | 'complete';
  submitter:       string;       // uid
  votes:           number;       // upvote count
  voters:          string[];     // uids who upvoted
  actionPlans:     ActionPlan[];
  completedDate?:  string;       // 'YYYY-MM-DD' (set when stage → complete)
  ts:              number;       // Date.now() at creation
}

interface ActionPlan {
  version:         number;       // 1, 2, 3... (increments per new plan)
  statement:       string;       // opportunity/problem statement
  successCriteria: string;       // how we know it worked
  reviewDate?:     string;       // 'YYYY-MM-DD'
  steps:           ActionStep[];
  ts:              number;       // Date.now() when plan was created
  outcome?:        'worked' | 'failed' | 'archived';
  outcomeNotes?:   string;
  outcomeDate?:    string;       // 'YYYY-MM-DD'
}

interface ActionStep {
  title:     string;
  assignee?: string | null;      // uid
  dueDate?:  string | null;      // 'YYYY-MM-DD'
  done:      boolean;
}
```

**Counter key**: `nKaizen` — use `nextId('nKaizen')`.

**Constants** (export from `src/lib/kaizen.ts`):
```typescript
export const KAIZEN_COLS = [
  { id: 'idea',     label: 'Ideas',        color: '#2980b9' },
  { id: 'review',   label: 'Under Review', color: '#8e44ad' },
  { id: 'action',   label: 'Action Plan',  color: '#e67e22' },
  { id: 'complete', label: 'Completed',    color: '#27ae60' },
] as const;

export const KAIZEN_CATS = [
  'Equipment', 'Instruments', 'Sound Balance',
  'Coordination', 'Tech', 'Stream / Capture', 'Other',
] as const;
```

**Active action plan**: always the last element of `item.actionPlans`. A helper:
```typescript
export function activeAP(item: KaizenItem): ActionPlan | null {
  return item.actionPlans.length ? item.actionPlans[item.actionPlans.length - 1] : null;
}
```

### 4.3 `planningBoards/{boardId}` — Board Metadata

```typescript
interface PlanningBoard {
  id:         number;           // Firestore doc ID = String(id)
  name:       string;
  eventId?:   number | null;    // link to events/{id}
  createdBy:  string;           // uid
  ts:         number;
}
```

**Counter key**: `nBoard` — use `nextId('nBoard')`.

### 4.4 `planningBoards/{boardId}/elements/{elementId}` — Canvas Elements

Each element in a board is a separate Firestore document in a subcollection. This allows per-element writes without clobbering other users' concurrent changes.

```typescript
type ElementType = 'sticky' | 'text' | 'box' | 'arrow' | 'pin' | 'pen' | 'image';

interface BoardElement {
  id:          string;          // nanoid(10) or crypto.randomUUID() — document ID
  type:        ElementType;
  x:           number;          // canvas coordinates (unitless, 1 unit ≈ 1px at 100% zoom)
  y:           number;
  zIndex:      number;          // render order; higher = on top

  // sticky / text / box / pin
  content?:    string;

  // sticky / box
  width?:      number;
  height?:     number;
  bgColor?:    string;          // hex background color
  textColor?:  string;          // hex text color
  fontSize?:   number;          // pt

  // text
  // uses content, x, y, textColor, fontSize

  // box (border only)
  strokeColor?: string;
  strokeWidth?: number;         // border thickness (default 2)

  // arrow
  x2?:         number;          // endpoint x
  y2?:         number;          // endpoint y
  // uses strokeColor, strokeWidth

  // pin
  pinColor?:   string;          // hex fill for pin head (default accent)
  // uses content (label below pin)

  // pen
  points?:     number[][];      // [[x,y], [x,y], ...] — decimated point stream
  // uses strokeColor, strokeWidth

  // image
  imageUrl?:   string;          // Firebase Storage download URL
  // uses x, y, width, height

  // metadata
  createdBy:   string;          // uid
  updatedAt:   number;          // Date.now() — for conflict resolution
  locked?:     boolean;         // if true, non-creator admins cannot move/edit
}
```

**Write strategy**: Each element is written independently with `setDoc(doc(db, 'planningBoards', boardId, 'elements', elementId), element, { merge: true })`. Debounce 500 ms on move/resize. Write immediately on create and delete.

**Delete**: `deleteDoc(doc(db, 'planningBoards', boardId, 'elements', elementId))`.

**Real-time listener**: `onSnapshot(collection(db, 'planningBoards', boardId, 'elements'))` — replace the local element map when each snapshot arrives.

---

## 5. Zustand Store Interfaces

### 5.1 `src/stores/issuesStore.ts`

```typescript
interface IssuesState {
  issues:  ProductionIssue[];
  loading: boolean;

  loadIssues:    () => Promise<void>;
  createIssue:   (data: Omit<ProductionIssue, 'id' | 'reporter' | 'ts'>) => Promise<void>;
  updateIssue:   (id: number, patch: Partial<ProductionIssue>) => Promise<void>;
  deleteIssue:   (id: number) => Promise<void>;
}
```

**Notes**:
- `createIssue`: `nextId('nIssue')` → build issue → `setDoc` → notify all admins (except self): `"New issue logged: \"{title}\""` → write audit `'Issue Created'`.
- `updateIssue`: merge patch into existing → `setDoc` → handle CA task creation/update (see §4.1) → write audit `'Issue Updated'`.
- `deleteIssue`: `deleteDoc`, remove from store.
- All issues are loaded on screen mount. No real-time listener needed (low-frequency updates; pull-to-refresh is sufficient).

### 5.2 `src/stores/kaizenStore.ts`

```typescript
interface KaizenState {
  items:   KaizenItem[];
  loading: boolean;

  loadItems:      () => Promise<void>;
  submitIdea:     (data: { title: string; category: string; description?: string; linkedIssueId?: number | null }) => Promise<void>;
  updateItem:     (id: number, patch: Partial<KaizenItem>) => Promise<void>;  // admin: edit title/category/desc/linkedIssueId
  advanceStage:   (id: number, toStage: KaizenItem['stage']) => Promise<void>; // admin: move forward
  retractStage:   (id: number) => Promise<void>;                               // admin: move back
  createActionPlan: (id: number, ap: Omit<ActionPlan, 'ts' | 'version'>) => Promise<void>;
  recordOutcome:  (id: number, worked: boolean, notes: string) => Promise<void>;
  toggleVote:     (id: number) => Promise<void>;
  toggleStepDone: (kaizenId: number, stepIdx: number) => Promise<void>;
  deleteItem:     (id: number, reason: string) => Promise<void>;
}
```

**Notes**:
- `submitIdea`: `nextId('nKaizen')` → push `{id, title, category, description, linkedIssueId, stage:'idea', submitter:user.uid, votes:0, voters:[], actionPlans:[], ts:Date.now()}` → notify all admins (except self): `"New improvement idea: \"{title}\""` → audit `'Kaizen Created'`.
- `advanceStage`: special handling for → `'action'` (requires an action plan to be created first; don't advance automatically — the "→ Plan" button opens the action plan modal instead) and → `'complete'` (requires outcome recording). For `'review'`: just update stage.
- `retractStage`: if current stage is `'action'` and `actionPlans.length > 0`, archive the active plan (`outcome = 'archived'`, `outcomeNotes = 'Moved back before completion'`, `outcomeDate = today`) and delete all associated kaizen tasks from the tasks store.
- `createActionPlan`: append a new `ActionPlan` to `item.actionPlans` with `version = existing.length + 1`, set `item.stage = 'action'`, generate tasks for each step with an assignee, send notifs, audit.
- `recordOutcome`: mark active plan `outcome = worked ? 'worked' : 'failed'`; if worked → set `item.stage = 'complete'`, `item.completedDate = today`; if failed → clear outcome and immediately open the action plan modal (handled in UI, not store). Delete all kaizen tasks for this item. Audit.
- `toggleVote`: toggle current user's uid in `item.voters`, adjust `item.votes` accordingly.
- `toggleStepDone`: flip `item.actionPlans[last].steps[stepIdx].done`.
- `deleteItem`: send DM to submitter (find or create 2-person room; see §7.5) → send in-app notif → delete associated tasks → `deleteDoc` → audit `'Kaizen Deleted'`.

### 5.3 `src/stores/planningStore.ts`

```typescript
interface PlanningState {
  boards:   PlanningBoard[];
  loading:  boolean;

  // board management
  loadBoards:   () => Promise<void>;
  createBoard:  (data: { name: string; eventId?: number | null }) => Promise<void>;
  updateBoard:  (id: number, patch: { name?: string; eventId?: number | null }) => Promise<void>;
  deleteBoard:  (id: number) => Promise<void>;

  // per-board canvas state (keyed by boardId)
  elements:     Record<number, BoardElement[]>;
  listeners:    Record<number, () => void>;  // unsubscribe functions

  // canvas actions
  subscribeBoard:    (boardId: number) => void;
  unsubscribeBoard:  (boardId: number) => void;
  upsertElement:     (boardId: number, el: BoardElement) => Promise<void>;
  deleteElement:     (boardId: number, elementId: string) => Promise<void>;
  batchMoveElements: (boardId: number, moves: Array<{ id: string; x: number; y: number }>) => Promise<void>;
}
```

**Notes**:
- `subscribeBoard(boardId)`: start `onSnapshot` on `planningBoards/{boardId}/elements` → store elements in `elements[boardId]`. Store unsubscribe fn in `listeners[boardId]`.
- `unsubscribeBoard(boardId)`: call stored unsubscribe fn, clear from `listeners`.
- `upsertElement`: `setDoc(doc(db,'planningBoards',boardId,'elements',el.id), {...el, updatedAt: Date.now()}, {merge:true})`.
- `deleteElement`: `deleteDoc(...)`.
- `batchMoveElements`: write each move as a `setDoc` update; since we're using per-element docs and `merge:true`, this won't clobber other fields.
- Debounce position writes: the canvas calls `upsertElement` during drag, but debounces 500 ms. On drag start, update local store immediately (optimistic); on debounce fire, write to Firestore.

---

## 6. Screen Specifications

### 6.1 Operations Screen — `src/screens/OperationsScreen.tsx`

**Access**: all authenticated users.

Three sub-tabs:
```
[Production Issues]  [Kaizen Board]  [Planning]   ← Planning hidden if !isAdmin
```

Nav badge on the Operations tab shows count of open + in-progress issues when > 0.

Default tab: `'issues'`. Preserve the selected tab in Zustand UI state (`S.improveTab`) so navigating away and back restores position.

---

### 6.2 Issues Screen — `src/screens/IssuesScreen.tsx`

**Header**: "Production Issues" + "+ New Issue" button.

**Stats row** (three tappable boxes):
```
[Open: N]  [In Progress: N]  [Resolved: N]
```
- Colors: Open = `#e74c3c`, In Progress = `#e67e22`, Resolved = `#27ae60`
- Tapping a box switches the active filter tab

**Filter tabs**: Open (N) | In Progress (N) | Resolved (N)

**Issue cards** (filtered by active tab, newest first):
- Title (bold)
- Sub-line: `{eventTitle} · {FD(date)} · Reported by {userName}` (eventTitle only if set)
- Problem snippet (first 120 chars + "..." if longer)
- CA line in green: `✔ CA: {first 80 chars}` (only if `ca` is set)
- Status badge (right-aligned): Open / CA In Progress / Resolved (color-coded)
- Tapping opens the Edit Issue bottom sheet

**Empty state**: "No issues in this category."

**State**: `issuesStore`. Load on mount. Pull-to-refresh.

---

### 6.3 Kaizen Board Screen — `src/screens/KaizenScreen.tsx`

**Header**: "Kaizen Board" + "+ Submit Idea" button (any user).

**Subtitle**: "Continuous improvement. Vote to surface the best ideas. Admins move cards through the pipeline."

**Board layout**: Horizontal scroll view containing four columns side-by-side (or stacked on narrow screens; adapt with `flexDirection` based on `useWindowDimensions`). Each column is at least 210 px wide.

**Column structure**:
- Colored dot + column name + item count
- Items sorted by votes descending
- Each item card:
  - Category tag (accent-colored pill)
  - Title (13px bold)
  - Description (truncated to 80 chars with "Show more" toggle)
  - "↗ From: {issueTitle}" (if `linkedIssueId` is set and issue is found)
  - Active action plan summary box (if `stage === 'action'`): plan version, statement preview, steps done/total
  - Vote row: `▲ {votes}` button (highlighted if user already voted) + submitter name
  - Admin action row (admin only): Back ←, Forward →, Edit, Delete buttons + special handling per stage

**Admin stage transitions** (forward):
- `idea` → `review`: direct move (set stage = 'review', save)
- `review` → `action`: do NOT auto-advance; instead open **Action Plan bottom sheet** (§7.3)
- `action` → `complete`: open **Outcome bottom sheet** (§7.4)

**Admin stage transition** (back):
- Any stage back: confirm if there's an action plan (warn it will archive the plan and remove tasks); archive active plan with `outcome = 'archived'`; remove kaizen tasks; move to previous stage.

**Special "New Plan" button** when already in `action` stage: opens **Outcome bottom sheet** with `worked=false` — this records the current plan as failed and then immediately opens a new Action Plan sheet.

**Completed items**: show "View History (N plans)" button.

---

### 6.4 Planning Boards List Screen — `src/screens/PlanningScreen.tsx`

**Access guard**: redirect to home if `!isAdmin(user)`.

**Header**: "Planning Boards" + "+ New Board" button.

**Subtitle**: "Freeform planning whiteboards linked to events."

**Boards grouped by event**:
- Section header per event: `{event.title} · {FD(event.date)}` (accent, uppercase, small)
- Boards with no `eventId` shown at the bottom (ungrouped)

**Board card**:
- Board name (bold)
- Sub-line: "Has content" or "Empty board"
- "Open" button + "Delete" button (with confirm)
- Tapping the card or "Open" → navigates to the canvas (full-screen overlay)

**New Board bottom sheet** (§7.6): name + event link picker.

---

### 6.5 Planning Board Canvas — `src/screens/PlanningBoardCanvas.tsx`

The canvas is a full-screen view. It subscribes to the board's `elements` subcollection in real-time and renders all elements. Multiple admins can be on the same board simultaneously and see each other's changes within ~1 second.

**Lifecycle**:
1. On mount: call `planningStore.subscribeBoard(boardId)`.
2. On unmount: call `planningStore.unsubscribeBoard(boardId)`.

**Layout**:
```
[Full-screen canvas with SVG overlay]
[Fixed toolbar at bottom or side]
[Header bar at top: board name + Close button]
```

---

## 7. Planning Board Canvas — Detailed Specification

This is the most complex component in Phase 4. Read this section carefully before writing any canvas code.

### 7.1 Canvas Architecture

```
PlanningBoardCanvas
  └── GestureHandlerRootView                    ← required wrapper from react-native-gesture-handler
        ├── Header bar (absolute, top)
        ├── GestureDetector (pan/pinch for viewport)
        │    └── Animated.View (transform: translate + scale)
        │         └── Svg (react-native-svg, large canvas)
        │              ├── <G> per element (sorted by zIndex)
        │              │    ├── StickyElement
        │              │    ├── TextElement
        │              │    ├── BoxElement
        │              │    ├── ArrowElement
        │              │    ├── PinElement
        │              │    ├── PenElement
        │              │    └── ImageElement
        │              └── SelectionOverlay (when activeTool === 'select' and selection exists)
        └── BoardToolbar (absolute, bottom)
```

**Coordinate system**: The canvas has a logical size of 4000×4000 units. The initial viewport is centered at (2000, 2000) with 100% zoom. All element positions are in canvas units.

**Viewport state** (local component state, not Firestore):
```typescript
type Viewport = {
  translateX: number;  // canvas offset in screen pixels
  translateY: number;
  scale:      number;  // zoom level (0.2–4.0)
};
```

Use `react-native-reanimated` shared values for viewport — update on the UI thread via worklets for smooth 60 fps pan/zoom.

### 7.2 Toolbar — `src/components/board/BoardToolbar.tsx`

```typescript
type Tool =
  | 'select'   // tap/drag to select and move elements
  | 'pan'      // drag viewport
  | 'sticky'   // tap to place a sticky note
  | 'text'     // tap to place a text label
  | 'box'      // drag to draw a box
  | 'arrow'    // drag to draw an arrow (first point → second point)
  | 'pin'      // tap to place a pin
  | 'pen'      // drag to draw freehand
  | 'image';   // tap to open image picker and place image
```

Toolbar shows icons for each tool. Active tool is highlighted. Selecting a tool that requires a drag draw (box, arrow, pen) shows a brief instruction hint.

Color/size picker appears when `pen`, `box`, `arrow`, or `sticky` is active — show a row of preset colors + a line-width slider for pen/box/arrow.

**Preset stroke colors** (for pen, box, arrow): `['#f0ece4', '#e8624a', '#2980b9', '#27ae60', '#e67e22', '#8e44ad', '#e74c3c', '#f39c12']`

**Preset sticky colors**: `['#fffde7', '#e3f2fd', '#e8f5e9', '#fce4ec', '#f3e5f5', '#e0f7fa']`

### 7.3 Gesture Handling

Use Gesture API from `react-native-gesture-handler` (not the legacy `PanResponder`).

**Pan viewport** (pan tool OR two-finger pan any time):
```typescript
const panGesture = Gesture.Pan()
  .onUpdate((e) => {
    viewport.translateX.value += e.changeX;
    viewport.translateY.value += e.changeY;
  });
```

**Pinch zoom** (always active, any tool):
```typescript
const pinchGesture = Gesture.Pinch()
  .onUpdate((e) => {
    const newScale = clamp(savedScale * e.scale, 0.2, 4.0);
    viewport.scale.value = newScale;
  });
```

Combine both: `Gesture.Simultaneous(panGesture, pinchGesture)` wrapping the canvas.

**Element placement** (sticky, text, pin tools): Single tap → convert screen coordinates to canvas coordinates → create element at that position.

Screen-to-canvas conversion:
```typescript
function screenToCanvas(screenX: number, screenY: number, vp: Viewport): { x: number; y: number } {
  return {
    x: (screenX - vp.translateX) / vp.scale,
    y: (screenY - vp.translateY) / vp.scale,
  };
}
```

**Draw tools** (box, arrow): `Gesture.Pan()` on the canvas layer (only when activeTool === 'box' or 'arrow'):
- `onStart`: record start point (canvas coords)
- `onUpdate`: show live preview element
- `onEnd`: create final element, save to Firestore

**Pen tool**: `Gesture.Pan()` with `.minDistance(0)`:
- `onStart`: begin new path, append first point
- `onUpdate`: append decimated point (see §7.4)
- `onEnd`: finalize path, save to Firestore

**Select tool**: 
- Single tap: hit-test elements (check if tap is inside any element's bounding box, highest zIndex wins) → select element → show selection handles
- Drag on selected element: move element (update position live, debounce Firestore write 500 ms)
- Drag on empty canvas: deselect

**Element drag** (when selected with select tool):
```typescript
const dragGesture = Gesture.Pan()
  .onUpdate((e) => {
    // Update element position in local store immediately
    // Debounce the Firestore write
    updateElementPosition(element.id, element.x + e.changeX / vp.scale, element.y + e.changeY / vp.scale);
  });
```

### 7.4 Pen Tool — Point Decimation & Path Smoothing

The pen tool captures a raw point stream at touch events (potentially 60+ points/second) and reduces it before saving.

**Decimation** (Ramer-Douglas-Peucker algorithm with epsilon = 3.0 canvas units):
```typescript
// src/lib/boardUtils.ts

export function rdpDecimate(points: number[][], epsilon: number): number[][] {
  if (points.length <= 2) return points;
  
  // Find the point with the greatest distance from the line between first and last
  let maxDist = 0;
  let maxIdx  = 0;
  const first = points[0];
  const last  = points[points.length - 1];
  
  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], first, last);
    if (dist > maxDist) { maxDist = dist; maxIdx = i; }
  }
  
  if (maxDist > epsilon) {
    const left  = rdpDecimate(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpDecimate(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

function perpendicularDistance(pt: number[], line0: number[], line1: number[]): number {
  const dx = line1[0] - line0[0];
  const dy = line1[1] - line0[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return Math.sqrt((pt[0]-line0[0])**2 + (pt[1]-line0[1])**2);
  return Math.abs(dy * pt[0] - dx * pt[1] + line1[0] * line0[1] - line1[1] * line0[0]) / len;
}
```

**Smoothed SVG path** (quadratic bezier through midpoints):
```typescript
export function pointsToSvgPath(points: number[][]): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0][0]} ${points[0][1]} L ${points[1][0]} ${points[1][1]}`;
  }
  
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i][0] + points[i+1][0]) / 2;
    const my = (points[i][1] + points[i+1][1]) / 2;
    d += ` Q ${points[i][0]} ${points[i][1]} ${mx} ${my}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last[0]} ${last[1]}`;
  return d;
}
```

During drawing (before saving), render the live path using `pointsToSvgPath` on the raw (un-decimated) stream for visual smoothness. On `onEnd`, decimate with RDP then save to Firestore. This means Firestore stores the compact point array; rendering always runs through `pointsToSvgPath`.

### 7.5 Element Rendering Components

Each element is rendered as an SVG group (`<G>`) inside the main `<Svg>` element.

#### `StickyElement`
```tsx
// A colored rectangle with multi-line text
<G transform={`translate(${el.x}, ${el.y})`}>
  <Rect width={el.width ?? 160} height={el.height ?? 120}
        fill={el.bgColor ?? '#fffde7'} rx={6} ry={6}
        stroke="rgba(0,0,0,0.1)" strokeWidth={1} />
  <ForeignObject x={8} y={8} width={(el.width ?? 160) - 16} height={(el.height ?? 120) - 16}>
    // Use Text from SVG for simple cases; ForeignObject for multiline on web
  </ForeignObject>
</G>
```

On native, use multiple SVG `<Text>` elements with manual line-wrapping (split on `\n`, estimate line height = `fontSize * 1.4`).

#### `TextElement`
```tsx
<G transform={`translate(${el.x}, ${el.y})`}>
  <Text fill={el.textColor ?? '#f0ece4'} fontSize={el.fontSize ?? 14}
        fontWeight="500" fontFamily="sans-serif">
    {el.content}
  </Text>
</G>
```

#### `BoxElement`
```tsx
<G transform={`translate(${el.x}, ${el.y})`}>
  <Rect width={el.width ?? 120} height={el.height ?? 80}
        fill="transparent"
        stroke={el.strokeColor ?? '#e8624a'}
        strokeWidth={el.strokeWidth ?? 2} rx={4} ry={4} />
  {el.content ? (
    <Text x={(el.width ?? 120) / 2} y={(el.height ?? 80) / 2}
          textAnchor="middle" fill={el.textColor ?? '#f0ece4'}
          fontSize={el.fontSize ?? 12}>
      {el.content}
    </Text>
  ) : null}
</G>
```

#### `ArrowElement`
```tsx
// Arrow from (el.x, el.y) to (el.x2, el.y2)
// Arrowhead: small triangle at the endpoint
const angle = Math.atan2((el.y2 ?? el.y) - el.y, (el.x2 ?? el.x) - el.x);
const headLen = 12;
<G>
  <Line x1={el.x} y1={el.y} x2={el.x2 ?? el.x} y2={el.y2 ?? el.y}
        stroke={el.strokeColor ?? '#f0ece4'}
        strokeWidth={el.strokeWidth ?? 2} />
  <Polygon
    points={arrowheadPoints(el.x2 ?? el.x, el.y2 ?? el.y, angle, headLen)}
    fill={el.strokeColor ?? '#f0ece4'} />
</G>
```

#### `PinElement`
```tsx
// Pin: circle on top + triangle point at bottom
<G transform={`translate(${el.x}, ${el.y})`}>
  <Circle cx={0} cy={-8} r={8} fill={el.pinColor ?? '#e8624a'} />
  <Polygon points="0,4 -5,-4 5,-4" fill={el.pinColor ?? '#e8624a'} />
  {el.content ? (
    <Text y={18} textAnchor="middle" fontSize={11}
          fill={el.textColor ?? '#f0ece4'}>
      {el.content}
    </Text>
  ) : null}
</G>
```

#### `PenElement`
```tsx
<Path d={pointsToSvgPath(el.points ?? [])}
      stroke={el.strokeColor ?? '#f0ece4'}
      strokeWidth={el.strokeWidth ?? 3}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round" />
```

#### `ImageElement`
```tsx
<Image
  x={el.x} y={el.y}
  width={el.width ?? 200}
  height={el.height ?? 150}
  href={el.imageUrl}
  preserveAspectRatio="xMidYMid meet" />
```

### 7.6 Selection Handles

When an element is selected (select tool), render a `SelectionOverlay` that shows:
- Dashed rectangle border around the element's bounding box
- Four corner handles (small filled squares)
- Drag on element body → move
- Drag on corner handle → resize (for sticky, box, image)
- Double-tap on sticky/text/box → open inline text edit bottom sheet

```tsx
// SelectionOverlay
<G>
  <Rect x={bbox.x - 4} y={bbox.y - 4}
        width={bbox.w + 8} height={bbox.h + 8}
        fill="none"
        stroke="#87b7e8"
        strokeWidth={1.5 / viewport.scale}
        strokeDasharray={[4 / viewport.scale, 3 / viewport.scale]} />
  {corners.map(({x, y, cursor}) => (
    <Rect key={cursor} x={x - 5/viewport.scale} y={y - 5/viewport.scale}
          width={10/viewport.scale} height={10/viewport.scale}
          fill="#87b7e8" rx={1} />
  ))}
</G>
```

Note: divide handle sizes and stroke widths by `viewport.scale` so they remain a constant visual size regardless of zoom level.

### 7.7 Image Upload on Board

When the `image` tool is active and user taps the canvas:
1. Call `useFileUpload().pickAndUpload()` (from Phase 3)
2. On success, create a `BoardElement` of type `'image'` with the returned `imageUrl`
3. Default size: 200×150 canvas units
4. Write to Firestore via `planningStore.upsertElement`

### 7.8 Hit Testing

For the select tool, when user taps, test each element (highest `zIndex` first):

```typescript
// src/lib/boardUtils.ts

export function getBoundingBox(el: BoardElement): { x: number; y: number; w: number; h: number } {
  switch (el.type) {
    case 'sticky': return { x: el.x, y: el.y, w: el.width ?? 160, h: el.height ?? 120 };
    case 'text':   return { x: el.x - 4, y: el.y - 14, w: (el.content?.length ?? 10) * (el.fontSize ?? 14) * 0.6, h: (el.fontSize ?? 14) * 1.4 };
    case 'box':    return { x: el.x, y: el.y, w: el.width ?? 120, h: el.height ?? 80 };
    case 'arrow':  return { x: Math.min(el.x, el.x2 ?? el.x) - 8, y: Math.min(el.y, el.y2 ?? el.y) - 8, w: Math.abs((el.x2 ?? el.x) - el.x) + 16, h: Math.abs((el.y2 ?? el.y) - el.y) + 16 };
    case 'pin':    return { x: el.x - 10, y: el.y - 20, w: 20, h: 30 };
    case 'pen':    return penBoundingBox(el.points ?? []);
    case 'image':  return { x: el.x, y: el.y, w: el.width ?? 200, h: el.height ?? 150 };
    default:       return { x: el.x, y: el.y, w: 20, h: 20 };
  }
}

function penBoundingBox(points: number[][]): { x: number; y: number; w: number; h: number } {
  if (!points.length) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = points.map(p => p[0]);
  const ys = points.map(p => p[1]);
  const minX = Math.min(...xs) - 8, maxX = Math.max(...xs) + 8;
  const minY = Math.min(...ys) - 8, maxY = Math.max(...ys) + 8;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function hitTest(canvasX: number, canvasY: number, el: BoardElement): boolean {
  const bb = getBoundingBox(el);
  return canvasX >= bb.x && canvasX <= bb.x + bb.w
      && canvasY >= bb.y && canvasY <= bb.y + bb.h;
}
```

---

## 8. Modal / Bottom Sheet Specifications

### 8.1 Edit Issue

Triggered by: "+ New Issue" button or tapping an issue card.

```
Header: "New Production Issue" or "Edit Issue"

Sections (separated by horizontal rules):
─── Issue Info ─────────────────────────────
  Title *              (TextInput)
  Date * / Related Event  (DatePicker / TextInput, side by side)

─── Problem Statement ──────────────────────
  "What happened?" *   (multiline, 3 rows)

─── 5-Why Root Cause Analysis ──────────────
  Label: "Ask 'Why?' five times to find the root cause."
  For each why (numbered 1–5 with circle badges):
    TextInput (2 rows)

─── Corrective Action ──────────────────────
  "What will be done to prevent recurrence?" (3 rows)
  CA Owner                                   (searchable ComboBox of users)
  CA Due Date                                (DatePicker, shown only when caOwner is set)

─── Verification ────────────────────────────
  Label: "Did the corrective action work? Complete this after the next event."
  Verification Date / Status (DatePicker / Picker, side by side)
  Status options: Open | CA In Progress | Resolved / Closed
  Verification Notes                         (3 rows)

Footer: [Cancel] [Delete (existing only, red)] [Submit / Save]
```

Validation: title and problem are required.

On save: call `issuesStore.createIssue` or `issuesStore.updateIssue`. Handle CA task creation/update within the store action (see §4.1).

### 8.2 Edit / Submit Kaizen Idea

Triggered by: "+ Submit Idea" button or "Edit" button on a kaizen card.

```
Header: "Submit Improvement Idea" or "Edit Idea"

Fields:
  Idea Title *        (TextInput)
  Category            (Picker from KAIZEN_CATS)
  Description         (4-row TextInput, optional)
  Linked Issue        (Picker from existing issues, optional)
  Stage               (Picker from KAIZEN_COLS, admin only on edit)

Footer: [Cancel] [Delete (admin, existing)] [Submit / Save]
```

### 8.3 Action Plan

Triggered by: admin tapping "→ Plan" when advancing to `action` stage, or "+ New Plan" on an existing action item.

```
Header: "Action Plan"
Sub-header: "For: {item.title}"

Fields:
  Opportunity / Problem Statement  (3-row TextInput, required)
  Success Criteria                 (2-row TextInput, "How will we know this worked?")
  Review Date                      (DatePicker, optional)

  ─── Action Steps ───────────────────────
  (for each step):
    Step N Description   (TextInput, required)
    Assignee             (searchable ComboBox)
    Due Date             (DatePicker, optional)
    [Remove Step]

  [+ Add Step]

Footer: [Cancel] [Save & Activate Plan]
```

Validation: statement required, at least one step required.

On save:
- Build `ActionPlan` object with `ts = Date.now()`, `version = item.actionPlans.length + 1`
- Append to `item.actionPlans`
- Set `item.stage = 'action'`
- For each step with an assignee: create a task (`kaizenStore.createActionPlan` handles this)
- Notify each step assignee: `"New Kaizen task: \"{step.title}\" for \"{item.title}\""`
- Audit: `'Kaizen Action Plan v{version}'`

### 8.4 Outcome Recording

Triggered by: admin tapping "→ Complete" (worked = true) or "+ New Plan" while in action stage (worked = false).

```
Header: "Mark as Completed" (worked) or "Initiate New Action Plan" (not worked)

Info (if active plan exists):
  "Current plan: v{N} — {statement.slice(0,60)}"
  "Steps: {done}/{total} complete"

Field:
  "What worked? (outcome notes)" or "What failed? Why?" (4-row TextInput)

Footer: [Cancel] [Mark Completed (worked) / Start New Plan (!worked)]
```

On save:
- Mark active plan with `outcome = worked ? 'worked' : 'failed'`, `outcomeNotes`, `outcomeDate = today`
- Delete all tasks with `kaizenId === item.id` from the tasks store
- If worked: `item.stage = 'complete'`, `item.completedDate = today`, audit `'Kaizen Completed'`
- If not worked: close this sheet → immediately open Action Plan sheet (§8.3) for a new plan

### 8.5 Kaizen History

Triggered by: "View History (N plans)" button on completed items.

```
Header: "{item.title} — History"

For each plan (ordered oldest to newest):
  Card:
    "Plan v{N}" + outcome badge (Worked / Did Not Work / Pending)
    Statement
    Success criteria
    Steps list (each: ✔/○ title (assignee) — due {date})
    Outcome notes (italic, color-coded)
    Outcome date

Footer: [Close]
```

### 8.6 Kaizen Delete

Triggered by: admin "Delete" button on a kaizen card.

```
Header: "Delete Idea"
Text: "Deleting \"{item.title}\". The submitter will be notified."

Field:
  Reason for deletion (required, 3-row TextInput)

Footer: [Cancel] [Delete & Notify (red)]
```

On save:
- Find or create DM room between current admin and the submitter (2-member room; see §8.6.1)
- Send message to room: `"Your idea \"{item.title}\" was removed by {admin.name}: {reason}"`
- Send in-app notif to submitter: `"Your Kaizen idea \"{item.title}\" was removed: {reason}"`
- Delete tasks with `kaizenId === item.id`
- `deleteDoc` the kaizen item
- Audit `'Kaizen Deleted'`

**§8.6.1 Find/create DM room**: Search `S.rooms` for a room with exactly 2 members where both the admin uid and submitter uid are members. If not found, create a new room: `{ name: 'Kaizen: {submitterName}', members: [adminUid, submitterUid], msgs: [], call: false }` using `nextId('nRoom')`. Then send the message to that room via `messagesStore.sendMessage(roomId, msg)`.

### 8.7 New / Edit Planning Board

Triggered by: "+ New Board" or editing a board.

```
Header: "New Planning Board" or "Edit Board"

Fields:
  Board Name *          (TextInput)
  Link to Event         (Picker: "No event (standalone)" + all events sorted by date)

Footer: [Cancel] [Create / Save]
```

### 8.8 Inline Text Edit (double-tap on canvas element)

When user double-taps a sticky, text, or box element:

```
Header: (no title — compact bottomsheet)

Field:
  Text content         (multiline TextInput, pre-filled)

Footer: [Cancel] [Done]
```

On Done: update `element.content` in local store → debounced Firestore write.

---

## 9. Firestore Security Rules Additions

```javascript
// Production Issues
match /issues/{issueId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update, delete: if request.auth != null
    && (isAdmin() || resource.data.reporter == request.auth.uid);
}

// Kaizen Board
match /kaizen/{kaizenId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  // Votes: any authenticated user can update voters/votes
  // Stage/actionPlans: admin only
  // For simplicity, allow any authenticated user to update (rely on store logic)
  allow update: if request.auth != null;
  allow delete: if isAdmin();
}

// Planning boards metadata
match /planningBoards/{boardId} {
  allow read, write: if isAdmin();

  // Board elements subcollection
  match /elements/{elementId} {
    allow read, write: if isAdmin();
  }
}
```

---

## 10. Acceptance Criteria

### Production Issues
- [ ] AC-4-01: Any authenticated user can create a production issue; it appears in `issues/{id}` with correct fields.
- [ ] AC-4-02: Creating an issue with a CA owner and CA text generates a task in `tasks/{id}` with the correct title, assignee, and due date.
- [ ] AC-4-03: The CA task owner receives an in-app notification.
- [ ] AC-4-04: Saving an existing issue that already has a `caDueTaskId` updates that task (does not create a duplicate).
- [ ] AC-4-05: Stats row correctly shows Open, In Progress, and Resolved counts; tapping each switches the filter tab.
- [ ] AC-4-06: Issues display correct status badge colors: red/orange/green.
- [ ] AC-4-07: Deleting an issue removes it from Firestore.
- [ ] AC-4-08: All admins (except the creator) receive an in-app notification when a new issue is created.

### Kaizen Board
- [ ] AC-4-09: Any authenticated user can submit a kaizen idea; it lands in the "Ideas" column.
- [ ] AC-4-10: Any authenticated user can upvote/un-upvote; the vote count updates in Firestore.
- [ ] AC-4-11: A user cannot vote more than once (toggling removes the vote).
- [ ] AC-4-12: Admin can advance an idea from Ideas → Under Review directly.
- [ ] AC-4-13: Admin cannot advance from Under Review → Action Plan without filling in an action plan (the Plan modal is required).
- [ ] AC-4-14: Creating an action plan creates the correct tasks in the tasks store and notifies assignees.
- [ ] AC-4-15: Admin can mark a plan as completed → item moves to Completed column.
- [ ] AC-4-16: Admin can record a failed outcome → current plan is archived → new Action Plan sheet opens immediately.
- [ ] AC-4-17: Moving an item back from Action Plan archives the active plan and removes its tasks.
- [ ] AC-4-18: Kaizen history modal shows all past plans with outcomes.
- [ ] AC-4-19: Delete sends a DM to the submitter with the reason, removes tasks, removes item.
- [ ] AC-4-20: Items within a column are sorted by votes descending.
- [ ] AC-4-21: "Linked issue" link is shown on the card when `linkedIssueId` is set.

### Planning Boards — List
- [ ] AC-4-22: Non-admin users cannot access the Planning tab (redirected or hidden).
- [ ] AC-4-23: Admin can create a board with a name and optional event link.
- [ ] AC-4-24: Boards are grouped by linked event; unlinked boards appear last.
- [ ] AC-4-25: Admin can delete a board (with confirm); the board and all its elements are deleted from Firestore.

### Planning Board — Canvas
- [ ] AC-4-26: Canvas renders all elements from `planningBoards/{boardId}/elements/` on load.
- [ ] AC-4-27: Elements update in real-time when another admin makes changes.
- [ ] AC-4-28: Pan and pinch-zoom update the viewport smoothly at 60 fps (no jank on device).
- [ ] AC-4-29: Sticky tool: tapping the canvas creates a sticky note element at the tapped position; it is written to Firestore.
- [ ] AC-4-30: Text tool: tapping creates a text element; double-tapping opens the inline edit sheet.
- [ ] AC-4-31: Box tool: drag creates a box at the correct position and size.
- [ ] AC-4-32: Arrow tool: drag creates an arrow from start to end point with an arrowhead at the end.
- [ ] AC-4-33: Pin tool: tapping creates a pin marker.
- [ ] AC-4-34: Pen tool: dragging creates a freehand path; the path is decimated before saving; the rendered path is smooth (quadratic bezier).
- [ ] AC-4-35: Image tool: tapping opens the file picker; after upload, an image element appears at the tapped position.
- [ ] AC-4-36: Select tool: tapping an element selects it with a dashed border and corner handles.
- [ ] AC-4-37: Dragging a selected element moves it; position is debounced 500 ms before writing to Firestore.
- [ ] AC-4-38: Double-tapping a sticky / text / box element opens the inline text edit sheet; saving updates `element.content`.
- [ ] AC-4-39: Deleting a selected element (via toolbar trash icon or swipe) removes it from Firestore immediately.
- [ ] AC-4-40: Selection handle sizes and border stroke widths remain visually constant regardless of zoom level.
- [ ] AC-4-41: Color and stroke-width pickers work for pen, box, arrow, and sticky tools.
- [ ] AC-4-42: The canvas performs acceptably with 100+ elements (no noticeable lag on a 2022+ device/browser).

---

## 11. Common Pitfalls

1. **Issue `id` counter is `nIssue`** — this key does not exist in the original app (which used `Date.now()` as the id). Add it to `config/main` the first time `nextId('nIssue')` is called. The `nextId` helper should handle missing keys gracefully (initialize to 1 if not present).

2. **CA task field `issueId` is not in Phase 2's task type** — add `issueId?: number` and `issueTitle?: string` to the task TypeScript interface from Phase 2 without breaking existing tasks.

3. **Kaizen `id` uses `nextId('nKaizen')` now, not `Date.now()`** — same as above; ensure `nKaizen` is initialized.

4. **Kaizen action plan tasks have `kaizenId` set** — when deleting a kaizen item or archiving a plan, filter the tasks store by `kaizenId === item.id` and delete those tasks both from Firestore (`tasks/{id}`) and from local store.

5. **`kaizenGetOrCreateDMRoom`**: search rooms by member composition, not by name (the name is just a display label). Room lookup: find a room with `members.length === 2` where both uids appear. Use `sameId()` for comparison.

6. **Planning board element ids are strings (nanoid/UUID)** — not numbers. Firestore document IDs must be strings; this is consistent. Do not use numeric IDs for elements.

7. **`onSnapshot` on elements subcollection**: start the listener only when the board is open (`subscribeBoard` on canvas mount) and stop it when the board closes (`unsubscribeBoard` on canvas unmount). Do NOT subscribe to all boards' elements at app startup — that would be a large number of listeners.

8. **Debounce on element position**: update local store state immediately on gesture event (optimistic, so the element doesn't lag behind the finger), but only write to Firestore after 500 ms of no movement. Use a `useRef` to hold the debounce timer.

9. **SVG canvas on web vs native**: `react-native-svg` renders to a `<svg>` DOM element on web and a native view on iOS/Android. The behavior is identical for the elements described above. However, `ForeignObject` (used for rich text in sticky notes) is NOT supported on native — use multiple SVG `<Text>` elements with manual line-wrapping on native; use `ForeignObject` on web. Gate with `Platform.OS === 'web'`.

10. **Pen tool and `minDistance(0)`**: set `.minDistance(0)` on the pan gesture used for drawing, otherwise small strokes (dots, short marks) are ignored by the gesture recognizer.

11. **Board deletion should also delete elements**: when `planningStore.deleteBoard(id)` is called, first query `collection(db, 'planningBoards', id, 'elements')` → get all docs → batch delete all element docs → then delete the board doc itself. Firestore does not cascade-delete subcollections.

---

## 12. Handoff Instructions

Give a fresh session exactly this prompt:

> Read `docs/migration/OVERVIEW.md` for architecture context, then execute `docs/migration/PHASE_4_ISSUES_AND_PLANNING.md` end-to-end.
>
> The Expo app lives in `mission-portal-app/`. Do not touch `index.html`. Phases 1–3 are complete.
>
> **Your job**: Implement the Operations screen (Issues + Kaizen + Planning Boards tabs) plus the full custom Planning Board canvas. The Planning Board replaces Excalidraw — build it from scratch using `react-native-gesture-handler` and `react-native-svg`. Do not use Excalidraw anywhere.
>
> Suggested order:
> 1. Types (`src/types/issues.ts`, `kaizen.ts`, `planning.ts`)
> 2. Utility functions (`src/lib/kaizen.ts`, `src/lib/boardUtils.ts`)
> 3. Stores: issues → kaizen → planning
> 4. Issues screen + Edit Issue modal
> 5. Kaizen screen + all kaizen modals
> 6. Planning list screen
> 7. Board canvas: architecture → toolbar → gesture handling → element rendering → pen tool → selection
> 8. Firestore rules additions
> 9. Run through all 42 acceptance criteria in §10
>
> The Planning Board canvas is the hardest part — tackle it last, after Issues and Kaizen are working. When all 42 ACs pass, stop and report. Do not start Phase 5.

---

*Document ends.*
