/* ==========================================================================
   Firebase configuration
   --------------------------------------------------------------------------
   These values are public by design — they ship in the page source of every
   Firebase web app and identify the project, they do not grant access to it.
   Access is controlled by firestore.rules, which restricts each respondent to
   their own document.
   ========================================================================== */

window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAs9oRxZhjB3EXoizqKQtZjtAwrddToU_g',
  authDomain: 'weightwebsite.firebaseapp.com',
  projectId: 'weightwebsite',
  storageBucket: 'weightwebsite.firebasestorage.app',
  messagingSenderId: '187683707948',
  appId: '1:187683707948:web:0e9c694a1220f5957d0589'
};

/* Firestore collection that holds one document per respondent. */
window.FIREBASE_COLLECTION = 'elicitations';
