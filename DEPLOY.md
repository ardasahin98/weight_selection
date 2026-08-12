# Deploying the weight elicitation site

Project: **weightwebsite** · Firestore collection: **elicitations**

---

## 1. Enable two things in the Firebase console

Both are one-time, and the site will not work without them.

**Firestore** — Build → Firestore Database → Create database → **Native mode** →
region `us-west1` (permanent choice; pick the one nearest the panel).

**Anonymous sign-in** — Build → Authentication → Get started → Sign-in method →
**Anonymous** → Enable.

If anonymous sign-in is off, the chip in the top right of the site reads
"Not connected" and the console shows `auth/configuration-not-found`.

## 2. Install the CLI

```bash
npm install -g firebase-tools
firebase login
```

## 3. Deploy

From this folder:

```bash
firebase deploy --only firestore:rules,hosting
```

That publishes the security rules and the site. The URL will be
`https://weightwebsite.web.app` — that is the link you send the panel.

To test locally before deploying:

```bash
firebase serve
```

Do **not** just double-click `index.html`. The Firebase SDK cannot run from a
`file://` URL, so autosave will be off — the questionnaire still works, but the
chip will read "Local only" and answers exist only until the tab closes.

---

## How responses are stored

One document per respondent at `elicitations/<anonymous uid>`, holding the whole
response set. Autosave rewrites that document about 1.5 s after the respondent
stops typing, so there is exactly one current record per person rather than a
pile of partial submissions.

The anonymous UID lives in the respondent's browser, so closing the page and
reopening it later on the same browser resumes their answers. A different
browser or machine starts fresh — that is what the *Save draft* / *Load draft*
buttons are for.

Useful fields on each document:

| Field | Meaning |
|---|---|
| `respondent.name` | What they typed on the intro page |
| `complete` | All weight sets filled and summing to 1.000 |
| `submitted` | They pressed **Mark as final** on the review page |
| `updatedAt` | Server timestamp of the last save |
| `responses[]` | One entry per weight set, with `weights[]`, `sum`, `status`, `comment` |

`submitted` is the one to watch — it separates people who are done from people
who are mid-thought, without you having to ask.

## Reading the results

Small panel, so the console works fine: Firestore Database → `elicitations`.

For a combined CSV across everyone:

```bash
npm install firebase-admin
node export_responses.js          # everyone, including drafts
node export_responses.js --final  # only responses marked final
```

This needs a service account key — Project settings → Service accounts →
Generate new private key → save as `serviceAccountKey.json` in this folder.

**That key bypasses the security rules.** Keep it out of git, and never let it
reach the `public` folder that gets deployed. `firebase.json` already ignores
`export_responses.js`, but the key file is yours to protect.

## Security

`firestore.rules` gives each respondent read and write access to their own
document only. Listing the collection is denied outright, so no one on the panel
can see anyone else's weights — which matters for elicitation, since you do not
want the third respondent anchoring on the first two.

The API key in `firebase-config.js` is public by design. It identifies the
project; it does not grant access to it. The rules are what protect the data.

## If something breaks

| Symptom | Cause | Fix |
|---|---|---|
| Chip reads "Local only" | Opened as a `file://` URL | Use the hosted link or `firebase serve` |
| Chip reads "Not connected", console says `auth/configuration-not-found` | Anonymous sign-in not enabled | Step 1 above |
| Chip reads "Not connected", console says `auth/unauthorized-domain` | Serving from a domain Firebase doesn't know | Authentication → Settings → Authorized domains → add it |
| Chip reads "Not saved" | Rules rejected the write | Confirm the rules deployed: `firebase deploy --only firestore:rules` |

In every one of these the questionnaire keeps working and the download buttons
still produce the full JSON and CSV — nobody loses their answers, they just have
to email them.
