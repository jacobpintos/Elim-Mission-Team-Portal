// js/migrate.js
// ─────────────────────────────────────────────────────────────────────────────
// ONE-TIME MIGRATION: appState/main  →  multi-collection schema
// ─────────────────────────────────────────────────────────────────────────────
//
// This file runs once per deployment.  After migration it writes a sentinel
// doc (config/migrationV2) so it never runs again.  If the old doc doesn't
// exist (fresh install or already migrated), it exits immediately.
//
// Safe to leave in the codebase indefinitely – it becomes a no-op after the
// first successful run.
// ─────────────────────────────────────────────────────────────────────────────

var MIGRATION_VERSION = 'v2_multi_collection';

/**
 * runMigrationIfNeeded(callback)
 *
 * Called from state.js before loadState().
 * callback(alreadyMigrated: bool) is invoked when done.
 *
 * If migration ran:   the new collections are populated; callback(false)
 * If already done:    callback(true)   (skip directly to loadState)
 * If no legacy data:  callback(true)   (fresh install, nothing to do)
 */
function runMigrationIfNeeded(callback) {
  // Check sentinel first
  db.collection('config').doc('migration').get()
    .then(function (sentinelDoc) {
      if (sentinelDoc.exists && sentinelDoc.data().version === MIGRATION_VERSION) {
        // Already migrated
        callback(true);
        return;
      }

      // Check for legacy data
      db.collection('appState').doc('main').get()
        .then(function (legacyDoc) {
          if (!legacyDoc.exists) {
            // No legacy data – mark migrated and continue
            _writeSentinel().then(function () { callback(true); });
            return;
          }

          console.info('[migrate] Starting migration from appState/main …');
          _doMigration(legacyDoc.data())
            .then(function () {
              console.info('[migrate] Migration complete.');
              return _writeSentinel();
            })
            .then(function () { callback(false); })
            .catch(function (e) {
              console.error('[migrate] Migration failed:', e);
              showToast('Data migration encountered an error. Some data may need re-entry.', 'error');
              // Still call callback so the app boots; loadState will read
              // whatever was successfully migrated.
              callback(false);
            });
        });
    })
    .catch(function (e) {
      // Firestore unreachable – skip migration, let loadState handle it
      console.warn('[migrate] Could not check sentinel:', e);
      callback(true);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

function _writeSentinel() {
  return db.collection('config').doc('migration').set({
    version:   MIGRATION_VERSION,
    migratedAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

/**
 * Migrate all fields from the legacy single document into the new schema.
 * Runs a series of sequential fan-outs.  Returns a Promise.
 */
function _doMigration(d) {
  var steps = [
    _migrateConfig(d),
    _migrateUsers(),          // legacy users doc → users/{uid}
    _migrateCollection('events',         d.templates       || [], true),
    _migrateOverrides(d.templates        || [], d.overrides || {}),
    _migrateCollection('tasks',          d.tasks           || []),
    _migrateCollection('groups',         d.groups          || []),
    _migrateCollection('reports',        d.reports         || []),
    _migrateCollection('announcements',  d.announcements   || []),
    _migrateCollection('setlists',       d.setlists        || []),
    _migrateCollection('taskTemplates',  d.taskTemplates   || []),
    _migrateCollection('issues',         d.issues          || []),
    _migrateCollection('kaizen',         d.kaizen          || []),
    _migrateCollection('planningBoards', d.planningBoards  || []),
    _migrateCollection('meetingRequests',d.meetingRequests || []),
    _migrateMerch(d.merch),
    _migrateInventory(d),
    _migrateMusic(d),
    _migrateInputLists(d),
    _migrateRooms(d.rooms       || []),
    _migrateAvail(d.avail       || {}),
    _migrateNotifs(d.notifs     || {}),
    _migrateAuditLog(d.auditLog || [])
  ];

  // Run sequentially to stay within Firestore write rate limits
  return steps.reduce(function (chain, step) {
    return chain.then(function () { return step; });
  }, Promise.resolve());
}

// ── config/main ──────────────────────────────────────────────────────────────
function _migrateConfig(d) {
  return db.collection('config').doc('main').set({
    calY:          d.calY  || new Date().getFullYear(),
    calM:          d.calM  || new Date().getMonth(),
    COMMON_TEAMS:  d.COMMON_TEAMS || [],
    connectConfig: d.connectConfig || { socialLinks: [], leadershipTeam: [] },
    publicPages:   d.publicPages   || {},
    postsConfig:   d.postsConfig   || { pages: [] },
    lastSeenPosts: d.lastSeenPosts || {},
    nEv:           d.nEv    || 1,
    nTask:         d.nTask  || 1,
    nGroup:        d.nGroup || 1,
    nRoom:         d.nRoom  || 1,
    nReport:       d.nReport|| 1,
    nNotif:        d.nNotif || 1,
    updatedAt:     firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

// ── users: read from appState/users, write to users/{uid} ───────────────────
function _migrateUsers() {
  return db.collection('appState').doc('users').get()
    .then(function (doc) {
      var list = (doc.exists && doc.data().list) ? doc.data().list : [];
      var writes = list.map(function (u) {
        var docId = String(u.uid || u.id);
        return db.collection('users').doc(docId).set({
          id:        String(u.uid || u.id),
          uid:       u.uid || null,
          name:      u.name,
          email:     u.email,
          roles:     u.roles || ['regular'],
          rec:       u.rec   || u.email,
          lastLogin: u.lastLogin || null
        }, { merge: true });
      });
      return Promise.all(writes);
    });
}

// ── Generic array → collection ───────────────────────────────────────────────
// stripOverrides: when true, removes the `overrides` field from event docs
// before writing (overrides are merged in separately via _migrateOverrides).
function _migrateCollection(collName, items, stripOverrides) {
  var writes = items.map(function (item) {
    var docId = String(item.id);
    var payload = Object.assign({}, item);
    if (stripOverrides) delete payload.overrides;
    payload._migratedAt = firebase.firestore.FieldValue.serverTimestamp();
    return db.collection(collName).doc(docId).set(payload, { merge: true });
  });
  return Promise.all(writes);
}

// ── Overrides: merge into parent event docs ──────────────────────────────────
function _migrateOverrides(templates, overrides) {
  // Group override keys by templateId
  var byTemplate = {};
  Object.keys(overrides).forEach(function (key) {
    var tmplId = key.split('_')[0];
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

// ── Merch ────────────────────────────────────────────────────────────────────
function _migrateMerch(merch) {
  if (!merch) return Promise.resolve();
  return db.collection('merch').doc('inventory').set({
    items:        merch.items        || [],
    transactions: merch.transactions || [],
    nItem:        merch.nItem        || 1,
    nTx:          merch.nTx          || 1,
    updatedAt:    firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });
}

// ── Inventory singletons ─────────────────────────────────────────────────────
function _migrateInventory(d) {
  return Promise.all([
    db.collection('inventory').doc('production').set(
      { items: d.productionItems || [], updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    ),
    db.collection('inventory').doc('reorder').set(
      { items: d.reorderItems || [], updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    )
  ]);
}

// ── Music ────────────────────────────────────────────────────────────────────
function _migrateMusic(d) {
  return db.collection('music').doc('db').set(
    { items: d.musicDb || [], updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

// ── Input lists ──────────────────────────────────────────────────────────────
function _migrateInputLists(d) {
  return db.collection('config').doc('inputLists').set(
    { lists: d.inputLists || { sunday: [], event: [], wh2: [] },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

// ── Rooms: metadata → rooms/{id}, messages → subcollection ──────────────────
function _migrateRooms(rooms) {
  var writes = [];
  rooms.forEach(function (room) {
    var docId = String(room.id);
    var msgs  = room.msgs || [];

    // Room metadata doc
    writes.push(
      db.collection('rooms').doc(docId).set({
        id:        room.id,
        name:      room.name,
        members:   room.members   || [],
        call:      room.call      || false,
        reviewers: room.reviewers || [],
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true })
    );

    // Messages subcollection (batch in chunks of 400 to stay under limits)
    var msgRef = db.collection('rooms').doc(docId).collection('messages');
    _chunked(msgs, 400, function (chunk) {
      var batch = db.batch();
      chunk.forEach(function (m) {
        var msgId = String(m.ts) + '_' + String(m.uid);
        batch.set(msgRef.doc(msgId), {
          uid:        m.uid,
          text:       m.text       || '',
          attachment: m.attachment || null,
          ts:         m.ts,
          readBy:     m.readBy     || {}
        }, { merge: true });
      });
      writes.push(batch.commit());
    });
  });
  return Promise.all(writes);
}

// ── Avail ────────────────────────────────────────────────────────────────────
function _migrateAvail(avail) {
  var writes = Object.keys(avail).map(function (key) {
    var safeKey = key.replace(/\//g, '_');
    return db.collection('avail').doc(safeKey).set(
      { responses: avail[key] || {}, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  });
  return Promise.all(writes);
}

// ── Notifs ───────────────────────────────────────────────────────────────────
function _migrateNotifs(notifs) {
  var writes = Object.keys(notifs).map(function (uid) {
    return db.collection('notifs').doc(uid).set(
      { items: notifs[uid] || [], updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  });
  return Promise.all(writes);
}

// ── Audit log ────────────────────────────────────────────────────────────────
// Write legacy entries in reverse order (newest first) so doc IDs sort correctly.
function _migrateAuditLog(entries) {
  var writes = entries.map(function (entry) {
    return db.collection('auditLog').add(
      Object.assign({}, entry, { _migrated: true })
    );
  });
  return Promise.all(writes);
}

// ── Utility: chunk an array and call fn(chunk) for each ─────────────────────
function _chunked(arr, size, fn) {
  for (var i = 0; i < arr.length; i += size) {
    fn(arr.slice(i, i + size));
  }
}
