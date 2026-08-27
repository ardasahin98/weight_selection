/* ==========================================================================
   Logic Tree Weight Elicitation — v2
   --------------------------------------------------------------------------
   The whole questionnaire is generated from the schema below. To add, remove
   or reword a case, a data scenario or a branch, edit the schema only — the
   rendering, validation, progress tracking and export all follow from it.

   v2 changes
     · The fines-content stage is gone from the tree. The tree is now
       Stage 1 Susceptibility → Stage 2 Assessment Type → Stage 3 Cyclic
       Resistance. Fines content moves from a tree stage to a *case condition*
       inside Stage 3.
     · Stage 3 is elicited separately on the two Stage-2 branches. On the
       not-susceptible (cyclic softening) branch only DEA24 and DEA18 apply;
       the CPT and SPT triggering models are excluded outright.
     · Every weight row now carries two columns — homogeneous and
       heterogeneous. The heterogeneous column mirrors the homogeneous one as
       it is typed and stays mirrored until the respondent edits it. The export
       records which heterogeneous weights were inherited and which were
       actually considered.

   Responses autosave to Firestore when firebase-sync.js is present and the
   page is served over http(s). Everything still works without it — the
   download buttons produce the same JSON and CSV either way.
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   CONFIG
   -------------------------------------------------------------------------- */

const CONFIG = {
  version: '2.0',
  study: 'Cyclic resistance logic tree — weight elicitation',
  tolerance: 1e-6,        // how close each column sum must be to 1.000
  returnTo: '',           // optional: email address shown on the review page
  autosaveDelay: 1500     // ms of quiet before a save is sent
};

/* The two stratigraphy columns every weight table carries. */
const COLUMNS = [
  {
    id: 'hom',
    label: 'Homogeneous',
    hint: 'A single, uniform unit — the profile supports one assessment.'
  },
  {
    id: 'het',
    label: 'Heterogeneous',
    hint: 'Interlayered or transitional unit — the models partly disagree ' +
          'because the unit is not one material.'
  }
];

/* --------------------------------------------------------------------------
   APPROACH — how fines content enters the Stage 3 weights
   --------------------------------------------------------------------------
   Two mutually exclusive ways to handle it, chosen by the respondent up front.

     Transition function.  The respondent gives one *base* weight vector. The
     fines-content dependence comes entirely from the transition function,
     which multiplies the penetration-based family by f(FC) and the
     fine-grained family by 1 − f(FC). No fines-content cases are asked,
     because the function is what supplies them.

     Fines-content cases.  No function. The respondent is asked the same
     weight table separately at low, transitional and high fines content, and
     the three answers are used as bins.

   The scope question only bites when a function is in use: applying it to the
   susceptible branch alone leaves the cyclic softening branch to be asked in
   fines-content cases instead.
   -------------------------------------------------------------------------- */

const TRANSITION_FUNCTIONS = [
  { id: 'varun', label: "Varun's fines-content transition function" },
  { id: 'usability', label: 'Dataset usability fines-content function' },
  { id: 'other', label: 'Other — please name it', freeText: true }
];

const SCOPES = [
  {
    id: 'susceptible',
    label: 'Susceptible branch only',
    desc: 'The function supplies the fines-content dependence on the liquefaction branch. ' +
          'The cyclic softening branch is then asked separately at low, transitional and high fines content.'
  },
  {
    id: 'both',
    label: 'Both branches',
    desc: 'The function supplies the fines-content dependence on both branches. Note that the ' +
          'cyclic softening branch carries no penetration-based models, so there the function ' +
          'shifts weight between DEA24 and DEA18 rather than between families.'
  }
];

/* --------------------------------------------------------------------------
   STAGE 1 — SUSCEPTIBILITY (S-CBT models)
   -------------------------------------------------------------------------- */

const SUSC_BRANCHES = {
  cbt_median: {
    label: 'This study (S-CBT), median',
    desc: 'Central estimate of the susceptibility–cyclic behaviour type model developed in this study.'
  },
  cbt_plus1: {
    label: 'This study (S-CBT), +1σ',
    desc: 'One standard deviation above the median — more soils classified as susceptible.'
  },
  cbt_minus1: {
    label: 'This study (S-CBT), −1σ',
    desc: 'One standard deviation below the median — fewer soils classified as susceptible.'
  },
  maurer: {
    label: 'Maurer et al.',
    desc: 'Penetration-based susceptibility criterion.',
    requires: ['cpt']
  },
  bi06_det: {
    label: 'B&I06, deterministic',
    desc: 'Boulanger & Idriss (2006) plasticity-index criterion, deterministic form.',
    requires: ['atterberg']
  },
  bs06_det: {
    label: 'B&S06, deterministic',
    desc: 'Bray & Sancio (2006) criterion on PI and wc/LL, deterministic form.',
    requires: ['atterberg']
  },
  bi06_huang: {
    label: 'B&I06, Huang recalibration',
    desc: 'Boulanger & Idriss (2006) criterion in the probabilistic form recalibrated by Huang.',
    requires: ['atterberg']
  },
  bs06_huang: {
    label: 'B&S06, Huang recalibration',
    desc: 'Bray & Sancio (2006) criterion in the probabilistic form recalibrated by Huang.',
    requires: ['atterberg']
  },
  susc_cyclic_lab: {
    label: 'Site-specific cyclic laboratory tests',
    desc: 'Cyclic testing on high-quality samples used directly to judge susceptibility.',
    requires: ['cyclic']
  }
};

const SUSC_SCENARIOS = [
  {
    id: 'D1',
    name: 'CPT only',
    desc: 'A CPT profile and nothing else. No samples, so no index properties.',
    tags: ['cpt']
  },
  {
    id: 'D2',
    name: 'Atterberg limits only',
    desc: 'Index testing on recovered samples — PI, LL, water content. No CPT profile.',
    tags: ['atterberg']
  },
  {
    id: 'D3',
    name: 'CPT + Atterberg limits',
    desc: 'Both a CPT profile and index testing on samples from the same unit.',
    tags: ['cpt', 'atterberg']
  },
  {
    id: 'D4',
    name: 'CPT + Atterberg limits + cyclic laboratory tests',
    desc: 'Full programme, including site-specific cyclic testing on high-quality samples.',
    tags: ['cpt', 'atterberg', 'cyclic']
  }
];

