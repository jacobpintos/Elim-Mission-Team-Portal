/**
 * The web app reads Firestore directly: its own cache, kept in IndexedDB
 * (firebase.ts), is what lets it open with no signal. liveFirestore.ts is the
 * native app's stand-in for that cache.
 */
export { onSnapshot, getDoc, getDocs } from 'firebase/firestore'
