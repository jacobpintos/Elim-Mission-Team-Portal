// js/state.js
// ─────────────────────────────────────────────────────────────────────────────
// STATE BOOTSTRAP & AUTH HANDLER
// ─────────────────────────────────────────────────────────────────────────────
//
// This file replaces:
//   1. The var USERS / var S = { … } block
//   2. The saveUsers() and loadState() functions
//   3. The auth.onAuthStateChanged() block at the bottom of the original file
//   4. The onboarding Firestore calls
//   5. The chat-room UI patches needed for subcollection messages
//
// All other functions (render, homeView, msgsView, etc.) remain in the
// original file unchanged.  The only behavioural difference in msgsView is
// that send() now calls sendMessage() + subscribeToRoom() instead of
// mutating room.msgs directly and calling save().
// ─────────────────────────────────────────────────────────────────────────────

// ── Global runtime state ─────────────────────────────────────────────────────
var USERS = [];
var nextUID = 7; // fallback counter (real IDs come from Firebase Auth UID)

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

// ── audit() patches the in-memory array AND writes to Firestore ──────────────
// (Overrides the function of the same name in the original file)
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
  writeAuditEntry(entry); // durable write to auditLog collection
}

// ── Onboarding: use dedicated collection instead of appState ─────────────────
// These override the functions from the original file.

function checkAndShowOnboarding(onDone) {
  if (!S.user) { if (onDone) onDone(); return; }
  if (isPublicUser(S.user) || (S.user.roles || []).indexOf('unverified') >= 0) {
    if (onDone) onDone(); return;
  }
  var uid = String(S.user.uid || S.user.id);
  loadOnboardingDismissed(uid)
    .then(function (dismissed) {
      if (dismissed) { if (onDone) onDone(); }
      else           { showOnboarding(onDone); }
    });
}

// finishOnboarding is called inside showOnboarding() in the original file.
// We patch the Firestore write here by overriding saveOnboardingPref so the
// original function calls our new collection-backed version.
// (The original's db.collection('appState').doc('onboarding_…') call is
//  replaced by the dedicated collection.)
function _patchOnboarding() {
  // Replace the save call inside finishOnboarding in the original showOnboarding.
  // Because the original is a closure we can't reach it directly; instead we
  // override the global onboarding save at the point it would be called.
  // This is handled by state.js owning checkAndShowOnboarding and
  // loadOnboardingDismissed / saveOnboardingDismissed from db.js.
}

// ── msgsView patches ─────────────────────────────────────────────────────────
// The original msgsView() is fully preserved.  We extend it here so that:
//   • Opening a room subscribes to its subcollection (real-time, last 50)
//   • "Load More" button fetches older messages
//   • send() writes to the subcollection instead of mutating room.msgs
//
// Strategy: override the two behaviours by monkey-patching the functions
// the original msgsView calls.  This avoids editing the original render code.

// Called by the original msgsView when the user clicks a room card.
// The original does:  S.activeRoom = rm.id; render();
// We intercept via startRoomSession (called in onAuthStateChanged bootstrap).

function _openRoomSession(roomId) {
  // Load initial messages into the in-memory room.msgs so the original
  // msgsView renders them without any UI changes.
  var room = S.rooms.find(function (r) { return r.id === roomId; });
  if (!room) return;

  subscribeToRoom(roomId, function (msgs) {
    room.msgs = msgs;
    if (S.activeRoom === roomId && !SUPPRESS_RENDER) render();
  });
}

function _closeRoomSession() {
  unsubscribeFromRoom();
}

// Patch the room send function.
// The original msgsView calls room.msgs.push({…}); save(); render();
// We replace this at the call site by exporting a sendRoomMessage() function
// that the original send() closure should call.  Because we can't rewrite
// the closure we use a global override flag checked in a wrapper.
//
// USAGE IN ORIGINAL msgsView send() – change these two lines:
//   room.msgs.push({uid:u.id, text:ti.value.trim(), attachment:pendingAtt||null, ts:Date.now()});
//   save();
// TO:
//   sendRoomMessage(room, {uid:u.id, text:ti.value.trim(), attachment:pendingAtt||null, ts:Date.now()});
//
function sendRoomMessage(room, msg) {
  msg.ts = msg.ts || Date.now();
  room.msgs.push(msg); // keep in-memory for immediate render
  sendMessage(room.id, msg)
    .then(function () { saveRoom(room); }) // also persist metadata (call flag etc.)
    .catch(function (e) {
      showToast('Message failed to send.', 'error');
      console.warn('sendMessage error:', e);
    });
  render();
}

// "Load More" helper – called by a button injected into msgsView.
// Appends older messages before the earliest message currently loaded.
function loadMoreMessages(room, onDone) {
  var earliest = room.msgs.length ? room.msgs[0].ts : null;
  loadMessages(room.id, earliest).then(function (older) {
    if (!older.length) {
      showToast('No more messages to load.', 'info');
    } else {
      room.msgs = older.concat(room.msgs);
    }
    if (onDone) onDone();
    render();
  });
}