/* --------------------------------------------------------------------------
   STAGE 3 — CYCLIC RESISTANCE
   -------------------------------------------------------------------------- */

const CR_BRANCHES = {
  bi16: {
    label: 'B&I — CPT-based triggering',
    desc: 'Boulanger & Idriss CPT triggering correlation.',
    requires: ['cpt']
  },
  mea06: {
    label: 'MEA06 — CPT-based triggering',
    desc: 'Moss et al. (2006) CPT triggering correlation.',
    requires: ['cpt']
  },
  bi12: {
    label: 'B&I12 — SPT-based triggering',
    desc: 'Boulanger & Idriss (2012) SPT triggering correlation.',
    requires: ['spt']
  },
  cea18: {
    label: 'CEA18 — SPT-based triggering',
    desc: 'Cetin et al. (2018) SPT triggering correlation.',
    requires: ['spt']
  },
  dea24: {
    label: 'DEA24 — laboratory-based model for fine-grained soils',
    desc: 'Cyclic resistance of fine-grained soils from plasticity and stress history.'
  },
  dea18: {
    label: 'DEA18 — cyclic softening model',
    desc: 'Strength-based cyclic softening procedure.'
  },
  cr_cyclic_lab: {
    label: 'Site-specific cyclic laboratory tests',
    desc: 'Cyclic testing on high-quality samples used directly to characterise cyclic resistance.',
    requires: ['cyclic']
  }
};

/* Fines-content cases. These are conditions on the soil unit, not tree stages. */
const FC_CASES = [
  {
    id: 'Flow',
    name: 'Low fines content',
    short: 'Low FC',
    desc: 'FC < 25% — coarse-grained dominated behaviour.'
  },
  {
    id: 'Fmid',
    name: 'Transitional fines content',
    short: 'Transitional FC',
    desc: 'FC between 25% and 40% — neither behaviour clearly dominates.'
  },
  {
    id: 'Fhigh',
    name: 'High fines content',
    short: 'High FC',
    desc: 'FC > 40% — fine-grained dominated behaviour.'
  }
];

/* Susceptible branch (liquefaction assessment, P[S]). The full data grid:
   which penetration data are available drives which triggering models appear,
   and the advanced-laboratory scenarios ask the same rows again on purpose —
   the question is whether su and OCR shift weight toward the lab-based
   models, not whether different models become available. */
const CR_SCENARIOS = [
  { id: 'E1', name: 'CPT only',                        tags: ['cpt'] },
  { id: 'E2', name: 'SPT only',                        tags: ['spt'] },
  { id: 'E3', name: 'CPT + SPT',                       tags: ['cpt', 'spt'] },
  { id: 'E4', name: 'CPT + advanced laboratory tests', tags: ['cpt', 'lab'] },
  { id: 'E5', name: 'SPT + advanced laboratory tests', tags: ['spt', 'lab'] },
  { id: 'E6', name: 'CPT + SPT + advanced laboratory tests', tags: ['cpt', 'spt', 'lab'] }
];

/* Not-susceptible branch (cyclic softening, 1 − P[S]). No triggering model
   applies here, so CPT-versus-SPT availability is irrelevant and the grid
   collapses to one "field data" option plus the laboratory dimensions. */
const CS_SCENARIOS = [
  {
    id: 'G1',
    name: 'Field data only',
    desc: 'A penetration profile — CPT, SPT or both — with index properties. No advanced laboratory testing.',
    tags: ['field']
  },
  {
    id: 'G2',
    name: 'Field data + advanced laboratory tests',
    desc: 'Adds consolidation and monotonic strength testing (sᵤ, OCR, state characterisation).',
    tags: ['field', 'lab']
  },
  {
    id: 'G3',
    name: 'Field data + cyclic laboratory tests',
    desc: 'Adds site-specific cyclic testing on high-quality samples, without advanced monotonic testing.',
    tags: ['field', 'cyclic']
  },
  {
    id: 'G4',
    name: 'Field data + advanced + cyclic laboratory tests',
    desc: 'Full programme — monotonic strength testing and site-specific cyclic testing.',
    tags: ['field', 'lab', 'cyclic']
  }
];

/* Branch pools per Stage-2 branch. */
const SUSCEPTIBLE_POOL     = ['bi16', 'mea06', 'bi12', 'cea18', 'dea24', 'dea18', 'cr_cyclic_lab'];
const NOT_SUSCEPTIBLE_POOL = ['dea24', 'dea18', 'cr_cyclic_lab'];

/* The not-susceptible branch is asked for all three fines-content cases. */
const CS_FC_CASES = ['Flow', 'Fmid', 'Fhigh'];

const SUSC_DESC =
  'The soil unit has been judged susceptible at Stage 2, so the liquefaction ' +
  'assessment branch, P[S], is followed.';
const NOTSUSC_DESC =
  'The soil unit has been judged not susceptible at Stage 2, so the cyclic ' +
  'softening branch, 1 − P[S], is followed. Penetration-based triggering ' +
  'correlations do not apply on this branch.';

/* --------------------------------------------------------------------------
   BUILD THE FLAT LIST OF PANELS AND WEIGHT SETS
   -------------------------------------------------------------------------- */

function availableIn(branch, scenario) {
  if (!branch.requires) return true;
  return branch.requires.every(tag => scenario.tags.indexOf(tag) !== -1);
}

function branchList(pool, defs, scenario) {
  return pool
    .filter(id => availableIn(defs[id], scenario))
    .map(id => ({ id: id, label: defs[id].label, desc: defs[id].desc }));
}

/* Expand the six base cyclic-resistance scenarios into twelve, by repeating
   each one with site-specific cyclic testing added. */
function expandCyclic(scenarios) {
  const out = [];
  scenarios.forEach(sc => {
    out.push({
      id: sc.id,
      name: sc.name,
      desc: describeScenario(sc, false),
      tags: sc.tags.slice()
    });
  });
  scenarios.forEach(sc => {
    out.push({
      id: sc.id + 'c',
      name: sc.name + ' + cyclic laboratory tests',
      desc: describeScenario(sc, true),
      tags: sc.tags.concat(['cyclic'])
    });
  });
  return out;
}

