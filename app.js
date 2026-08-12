/* ==========================================================================
   Logic Tree Weight Elicitation
   --------------------------------------------------------------------------
   The whole questionnaire is generated from SCHEMA below. To add, remove or
   reword a case, a data scenario or a branch, edit SCHEMA only — the rendering,
   validation, progress tracking and export all follow from it automatically.

   Responses autosave to Firestore when firebase-sync.js is present and the page
   is served over http(s). Everything still works without it — the download
   buttons produce the same JSON and CSV either way.
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   CONFIG
   -------------------------------------------------------------------------- */

const CONFIG = {
  version: '1.0',
  study: 'Cyclic resistance logic tree — weight elicitation',
  tolerance: 1e-6,        // how close the sum must be to 1.000
  returnTo: '',           // optional: email address shown on the review page
  autosaveDelay: 1500     // ms of quiet before a save is sent
};

/* --------------------------------------------------------------------------
   DATA AVAILABILITY SCENARIOS
   Penetration resistance is assumed available in every scenario.
   Tags drive which branches appear: a branch listing a tag in `requires`
   is only shown in scenarios that carry that tag.
   -------------------------------------------------------------------------- */

const SCENARIOS = [
  {
    id: 'S1',
    name: 'Penetration resistance only',
    desc: 'CPT, SPT, Vₛ or DPT profile. No laboratory data.',
    tags: ['pen']
  },
  {
    id: 'S2',
    name: 'Penetration + index tests',
    desc: 'Adds Atterberg limits, gradation and fines content on recovered samples.',
    tags: ['pen', 'index']
  },
  {
    id: 'S3',
    name: 'Penetration + index + advanced monotonic laboratory tests',
    desc: 'Adds consolidation and monotonic strength testing (e.g. sᵤ, OCR, state characterisation).',
    tags: ['pen', 'index', 'lab']
  },
  {
    id: 'S4',
    name: 'Penetration + index + monotonic + cyclic laboratory tests',
    desc: 'Full programme, including site-specific cyclic laboratory testing on high-quality samples.',
    tags: ['pen', 'index', 'lab', 'cyclic']
  }
];

/* --------------------------------------------------------------------------
   BRANCH DEFINITIONS (Stage 4 — cyclic resistance assessment types)
   -------------------------------------------------------------------------- */

const BRANCHES = {
  empirical: {
    label: 'Empirical triggering models',
    desc: 'Penetration- and Vₛ-based case-history correlations (SPT, CPT, Vₛ, DPT).'
  },
  labSand: {
    label: 'Laboratory-based model for sands',
    desc: "Kristin's model."
  },
  labFine: {
    label: 'Laboratory-based models for fine-grained soils',
    desc: "Ali's model and Varun's model, taken together as one branch."
  },
  softening: {
    label: 'Cyclic softening models',
    desc: 'Strength-based cyclic softening procedures for non-susceptible fine-grained soils.'
  },
  cyclicLab: {
    label: 'Cyclic laboratory tests',
    desc: 'Site-specific cyclic testing used directly to characterise cyclic resistance.',
    requires: ['cyclic']
  }
};

/* --------------------------------------------------------------------------
   CASES (Stage 4)
   -------------------------------------------------------------------------- */

const CASES = [
  {
    id: 'C1',
    letter: 'B',
    name: 'Coarse-grained dominated, non-plastic soil',
    context:
      'Stage 1 has classified the unit as coarse-grained dominated, so Stage 2 is bypassed and ' +
      'P[S] = 1 is assigned (CBT = 0.96 median from the sand results). You are weighting the ' +
      'Stage 4 cyclic resistance assessment types for this branch.',
    branches: ['empirical', 'labSand', 'cyclicLab'],
    // Index testing adds nothing for a non-plastic coarse-grained unit, so the
    // "penetration + index" scenario is not asked for this case.
    skipScenarios: ['S2']
  },
  {
    id: 'C2',
    letter: 'C',
    name: 'Fine-grained dominated, susceptible soil',
    context:
      'Stage 1 has classified the unit as fine-grained dominated and the S-CBT models indicate ' +
      'susceptibility, so the liquefaction assessment branch (P[S]) is followed. You are weighting ' +
      'the Stage 4 cyclic resistance assessment types on that branch.',
    branches: ['empirical', 'labFine', 'cyclicLab']
  },
  {
    id: 'C3',
    letter: 'D',
    name: 'Fine-grained dominated, not-susceptible soil',
    context:
      'Stage 1 has classified the unit as fine-grained dominated and the S-CBT models indicate the ' +
      'soil is not susceptible, so the cyclic softening branch (1 − P[S]) is followed. Empirical ' +
      'triggering correlations are not applicable here.',
    branches: ['labFine', 'softening', 'cyclicLab']
  }
];