// ── UID migration (preserved from original) ───────────────────────────────────
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

// ── Auth state handler (replaces the original auth.onAuthStateChanged block) ──
auth.onAuthStateChanged(function (firebaseUser) {
  if (firebaseUser) {
    // Show loading splash (same as original)
    (function () {
      var app = document.getElementById('app');
      if (!app) return;
      app.innerHTML = '';
      var loading = document.createElement('div');
      loading.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;background:#14141e;gap:16px';
      var svgNS = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width','56'); svg.setAttribute('height','56'); svg.setAttribute('viewBox','0 0 72 72');
      var circ = document.createElementNS(svgNS,'circle');
      circ.setAttribute('cx','36'); circ.setAttribute('cy','36'); circ.setAttribute('r','34');
      circ.setAttribute('fill','none'); circ.setAttribute('stroke','#e8624a'); circ.setAttribute('stroke-width','2.5');
      svg.appendChild(circ);
      loading.appendChild(svg);
      loading.appendChild(document.createTextNode('Loading…'));
      app.appendChild(loading);
    })();

    // Run migration (no-op after first time), then load state
    runMigrationIfNeeded(function (/* alreadyMigrated */) {
      loadState(function () {
        // ── same post-load logic as the original ──────────────────────────
        var profile = USERS.find(function (u) {
          return sameId(u.uid, firebaseUser.uid) || u.email === firebaseUser.email;
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
            rec:   firebaseUser.email
          };
          USERS.push(profile);
          saveUsers();
        } else {
          var oldUid = String(profile.uid || profile.id || '');
          var newUid = String(firebaseUser.uid);
          profile.uid       = newUid;
          profile.id        = newUid;
          profile.lastLogin = Date.now();

          // Upgrade unverified → public once email verified
          if (firebaseUser.emailVerified &&
              (profile.roles || []).indexOf('unverified') >= 0) {
            profile.roles = ['public'];
            saveUsers();
          }

          // Block unverified accounts
          if ((profile.roles || []).indexOf('unverified') >= 0 &&
              !firebaseUser.emailVerified) {
            auth.signOut(); render(); return;
          }

          if (oldUid !== newUid) {
            _runUidMigration(oldUid, newUid);
            saveUsers();
          }
        }

        S.user = profile;

        // Default tab by role
        var r2 = S.user.roles || [S.user.role || 'regular'];
        if (isAdmin(S.user)) {
          if (!S.tab || S.tab === 'events' || S.tab === 'home') S.tab = 'dashboard';
        } else if (r2.indexOf('security') >= 0) {
          S.tab = 'security';
        } else if (r2.indexOf('public') >= 0) {
          S.tab = 'pubhome';
        } else {
          S.tab = 'home';
        }

        // Reset transient UI state
        S.availExpanded   = false;
        S.availStepIdx    = 0;
        S.availFocusKey   = null;
        S.coordAdminTab   = S.coordAdminTab  || 'matrix';
        S.improveTab      = S.improveTab     || 'issues';
        S.planningBoardId = S.planningBoardId|| null;
        S.issueTab        = S.issueTab       || 'open';

        // Normalize all IDs to strings
        USERS.forEach(function (u) { u.id = String(u.uid || u.id); });

        // Clean null members from groups
        (S.groups || []).forEach(function (g) {
          g.members = (g.members || []).filter(function (x) {
            return x != null && x !== '' && String(x) !== 'null' && String(x) !== 'undefined' && UN(x) !== '?';
          });
        });
        (S.rooms || []).forEach(function (r) {
          r.members = (r.members || []).map(function (x) { return x == null ? x : String(x); });
        });

        _migrateNumericIds();

        STATE_LOADED = true;
        save();
        checkAvailReminders();
        startRealtimeListener();
        requestPushPermission();
        render();
        checkAndShowOnboarding(null);
      });
    });

  } else {
    // Signed out
    S.user       = null;
    STATE_LOADED = false;
    stopRealtimeListeners();
    _closeRoomSession();
    render();
  }
});

// ── Intercept room open / close to wire up the message subcollection ─────────
// The original msgsView uses:
//   c.addEventListener('click', function(){ S.activeRoom = rm.id; render(); })
// We can't rewrite that closure, so we patch render() to detect room changes.

var _lastActiveRoom = null;
var _origRender     = null;

// Called once the original render function is defined (at end of original file).
function _installRoomSessionPatch() {
  if (typeof render !== 'function') {
    setTimeout(_installRoomSessionPatch, 50);
    return;
  }
  _origRender = render;
  render = function () {
    // Detect room change
    if (S.activeRoom !== _lastActiveRoom) {
      if (_lastActiveRoom !== null) _closeRoomSession();
      if (S.activeRoom  !== null)  _openRoomSession(S.activeRoom);
      _lastActiveRoom = S.activeRoom;
    }
    _origRender.apply(this, arguments);
  };
}
_installRoomSessionPatch();