function describeScenario(sc, withCyclic) {
  const bits = [];
  if (sc.tags.indexOf('cpt') !== -1 && sc.tags.indexOf('spt') !== -1) {
    bits.push('Both CPT and SPT profiles are available for the unit.');
  } else if (sc.tags.indexOf('cpt') !== -1) {
    bits.push('A CPT profile is available; no SPT data for this unit.');
  } else if (sc.tags.indexOf('spt') !== -1) {
    bits.push('SPT data are available; no CPT profile for this unit.');
  }
  if (sc.tags.indexOf('lab') !== -1) {
    bits.push('Consolidation and monotonic strength testing (sᵤ, OCR) have been carried out.');
  } else {
    bits.push('Index properties are known, but there is no advanced monotonic laboratory testing.');
  }
  if (withCyclic) {
    bits.push('Site-specific cyclic testing on high-quality samples is also available.');
  }
  return bits.join(' ');
}

/* Which Stage-3 branches get split into fines-content cases, given the
   respondent's choice. With a transition function in play the function itself
   supplies the fines-content dependence, so no cases are asked on that branch. */
function splitPlan(approach) {
  if (!approach || approach.useTransition === null) return null;
  if (approach.useTransition) {
    return { susceptible: false, notSusceptible: approach.scope !== 'both' };
  }
  // No function: fines-content cases on the susceptible branch only.
  return { susceptible: true, notSusceptible: false };
}

function transitionLabel(approach) {
  if (!approach || !approach.useTransition) return '';
  const fn = TRANSITION_FUNCTIONS.find(f => f.id === approach.transitionFn);
  if (!fn) return 'a fines-content transition function';
  if (fn.freeText) return approach.transitionOther.trim() || 'a fines-content transition function';
  return fn.label;
}

/* The note that tells the respondent what the numbers in front of them mean —
   base weights that a function will scale, or weights for one fines-content
   case. Getting this wrong is the difference between a usable answer and an
   unusable one, so it sits at the top of every Stage-3 panel. */
function stage3Note(usesFunction, approach) {
  if (usesFunction) {
    return 'These are <strong>base weights</strong>. ' + transitionLabel(approach) +
      ' supplies the fines-content dependence on top of them, so answer without a ' +
      'particular fines content in mind — weight the methods relative to one another ' +
      'and let the function do the rest. A weight of 0 is a valid answer.';
  }
  return 'Answer for <strong>this fines-content case only</strong>. A weight of 0 is a valid ' +
    'answer — it means you would not use that method at all with the data listed.';
}

const COLUMN_NOTE =
  ' Fill both columns: the heterogeneous column starts as a copy of the homogeneous one, ' +
  'so change it only where your judgment would actually differ.';

function makeStage3Panel(opts) {
  const { fc, scenarios, letter, pool, defs, keyPrefix, navGroup, branchName,
          branchDesc, approach, usesFunction } = opts;
  const key = keyPrefix + (fc ? fc.id : 'ALL');
  const title = fc ? fc.name + ' — ' + branchName : 'Cyclic resistance — ' + branchName;

  return {
    key: key,
    navGroup: navGroup,
    navLabel: letter + '. ' + (fc ? fc.short : 'Base weights'),
    eyebrow: 'Section ' + letter + ' · Stage 3 · ' + navGroup.replace('Stage 3 — ', ''),
    title: title,
    intro: (fc ? fc.desc + ' ' : '') + branchDesc +
           (usesFunction
             ? ' Fines content is handled by the transition function you chose, so it is not asked here.'
             : ''),
    note: stage3Note(usesFunction, approach) + COLUMN_NOTE,
    sets: scenarios.map((sc, i, arr) => ({
      id: key + '.' + sc.id,
      section: 'Section ' + letter + ' — ' + title,
      caseName: title,
      fc: fc ? fc.id : 'base',
      assessment: keyPrefix === 'S-' ? 'liquefaction' : 'cyclic softening',
      scenarioName: sc.name,
      title: sc.name,
      index: i + 1,
      count: arr.length,
      kicker: 'Data scenario',
      desc: sc.desc,
      branches: branchList(pool, defs, sc)
    }))
  };
}

function buildSchema(approach) {
  const panels = [];

  /* ---- Section A — Stage 1 susceptibility. Independent of fines content,
     so it is asked the same way whatever the respondent chose. ---- */
  panels.push({
    key: 'A',
    navGroup: 'Stage 1',
    navLabel: 'A. Susceptibility',
    eyebrow: 'Section A · Stage 1',
    title: 'Susceptibility — S-CBT model weights',
    intro:
      'At Stage 1 the susceptibility of the unit is assessed with the S-CBT models. Assign the ' +
      'weight you would give to each model result under each data scenario below.',
    note:
      'These weights describe how much confidence you place in each model, <strong>not</strong> how ' +
      'likely the soil is to be susceptible — that comes from the model output itself.' + COLUMN_NOTE,
    sets: SUSC_SCENARIOS.map((sc, i, arr) => ({
      id: 'A.' + sc.id,
      section: 'A. Susceptibility (Stage 1)',
      caseName: 'Susceptibility — S-CBT models',
      scenarioName: sc.name,
      title: sc.name,
      index: i + 1,
      count: arr.length,
      kicker: 'Data scenario',
      desc: sc.desc,
      branches: branchList(Object.keys(SUSC_BRANCHES), SUSC_BRANCHES, sc)
    }))
  });

  const plan = splitPlan(approach);
  if (!plan) return panels;   // approach not chosen yet — Stage 3 is not built

  const crScenarios = expandCyclic(CR_SCENARIOS);
  const letters = ['B', 'C', 'D', 'E', 'F', 'G', 'H'];
  let li = 0;
  const nextLetter = () => letters[li++] || '·';

  const suscCases = plan.susceptible ? FC_CASES : [null];
  suscCases.forEach(fc => {
    panels.push(makeStage3Panel({
      fc: fc, scenarios: crScenarios, letter: nextLetter(),
      pool: SUSCEPTIBLE_POOL, defs: CR_BRANCHES, keyPrefix: 'S-',
      navGroup: 'Stage 3 — Liquefaction',
      branchName: 'susceptible', branchDesc: SUSC_DESC,
      approach: approach, usesFunction: !plan.susceptible
    }));
  });

  const csCases = plan.notSusceptible ? FC_CASES : [null];
  csCases.forEach(fc => {
    panels.push(makeStage3Panel({
      fc: fc, scenarios: CS_SCENARIOS, letter: nextLetter(),
      pool: NOT_SUSCEPTIBLE_POOL, defs: CR_BRANCHES, keyPrefix: 'N-',
      navGroup: 'Stage 3 — Cyclic softening',
      branchName: 'not susceptible', branchDesc: NOTSUSC_DESC,
      approach: approach,
      usesFunction: approach.useTransition && !plan.notSusceptible
    }));
  });

  return panels;
}