/* --------------------------------------------------------------------------
   SECTION A — Susceptibility (Stage 2)
   -------------------------------------------------------------------------- */

const SUSCEPTIBILITY = {
  id: 'A',
  letter: 'A',
  title: 'Susceptibility — S-CBT model results',
  intro:
    'At Stage 2 the susceptibility assessment is carried through the logic tree using the median ' +
    'S-CBT model result together with the +1σ and −1σ results. Assign the weight you would give ' +
    'to each. You are asked twice: once where the models are the only basis for the assessment, ' +
    'and once where site-specific cyclic laboratory testing is also available.',
  branches: {
    median: { id: 'median', label: 'Median S-CBT model result', desc: 'The central estimate of the S-CBT model.' },
    plus1:  { id: 'plus1',  label: '+1σ S-CBT model result',    desc: 'One standard deviation above the median (more susceptible).' },
    minus1: { id: 'minus1', label: '−1σ S-CBT model result',    desc: 'One standard deviation below the median (less susceptible).' },
    cyclic: { id: 'cyclicLab', label: 'Cyclic laboratory tests', desc: 'Site-specific cyclic testing used directly to judge susceptibility.' }
  },
  conditions: [
    {
      id: 'A1',
      name: 'S-CBT models only',
      desc: 'No site-specific cyclic laboratory testing. Susceptibility is judged from the model results alone.',
      branches: ['median', 'plus1', 'minus1']
    },
    {
      id: 'A2',
      name: 'S-CBT models + cyclic laboratory tests',
      desc: 'Cyclic laboratory testing on high-quality samples is available and can be used to judge ' +
            'susceptibility directly, alongside the model results.',
      branches: ['median', 'plus1', 'minus1', 'cyclic']
    }
  ]
};

/* --------------------------------------------------------------------------
   BUILD THE FLAT LIST OF PANELS AND WEIGHT SETS
   -------------------------------------------------------------------------- */

function buildSchema() {
  const panels = [];

  // Section A — one panel, three weight sets (one per data condition)
  panels.push({
    key: 'A',
    navGroup: 'Stage 2',
    navLabel: 'A. Susceptibility',
    eyebrow: 'Section A · Stage 2',
    title: SUSCEPTIBILITY.title,
    intro: SUSCEPTIBILITY.intro,
    note:
      'These weights describe how much confidence you place in each model result, not how likely ' +
      'the soil is to be susceptible — that comes from the model itself.',
    sets: SUSCEPTIBILITY.conditions.map((cond, i) => ({
      id: 'A.' + cond.id,
      section: 'A. Susceptibility (Stage 2)',
      caseName: 'Susceptibility — S-CBT model results',
      scenarioName: cond.name,
      title: cond.name,
      index: i + 1,
      count: SUSCEPTIBILITY.conditions.length,
      kicker: 'Case',
      desc: cond.desc,
      branches: cond.branches.map(key => {
        const b = SUSCEPTIBILITY.branches[key];
        return { id: b.id, label: b.label, desc: b.desc };
      })
    }))
  });

  // Sections B–D — one panel per case, four weight sets (one per data scenario)
  CASES.forEach(cs => {
    panels.push({
      key: cs.id,
      navGroup: 'Stage 4',
      navLabel: cs.letter + '. ' + shortCase(cs.name),
      eyebrow: 'Section ' + cs.letter + ' · Stage 4',
      title: cs.name,
      intro: cs.context,
      note:
        'Penetration resistance data are available in every scenario below. Weight the assessment ' +
        'types as you would recommend for guidance, given only the data listed. A weight of 0 is a ' +
        'valid answer.',
      sets: SCENARIOS.filter(
        sc => !(cs.skipScenarios || []).includes(sc.id)
      ).map((sc, i, arr) => {
        const branches = cs.branches
          .filter(bid => availableIn(BRANCHES[bid], sc))
          .map(bid => ({ id: bid, label: BRANCHES[bid].label, desc: BRANCHES[bid].desc }));
        return {
          id: cs.id + '.' + sc.id,
          section: 'Section ' + cs.letter + ' — ' + cs.name,
          caseName: cs.name,
          scenarioName: sc.name,
          title: sc.name,
          index: i + 1,
          count: arr.length,
          kicker: 'Data scenario',
          desc: sc.desc,
          branches: branches
        };
      })
    });
  });

  return panels;
}

