// js/db.js
// ─────────────────────────────────────────────────────────────────────────────
// MULTI-COLLECTION FIRESTORE DATA LAYER
// ─────────────────────────────────────────────────────────────────────────────
//
// Collection map (all under the "mission-team-portal" project):
//
//   config/main            – COMMON_TEAMS, connectConfig, publicPages,
//                            postsConfig, calY/calM, counters (nEv, nTask …)
//   users/{uid}            – one doc per Firebase Auth UID
//   events/{id}            – event template + overrides object
//   tasks/{id}             – single task
//   rooms/{id}             – room metadata (name, members, call, reviewers)
//   rooms/{id}/messages/{msgId} – individual chat messages (subcollection)
//   groups/{id}            – group
//   reports/{id}           – security report
//   announcements/{id}     – announcement
//   setlists/{id}          – setlist
//   taskTemplates/{id}     – task template
//   issues/{id}            – production issue
//   kaizen/{id}            – kaizen idea
//   planningBoards/{id}    – planning board
//   merch/inventory        – items[] + transactions[]
//   inventory/production   – productionItems[]
//   inventory/reorder      – reorderItems[]
//   music/db               – musicDb[]
//   avail/{eventId}        – { responses: { [uid]: {status,note,ts} } }
//   notifs/{uid}           – { items: [...] }
//   meetingRequests/{id}   – meeting request
//   onboarding/{uid}       – { dismissed: bool }
//   auditLog/{autoId}      – single audit entry  (append-only)
//
// ─────────────────────────────────────────────────────────────────────────────

// ── Save-state guards ────────────────────────────────────────────────────────
var DB_SAVING     = false;
var SAVE_QUEUE    = false;
var STATE_LOADED  = false;
var SUPPRESS_RENDER = false;

// ── Theme (localStorage, not Firestore) ─────────────────────────────────────
var THEME = localStorage.getItem('mtp_theme') || 'dark';
function applyTheme(t) {
  THEME = t;
  localStorage.setItem('mtp_theme', t);
  document.body.classList.toggle('light', t === 'light');
}

// ── Debounced top-level save ─────────────────────────────────────────────────
var _saveTimer = null;
function save() {
  if (!STATE_LOADED) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(function () { _saveTimer = null; _doSave(); }, 250);
}