/* --------------------------------------------------------------------------
   STATE
   -------------------------------------------------------------------------- */

const state = {
  respondent: { name: '', email: '' },
  /* How fines content is handled at Stage 3. useTransition stays null until
     the respondent answers, and the Stage-3 panels are not built before then —
     the two approaches ask genuinely different questions, so guessing a
     default would put the wrong question in front of them. */
  approach: {
    useTransition: null,      // true | false | null
    transitionFn: '',         // id from TRANSITION_FUNCTIONS
    transitionOther: '',      // free text when transitionFn === 'other'
    scope: 'susceptible'      // 'susceptible' | 'both'
  },
  answers: {},          // setId -> { weights: {branchId: {hom, het, hetEdited}}, comment }
  startedAt: new Date().toISOString(),
  currentPanel: 0,
  submitted: false,
  submittedAt: null
};

const sync = {
  timer: null,
  inFlight: false,
  pending: false,
  lastSavedAt: null,
  restoring: false,
  error: null
};

let PANELS = buildSchema(state.approach);
let ALL_SETS = PANELS.reduce((acc, p) => acc.concat(p.sets), []);

/* Answer slots are created, never destroyed. Switching approach swaps which
   sets are on screen; anything already typed under the other approach stays in
   state and comes back if the respondent switches back. */
function ensureAnswerSlots() {
  ALL_SETS.forEach(s => {
    if (!state.answers[s.id]) state.answers[s.id] = { weights: {}, comment: '' };
    s.branches.forEach(b => {
      if (!state.answers[s.id].weights[b.id]) {
        state.answers[s.id].weights[b.id] = { hom: '', het: '', hetEdited: false };
      }
    });
  });
}
ensureAnswerSlots();

/* Rebuild the Stage-3 panels after the approach changes. */
function rebuildSchema() {
  PANELS = buildSchema(state.approach);
  ALL_SETS = PANELS.reduce((acc, p) => acc.concat(p.sets), []);
  ensureAnswerSlots();

  const host = document.getElementById('generated');
  host.innerHTML = '';
  renderPanels();
  restoreInputsFromState();

  const order = panelOrder();
  if (state.currentPanel > order.length - 1) state.currentPanel = order.length - 1;
  showPanel(state.currentPanel);
}

/* Push state back into freshly rendered inputs. */
function restoreInputsFromState() {
  ALL_SETS.forEach(set => {
    set.branches.forEach(b => {
      const cell = state.answers[set.id].weights[b.id];
      writeCell(set.id, b.id, 'hom', cell.hom);
      writeCell(set.id, b.id, 'het', cell.het);
      paintCell(set.id, b.id);
    });
    const ta = document.getElementById('comment-' + set.id);
    if (ta) ta.value = state.answers[set.id].comment || '';
    updateSetStatus(set.id);
  });
}

/* --------------------------------------------------------------------------
   DOM HELPERS
   -------------------------------------------------------------------------- */

const $ = sel => document.querySelector(sel);

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
   RENDER — intro legend
   -------------------------------------------------------------------------- */

function renderScenarioLegend() {
  const ol = $('#scenario-legend');
  if (!ol) return;
  const rows = [
    ['Stage 1 — susceptibility', SUSC_SCENARIOS.map(s => s.name).join(' · ')],
    ['Stage 3 — liquefaction branch',
      CR_SCENARIOS.map(s => s.name).join(' · ') +
      ' — each also asked with site-specific cyclic laboratory tests added'],
    ['Stage 3 — cyclic softening branch', CS_SCENARIOS.map(s => s.name).join(' · ')]
  ];
  rows.forEach(r => {
    ol.appendChild(el('li', {}, [
      el('span', { class: 'sc-name', text: r[0] }),
      el('span', { class: 'sc-desc', text: ' — ' + r[1] })
    ]));
  });
}

function renderColumnLegend() {
  const box = $('#column-legend');
  if (!box) return;
  COLUMNS.forEach(c => {
    box.appendChild(el('div', { class: 'col-legend-item' }, [
      el('div', { class: 'col-legend-name', text: c.label }),
      el('div', { class: 'col-legend-desc', text: c.hint })
    ]));
  });
}

/* --------------------------------------------------------------------------
   RENDER — the approach question
   --------------------------------------------------------------------------
   This is the first thing the respondent answers, and it decides what the rest
   of the questionnaire asks. Changing it later is allowed and rebuilds the
   Stage-3 sections in place; nothing already typed is thrown away.
   -------------------------------------------------------------------------- */

function radio(name, checked, label, desc, onPick) {
  const input = el('input', { type: 'radio', name: name });
  input.checked = !!checked;
  input.addEventListener('change', () => { if (input.checked) onPick(); });
  return el('label', { class: 'opt' + (checked ? ' is-picked' : '') }, [
    input,
    el('span', {}, [
      el('span', { class: 'opt-label', text: label }),
      desc ? el('span', { class: 'opt-desc', text: desc }) : null
    ])
  ]);
}