function availableIn(branch, scenario) {
  if (!branch.requires) return true;
  return branch.requires.every(tag => scenario.tags.indexOf(tag) !== -1);
}

function shortCase(name) {
  return name
    .replace('Coarse-grained dominated, non-plastic soil', 'Coarse-grained')
    .replace('Fine-grained dominated, susceptible soil', 'Fine-grained, susceptible')
    .replace('Fine-grained dominated, not-susceptible soil', 'Fine-grained, not susceptible');
}

/* --------------------------------------------------------------------------
   STATE
   -------------------------------------------------------------------------- */

const PANELS = buildSchema();
const ALL_SETS = PANELS.reduce((acc, p) => acc.concat(p.sets), []);

const state = {
  respondent: { name: '' },
  answers: {},          // setId -> { weights: {branchId: string}, comment: string }
  startedAt: new Date().toISOString(),
  currentPanel: 0,      // 0 = intro, 1..n = generated, n+1 = review
  submitted: false,     // set when the respondent marks their answers final
  submittedAt: null
};

/* Cloud sync bookkeeping (see firebase-sync.js) */
const sync = {
  timer: null,
  inFlight: false,
  pending: false,
  lastSavedAt: null,
  restoring: false,
  error: null
};

ALL_SETS.forEach(s => {
  state.answers[s.id] = { weights: {}, comment: '' };
  s.branches.forEach(b => { state.answers[s.id].weights[b.id] = ''; });
});

/* --------------------------------------------------------------------------
   DOM HELPERS
   -------------------------------------------------------------------------- */

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach(k => {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
  }
  (children || []).forEach(c => { if (c) node.appendChild(c); });
  return node;
}

/* --------------------------------------------------------------------------
   RENDER — intro scenario legend
   -------------------------------------------------------------------------- */

function renderScenarioLegend() {
  const ol = $('#scenario-legend');
  SCENARIOS.forEach(sc => {
    ol.appendChild(el('li', {}, [
      el('span', { class: 'sc-name', text: sc.name }),
      el('span', { class: 'sc-desc', text: ' — ' + sc.desc })
    ]));
  });
}

/* --------------------------------------------------------------------------
   RENDER — weight panels
   -------------------------------------------------------------------------- */

function renderPanels() {
  const host = $('#generated');

  PANELS.forEach((panel, idx) => {
    const sec = el('section', { class: 'panel', id: 'panel-' + panel.key, hidden: 'hidden' });
    sec.setAttribute('data-panel', panel.key);

    sec.appendChild(el('p', { class: 'eyebrow', text: panel.eyebrow }));
    sec.appendChild(el('h1', { text: panel.title }));
    sec.appendChild(el('p', { class: 'lede', text: panel.intro }));
    if (panel.note) sec.appendChild(el('div', { class: 'note', html: panel.note }));

    panel.sets.forEach(set => sec.appendChild(renderSet(set)));

    sec.appendChild(el('div', { class: 'panel-nav' }, [
      el('button', { type: 'button', class: 'btn btn-ghost', 'data-goto': 'prev', text: '← Back' }),
      el('button', { type: 'button', class: 'btn btn-primary', 'data-goto': 'next', text: 'Continue →' })
    ]));

    host.appendChild(sec);
  });
}

function renderSet(set) {
  const wrap = el('div', { class: 'wset', id: 'wset-' + set.id });

  wrap.appendChild(el('div', { class: 'wset-head' }, [
    el('div', { class: 'wset-badge', text: String(set.index) }),
    el('div', { class: 'wset-headtext' }, [
      el('div', { class: 'wset-kicker', text: set.kicker + ' ' + set.index + ' of ' + set.count }),
      el('h3', { class: 'wset-title', text: set.title }),
      set.desc ? el('p', { class: 'wset-desc', text: set.desc }) : null
    ])
  ]));

  wrap.appendChild(el('div', { class: 'wset-body' }, [buildSetBody(set)]));
  return wrap;
}

