# Deploying the weight elicitation site

Project: **weightwebsite** · Firestore collection: **elicitations** · Hosting: **Vercel**

---

## 1. Enable three things in the Firebase console

All one-time, and the site will not work without them.

**Firestore** — Build → Firestore Database → Create database → **Native mode** →
region `us-west1` (permanent choice; pick the one nearest the panel).

**Anonymous sign-in** — Build → Authentication → Get started → Sign-in method →
**Anonymous** → Enable.

If anonymous sign-in is off, the chip in the top right of the site reads
"Not connected" and the console shows `auth/configuration-not-found`.

**Authorized domains** — Build → Authentication → Settings → **Authorized domains**
→ Add domain. Add the Vercel production domain (e.g. `weight-website.vercel.app`)
and any custom domain.

Anonymous sign-in refuses to run on an origin Firebase does not know. Without
this the site loads but the chip reads "Not connected" and the console shows
`auth/unauthorized-domain`.

Vercel gives every preview deployment its own URL, and those will *not* be
authorized. Send the panel the stable production URL, not a preview link.

## 2. Publish the security rules

The site is hosted on Vercel, but Firestore rules still live in Firebase. Either
paste `firestore.rules` into the console (Firestore Database → **Rules** →
Publish), or from this folder:

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

**This is not optional.** Firestore's default rules are either locked (every
write denied — nothing ever saves) or test mode (open to the world, then expires
after 30 days and breaks mid-study). Neither is what you want.

## 3. Deploy the site

Vercel deploys the repo as a static site — no build step, no framework preset.
Push to the connected branch and it goes live.

`.vercelignore` keeps the admin files off the public site. The one that matters
is `serviceAccountKey.json`: it bypasses the security rules entirely, so it must
never be served.

To test locally, run any static server from this folder — for example
`python3 -m http.server 8000` — and open `http://localhost:8000`. Add
`localhost` to Authorized domains so sign-in works there too.

Do **not** just double-click `index.html`. The Firebase SDK cannot run from a
`file://` URL, so autosave will be off — the questionnaire still works, but the
chip will read "Local only" and answers exist only until the tab closes.

## A note on the collection

You do not create the `elicitations` collection by hand. Firestore creates it
when the first document is written. Its appearance in the console is your
confirmation that saving works end to end.

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
reach the `public` folder that gets deployed. `.vercelignore` already keeps it out of the
deployment, but the key file is yours to protect — do not commit it.

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
| Chip reads "Not connected", console says `auth/unauthorized-domain` | Serving from a domain Firebase doesn't know | Authentication → Settings → Authorized domains → add the Vercel domain |
| No `elicitations` collection appears | No write has succeeded yet — almost always the rules | Publish `firestore.rules` (step 2) |
| Logic tree image missing on the deployed site but fine locally | Filename case mismatch — macOS ignores case, Linux does not | Make the `src` in `index.html` match the file exactly |
| Chip reads "Not saved" | Rules rejected the write | Confirm the rules deployed: `firebase deploy --only firestore:rules` |

In every one of these the questionnaire keeps working and the download buttons
still produce the full JSON and CSV — nobody loses their answers, they just have
to email them.