function renderApproachControls() {
  const box = $('#approach-box');
  if (!box) return;
  box.innerHTML = '';
  const a = state.approach;

  const pick = (patch) => {
    Object.assign(a, patch);
    renderApproachControls();
    rebuildSchema();
    updateBeginGate();
    markDirty();
  };

  /* Q1 — function or fines-content cases */
  box.appendChild(el('div', { class: 'qblock' }, [
    el('div', { class: 'qtitle', text: 'Would you like to use a fines-content transition function?' }),
    el('p', { class: 'qhelp', text:
      'With a transition function you give one set of base weights and the function supplies the ' +
      'fines-content dependence. Without one, you are asked the same weights separately at low, ' +
      'transitional and high fines content.' }),
    el('div', { class: 'opts' }, [
      radio('use-transition', a.useTransition === true,
        'Yes — use a transition function',
        'One set of base weights per data scenario; the function handles fines content.',
        () => pick({ useTransition: true })),
      radio('use-transition', a.useTransition === false,
        'No — ask me for each fines-content case',
        'Weights asked separately at low, transitional and high fines content.',
        () => pick({ useTransition: false }))
    ])
  ]));

  if (a.useTransition !== true) return;

  /* Q2 — which function */
  const fnOpts = el('div', { class: 'opts' });
  TRANSITION_FUNCTIONS.forEach(fn => {
    fnOpts.appendChild(radio('transition-fn', a.transitionFn === fn.id, fn.label, null,
      () => pick({ transitionFn: fn.id })));
  });
  const fnBlock = el('div', { class: 'qblock' }, [
    el('div', { class: 'qtitle', text: 'Which transition function?' }),
    fnOpts
  ]);
  if (a.transitionFn === 'other') {
    const t = el('input', {
      type: 'text', id: 'transition-other', class: 'opt-text',
      placeholder: 'Name the function you would use', value: a.transitionOther
    });
    /* Free text must not rebuild the schema on every keystroke — it only
       changes wording, so update state and repaint the notes lazily. */
    t.addEventListener('input', e => {
      a.transitionOther = e.target.value;
      markDirty();
    });
    t.addEventListener('change', () => { rebuildSchema(); });
    fnBlock.appendChild(t);
  }
  box.appendChild(fnBlock);

  /* Q3 — scope */
  const scopeOpts = el('div', { class: 'opts' });
  SCOPES.forEach(sc => {
    scopeOpts.appendChild(radio('transition-scope', a.scope === sc.id, sc.label, sc.desc,
      () => pick({ scope: sc.id })));
  });
  box.appendChild(el('div', { class: 'qblock' }, [
    el('div', { class: 'qtitle', text: 'Where should the transition function apply?' }),
    scopeOpts
  ]));
}

/* The questionnaire cannot start before the approach is chosen, because the
   two approaches ask different questions. */
function updateBeginGate() {
  const btn = $('#btn-begin');
  const hint = $('#begin-hint');
  if (!btn) return;
  const ready = state.approach.useTransition !== null;
  btn.disabled = !ready;
  if (hint) hint.hidden = ready;
}

/* --------------------------------------------------------------------------
   RENDER — weight panels
   -------------------------------------------------------------------------- */

function renderPanels() {
  const host = $('#generated');

  PANELS.forEach(panel => {
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

  const table = el('table', { class: 'wtable wtable-2col' });
  table.appendChild(el('thead', {}, [
    el('tr', {}, [
      el('th', { text: 'Assessment method' }),
      el('th', { class: 'num', text: COLUMNS[0].label }),
      el('th', { class: 'num', text: COLUMNS[1].label })
    ])
  ]));

  const tbody = el('tbody');
  set.branches.forEach(b => {
    const cells = COLUMNS.map(col => {
      const input = el('input', {
        type: 'number', class: 'w-input w-' + col.id, min: '0', max: '1', step: '0.05',
        'data-set': set.id, 'data-branch': b.id, 'data-col': col.id,
        'aria-label': b.label + ' — ' + col.label + ' weight'
      });
      input.addEventListener('input', onWeightInput);
      const cell = el('td', { class: 'num' }, [input]);
      if (col.id === 'het') {
        cell.appendChild(el('span', {
          class: 'mirror-flag', id: 'mirror-' + set.id + '-' + b.id,
          title: 'Copied from the homogeneous column', text: 'copied'
        }));
      }
      return cell;
    });

    tbody.appendChild(el('tr', {}, [
      el('td', {}, [
        el('div', { class: 'branch-label', text: b.label }),
        b.desc ? el('div', { class: 'branch-desc', text: b.desc }) : null
      ])
    ].concat(cells)));
  });
  table.appendChild(tbody);
  wrap.appendChild(table);

  /* One total bar per column. */
  const totals = el('div', { class: 'wtotals' });
  COLUMNS.forEach(col => {
    const tools = [
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: 'Equal',
        onclick: () => fillEqual(set.id, col.id)
      }),
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: 'Normalise',
        onclick: () => normalise(set.id, col.id)
      }),
      el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: 'Clear',
        onclick: () => clearSet(set.id, col.id)
      })
    ];
    if (col.id === 'het') {
      tools.push(el('button', {
        type: 'button', class: 'btn btn-ghost btn-sm', text: 'Mirror homogeneous',
        onclick: () => remirror(set.id)
      }));
    }

    totals.appendChild(el('div', { class: 'wtotal is-empty', id: 'total-' + set.id + '-' + col.id }, [
      el('span', { class: 'wtotal-col', text: col.label }),
      el('div', { class: 'wtotal-tools' }, tools),
      el('span', { class: 'wtotal-msg', id: 'msg-' + set.id + '-' + col.id, text: 'No weights entered yet' }),
      el('span', { class: 'wtotal-label', text: 'Sum' }),
      el('span', { class: 'wtotal-value', id: 'val-' + set.id + '-' + col.id, text: '—' })
    ]));
  });
  wrap.appendChild(totals);

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

/* Typing in the homogeneous column drags the heterogeneous one along with it,
   until the respondent touches the heterogeneous cell. From then on that cell
   is theirs and is never overwritten silently — "Mirror homogeneous" is the
   only way back, and it is an explicit button press. */
function onWeightInput(e) {
  const setId = e.target.getAttribute('data-set');
  const branchId = e.target.getAttribute('data-branch');
  const col = e.target.getAttribute('data-col');
  const cell = state.answers[setId].weights[branchId];

  if (col === 'hom') {
    cell.hom = e.target.value;
    if (!cell.hetEdited) writeCell(setId, branchId, 'het', e.target.value);
  } else {
    cell.het = e.target.value;
    cell.hetEdited = true;
  }

  paintCell(setId, branchId);
  updateSetStatus(setId);
  markDirty();
}