function buildSetBody(set) {
  const wrap = el('div');

  const table = el('table', { class: 'wtable' });
  const thead = el('thead', {}, [
    el('tr', {}, [
      el('th', { text: 'Branch' }),
      el('th', { class: 'num', text: 'Weight' })
    ])
  ]);
  table.appendChild(thead);

  const tbody = el('tbody');
  set.branches.forEach(b => {
    const input = el('input', {
      type: 'number', class: 'w-input', min: '0', max: '1', step: '0.05',
      'data-set': set.id, 'data-branch': b.id,
      'aria-label': b.label + ' weight'
    });
    input.addEventListener('input', onWeightInput);

    tbody.appendChild(el('tr', {}, [
      el('td', {}, [
        el('div', { class: 'branch-label', text: b.label }),
        b.desc ? el('div', { class: 'branch-desc', text: b.desc }) : null
      ]),
      el('td', { class: 'num' }, [input])
    ]));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);

  wrap.appendChild(el('div', { class: 'wtotal is-empty', id: 'total-' + set.id }, [
    el('div', { class: 'wtotal-tools' }, [
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: 'Equal weights',
        onclick: () => fillEqual(set.id)
      }),
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: 'Normalise',
        onclick: () => normalise(set.id)
      }),
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: 'Clear',
        onclick: () => clearSet(set.id)
      })
    ]),
    el('span', { class: 'wtotal-msg', id: 'msg-' + set.id, text: 'No weights entered yet' }),
    el('span', { class: 'wtotal-label', text: 'Sum' }),
    el('span', { class: 'wtotal-value', id: 'val-' + set.id, text: '—' })
  ]));

  const ta = el('textarea', {
    id: 'comment-' + set.id,
    placeholder: 'Why these weights? Any condition or caveat you would attach to them?'
  });
  ta.addEventListener('input', e => {
    state.answers[set.id].comment = e.target.value;
    markDirty();
  });

  wrap.appendChild(el('div', { class: 'comment-wrap' }, [
    el('label', { class: 'comment-label', for: 'comment-' + set.id, text: 'Comments (optional)' }),
    ta
  ]));

  return wrap;
}

/* --------------------------------------------------------------------------
   WEIGHT INPUT HANDLING
   -------------------------------------------------------------------------- */

function onWeightInput(e) {
  const setId = e.target.getAttribute('data-set');
  const branchId = e.target.getAttribute('data-branch');
  state.answers[setId].weights[branchId] = e.target.value;
  e.target.classList.toggle('is-zero', parseFloat(e.target.value) === 0);
  updateSetStatus(setId);
  markDirty();
}

function setOf(setId) { return ALL_SETS.find(s => s.id === setId); }

function sumOf(setId) {
  const w = state.answers[setId].weights;
  return Object.keys(w).reduce((t, k) => t + (parseFloat(w[k]) || 0), 0);
}

function filledCount(setId) {
  const w = state.answers[setId].weights;
  return Object.keys(w).filter(k => w[k] !== '' && w[k] !== null).length;
}

function setStatus(setId) {
  const set = setOf(setId);
  const filled = filledCount(setId);
  if (filled === 0) return 'empty';
  if (filled < set.branches.length) return 'partial';
  return Math.abs(sumOf(setId) - 1) <= CONFIG.tolerance ? 'complete' : 'off';
}

function updateSetStatus(setId) {
  const box = document.getElementById('total-' + setId);
  const val = document.getElementById('val-' + setId);
  const msg = document.getElementById('msg-' + setId);
  if (!box) return;

  const status = setStatus(setId);
  const sum = sumOf(setId);

  box.classList.remove('is-ok', 'is-off', 'is-empty');

  if (status === 'empty') {
    box.classList.add('is-empty');
    val.textContent = '—';
    msg.textContent = 'No weights entered yet';
  } else if (status === 'complete') {
    box.classList.add('is-ok');
    val.textContent = sum.toFixed(3);
    msg.textContent = 'Sums to 1.000';
  } else {
    box.classList.add('is-off');
    val.textContent = sum.toFixed(3);
    const missing = setOf(setId).branches.length - filledCount(setId);
    if (status === 'partial' && Math.abs(sum - 1) <= CONFIG.tolerance) {
      msg.textContent = missing + ' branch' + (missing === 1 ? '' : 'es') +
        ' still blank — enter 0 if you would not use it';
    } else if (status === 'partial') {
      msg.textContent = missing + ' branch' + (missing === 1 ? '' : 'es') + ' blank; ' +
        (sum > 1 ? 'over' : 'under') + ' by ' + Math.abs(sum - 1).toFixed(3);
    } else {
      msg.textContent = (sum > 1 ? 'Over' : 'Under') + ' by ' + Math.abs(sum - 1).toFixed(3);
    }
  }
}

function writeWeight(setId, branchId, value) {
  state.answers[setId].weights[branchId] = value;
  const input = document.querySelector(
    '.w-input[data-set="' + setId + '"][data-branch="' + branchId + '"]'
  );
  if (input) {
    input.value = value;
    input.classList.toggle('is-zero', parseFloat(value) === 0);
  }
}

