// js/state.js
// ─────────────────────────────────────────────────────────────────────────────
// STATE BOOTSTRAP & AUTH HANDLER
// ─────────────────────────────────────────────────────────────────────────────

// ── Global runtime state ─────────────────────────────────────────────────────
var USERS = [];
var nextUID = 7;

var COMMON_TEAMS = [
  'Greeting Team','Worship Team','Food Team','Setup Team','Teardown Team',
  'Production Team','Security Team','Prayer Team','Student Pickup Team','Childcare Team'
];

var S = {
  user:null, tab:'events', modal:null, calY:2026, calM:3, activeRoom:null,
  adminSub:'users', merchSub:'inventory', inventorySub:'merch', productionItems:[],
  templates:[{
    id:1, title:'Sunday Service', isRec:true, recur:'weekly', recDay:0, recEnd:null,
    location:'The Midnight Gem, 2613 Ders Dr NW, Swisher IA',
    startTime:'10:00 AM', rtp:'8:30 AM', rtm:'9:00 AM', dcw:'Smart Casual', dcm:'Business Casual',
    users:[1,3,4,5,6], food:false, carpool:false, foodItems:[], carpoolLoc:'', vehicles:[],
    teams:[
      {name:'Worship Team',    leaders:[5], members:[3,5]},
      {name:'Production Team', leaders:[1], members:[1,4]}
    ]
  }],
  overrides:{},
  groups:[
    {id:1,name:'Worship Team',members:[3,5]},
    {id:2,name:'Mission Team',members:[4]},
    {id:3,name:'All',         members:[1,2,3,4,5,6]}
  ],
  tasks:[{
    id:1,assignees:[3],lead:3,by:1,title:'Update welcome slides',
    status:'pending',evId:null,evDate:null,dueDate:null,overdueNotified:false
  }],
  rooms:[
    {id:1,name:'Leadership General',members:[1,2,3,4,5,6],msgs:[],call:false},
    {id:2,name:'Worship Team',      members:[1,3,5],       msgs:[],call:false}
  ],
  reports:[{
    id:1,reporter:3,type:'Safety Concern',loc:'Parking Lot',
    desc:'Wet floor near entrance.',ts:0,ack:false
  }],
  notifs:{}, pendingDel:[],
  merch:{
    items:[
      {id:1,name:'The Well Tee',  category:'clothing',sub:'t-shirts',
       sizes:{S:10,M:15,L:12,XL:8,'2XL':4,'3XL':2},price:25},
      {id:2,name:'The Well Hat',  category:'hats',sub:null,sizes:{one:20},price:30},
      {id:3,name:'Revive Me Book',category:'books',sub:null,sizes:{one:15},price:18}
    ],
    transactions:[],
    nItem:4, nTx:1
  },
  nEv:2,nTask:2,nGroup:4,nRoom:3,nReport:2,nNotif:1,
  auditLog:[], announcements:[], reorderItems:[], musicDb:[],
  publicPages:{}, connectConfig:{socialLinks:[],leadershipTeam:[]}, meetingRequests:[],
  setlists:[], inputLists:{sunday:[],event:[],wh2:[]}, avail:{},
  taskTemplates:[], issues:[], kaizen:[], planningBoards:[]
};

// ── Safe wrappers for role helpers (guard against null user) ─────────────────
// The original hasRole/isAdmin are defined in the inline script block.
// We wrap them here so state.js can call them safely even if user is null.
function _isAdmin(u) {
  if (!u) return false;
  try { return isAdmin(u); } catch(e) { return (u.roles||[]).indexOf('admin') >= 0; }
}
function _isPublicUser(u) {
  if (!u) return false;
  try { return isPublicUser(u); } catch(e) { return (u.roles||[]).indexOf('public') >= 0; }
}

// ── audit() writes in-memory + to Firestore ──────────────────────────────────
function audit(action, detail) {
  if (!S.auditLog) S.auditLog = [];
  var entry = {
    ts:     Date.now(),
    uid:    S.user ? S.user.id   : null,
    name:   S.user ? S.user.name : 'System',
    action: action,
    detail: detail
  };
  S.auditLog.unshift(entry);
  if (S.auditLog.length > 500) S.auditLog = S.auditLog.slice(0, 500);
  if (typeof writeAuditEntry === 'function') writeAuditEntry(entry);
}