function setOf(setId) { return ALL_SETS.find(s => s.id === setId); }

function cellOf(setId, branchId) { return state.answers[setId].weights[branchId]; }

function sumOf(setId, col) {
  const w = state.answers[setId].weights;
  return Object.keys(w).reduce((t, k) => t + (parseFloat(w[k][col]) || 0), 0);
}

function filledCount(setId, col) {
  const w = state.answers[setId].weights;
  return Object.keys(w).filter(k => w[k][col] !== '' && w[k][col] !== null).length;
}

function colStatus(setId, col) {
  const set = setOf(setId);
  const filled = filledCount(setId, col);
  if (filled === 0) return 'empty';
  if (filled < set.branches.length) return 'partial';
  return Math.abs(sumOf(setId, col) - 1) <= CONFIG.tolerance ? 'complete' : 'off';
}

/* A set counts as done only when both columns are done. */
function setStatus(setId) {
  const s = COLUMNS.map(c => colStatus(setId, c.id));
  if (s.every(x => x === 'empty')) return 'empty';
  if (s.every(x => x === 'complete')) return 'complete';
  return 'partial';
}

function writeCell(setId, branchId, col, value) {
  state.answers[setId].weights[branchId][col] = value;
  const input = document.querySelector(
    '.w-input[data-set="' + setId + '"][data-branch="' + branchId + '"][data-col="' + col + '"]'
  );
  if (input) input.value = value;
}

function paintCell(setId, branchId) {
  const cell = cellOf(setId, branchId);
  COLUMNS.forEach(col => {
    const input = document.querySelector(
      '.w-input[data-set="' + setId + '"][data-branch="' + branchId + '"][data-col="' + col.id + '"]'
    );
    if (input) input.classList.toggle('is-zero', parseFloat(cell[col.id]) === 0);
  });
  const flag = document.getElementById('mirror-' + setId + '-' + branchId);
  if (flag) flag.hidden = cell.hetEdited || cell.het === '';
}

function updateSetStatus(setId) {
  COLUMNS.forEach(col => {
    const box = document.getElementById('total-' + setId + '-' + col.id);
    const val = document.getElementById('val-' + setId + '-' + col.id);
    const msg = document.getElementById('msg-' + setId + '-' + col.id);
    if (!box) return;

    const status = colStatus(setId, col.id);
    const sum = sumOf(setId, col.id);
    box.classList.remove('is-ok', 'is-off', 'is-empty');

    if (status === 'empty') {
      box.classList.add('is-empty');
      val.textContent = '—';
      msg.textContent = 'No weights entered yet';
      return;
    }

    val.textContent = sum.toFixed(3);

    if (status === 'complete') {
      box.classList.add('is-ok');
      msg.textContent = 'Sums to 1.000';
      return;
    }

    box.classList.add('is-off');
    const missing = setOf(setId).branches.length - filledCount(setId, col.id);
    if (status === 'partial' && Math.abs(sum - 1) <= CONFIG.tolerance) {
      msg.textContent = missing + ' row' + (missing === 1 ? '' : 's') +
        ' still blank — enter 0 if you would not use it';
    } else if (status === 'partial') {
      msg.textContent = missing + ' row' + (missing === 1 ? '' : 's') + ' blank; ' +
        (sum > 1 ? 'over' : 'under') + ' by ' + Math.abs(sum - 1).toFixed(3);
    } else {
      msg.textContent = (sum > 1 ? 'Over' : 'Under') + ' by ' + Math.abs(sum - 1).toFixed(3);
    }
  });
}

/* The column tools. Each acts on one column only; using them on the
   homogeneous column drags any still-mirrored heterogeneous cells with it,
   exactly as typing does. */
function applyToColumn(setId, col, values) {
  setOf(setId).branches.forEach((b, i) => {
    const v = values[i];
    writeCell(setId, b.id, col, v);
    const cell = cellOf(setId, b.id);
    if (col === 'hom' && !cell.hetEdited) writeCell(setId, b.id, 'het', v);
    if (col === 'het') cell.hetEdited = (v !== '');
    paintCell(setId, b.id);
  });
  updateSetStatus(setId);
  markDirty();
}

function fillEqual(setId, col) {
  const branches = setOf(setId).branches;
  const n = branches.length;
  const base = Math.floor((1 / n) * 1000) / 1000;
  const remainder = Math.round((1 - base * n) * 1000) / 1000;
  const values = branches.map((b, i) =>
    (i === 0 ? Math.round((base + remainder) * 1000) / 1000 : base).toFixed(3));
  applyToColumn(setId, col, values);
}

function normalise(setId, col) {
  const total = sumOf(setId, col);
  if (total <= 0) return;
  const branches = setOf(setId).branches;
  const rounded = branches.map(b =>
    Math.round(((parseFloat(cellOf(setId, b.id)[col]) || 0) / total) * 1000) / 1000);
  const drift = Math.round((1 - rounded.reduce((a, b) => a + b, 0)) * 1000) / 1000;
  let maxIdx = 0;
  rounded.forEach((v, i) => { if (v > rounded[maxIdx]) maxIdx = i; });
  rounded[maxIdx] = Math.round((rounded[maxIdx] + drift) * 1000) / 1000;
  applyToColumn(setId, col, rounded.map(v => v.toFixed(3)));
}

function clearSet(setId, col) {
  applyToColumn(setId, col, setOf(setId).branches.map(() => ''));
}

