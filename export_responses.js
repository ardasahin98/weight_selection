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

   The CSV is long format — one row per respondent × weight set × branch ×
   stratigraphy column — which is what you want for pivoting or reading into
   R/pandas. Filter on `stratigraphy` to get one case or the other, and on
   `inherited` to drop heterogeneous weights the respondent never actually
   changed from the homogeneous value.
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
    'respondent_name', 'uid', 'submitted', 'schema_version',
    'set_id', 'section', 'case', 'fines_content', 'assessment', 'scenario',
    'branch_id', 'branch', 'stratigraphy', 'weight', 'inherited',
    'set_sum', 'set_status', 'comment', 'updated_at'
  ]];

  let people = 0;
  let skipped = 0;
  let legacy = 0;

  snap.forEach(docSnap => {
    const d = docSnap.data();
    if (finalOnly && !d.submitted) { skipped++; return; }
    people++;
    if (d.schemaVersion && d.schemaVersion !== '2.0') legacy++;

    const name = (d.respondent && d.respondent.name) || '(no name)';
    const updated = d.updatedAt && d.updatedAt.toDate
      ? d.updatedAt.toDate().toISOString()
      : '';

    (d.responses || []).forEach(res => {
      const push = (strat, weight, inherited, sum) => {
        rows.push([
          name, docSnap.id, d.submitted ? 'yes' : 'no', d.schemaVersion || '1.0',
          res.setId, res.section, res.case, res.fc || '', res.assessment || '', res.scenario,
          res.__bid, res.__blabel, strat, weight === null || weight === undefined ? '' : weight,
          inherited, sum === undefined ? '' : sum,
          res.status, res.comment, updated
        ]);
      };

      (res.weights || []).forEach(w => {
        res.__bid = w.branchId;
        res.__blabel = w.branch;

        // v1 records carried a single `weight` and no stratigraphy columns.
        if (w.homogeneous === undefined && w.heterogeneous === undefined) {
          push('', w.weight, '', res.sum);
          return;
        }
        push('homogeneous', w.homogeneous, 'no', res.sumHomogeneous);
        push('heterogeneous', w.heterogeneous,
             w.heterogeneousInherited ? 'yes' : 'no', res.sumHeterogeneous);
      });
    });
  });

  const out = finalOnly ? 'final_responses.csv' : 'all_responses.csv';
  fs.writeFileSync(out, rows.map(r => r.map(esc).join(',')).join('\n'));

  console.log('Wrote ' + out + ' — ' + people + ' respondent(s), ' + (rows.length - 1) + ' rows.');
  if (skipped) console.log(skipped + ' draft response(s) skipped (--final).');
  if (legacy) console.log(legacy + ' response(s) written against an older schema version.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
