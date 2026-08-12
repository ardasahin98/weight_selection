/* ==========================================================================
   Firebase sync layer
   --------------------------------------------------------------------------
   Loaded as a module. Handles Google sign-in, then exposes a small API on
   window.LTSync that app.js uses. app.js contains no Firebase code — if this
   file fails to load, or the page is opened from file://, the questionnaire
   still works and the download buttons still produce the same JSON and CSV.

   Why Google sign-in rather than anonymous: the identity has to outlive the
   browser. An anonymous UID lives in browser storage, so it is lost when
   Safari clears site data (7 days idle, by default), when the cache is
   cleared, in private windows, and on any second device. A respondent
   answering over several days would lose their work. A Google account is
   stable everywhere, so someone can start on a laptop and finish on a desktop.

   Document model: one document per respondent, at
       <collection>/<google uid>
   holding the full response set. Autosave rewrites that document.
   ========================================================================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut, setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const config = window.FIREBASE_CONFIG;
const COLLECTION = window.FIREBASE_COLLECTION || 'elicitations';

const api = {
  status: 'connecting',   // connecting | signed-out | ready | error | unavailable
  uid: null,
  user: null,             // { name, email, photo }
  error: null,
  signIn: null,
  signOut: null,
  load: null,
  save: null
};
window.LTSync = api;

function announce(status, detail) {
  api.status = status;
  window.dispatchEvent(new CustomEvent('ltsync-status', {
    detail: Object.assign({ status: status }, detail || {})
  }));
}

if (!config || !config.projectId) {
  api.error = 'No Firebase configuration found.';
  announce('unavailable', { message: api.error });
} else {
  try {
    const app = initializeApp(config);
    const auth = getAuth(app);
    const provider = new GoogleAuthProvider();
    // Always show the account chooser, so someone on a shared machine does not
    // get silently signed in as whoever used it last.
    provider.setCustomParameters({ prompt: 'select_account' });

    // Offline cache: edits made while the connection drops are queued and
    // flushed when it returns, so a respondent on hotel wifi does not lose work.
    const db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() })
    });

    api.signIn = async function () {
      api.error = null;
      try {
        await signInWithPopup(auth, provider);
      } catch (err) {
        const code = err && err.code;
        // A blocked popup is not a failure the respondent can act on — fall
        // back to a full-page redirect, which no blocker interferes with.
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
          return signInWithRedirect(auth, provider);
        }
        // These two are the respondent closing the popup themselves. Not errors.
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
          announce('signed-out');
          return;
        }
        api.error = err.message || String(err);
        announce('error', { message: api.error, code: code });
      }
    };

    api.signOut = function () { return signOut(auth); };

    api.load = async function () {
      if (!api.uid) return null;
      const snap = await getDoc(doc(db, COLLECTION, api.uid));
      return snap.exists() ? snap.data() : null;
    };

    api.save = async function (payload) {
      if (!api.uid) throw new Error('Not signed in.');
      const record = Object.assign({}, payload, {
        uid: api.uid,
        account: api.user,
        updatedAt: serverTimestamp()
      });
      await setDoc(doc(db, COLLECTION, api.uid), record);
      return record;
    };

    setPersistence(auth, browserLocalPersistence).catch(() => { /* default is fine */ });

    // Completes a redirect-based sign-in when the page comes back.
    getRedirectResult(auth).catch(err => {
      api.error = err.message || String(err);
      announce('error', { message: api.error, code: err && err.code });
    });

    onAuthStateChanged(auth, user => {
      if (user) {
        api.uid = user.uid;
        api.user = {
          name: user.displayName || '',
          email: user.email || '',
          photo: user.photoURL || ''
        };
        announce('ready', { uid: user.uid, user: api.user });
      } else {
        api.uid = null;
        api.user = null;
        announce('signed-out');
      }
    });

  } catch (err) {
    api.error = err && err.message ? err.message : String(err);
    announce('error', { message: api.error });
  }
}