function fillEqual(setId) {
  const branches = setOf(setId).branches;
  const n = branches.length;
  const base = Math.floor((1 / n) * 1000) / 1000;
  let remainder = Math.round((1 - base * n) * 1000) / 1000;
  branches.forEach((b, i) => {
    let v = base;
    if (i === 0) v = Math.round((base + remainder) * 1000) / 1000;
    writeWeight(setId, b.id, v.toFixed(3));
  });
  updateSetStatus(setId);
  markDirty();
}

function normalise(setId) {
  const total = sumOf(setId);
  if (total <= 0) return;
  const branches = setOf(setId).branches;
  const raw = branches.map(b => (parseFloat(state.answers[setId].weights[b.id]) || 0) / total);
  const rounded = raw.map(v => Math.round(v * 1000) / 1000);
  const drift = Math.round((1 - rounded.reduce((a, b) => a + b, 0)) * 1000) / 1000;
  let maxIdx = 0;
  rounded.forEach((v, i) => { if (v > rounded[maxIdx]) maxIdx = i; });
  rounded[maxIdx] = Math.round((rounded[maxIdx] + drift) * 1000) / 1000;
  branches.forEach((b, i) => writeWeight(setId, b.id, rounded[i].toFixed(3)));
  updateSetStatus(setId);
  markDirty();
}

function clearSet(setId) {
  setOf(setId).branches.forEach(b => writeWeight(setId, b.id, ''));
  updateSetStatus(setId);
  markDirty();
}

/* --------------------------------------------------------------------------
   NAVIGATION
   -------------------------------------------------------------------------- */

function panelOrder() {
  return ['intro'].concat(PANELS.map(p => p.key), ['review']);
}

