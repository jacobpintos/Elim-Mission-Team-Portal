// js/firebase-init.js
// Firebase project: mission-team-portal
// This file is safe to commit – the API key is a public identifier,
// not a secret.  Firestore security rules control actual data access.

var firebaseConfig = {
  apiKey:            "AIzaSyCFwC4mb68HBKVS88RVub7tWzoPmL59Wxs",
  authDomain:        "mission-team-portal.firebaseapp.com",
  projectId:         "mission-team-portal",
  storageBucket:     "mission-team-portal.firebasestorage.app",
  messagingSenderId: "222865106764",
  appId:             "1:222865106764:web:100da541b795712f1091e9"
};

firebase.initializeApp(firebaseConfig);
var auth    = firebase.auth();
var db      = firebase.firestore();
var storage = firebase.storage();
