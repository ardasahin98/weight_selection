/* ==========================================================================
   Pull every response out of Firestore and write one combined CSV.
   --------------------------------------------------------------------------
   Run this on your own machine, not on the site. It uses the Admin SDK, which
   bypasses the security rules — so the service account key it needs must never
   be committed or deployed.

   Setup, once:
     1. Firebase console → Project settings → Service accounts →
        "Generate new private key". Save it next to this file as
        serviceAccountKey.json.
     2. npm install firebase-admin

   Then:
     node export_responses.js            # writes all_responses.csv
     node export_responses.js --final    # finished responses only

   The CSV is long format — one row per respondent × weight set × branch —
   which is what you want for pivoting or reading into R/pandas.
   ========================================================================== */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const KEY = path.join(__dirname, 'serviceAccountKey.json');
const COLLECTION = 'elicitations';
const finalOnly = process.argv.includes('--final');

if (!fs.existsSync(KEY)) {
  console.error('Missing serviceAccountKey.json — see the header of this file.');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(KEY)) });
const db = admin.firestore();

const esc = v => {
  const s = (v === null || v === undefined) ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

(async () => {
  const snap = await db.collection(COLLECTION).get();

  const rows = [[
    'respondent_name', 'uid', 'submitted', 'set_id', 'section', 'case', 'scenario',
    'branch_id', 'branch', 'weight', 'set_sum', 'set_status', 'comment', 'updated_at'
  ]];

  let people = 0;
  let skipped = 0;

  snap.forEach(docSnap => {
    const d = docSnap.data();
    if (finalOnly && !d.submitted) { skipped++; return; }
    people++;

    const name = (d.respondent && d.respondent.name) || '(no name)';
    const updated = d.updatedAt && d.updatedAt.toDate
      ? d.updatedAt.toDate().toISOString()
      : '';

    (d.responses || []).forEach(res => {
      (res.weights || []).forEach(w => {
        rows.push([
          name, docSnap.id, d.submitted ? 'yes' : 'no',
          res.setId, res.section, res.case, res.scenario,
          w.branchId, w.branch, w.weight === null ? '' : w.weight,
          res.sum, res.status, res.comment, updated
        ]);
      });
    });
  });

  const out = finalOnly ? 'final_responses.csv' : 'all_responses.csv';
  fs.writeFileSync(out, rows.map(r => r.map(esc).join(',')).join('\n'));

  console.log('Wrote ' + out + ' — ' + people + ' respondent(s), ' + (rows.length - 1) + ' rows.');
  if (skipped) console.log(skipped + ' draft response(s) skipped (--final).');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
