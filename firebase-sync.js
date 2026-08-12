/* ==========================================================================
   Firebase sync layer
   --------------------------------------------------------------------------
   Loaded as a module. Signs the visitor in anonymously, then exposes a small
   API on window.LTSync that app.js uses. app.js has no Firebase code in it —
   if this file fails to load, or the page is opened from file://, the
   questionnaire still works and the download buttons still produce the same
   JSON and CSV.

   Document model: one document per respondent, at
       <collection>/<anonymous uid>
   holding the full response set. Autosave rewrites that document, so there is
   exactly one current record per person rather than a pile of partial saves.
   ========================================================================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const config = window.FIREBASE_CONFIG;
const COLLECTION = window.FIREBASE_COLLECTION || 'elicitations';

const api = {
  status: 'connecting',   // connecting | ready | error | unavailable
  uid: null,
  error: null,
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

    // Offline cache: edits made while the connection drops are queued and
    // flushed when it returns, so a respondent on hotel wifi does not lose work.
    const db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() })
    });

    api.load = async function () {
      if (!api.uid) return null;
      const snap = await getDoc(doc(db, COLLECTION, api.uid));
      return snap.exists() ? snap.data() : null;
    };

    api.save = async function (payload) {
      if (!api.uid) throw new Error('Not signed in yet.');
      const record = Object.assign({}, payload, {
        uid: api.uid,
        updatedAt: serverTimestamp()
      });
      await setDoc(doc(db, COLLECTION, api.uid), record);
      return record;
    };

    onAuthStateChanged(auth, user => {
      if (user) {
        api.uid = user.uid;
        announce('ready', { uid: user.uid });
      }
    });

    signInAnonymously(auth).catch(err => {
      api.error = err && err.message ? err.message : String(err);
      // The two failures worth naming, because the fix differs:
      //   auth/configuration-not-found → Anonymous sign-in is not enabled
      //   auth/unauthorized-domain     → this domain is not in Authorized domains
      announce('error', { message: api.error, code: err && err.code });
    });

  } catch (err) {
    api.error = err && err.message ? err.message : String(err);
    announce('error', { message: api.error });
  }
}