function showPanel(index) {
  const order = panelOrder();
  const clamped = Math.max(0, Math.min(order.length - 1, index));
  state.currentPanel = clamped;

  order.forEach((key, i) => {
    const node = document.getElementById('panel-' + key);
    if (node) node.hidden = (i !== clamped);
  });

  if (order[clamped] === 'review') renderReview();
  renderNav();
  updateProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderNav() {
  const list = $('#nav-list');
  list.innerHTML = '';
  const order = panelOrder();

  const addItem = (label, index, cls, statusCls) => {
    const li = el('li');
    const btn = el('button', {
      type: 'button',
      class: 'nav-item ' + (cls || '') + ' ' + (statusCls || ''),
      onclick: () => showPanel(index)
    });
    if (index === state.currentPanel) btn.classList.add('is-current');
    btn.appendChild(el('span', { class: 'nav-dot' }));
    btn.appendChild(el('span', { text: label }));
    li.appendChild(btn);
    list.appendChild(li);
  };

  const addGroup = label => {
    const li = el('li');
    li.appendChild(el('div', { class: 'nav-item is-group', text: label }));
    list.appendChild(li);
  };

  addItem('Introduction', 0, '', state.respondent.name ? 'is-done' : '');

  let lastGroup = null;
  PANELS.forEach((p, i) => {
    if (p.navGroup !== lastGroup) { addGroup(p.navGroup); lastGroup = p.navGroup; }
    const statuses = p.sets.map(s => setStatus(s.id));
    const allDone = statuses.every(s => s === 'complete');
    const anyStarted = statuses.some(s => s !== 'empty');
    addItem(p.navLabel, i + 1, '', allDone ? 'is-done' : (anyStarted ? 'is-partial' : ''));
  });

  addGroup('Finish');
  addItem('Review and submit', order.length - 1, '', '');
}

function updateProgress() {
  const done = ALL_SETS.filter(s => setStatus(s.id) === 'complete').length;
  const total = ALL_SETS.length;
  const chip = $('#progress-chip');
  chip.textContent = done + ' / ' + total + ' complete';
  chip.classList.toggle('chip-done', done === total);
  $('#progress-fill').style.width = (total ? (done / total) * 100 : 0) + '%';

  const rchip = $('#respondent-chip');
  if (state.respondent.name) {
    rchip.textContent = state.respondent.name;
    rchip.classList.remove('chip-muted');
  } else {
    rchip.textContent = 'No respondent';
    rchip.classList.add('chip-muted');
  }
}

/* --------------------------------------------------------------------------
   REVIEW
   -------------------------------------------------------------------------- */

function renderReview() {
  const status = $('#review-status');
  const body = $('#review-body');
  status.innerHTML = '';
  body.innerHTML = '';

  const incomplete = ALL_SETS.filter(s => setStatus(s.id) !== 'complete');
  const banner = el('div', {
    class: 'status-banner ' + (incomplete.length ? 'is-off' : 'is-ok')
  });
  if (!state.respondent.name) {
    banner.appendChild(el('div', { text: 'Your name is missing — please add it on the introduction page.' }));
  }
  banner.appendChild(el('div', {
    text: incomplete.length
      ? incomplete.length + ' of ' + ALL_SETS.length + ' weight sets are incomplete. ' +
        'You can still download what you have, but please note the gaps when you send it back.'
      : 'All ' + ALL_SETS.length + ' weight sets are complete and sum to 1.000.'
  }));
  status.appendChild(banner);

  const table = el('table', { class: 'review-table' });
  table.appendChild(el('thead', {}, [
    el('tr', {}, [
      el('th', { text: 'Branch' }),
      el('th', { class: 'num', text: 'Weight' })
    ])
  ]));
  const tbody = el('tbody');

  PANELS.forEach(panel => {
    panel.sets.forEach(set => {
      const st = setStatus(set.id);
      const head = el('tr', { class: 'review-group' }, [
        el('td', { colspan: '2' }, [
          el('span', { text: panel.navLabel + ' — ' + set.title }),
          st !== 'complete'
            ? el('span', { class: 'review-flag', text: '   ▲ ' + (st === 'empty' ? 'not started' : 'incomplete') })
            : null
        ])
      ]);
      tbody.appendChild(head);

      set.branches.forEach(b => {
        const v = state.answers[set.id].weights[b.id];
        tbody.appendChild(el('tr', {}, [
          el('td', { text: b.label }),
          el('td', { class: 'num', text: v === '' ? '—' : (parseFloat(v) || 0).toFixed(3) })
        ]));
      });

      if (state.answers[set.id].comment) {
        tbody.appendChild(el('tr', {}, [
          el('td', { colspan: '2' }, [
            el('em', { text: '“' + state.answers[set.id].comment + '”' })
          ])
        ]));
      }
    });
  });

  table.appendChild(tbody);
  body.appendChild(table);

  const finalBtn = $('#btn-submit-online');
  finalBtn.hidden = !syncAvailable();
  finalBtn.textContent = state.submitted ? 'Marked as final ✓' : 'Mark as final';

  $('#export-note').textContent = syncAvailable()
    ? (state.submitted
        ? 'Your answers are saved and marked as final. You can keep editing — changes are still saved automatically.'
        : 'Your answers save automatically as you type. Downloading is optional — for your own records.')
    : (CONFIG.returnTo
        ? 'Autosave is off in this copy. Download the file and send it to ' + CONFIG.returnTo + '.'
        : 'Autosave is off in this copy. Download the file and send it back to the study coordinator.');
}

/* --------------------------------------------------------------------------
   EXPORT
   -------------------------------------------------------------------------- */

function collectPayload() {
  return {
    schemaVersion: CONFIG.version,
    study: CONFIG.study,
    respondent: Object.assign({}, state.respondent),
    startedAt: state.startedAt,
    completedAt: new Date().toISOString(),
    complete: ALL_SETS.every(s => setStatus(s.id) === 'complete'),
    submitted: state.submitted,
    submittedAt: state.submittedAt,
    responses: ALL_SETS.map(set => ({
      setId: set.id,
      section: set.section,
      case: set.caseName,
      scenario: set.scenarioName,
      status: setStatus(set.id),
      sum: Number(sumOf(set.id).toFixed(6)),
      comment: state.answers[set.id].comment,
      weights: set.branches.map(b => ({
        branchId: b.id,
        branch: b.label,
        weight: state.answers[set.id].weights[b.id] === ''
          ? null
          : Number(state.answers[set.id].weights[b.id])
      }))
    }))
  };
}

function toCSV(payload) {
  const esc = v => {
    const s = (v === null || v === undefined) ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = [[
    'respondent_name',
    'set_id', 'section', 'case', 'scenario', 'branch_id', 'branch', 'weight',
    'set_sum', 'set_status', 'comment', 'completed_at'
  ]];
  const r = payload.respondent;
  payload.responses.forEach(res => {
    res.weights.forEach(w => {
      rows.push([
        r.name,
        res.setId, res.section, res.case, res.scenario,
        w.branchId, w.branch, w.weight === null ? '' : w.weight,
        res.sum, res.status, res.comment, payload.completedAt
      ]);
    });
  });
  return rows.map(row => row.map(esc).join(',')).join('\n');
}

function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName() {
  const n = (state.respondent.name || 'respondent').trim().replace(/[^A-Za-z0-9]+/g, '_');
  const d = new Date().toISOString().slice(0, 10);
  return 'weights_' + n + '_' + d;
}

/* --------------------------------------------------------------------------
   DRAFT SAVE / LOAD  (file-based, so nothing is stored in the browser)
   -------------------------------------------------------------------------- */

function saveDraft() {
  const draft = {
    draft: true,
    schemaVersion: CONFIG.version,
    respondent: state.respondent,
    answers: state.answers,
    startedAt: state.startedAt,
    savedAt: new Date().toISOString()
  };
  download(safeName() + '_DRAFT.json', JSON.stringify(draft, null, 2), 'application/json');
}

function loadDraft(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let data;
    try { data = JSON.parse(reader.result); }
    catch (err) { alert('That file could not be read as JSON.'); return; }

    const answers = data.answers || null;
    if (!answers) { alert('That file does not look like a saved draft.'); return; }

    if (data.respondent) {
      state.respondent.name = data.respondent.name || '';
      $('#r-name').value = state.respondent.name;
    }
    if (data.startedAt) state.startedAt = data.startedAt;

    let restored = 0;
    ALL_SETS.forEach(set => {
      const saved = answers[set.id];
      if (!saved) return;
      set.branches.forEach(b => {
        const v = saved.weights && saved.weights[b.id];
        if (v !== undefined && v !== null) writeWeight(set.id, b.id, v);
      });
      state.answers[set.id].comment = saved.comment || '';
      const ta = document.getElementById('comment-' + set.id);
      if (ta) ta.value = state.answers[set.id].comment;
      updateSetStatus(set.id);
      restored++;
    });

    renderNav();
    markDirty();
    alert('Draft loaded — ' + restored + ' weight sets restored.');
  };
  reader.readAsText(file);
}

/* --------------------------------------------------------------------------
   ONLINE SUBMISSION — stub for the Firebase version
   -------------------------------------------------------------------------- */

function syncAvailable() {
  return !!(window.LTSync && window.LTSync.save && window.LTSync.status === 'ready');
}

/* Called after any change the respondent makes. Updates the UI immediately and
   queues a save for CONFIG.autosaveDelay ms later; further edits push the save
   back, so a burst of typing produces one write rather than dozens. */
function markDirty() {
  updateProgress();
  if (sync.restoring) return;
  if (!syncAvailable()) { renderSyncStatus(); return; }

  sync.pending = true;
  renderSyncStatus();
  clearTimeout(sync.timer);
  sync.timer = setTimeout(flushSave, CONFIG.autosaveDelay);
}

async function flushSave() {
  if (!syncAvailable()) return;
  if (sync.inFlight) { sync.pending = true; return; }

  sync.inFlight = true;
  sync.pending = false;
  renderSyncStatus();

  try {
    await window.LTSync.save(collectPayload());
    sync.lastSavedAt = new Date();
    sync.error = null;
  } catch (err) {
    sync.error = (err && err.message) ? err.message : String(err);
  } finally {
    sync.inFlight = false;
    renderSyncStatus();
    // An edit landed while the write was in flight — save again.
    if (sync.pending) {
      clearTimeout(sync.timer);
      sync.timer = setTimeout(flushSave, 300);
    }
  }
}

/* Pull an existing document for this browser's anonymous user and refill the
   form. Runs once, as soon as authentication completes. */
async function restoreFromCloud() {
  if (!window.LTSync || !window.LTSync.load) return;

  let data;
  try { data = await window.LTSync.load(); }
  catch (err) { sync.error = err.message; renderSyncStatus(); return; }
  if (!data) { renderSyncStatus(); return; }

  sync.restoring = true;

  if (data.respondent && data.respondent.name) {
    state.respondent.name = data.respondent.name;
    $('#r-name').value = data.respondent.name;
  }
  if (data.startedAt) state.startedAt = data.startedAt;
  state.submitted = !!data.submitted;
  state.submittedAt = data.submittedAt || null;

  (data.responses || []).forEach(res => {
    const set = setOf(res.setId);
    if (!set) return;   // schema changed since the record was written
    (res.weights || []).forEach(w => {
      if (w.weight === null || w.weight === undefined) return;
      if (!set.branches.some(b => b.id === w.branchId)) return;
      writeWeight(res.setId, w.branchId, String(w.weight));
    });
    state.answers[res.setId].comment = res.comment || '';
    const ta = document.getElementById('comment-' + res.setId);
    if (ta) ta.value = state.answers[res.setId].comment;
    updateSetStatus(res.setId);
  });

  sync.restoring = false;
  sync.lastSavedAt = new Date();
  updateProgress();
  renderNav();
  renderSyncStatus();
  if (state.currentPanel === panelOrder().length - 1) renderReview();
}

/* The chip in the top bar. This is the respondent's only signal that their work
   is safe, so it says what is actually true rather than a permanent "Saved". */
function renderSyncStatus() {
  const chip = $('#sync-chip');
  if (!chip) return;

  const s = window.LTSync ? window.LTSync.status : 'unavailable';
  chip.classList.remove('chip-done', 'chip-muted', 'chip-warn');

  if (sync.error) {
    chip.textContent = 'Not saved';
    chip.title = sync.error;
    chip.classList.add('chip-warn');
  } else if (s === 'unavailable') {
    chip.textContent = 'Local only';
    chip.title = 'Autosave is off. Open the hosted link, or download your answers when you finish.';
    chip.classList.add('chip-muted');
  } else if (s === 'error') {
    chip.textContent = 'Not connected';
    chip.title = (window.LTSync.error || '') + ' — your answers are still kept in this page; use the download buttons.';
    chip.classList.add('chip-warn');
  } else if (s === 'connecting') {
    chip.textContent = 'Connecting…';
    chip.classList.add('chip-muted');
  } else if (sync.inFlight) {
    chip.textContent = 'Saving…';
  } else if (sync.pending) {
    chip.textContent = 'Saving…';
  } else if (sync.lastSavedAt) {
    chip.textContent = 'Saved ' + sync.lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    chip.title = 'Autosaved to the study database.';
    chip.classList.add('chip-done');
  } else {
    chip.textContent = 'Autosave on';
    chip.classList.add('chip-done');
  }
}

/* Review page: mark the response final. Not a gate — it just records that the
   respondent considers themselves done, so Arda can tell drafts from finished
   answers without chasing anyone. */
async function markFinal() {
  const btn = $('#btn-submit-online');
  state.submitted = true;
  state.submittedAt = new Date().toISOString();

  btn.disabled = true;
  btn.textContent = 'Saving…';
  clearTimeout(sync.timer);
  await flushSave();
  btn.disabled = false;

  if (sync.error) {
    btn.textContent = 'Mark as final';
    alert('That could not be saved:\n\n' + sync.error +
          '\n\nPlease download the JSON file and send it instead.');
  } else {
    btn.textContent = 'Marked as final ✓';
  }
  renderReview();
}

/* --------------------------------------------------------------------------
   INIT
   -------------------------------------------------------------------------- */

function bindRespondentFields() {
  $('#r-name').addEventListener('input', e => {
    state.respondent.name = e.target.value;
    renderNav();
    markDirty();
  });
}

function bindNavButtons() {
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-goto]');
    if (!btn) return;
    const dir = btn.getAttribute('data-goto');
    if (dir === 'next') showPanel(state.currentPanel + 1);
    else if (dir === 'prev') showPanel(state.currentPanel - 1);
  });
}