// ── checkAndShowOnboarding: uses onboarding/{uid} collection ─────────────────
function checkAndShowOnboarding(onDone) {
  if (!S.user) { if (onDone) onDone(); return; }
  if (_isPublicUser(S.user) || (S.user.roles || []).indexOf('unverified') >= 0) {
    if (onDone) onDone(); return;
  }
  var uid = String(S.user.uid || S.user.id);
  loadOnboardingDismissed(uid)
    .then(function (dismissed) {
      if (dismissed) { if (onDone) onDone(); }
      else           { if (typeof showOnboarding === 'function') showOnboarding(onDone); else if (onDone) onDone(); }
    })
    .catch(function() { if (onDone) onDone(); });
}

// ── sendRoomMessage: writes to subcollection ─────────────────────────────────
function sendRoomMessage(room, msg) {
  msg.ts = msg.ts || Date.now();
  room.msgs.push(msg);
  sendMessage(room.id, msg)
    .then(function () { saveRoom(room); })
    .catch(function (e) {
      if (typeof showToast === 'function') showToast('Message failed to send.', 'error');
      console.warn('sendMessage error:', e);
    });
  if (typeof render === 'function') render();
}

function loadMoreMessages(room, onDone) {
  var earliest = room.msgs.length ? room.msgs[0].ts : null;
  loadMessages(room.id, earliest).then(function (older) {
    if (!older.length) {
      if (typeof showToast === 'function') showToast('No more messages to load.', 'info');
    } else {
      room.msgs = older.concat(room.msgs);
    }
    if (onDone) onDone();
    if (typeof render === 'function') render();
  });
}

// ── UID migration helpers ────────────────────────────────────────────────────
function _runUidMigration(oldUid, newUid) {
  function swapUid(x) { return String(x) === oldUid ? newUid : x; }
  (S.templates || []).forEach(function (t) {
    t.users = (t.users || []).map(swapUid);
    (t.teams || []).forEach(function (tm) {
      tm.members = (tm.members || []).map(swapUid);
      tm.leaders = (tm.leaders || []).map(swapUid);
    });
  });
  (S.groups || []).forEach(function (g) {
    g.members = (g.members || []).filter(function (x) {
      return x != null && x !== '' && x !== 'null';
    }).map(swapUid);
  });
  (S.rooms || []).forEach(function (r) {
    r.members = (r.members || []).map(swapUid);
  });
}

function _migrateNumericIds() {
  function migrateId(oldId) {
    var sid = String(oldId);
    if (sid.length > 6) return sid;
    var match = USERS.find(function (u) {
      return String(u.id) === sid || String(u.uid || '') === sid;
    });
    return match ? String(match.uid || match.id) : sid;
  }
  (S.groups || []).forEach(function (g) {
    g.members = (g.members || []).map(function (x) { return x == null ? x : migrateId(x); });
  });
  (S.rooms || []).forEach(function (r) {
    r.members = (r.members || []).map(function (x) { return x == null ? x : migrateId(x); });
  });
  (S.templates || []).forEach(function (t) {
    t.users = (t.users || []).map(function (x) { return x == null ? x : migrateId(x); });
    (t.teams || []).forEach(function (tm) {
      tm.members = (tm.members || []).map(function (x) { return x == null ? x : migrateId(x); });
      tm.leaders = (tm.leaders || []).map(function (x) { return x == null ? x : migrateId(x); });
    });
  });
  (S.tasks || []).forEach(function (t) {
    if (t.assignees) t.assignees = t.assignees.map(function (x) { return x == null ? x : migrateId(x); });
    if (t.lead) t.lead = migrateId(t.lead);
    if (t.by)   t.by   = migrateId(t.by);
    if (t.to)   t.to   = migrateId(t.to);
  });
  var newNotifs = {};
  Object.keys(S.notifs || {}).forEach(function (k) {
    newNotifs[migrateId(k)] = S.notifs[k] || [];
  });
  S.notifs = newNotifs;
}