// ── Main write dispatcher ────────────────────────────────────────────────────
// Called by the debounce above and also directly by code that already knows
// exactly which collection changed (e.g. saveUsers, saveRoom …).
function _doSave() {
  if (!STATE_LOADED) return;

  // Strip null/empty assignees and group members before every save
  (S.tasks || []).forEach(function (t) {
    t.assignees = (t.assignees || []).filter(function (x) {
      return x != null && x !== '' && String(x) !== 'null' && String(x) !== 'undefined';
    });
    if (!t.lead || String(t.lead) === 'null') t.lead = (t.assignees || [])[0] || null;
  });
  (S.groups || []).forEach(function (g) {
    g.members = (g.members || []).filter(function (x) {
      return x != null && x !== '' && String(x) !== 'null' && String(x) !== 'undefined' && UN(x) !== '?';
    });
  });

  if (DB_SAVING) { SAVE_QUEUE = true; return; }
  if (!S.user) return;
  DB_SAVING = true;
  saveDotSaving();

  var batch = db.batch();

  // ── config/main ─────────────────────────────────────────────────────────
  var configRef = db.collection('config').doc('main');
  batch.set(configRef, {
    calY:          S.calY,
    calM:          S.calM,
    COMMON_TEAMS:  COMMON_TEAMS,
    connectConfig: S.connectConfig  || { socialLinks: [], leadershipTeam: [] },
    publicPages:   S.publicPages    || {},
    postsConfig:   S.postsConfig    || { pages: [] },
    lastSeenPosts: S.lastSeenPosts  || {},
    nEv:           S.nEv,
    nTask:         S.nTask,
    nGroup:        S.nGroup,
    nRoom:         S.nRoom,
    nReport:       S.nReport,
    nNotif:        S.nNotif,
    updatedAt:     firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // ── merch (single doc – items + transactions are reasonably small) ───────
  batch.set(db.collection('merch').doc('inventory'), {
    items:        S.merch.items,
    transactions: S.merch.transactions,
    nItem:        S.merch.nItem,
    nTx:          S.merch.nTx,
    updatedAt:    firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // ── inventory ────────────────────────────────────────────────────────────
  batch.set(db.collection('inventory').doc('production'), {
    items:     S.productionItems || [],
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  batch.set(db.collection('inventory').doc('reorder'), {
    items:     S.reorderItems || [],
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // ── music ────────────────────────────────────────────────────────────────
  batch.set(db.collection('music').doc('db'), {
    items:     S.musicDb || [],
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // ── inputLists ───────────────────────────────────────────────────────────
  batch.set(db.collection('config').doc('inputLists'), {
    lists:     S.inputLists || { sunday: [], event: [], wh2: [] },
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  // Commit the batch (config + merch + inventory + music)
  batch.commit()
    .then(function () {
      // Now fan-out the array-backed collections concurrently
      return Promise.all([
        _saveCollection('events',         S.templates       || []),
        _saveCollection('tasks',          S.tasks           || []),
        _saveCollection('groups',         S.groups          || []),
        _saveCollection('reports',        S.reports         || []),
        _saveCollection('announcements',  S.announcements   || []),
        _saveCollection('setlists',       S.setlists        || []),
        _saveCollection('taskTemplates',  S.taskTemplates   || []),
        _saveCollection('issues',         S.issues          || []),
        _saveCollection('kaizen',         S.kaizen          || []),
        _saveCollection('planningBoards', S.planningBoards  || []),
        _saveCollection('meetingRequests',S.meetingRequests || []),
        _saveOverrides(),
        _saveAvail(),
        _saveNotifs()
      ]);
    })
    .then(function () {
      DB_SAVING = false;
      saveDotSaved();
      if (SAVE_QUEUE) { SAVE_QUEUE = false; save(); }
    })
    .catch(function (e) {
      console.warn('Save error:', e);
      DB_SAVING = false;
      showToast('Save failed – check your connection.', 'error');
    });
}

// ── Helpers: fan-out an in-memory array to a top-level collection ────────────
// Each item MUST have a string/number `id` field.
// Uses individual set() calls rather than a batch so we don't hit the
// 500-write batch limit on large datasets.
// Also deletes any Firestore docs whose IDs are no longer in `items`, so that
// deletions from S.kaizen (etc.) actually propagate and don't snap back.
function _saveCollection(collectionName, items) {
  var coll = db.collection(collectionName);
  var keepIds = {};
  items.forEach(function (item) { keepIds[String(item.id)] = true; });

  var writes = items.map(function (item) {
    var docId = String(item.id);
    return coll.doc(docId).set(
      Object.assign({}, item, { _updatedAt: firebase.firestore.FieldValue.serverTimestamp() }),
      { merge: true }
    );
  });

  // Delete docs that exist in Firestore but are no longer in the in-memory array
  var deleteOp = coll.get().then(function (snap) {
    var deletes = [];
    snap.forEach(function (d) {
      if (!keepIds[d.id]) {
        deletes.push(coll.doc(d.id).delete());
      }
    });
    return Promise.all(deletes);
  });

  return Promise.all(writes.concat([deleteOp]));
}

// ── Overrides live inside event docs as a sub-field ─────────────────────────
// S.overrides = { "templateId_date": { ...fields } }
// We store each override inside its parent event doc as  overrides[instanceKey]
// to avoid a separate collection.  This is safe because overrides are small.
function _saveOverrides() {
  var overrides = S.overrides || {};
  // Group by templateId (first segment before "_")
  var byTemplate = {};
  Object.keys(overrides).forEach(function (key) {
    var parts = key.split('_');
    var tmplId = parts[0];
    if (!byTemplate[tmplId]) byTemplate[tmplId] = {};
    byTemplate[tmplId][key] = overrides[key];
  });
  var writes = Object.keys(byTemplate).map(function (tmplId) {
    return db.collection('events').doc(tmplId).set(
      { overrides: byTemplate[tmplId] },
      { merge: true }
    );
  });
  return Promise.all(writes);
}

// ── Avail: one doc per eventId ───────────────────────────────────────────────
// S.avail = { "eventId_date": { uid: {status, note, ts}, … } }
function _saveAvail() {
  var avail = S.avail || {};
  // Bucket by event instance key
  var writes = Object.keys(avail).map(function (instanceKey) {
    var safeKey = instanceKey.replace(/\//g, '_');
    return db.collection('avail').doc(safeKey).set(
      { responses: avail[instanceKey] || {}, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  });
  return Promise.all(writes);
}

// ── Notifs: one doc per uid ──────────────────────────────────────────────────
function _saveNotifs() {
  var notifs = S.notifs || {};
  var writes = Object.keys(notifs).map(function (uid) {
    return db.collection('notifs').doc(uid).set(
      { items: notifs[uid] || [], updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  });
  return Promise.all(writes);
}

// ── saveUsers ────────────────────────────────────────────────────────────────
// Each user gets their own doc in the `users` collection.
function saveUsers() {
  var writes = USERS.map(function (u) {
    var docId = String(u.uid || u.id);
    return db.collection('users').doc(docId).set({
      id:        String(u.uid || u.id),
      uid:       u.uid || null,
      name:      u.name,
      email:     u.email,
      roles:     u.roles,
      rec:       u.rec || u.email,
      lastLogin: u.lastLogin || null
    }, { merge: true });
  });
  return Promise.all(writes);
}

// ── saveRoom ─────────────────────────────────────────────────────────────────
// Saves only room metadata (name, members, call flag, reviewers).
// Messages are written individually via sendMessage().
function saveRoom(room) {
  return db.collection('rooms').doc(String(room.id)).set({
    id:        room.id,
    name:      room.name,
    members:   room.members || [],
    call:      room.call    || false,
    reviewers: room.reviewers || [],
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

// ── sendMessage ──────────────────────────────────────────────────────────────
// Appends one message to a room's subcollection.
// Returns a Promise.
function sendMessage(roomId, msg) {
  var msgId = String(msg.ts) + '_' + String(msg.uid);
  return db.collection('rooms').doc(String(roomId))
    .collection('messages').doc(msgId).set({
      uid:        msg.uid,
      text:       msg.text   || '',
      attachment: msg.attachment || null,
      ts:         msg.ts,
      readBy:     msg.readBy || {}
    });
}

// ── loadMessages ─────────────────────────────────────────────────────────────
// Loads the last PAGE_SIZE messages for a room.  Returns a Promise<Array>.
var MSG_PAGE_SIZE = 50;
function loadMessages(roomId, beforeTs) {
  var q = db.collection('rooms').doc(String(roomId))
    .collection('messages')
    .orderBy('ts', 'desc')
    .limit(MSG_PAGE_SIZE);
  if (beforeTs) q = q.where('ts', '<', beforeTs);
  return q.get().then(function (snap) {
    return snap.docs.map(function (d) { return d.data(); }).reverse();
  });
}

// ── subscribeMessages ─────────────────────────────────────────────────────────
// Real-time listener for the last 50 messages in a room.
// onUpdate(messages[]) is called with the full current window.
// Returns an unsubscribe function.
function subscribeMessages(roomId, onUpdate) {
  return db.collection('rooms').doc(String(roomId))
    .collection('messages')
    .orderBy('ts', 'desc')
    .limit(MSG_PAGE_SIZE)
    .onSnapshot(function (snap) {
      var msgs = snap.docs.map(function (d) { return d.data(); }).reverse();
      onUpdate(msgs);
    }, function (e) {
      console.warn('Message listener error:', e);
    });
}

// ── appendAuditEntry ─────────────────────────────────────────────────────────
// Writes a single audit entry as its own Firestore doc (append-only).
// This keeps auditLog out of the main payload while preserving searchability.
function appendAuditEntry(entry) {
  return db.collection('auditLog').add(
    Object.assign({}, entry, { _ts: firebase.firestore.FieldValue.serverTimestamp() })
  );
}

// ── loadState ────────────────────────────────────────────────────────────────
// Loads all collections into S.* and USERS.
// callback() is called when done (or on error).
function loadState(callback) {
  var promises = [
    // config
    db.collection('config').doc('main').get(),
    db.collection('config').doc('inputLists').get(),
    // flat singletons
    db.collection('merch').doc('inventory').get(),
    db.collection('inventory').doc('production').get(),
    db.collection('inventory').doc('reorder').get(),
    db.collection('music').doc('db').get(),
    // all users
    db.collection('users').get(),
    // array-backed collections
    db.collection('events').get(),
    db.collection('tasks').get(),
    db.collection('groups').get(),
    db.collection('reports').get(),
    db.collection('announcements').get(),
    db.collection('setlists').get(),
    db.collection('taskTemplates').get(),
    db.collection('issues').get(),
    db.collection('kaizen').get(),
    db.collection('planningBoards').get(),
    db.collection('meetingRequests').get(),
    db.collection('avail').get(),
    db.collection('notifs').get(),
    // rooms metadata (no messages yet – loaded per-room)
    db.collection('rooms').get()
  ];

  Promise.all(promises).then(function (results) {
    var i = 0;
    var configDoc       = results[i++];
    var inputListsDoc   = results[i++];
    var merchDoc        = results[i++];
    var prodDoc         = results[i++];
    var reorderDoc      = results[i++];
    var musicDoc        = results[i++];
    var usersSnap       = results[i++];
    var eventsSnap      = results[i++];
    var tasksSnap       = results[i++];
    var groupsSnap      = results[i++];
    var reportsSnap     = results[i++];
    var announcementsSnap = results[i++];
    var setlistsSnap    = results[i++];
    var taskTplSnap     = results[i++];
    var issuesSnap      = results[i++];
    var kaizenSnap      = results[i++];
    var boardsSnap      = results[i++];
    var meetingReqSnap  = results[i++];
    var availSnap       = results[i++];
    var notifsSnap      = results[i++];
    var roomsSnap       = results[i++];

    // config/main
    if (configDoc.exists) {
      var c = configDoc.data();
      if (c.COMMON_TEAMS)  COMMON_TEAMS       = c.COMMON_TEAMS;
      if (c.calY)          S.calY             = c.calY;
      if (c.calM)          S.calM             = c.calM;
      if (c.connectConfig) S.connectConfig    = c.connectConfig;
      if (c.publicPages)   S.publicPages      = c.publicPages;
      if (c.postsConfig)   S.postsConfig      = c.postsConfig;
      if (c.lastSeenPosts) S.lastSeenPosts    = c.lastSeenPosts;
      ['nEv','nTask','nGroup','nRoom','nReport','nNotif'].forEach(function (k) {
        if (c[k] !== undefined) S[k] = c[k];
      });
    }

    // config/inputLists
    if (inputListsDoc.exists && inputListsDoc.data().lists) {
      S.inputLists = inputListsDoc.data().lists;
    }

    // merch
    if (merchDoc.exists) {
      var m = merchDoc.data();
      S.merch = {
        items:        m.items        || [],
        transactions: m.transactions || [],
        nItem:        m.nItem        || 1,
        nTx:          m.nTx          || 1
      };
    }

    // inventory
    if (prodDoc.exists)    S.productionItems = prodDoc.data().items    || [];
    if (reorderDoc.exists) S.reorderItems    = reorderDoc.data().items || [];

    // music
    if (musicDoc.exists) S.musicDb = musicDoc.data().items || [];

    // users collection
    USERS = [];
    usersSnap.forEach(function (d) { USERS.push(d.data()); });

    // array-backed collections
    S.templates       = _docsToArray(eventsSnap);
    S.tasks           = _docsToArray(tasksSnap);
    S.groups          = _docsToArray(groupsSnap);
    S.reports         = _docsToArray(reportsSnap);
    S.announcements   = _docsToArray(announcementsSnap);
    S.setlists        = _docsToArray(setlistsSnap);
    S.taskTemplates   = _docsToArray(taskTplSnap);
    S.issues          = _docsToArray(issuesSnap);
    S.kaizen          = _docsToArray(kaizenSnap);
    S.planningBoards  = _docsToArray(boardsSnap);
    S.meetingRequests = _docsToArray(meetingReqSnap);

    // Reconstruct S.overrides from event docs that have an `overrides` field
    S.overrides = {};
    eventsSnap.forEach(function (d) {
      var data = d.data();
      if (data.overrides) {
        Object.assign(S.overrides, data.overrides);
      }
    });

    // avail: re-key to { instanceKey: { uid: response } }
    S.avail = {};
    availSnap.forEach(function (d) {
      S.avail[d.id] = d.data().responses || {};
    });

    // notifs: re-key to { uid: [notif, …] }
    S.notifs = {};
    notifsSnap.forEach(function (d) {
      S.notifs[d.id] = d.data().items || [];
    });

    // rooms metadata (msgs array starts empty; loaded on demand)
    S.rooms = [];
    roomsSnap.forEach(function (d) {
      var r = d.data();
      r.msgs = r.msgs || []; // keep in-memory msgs array for compatibility
      S.rooms.push(r);
    });

    if (callback) callback();
  }).catch(function (e) {
    console.warn('loadState error:', e);
    if (callback) callback();
  });
}

// ── Utility: QuerySnapshot → plain array ─────────────────────────────────────
function _docsToArray(snap) {
  var arr = [];
  snap.forEach(function (d) { arr.push(d.data()); });
  return arr;
}

// ── Real-time listeners ──────────────────────────────────────────────────────
// We listen to the collections that change most often.
// One listener per collection; they all converge on S.* + render().
var _unsubscribers = [];

function startRealtimeListener() {
  _unsubscribers.forEach(function (u) { u(); });
  _unsubscribers = [];

  function onCollectionChange(collKey, snap) {
    if (!S.user) return;
    var fresh = [];
    snap.forEach(function (d) { fresh.push(d.data()); });
    var oldStr = JSON.stringify(S[collKey]);
    var newStr = JSON.stringify(fresh);
    if (oldStr !== newStr) {
      S[collKey] = fresh;
      if (!SUPPRESS_RENDER) render();
    }
  }

  var collections = [
    'events',
    'tasks',
    'groups',
    'reports',
    'announcements',
    'setlists',
    'taskTemplates',
    'issues',
    'kaizen',
    'planningBoards',
    'meetingRequests'
  ];

  var collToKey = {
    events:         'templates',
    tasks:          'tasks',
    groups:         'groups',
    reports:        'reports',
    announcements:  'announcements',
    setlists:       'setlists',
    taskTemplates:  'taskTemplates',
    issues:         'issues',
    kaizen:         'kaizen',
    planningBoards: 'planningBoards',
    meetingRequests:'meetingRequests'
  };

  collections.forEach(function (coll) {
    var key = collToKey[coll];
    var unsub = db.collection(coll).onSnapshot(function (snap) {
      if (!S.user) return;
      var fresh = [];
      snap.forEach(function (d) { fresh.push(d.data()); });

      // Rebuild overrides separately when events change
      if (coll === 'events') {
        var newOverrides = {};
        snap.forEach(function (d) {
          var data = d.data();
          if (data.overrides) Object.assign(newOverrides, data.overrides);
        });
        var oldOvStr = JSON.stringify(S.overrides);
        var newOvStr = JSON.stringify(newOverrides);
        if (oldOvStr !== newOvStr) S.overrides = newOverrides;
      }

      var oldStr = JSON.stringify(S[key]);
      var newStr = JSON.stringify(fresh);
      if (oldStr !== newStr) {
        S[key] = fresh;
        // Clean invalid group members on every update
        if (coll === 'groups') {
          var dirty = false;
          (S.groups || []).forEach(function (g) {
            var before = (g.members || []).length;
            g.members = (g.members || []).filter(function (x) {
              if (x == null || x === '' || String(x) === 'null' || String(x) === 'undefined') return false;
              return UN(x) !== '?';
            });
            if (g.members.length !== before) dirty = true;
          });
          if (dirty) save();
        }
        if (!SUPPRESS_RENDER) render();
      }
    }, function (e) { console.warn('Listener error (' + coll + '):', e); });
    _unsubscribers.push(unsub);
  });

  // config/main
  var unsubConfig = db.collection('config').doc('main').onSnapshot(function (doc) {
    if (!doc.exists || !S.user) return;
    var c = doc.data();
    var changed = false;
    if (c.COMMON_TEAMS && JSON.stringify(COMMON_TEAMS) !== JSON.stringify(c.COMMON_TEAMS)) {
      COMMON_TEAMS = c.COMMON_TEAMS; changed = true;
    }
    ['connectConfig','publicPages','postsConfig','lastSeenPosts',
     'nEv','nTask','nGroup','nRoom','nReport','nNotif','calY','calM'].forEach(function (k) {
      if (c[k] !== undefined && JSON.stringify(S[k]) !== JSON.stringify(c[k])) {
        S[k] = c[k]; changed = true;
      }
    });
    if (changed && !SUPPRESS_RENDER) render();
  }, function (e) { console.warn('Config listener error:', e); });
  _unsubscribers.push(unsubConfig);

  // users collection
  var unsubUsers = db.collection('users').onSnapshot(function (snap) {
    var fresh = [];
    snap.forEach(function (d) { fresh.push(d.data()); });
    if (JSON.stringify(USERS) !== JSON.stringify(fresh)) {
      USERS = fresh;
      if (S.user) render();
    }
  }, function (e) { console.warn('Users listener error:', e); });
  _unsubscribers.push(unsubUsers);

  // notifs (current user only)
  if (S.user) {
    var uid = String(S.user.uid || S.user.id);
    var unsubNotif = db.collection('notifs').doc(uid).onSnapshot(function (doc) {
      if (!doc.exists) return;
      var items = doc.data().items || [];
      var key = String(S.user.id);
      if (JSON.stringify(S.notifs[key]) !== JSON.stringify(items)) {
        S.notifs[key] = items;
        if (!SUPPRESS_RENDER) render();
      }
    }, function (e) { console.warn('Notifs listener error:', e); });
    _unsubscribers.push(unsubNotif);
  }

  // avail
  var unsubAvail = db.collection('avail').onSnapshot(function (snap) {
    if (!S.user) return;
    var fresh = {};
    snap.forEach(function (d) { fresh[d.id] = d.data().responses || {}; });
    if (JSON.stringify(S.avail) !== JSON.stringify(fresh)) {
      S.avail = fresh;
      if (!SUPPRESS_RENDER) render();
    }
  }, function (e) { console.warn('Avail listener error:', e); });
  _unsubscribers.push(unsubAvail);

  // rooms metadata
  var unsubRooms = db.collection('rooms').onSnapshot(function (snap) {
    if (!S.user) return;
    snap.docChanges().forEach(function (change) {
      var data = change.doc.data();
      if (change.type === 'removed') {
        S.rooms = S.rooms.filter(function (r) { return String(r.id) !== change.doc.id; });
      } else {
        var idx = S.rooms.findIndex(function (r) { return String(r.id) === change.doc.id; });
        // Preserve the in-memory msgs array when metadata refreshes
        var existingMsgs = (idx >= 0 ? S.rooms[idx].msgs : null) || [];
        data.msgs = data.msgs || existingMsgs;
        if (idx >= 0) S.rooms[idx] = data;
        else S.rooms.push(data);
      }
    });
    if (!SUPPRESS_RENDER) render();
  }, function (e) { console.warn('Rooms listener error:', e); });
  _unsubscribers.push(unsubRooms);
}

function stopRealtimeListeners() {
  _unsubscribers.forEach(function (u) { u(); });
  _unsubscribers = [];
}

// ── Room message subscription management ─────────────────────────────────────
// One active message subscription at a time (the open room).
var _activeMsgUnsub = null;

function subscribeToRoom(roomId, onMessages) {
  if (_activeMsgUnsub) { _activeMsgUnsub(); _activeMsgUnsub = null; }
  _activeMsgUnsub = subscribeMessages(roomId, onMessages);
}

function unsubscribeFromRoom() {
  if (_activeMsgUnsub) { _activeMsgUnsub(); _activeMsgUnsub = null; }
}

// ── Onboarding preference (per-user doc in its own collection) ───────────────
function saveOnboardingDismissed(uid) {
  return db.collection('onboarding').doc(String(uid))
    .set({ dismissed: true, ts: Date.now() });
}

function loadOnboardingDismissed(uid) {
  return db.collection('onboarding').doc(String(uid)).get()
    .then(function (doc) { return doc.exists && !!doc.data().dismissed; })
    .catch(function () { return false; });
}

// ── Audit log (append-only) ──────────────────────────────────────────────────
// The legacy S.auditLog array is still kept in memory for the admin UI;
// each new entry is also written to Firestore for durability.
function writeAuditEntry(entry) {
  appendAuditEntry(entry).catch(function (e) {
    console.warn('Audit write failed:', e);
  });
}