function init() {
  renderScenarioLegend();
  renderPanels();
  bindRespondentFields();
  bindNavButtons();

  $('#btn-save-draft').addEventListener('click', saveDraft);
  $('#btn-load-draft').addEventListener('click', () => $('#draft-input').click());
  $('#draft-input').addEventListener('change', e => {
    if (e.target.files && e.target.files[0]) loadDraft(e.target.files[0]);
    e.target.value = '';
  });

  $('#btn-export-json').addEventListener('click', () => {
    download(safeName() + '.json', JSON.stringify(collectPayload(), null, 2), 'application/json');
  });
  $('#btn-export-csv').addEventListener('click', () => {
    download(safeName() + '.csv', toCSV(collectPayload()), 'text/csv');
  });
  $('#btn-submit-online').addEventListener('click', markFinal);

  // Cloud sync, if firebase-sync.js loaded. It is a module, so it may finish
  // after this classic script — listen rather than poll.
  window.addEventListener('ltsync-status', e => {
    renderSyncStatus();
    if (e.detail.status === 'ready') restoreFromCloud();
  });
  if (window.LTSync && window.LTSync.status === 'ready') restoreFromCloud();
  renderSyncStatus();

  // Last-chance flush if the tab closes inside the debounce window.
  window.addEventListener('beforeunload', () => {
    if (sync.pending || sync.inFlight) flushSave();
  });

  ALL_SETS.forEach(s => updateSetStatus(s.id));
  showPanel(0);
}

document.addEventListener('DOMContentLoaded', init);