/* Put the heterogeneous column back under the homogeneous column's control. */
function remirror(setId) {
  setOf(setId).branches.forEach(b => {
    const cell = cellOf(setId, b.id);
    cell.hetEdited = false;
    writeCell(setId, b.id, 'het', cell.hom);
    paintCell(setId, b.id);
  });
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

  const addItem = (label, index, statusCls) => {
    const btn = el('button', {
      type: 'button',
      class: 'nav-item ' + (statusCls || ''),
      onclick: () => showPanel(index)
    });
    if (index === state.currentPanel) btn.classList.add('is-current');
    btn.appendChild(el('span', { class: 'nav-dot' }));
    btn.appendChild(el('span', { text: label }));
    list.appendChild(el('li', {}, [btn]));
  };

  const addGroup = label =>
    list.appendChild(el('li', {}, [el('div', { class: 'nav-item is-group', text: label })]));

  addItem('Introduction', 0, state.respondent.name ? 'is-done' : '');

  let lastGroup = null;
  PANELS.forEach((p, i) => {
    if (p.navGroup !== lastGroup) { addGroup(p.navGroup); lastGroup = p.navGroup; }
    const statuses = p.sets.map(s => setStatus(s.id));
    const allDone = statuses.every(s => s === 'complete');
    const anyStarted = statuses.some(s => s !== 'empty');
    addItem(p.navLabel, i + 1, allDone ? 'is-done' : (anyStarted ? 'is-partial' : ''));
  });

  addGroup('Finish');
  addItem('Review and submit', order.length - 1, '');
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
      : 'All ' + ALL_SETS.length + ' weight sets are complete and both columns sum to 1.000.'
  }));
  status.appendChild(banner);

  const table = el('table', { class: 'review-table' });
  table.appendChild(el('thead', {}, [
    el('tr', {}, [
      el('th', { text: 'Assessment method' }),
      el('th', { class: 'num', text: 'Homogeneous' }),
      el('th', { class: 'num', text: 'Heterogeneous' })
    ])
  ]));
  const tbody = el('tbody');

  PANELS.forEach(panel => {
    panel.sets.forEach(set => {
      const st = setStatus(set.id);
      tbody.appendChild(el('tr', { class: 'review-group' }, [
        el('td', { colspan: '3' }, [
          el('span', { text: panel.navLabel + ' — ' + set.title }),
          st !== 'complete'
            ? el('span', { class: 'review-flag', text: '   ▲ ' + (st === 'empty' ? 'not started' : 'incomplete') })
            : null
        ])
      ]));

      set.branches.forEach(b => {
        const cell = cellOf(set.id, b.id);
        const fmt = v => (v === '' || v === null ? '—' : (parseFloat(v) || 0).toFixed(3));
        tbody.appendChild(el('tr', {}, [
          el('td', { text: b.label }),
          el('td', { class: 'num', text: fmt(cell.hom) }),
          el('td', { class: 'num' + (cell.hetEdited ? '' : ' is-inherited'), text: fmt(cell.het) })
        ]));
      });

      if (state.answers[set.id].comment) {
        tbody.appendChild(el('tr', {}, [
          el('td', { colspan: '3' }, [
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

function num(v) { return (v === '' || v === null || v === undefined) ? null : Number(v); }

function collectPayload() {
  return {
    schemaVersion: CONFIG.version,
    study: CONFIG.study,
    respondent: Object.assign({}, state.respondent),
    approach: Object.assign({}, state.approach),
    startedAt: state.startedAt,
    completedAt: new Date().toISOString(),
    complete: ALL_SETS.every(s => setStatus(s.id) === 'complete'),
    submitted: state.submitted,
    submittedAt: state.submittedAt,
    /* Everything typed, under either approach, keyed by set id. `responses`
       below is the active approach only — this is what lets someone switch
       approach and switch back without losing work. */
    answersRaw: state.answers,
    responses: ALL_SETS.map(set => ({
      setId: set.id,
      section: set.section,
      case: set.caseName,
      fc: set.fc || '',
      assessment: set.assessment || 'susceptibility',
      scenario: set.scenarioName,
      status: setStatus(set.id),
      sumHomogeneous: Number(sumOf(set.id, 'hom').toFixed(6)),
      sumHeterogeneous: Number(sumOf(set.id, 'het').toFixed(6)),
      comment: state.answers[set.id].comment,
      weights: set.branches.map(b => {
        const cell = cellOf(set.id, b.id);
        return {
          branchId: b.id,
          branch: b.label,
          homogeneous: num(cell.hom),
          heterogeneous: num(cell.het),
          heterogeneousInherited: !cell.hetEdited
        };
      })
    }))
  };
}

/* Long format — one row per respondent × set × branch × stratigraphy column,
   which is what you want for pivoting or reading into R/pandas. */
function toCSV(payload) {
  const esc = v => {
    const s = (v === null || v === undefined) ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = [[
    'respondent_name', 'respondent_email',
    'uses_transition_function', 'transition_function', 'transition_scope',
    'set_id', 'section', 'case', 'fines_content', 'assessment', 'scenario',
    'branch_id', 'branch', 'stratigraphy', 'weight', 'inherited',
    'set_sum', 'set_status', 'comment', 'completed_at'
  ]];
  const r = payload.respondent;
  const ap = payload.approach || {};
  const apCols = [
    ap.useTransition === true ? 'yes' : (ap.useTransition === false ? 'no' : ''),
    ap.useTransition ? (ap.transitionFn === 'other' ? ap.transitionOther : ap.transitionFn) : '',
    ap.useTransition ? ap.scope : ''
  ];
  payload.responses.forEach(res => {
    res.weights.forEach(w => {
      rows.push([r.name, r.email || ''].concat(apCols, [
        res.setId, res.section, res.case, res.fc, res.assessment, res.scenario,
        w.branchId, w.branch, 'homogeneous', w.homogeneous === null ? '' : w.homogeneous, 'no',
        res.sumHomogeneous, res.status, res.comment, payload.completedAt
      ]));
      rows.push([r.name, r.email || ''].concat(apCols, [
        res.setId, res.section, res.case, res.fc, res.assessment, res.scenario,
        w.branchId, w.branch, 'heterogeneous', w.heterogeneous === null ? '' : w.heterogeneous,
        w.heterogeneousInherited ? 'yes' : 'no',
        res.sumHeterogeneous, res.status, res.comment, payload.completedAt
      ]));
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
   CLOUD SYNC
   -------------------------------------------------------------------------- */

function renderGate() {
  const gate = $('#gate');
  const layout = $('#layout');
  const btn = $('#btn-signin');
  const label = $('#signin-label');
  const errBox = $('#gate-error');
  const s = window.LTSync ? window.LTSync.status : 'unavailable';

  const showGate = (s === 'connecting' || s === 'signed-out' || s === 'error');
  gate.hidden = !showGate;
  layout.hidden = showGate;

  btn.disabled = (s === 'connecting');
  label.textContent = (s === 'connecting') ? 'Connecting…' : 'Sign in with Google';

  const msg = (window.LTSync && window.LTSync.error) || '';
  errBox.hidden = !(s === 'error' && msg);
  if (!errBox.hidden) errBox.textContent = friendlyAuthError(msg);

  const box = $('#account-box');
  const acct = window.LTSync && window.LTSync.user;
  box.hidden = !acct;
  if (acct) $('#account-email').textContent = acct.email || acct.name || '';
}

function friendlyAuthError(msg) {
  if (/unauthorized-domain/.test(msg)) {
    return 'This site\'s address is not authorised for sign-in yet. Please let the study ' +
           'coordinator know — it is a one-line setting on their side.';
  }
  if (/configuration-not-found|operation-not-allowed/.test(msg)) {
    return 'Google sign-in is not switched on for this project yet. Please let the study ' +
           'coordinator know.';
  }
  return msg;
}

function syncAvailable() {
  return !!(window.LTSync && window.LTSync.save && window.LTSync.status === 'ready');
}

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
    if (sync.pending) {
      clearTimeout(sync.timer);
      sync.timer = setTimeout(flushSave, 300);
    }
  }
}

/* Pull an existing document for this account and refill the form. Records
   written against the v1 schema use different set ids and are skipped
   silently — the guards below make that safe rather than fatal. */
async function restoreFromCloud() {
  if (!window.LTSync || !window.LTSync.load) return;

  const acct = window.LTSync.user;
  if (acct) {
    state.respondent.email = acct.email || '';
    if (!state.respondent.name && acct.name) {
      state.respondent.name = acct.name;
      $('#r-name').value = acct.name;
      $('#name-hint').hidden = false;
    }
  }

  let data;
  try { data = await window.LTSync.load(); }
  catch (err) { sync.error = err.message; renderSyncStatus(); return; }
  if (!data) { renderSyncStatus(); return; }

  sync.restoring = true;

  if (data.respondent && data.respondent.name) {
    state.respondent.name = data.respondent.name;
    $('#r-name').value = data.respondent.name;
  }
  if (data.respondent && data.respondent.email) state.respondent.email = data.respondent.email;
  if (data.startedAt) state.startedAt = data.startedAt;
  state.submitted = !!data.submitted;
  state.submittedAt = data.submittedAt || null;

  /* The approach has to be restored before anything else, because it decides
     which sets exist. Rebuild, then refill. */
  if (data.approach && data.approach.useTransition !== undefined) {
    Object.assign(state.approach, data.approach);
    renderApproachControls();
    updateBeginGate();
    rebuildSchema();
  }

  if (data.answersRaw) {
    Object.keys(data.answersRaw).forEach(setId => {
      const src = data.answersRaw[setId];
      if (!src) return;
      if (!state.answers[setId]) state.answers[setId] = { weights: {}, comment: '' };
      state.answers[setId].comment = src.comment || '';
      Object.keys(src.weights || {}).forEach(bid => {
        state.answers[setId].weights[bid] = Object.assign(
          { hom: '', het: '', hetEdited: false }, src.weights[bid]);
      });
    });
    restoreInputsFromState();
  }

  (data.responses || []).forEach(res => {
    const set = setOf(res.setId);
    if (!set) return;   // schema changed since the record was written
    (res.weights || []).forEach(w => {
      if (!set.branches.some(b => b.id === w.branchId)) return;
      const cell = cellOf(res.setId, w.branchId);
      // v1 records carried a single `weight`; treat it as the homogeneous value.
      const hom = (w.homogeneous !== undefined) ? w.homogeneous : w.weight;
      const het = (w.heterogeneous !== undefined) ? w.heterogeneous : hom;
      if (hom !== null && hom !== undefined) writeCell(res.setId, w.branchId, 'hom', String(hom));
      if (het !== null && het !== undefined) writeCell(res.setId, w.branchId, 'het', String(het));
      cell.hetEdited = (w.heterogeneousInherited === false);
      paintCell(res.setId, w.branchId);
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
  } else if (s === 'connecting' || s === 'signed-out') {
    chip.textContent = 'Connecting…';
    chip.classList.add('chip-muted');
  } else if (sync.inFlight || sync.pending) {
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

function init() {
  renderScenarioLegend();
  renderColumnLegend();
  renderApproachControls();
  updateBeginGate();
  renderPanels();

  $('#r-name').addEventListener('input', e => {
    state.respondent.name = e.target.value;
    renderNav();
    markDirty();
  });

  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-goto]');
    if (!btn) return;
    const dir = btn.getAttribute('data-goto');
    if (dir === 'next') showPanel(state.currentPanel + 1);
    else if (dir === 'prev') showPanel(state.currentPanel - 1);
  });

  $('#btn-export-json').addEventListener('click', () => {
    download(safeName() + '.json', JSON.stringify(collectPayload(), null, 2), 'application/json');
  });
  $('#btn-export-csv').addEventListener('click', () => {
    download(safeName() + '.csv', toCSV(collectPayload()), 'text/csv');
  });
  $('#btn-submit-online').addEventListener('click', markFinal);

  $('#btn-signin').addEventListener('click', () => {
    $('#signin-label').textContent = 'Opening Google…';
    window.LTSync.signIn();
  });
  $('#btn-signout').addEventListener('click', async () => {
    clearTimeout(sync.timer);
    if (sync.pending || sync.inFlight) await flushSave();
    await window.LTSync.signOut();
    location.reload();
  });

  window.addEventListener('ltsync-status', e => {
    renderGate();
    renderSyncStatus();
    if (e.detail.status === 'ready') restoreFromCloud();
  });
  if (window.LTSync && window.LTSync.status === 'ready') restoreFromCloud();
  renderGate();
  renderSyncStatus();

  window.addEventListener('beforeunload', () => {
    if (sync.pending || sync.inFlight) flushSave();
  });

  ALL_SETS.forEach(s => {
    updateSetStatus(s.id);
    s.branches.forEach(b => paintCell(s.id, b.id));
  });
  showPanel(0);
}

document.addEventListener('DOMContentLoaded', init);

/* Exposed for the offline smoke test; harmless in the browser. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PANELS, ALL_SETS, buildSchema, CONFIG };
}