// ── Auth state handler ───────────────────────────────────────────────────────
auth.onAuthStateChanged(function (firebaseUser) {
  if (firebaseUser) {

    runMigrationIfNeeded(function () {
      loadState(function () {

        var profile = USERS.find(function (u) {
          try { return sameId(u.uid, firebaseUser.uid) || u.email === firebaseUser.email; }
          catch(e) { return u.email === firebaseUser.email; }
        });

        if (!profile) {
          profile = {
            id:    String(firebaseUser.uid),
            uid:   String(firebaseUser.uid),
            name:  firebaseUser.displayName || firebaseUser.email.split('@')[0],
            email: firebaseUser.email,
            roles: USERS.length === 0
              ? ['admin']
              : (firebaseUser.emailVerified ? ['public'] : ['unverified']),
            rec: firebaseUser.email
          };
          USERS.push(profile);
          saveUsers();
        } else {
          var oldUid = String(profile.uid || profile.id || '');
          var newUid = String(firebaseUser.uid);
          profile.uid       = newUid;
          profile.id        = newUid;
          profile.lastLogin = Date.now();

          if (firebaseUser.emailVerified &&
              (profile.roles || []).indexOf('unverified') >= 0) {
            profile.roles = ['public'];
            saveUsers();
          }

          if ((profile.roles || []).indexOf('unverified') >= 0 &&
              !firebaseUser.emailVerified) {
            auth.signOut();
            if (typeof render === 'function') render();
            return;
          }

          if (oldUid !== newUid) {
            _runUidMigration(oldUid, newUid);
            saveUsers();
          }
        }

        S.user = profile;

        // Default tab by role — use safe wrappers
        var r2 = S.user.roles || [S.user.role || 'regular'];
        if (_isAdmin(S.user)) {
          if (!S.tab || S.tab === 'events' || S.tab === 'home') S.tab = 'dashboard';
        } else if (r2.indexOf('security') >= 0) {
          S.tab = 'security';
        } else if (r2.indexOf('public') >= 0) {
          S.tab = 'pubhome';
        } else {
          S.tab = 'home';
        }

        S.availExpanded   = false;
        S.availStepIdx    = 0;
        S.availFocusKey   = null;
        S.coordAdminTab   = S.coordAdminTab   || 'matrix';
        S.improveTab      = S.improveTab      || 'issues';
        S.planningBoardId = S.planningBoardId || null;
        S.issueTab        = S.issueTab        || 'open';

        USERS.forEach(function (u) { u.id = String(u.uid || u.id); });

        (S.groups || []).forEach(function (g) {
          g.members = (g.members || []).filter(function (x) {
            if (x == null || x === '' || String(x) === 'null' || String(x) === 'undefined') return false;
            try { return (typeof UN === 'function') ? UN(x) !== '?' : true; } catch(e) { return true; }
          });
        });
        (S.rooms || []).forEach(function (r) {
          r.members = (r.members || []).map(function (x) { return x == null ? x : String(x); });
        });

        _migrateNumericIds();

        STATE_LOADED = true;
        save();
        if (typeof checkAvailReminders === 'function') checkAvailReminders();
        startRealtimeListener();
        if (typeof requestPushPermission === 'function') requestPushPermission();
        if (typeof render === 'function') render();
        checkAndShowOnboarding(null);
      });
    });

  } else {
    S.user       = null;
    STATE_LOADED = false;
    stopRealtimeListeners();
    _closeRoomSession();
    if (typeof render === 'function') render();
  }
});

// ── Room session patch — wires subcollection messages to msgsView ────────────
var _lastActiveRoom = null;

function _installRoomSessionPatch() {
  if (typeof render !== 'function') {
    setTimeout(_installRoomSessionPatch, 50);
    return;
  }
  var _origRender = render;
  render = function () {
    if (S.activeRoom !== _lastActiveRoom) {
      if (_lastActiveRoom !== null) _closeRoomSession();
      if (S.activeRoom  !== null)  _openRoomSession(S.activeRoom);
      _lastActiveRoom = S.activeRoom;
    }
    _origRender.apply(this, arguments);
  };
}
_installRoomSessionPatch();
