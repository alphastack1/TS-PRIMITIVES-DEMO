'use strict';

const penguinCaption = 'The penguin flew through the water.';

const examples = {
  noul: [
    {
      id: 'penguin', name: 'Penguin', label: 'Caption', field: 'caption', text: penguinCaption,
      question: 'Does the caption describe swimming?'
    },
    {
      id: 'agent-proof', name: 'Agent proof', label: 'Agent report', field: 'agent_report',
      text: 'I fixed the checkout error. I’ll run the tests next.',
      question: 'Is there evidence the tests passed?',
      yes: 'The report includes a passing test result or a verified successful test run.',
      no: 'The report only claims a fix, plans to run tests, or shows a failing result.'
    },
    {
      id: 'send-permission', name: 'Send permission', label: 'Message', field: 'message',
      text: 'Draft the email to Maya now.',
      question: 'Does this message explicitly ask to send the email?',
      yes: 'It asks to send the email now.',
      no: 'It asks to draft the email, or asks to wait before sending.'
    }
  ],
  choice: [
    {
      id: 'penguin', name: 'Penguin', label: 'Caption', field: 'caption', text: penguinCaption,
      question: 'What kind of movement is it?',
      choices: [
        ['Swimming', 'Moving in or through water. Flight language may describe rapid swimming.'],
        ['Flying', 'Flying through the air.'],
        ['Walking', 'Moving on foot along a solid surface.'],
        ['Unclear', 'The movement cannot be determined from the caption.']
      ]
    },
    {
      id: 'email-routing', name: 'Email routing', label: 'Email', field: 'message',
      text: 'My Penguin Plus renewal shows up twice on my card. Could you reverse one of the charges?',
      question: 'Which team should handle this email?',
      choices: [
        ['Billing', 'Charges, invoices, refunds, or payment disputes.'],
        ['Account', 'Sign-in, profile details, or account access.'],
        ['Technical', 'A feature is broken or the app does not work as expected.']
      ]
    },
    {
      id: 'issue-triage', name: 'Issue triage', label: 'Issue', field: 'ticket',
      text: 'Export used to save a CSV. Since yesterday’s update, the button spins and nothing downloads.',
      question: 'Which issue type best fits this report?',
      choices: [
        ['Bug', 'An existing feature behaves incorrectly.'],
        ['Feature request', 'A user wants a feature or behavior that does not exist.'],
        ['How-to question', 'A user needs instructions for an existing feature.']
      ]
    }
  ],
  score: [
    {
      id: 'penguin', name: 'Penguin', label: 'Caption', field: 'caption', text: penguinCaption,
      question: 'How clear is the swimming cue?',
      levels: ['No identifiable movement.', 'Movement is implied or described figuratively.', 'Movement is stated literally and directly.'],
      levelNames: ['No cue', 'Implied', 'Direct']
    },
    {
      id: 'bug-reproducibility', name: 'Bug reproducibility', label: 'Bug report', field: 'ticket',
      text: 'Checkout freezes after I tap Pay. It happened twice on my phone.',
      question: 'How reproducible is this bug from the report alone?',
      levels: ['No specific symptom or steps.', 'Some steps or symptoms, but setup or a key detail is missing.', 'Clear setup, steps, and observed result.'],
      levelNames: ['Missing', 'Partial', 'Reproducible']
    },
    {
      id: 'handoff-readiness', name: 'Handoff readiness', label: 'Handoff', field: 'handoff',
      text: 'Penguin import is blocked on a missing account ID. Linh is checking the source file and will update us by 3 PM.',
      question: 'How ready is this handoff for the next person?',
      levels: ['Little usable context about the work.', 'The work is described, but the next step or owner is unclear.', 'The current status, next step, and owner are clear.'],
      levelNames: ['Missing', 'Partial', 'Ready']
    }
  ],
  box: [
    {
      id: 'penguin', name: 'Penguin', asset: '/box-penguin.png', imageLabel: 'Penguin on the ice',
      question: 'Where is the penguin in the image?'
    },
    {
      id: 'address-label', name: 'Address label', asset: '/box-mail.jpg', imageLabel: 'Package with a sample label',
      question: 'Where is the shipping label on this parcel?',
      credit: ['Meanwell Packaging', 'https://commons.wikimedia.org/wiki/File:Sticking_a_label_onto_a_parcel_for_shipping.jpg']
    },
    {
      id: 'vehicle-damage', name: 'Vehicle damage', asset: '/box-damage.jpg', imageLabel: 'Damaged car fender',
      question: 'Where is the damaged paint on the fender?',
      credit: ['Nenad Stojković', 'https://commons.wikimedia.org/wiki/File:Car_damage_on_fender_observed_in_a_parking_lot.jpg']
    }
  ]
};

const headings = {
  noul: 'Probability of yes',
  choice: 'Selected option',
  score: 'Position on the rubric',
  box: 'Image location'
};

const readyCopy = {
  noul: ['Ready to run', 'Jev will estimate the probability of yes.'],
  choice: ['Ready to compare', 'Jev will rank the options in your question.'],
  score: ['Ready to score', 'Jev will place the answer on your rubric.'],
  box: ['Ready to locate', 'Jev will outline the target in this image.']
};

const byId = id => document.getElementById(id);
const tabs = [...document.querySelectorAll('[data-type]')];
const sourceInput = byId('caption');
const questionInput = byId('instructions');
const criteria = byId('criteria');
const status = byId('status');
const runButton = byId('run');
const readout = byId('readout');
const resultPanel = readout.closest('.result');
const upload = byId('upload');
const imageTools = byId('image-tools');
const caseBar = byId('cases');
const responseCopy = document.querySelector('[data-copy="response"]');
const drafts = structuredClone(examples);
const selections = {};
const results = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const maxImageSize = 4 * 1024 * 1024;
let mode = 'noul';
let draft = drafts.noul[0];
let active = null;
let settings = { model: 'jev-latest', boxModel: 'jev-1.14.0' };
let notice = '';
let nextUploadId = 0;
let pendingUpload = null;
let draggedLevel = null;

function element(tag, className, content) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (content !== undefined) item.textContent = content;
  return item;
}

function input(label, value, maxLength, update, placeholder) {
  const field = element('input');
  field.type = 'text';
  field.value = value;
  field.maxLength = maxLength;
  field.placeholder = placeholder;
  field.setAttribute('aria-label', label);
  field.addEventListener('input', () => {
    update(field.value);
    markEdited();
  });
  return field;
}

function editButton(label, handler, className) {
  const button = element('button', className, label);
  button.type = 'button';
  button.addEventListener('click', handler);
  return button;
}

function moveLevel(from, to) {
  const levels = draft.levels;
  if (from === to || to < 0 || to >= levels.length) return;
  const [level] = levels.splice(from, 1);
  levels.splice(to, 0, level);
  renderCriteria(true);
  criteria.querySelectorAll('.drag-grip')[to]?.focus({ preventScroll: true });
  markEdited();
}

function levelGrip(row, index) {
  const grip = element('button', 'drag-grip', '⠿');
  grip.type = 'button';
  grip.draggable = true;
  grip.title = 'Drag or use the arrow keys to reorder';
  grip.setAttribute('aria-label', 'Move level ' + index);
  grip.addEventListener('keydown', event => {
    const direction = { ArrowUp: -1, ArrowDown: 1 }[event.key];
    if (!direction) return;
    event.preventDefault();
    moveLevel(index, index + direction);
  });
  grip.addEventListener('dragstart', event => {
    draggedLevel = index;
    event.dataTransfer.setData('text/jev-level', String(index));
    event.dataTransfer.effectAllowed = 'move';
  });
  grip.addEventListener('dragend', () => {
    draggedLevel = null;
    for (const entry of criteria.querySelectorAll('[data-drag-over]')) entry.removeAttribute('data-drag-over');
  });
  row.addEventListener('dragover', event => {
    if (draggedLevel === null || draggedLevel === index) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    row.setAttribute('data-drag-over', '');
  });
  row.addEventListener('dragleave', event => {
    if (!row.contains(event.relatedTarget)) row.removeAttribute('data-drag-over');
  });
  row.addEventListener('drop', event => {
    if (draggedLevel === null) return;
    event.preventDefault();
    const from = draggedLevel;
    draggedLevel = null;
    moveLevel(from, index);
  });
  return grip;
}

function renderCriteria(keepOpen = false) {
  criteria.replaceChildren();
  if (mode === 'box') return;
  const details = element('details', 'criteria-details');
  details.open = keepOpen;
  if (mode === 'noul') {
    const fields = element('div', 'boundaries');
    fields.append(
      input('What counts as yes', draft.yes ?? '', 240, value => { draft.yes = value; }, 'What counts as yes'),
      input('What counts as no', draft.no ?? '', 240, value => { draft.no = value; }, 'What counts as no')
    );
    details.append(element('summary', '', 'Yes / no criteria'), fields);
    criteria.append(details);
    return;
  }

  const choice = mode === 'choice';
  const rows = choice ? draft.choices : draft.levels;
  details.append(element('summary', '', choice ? 'Options · ' + rows.length : 'Rubric · ' + rows.length + ' levels'));
  const entries = element('div', 'criteria-entries');
  for (const [index, value] of rows.entries()) {
    const row = element('div', 'criteria-row ' + (choice ? 'criteria-row--option' : 'criteria-row--level'));
    const remove = editButton('×', () => {
      rows.splice(index, 1);
      renderCriteria(true);
      markEdited();
    }, 'delete');
    remove.setAttribute('aria-label', 'Remove ' + (choice ? 'option ' + (index + 1) : 'level ' + index));
    remove.disabled = rows.length <= 2;
    if (choice) {
      row.append(
        input('Option ' + (index + 1) + ' name', value[0], 40, next => { value[0] = next; }, 'Name'),
        input('Option ' + (index + 1) + ' description', value[1], 240, next => { value[1] = next; }, 'Description')
      );
    } else {
      row.append(
        levelGrip(row, index),
        element('span', 'ordinal', String(index)),
        input('Level ' + index, value, 240, next => { rows[index] = next; }, 'Description')
      );
    }
    row.append(remove);
    entries.append(row);
  }
  const add = editButton(choice ? 'Add option' : 'Add level', () => {
    rows.push(choice ? ['', ''] : '');
    renderCriteria(true);
    criteria.querySelector('.criteria-row:last-of-type input')?.focus();
    markEdited();
  }, 'add');
  add.disabled = rows.length >= 10;
  details.append(entries, add);
  criteria.append(details);
}

function buildRequest() {
  const instructions = draft.question.trim();
  if (mode === 'box') {
    return {
      model: settings.boxModel,
      state: { photo: 'asset-image' },
      assets: { 'asset-image': { type: 'image', part: 'photo-upload' } },
      questions: { image_check: { type: 'box', instructions } }
    };
  }
  const question = { type: mode, instructions };
  if (mode === 'noul' && (draft.yes?.trim() || draft.no?.trim())) {
    question.criteria = { true: draft.yes?.trim() ?? '', false: draft.no?.trim() ?? '' };
  } else if (mode === 'choice') {
    question.criteria = Object.fromEntries(draft.choices.map(([name, definition]) => [name.trim(), definition.trim()]));
  } else if (mode === 'score') {
    question.criteria = draft.levels.map(level => level.trim());
  }
  return {
    model: settings.model,
    state: { [draft.field]: draft.text.trim() },
    questions: { [draft.field + '_check']: question }
  };
}

function inputProblem() {
  if (!draft.question.trim()) return 'Enter a question.';
  if (mode === 'box') return draft.upload || draft.asset ? '' : 'Choose an image.';
  if (!draft.text.trim()) return 'Enter an input.';
  if (mode === 'choice') {
    const names = draft.choices.map(([name]) => name.trim().toLowerCase());
    if (draft.choices.some(row => row.some(text => !text.trim()))) return 'Name and describe every option.';
    if (new Set(names).size !== names.length) return 'Give each option a different name.';
  }
  if (mode === 'score' && draft.levels.some(level => !level.trim())) return 'Describe each level.';
  return '';
}

function inputKey(request) {
  return JSON.stringify(mode === 'box' ? [request, draft.upload?.id ?? draft.asset] : request);
}

function caseKey() {
  return mode + '/' + draft.id;
}

function inspectorExchange() {
  const request = buildRequest();
  const last = results.get(caseKey());
  // Keep a previous exchange visible in the inspector while the draft is edited.
  const current = last?.key === inputKey(request) ? last : undefined;
  return { request: current?.request ?? request, last, current };
}

function formatDecimal(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '—';
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '—';
  return value > 0 && value < .005 ? '<1%' : Math.round(value * 100) + '%';
}

function renderJson(box, value, empty = '') {
  if (!value) {
    box.replaceChildren(element('span', 'quiet', empty));
    return;
  }
  const json = JSON.stringify(value, null, 2);
  const tokens = /"(?:\\.|[^"\\])*"(?=\s*:)|\b(?:null|true|false|\d+(?:\.\d+)?)\b/g;
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const match of json.matchAll(tokens)) {
    fragment.append(json.slice(cursor, match.index));
    fragment.append(element('span', match[0][0] === '"' ? 'key' : 'num', match[0]));
    cursor = match.index + match[0].length;
  }
  fragment.append(json.slice(cursor));
  box.replaceChildren(fragment);
}

function buildScale(ticks, value) {
  const rail = element('div', 'meter');
  const max = ticks.at(-1).value;
  const progress = value / max * 100 + '%';
  const fill = element('span', 'meter-fill');
  fill.style.setProperty('--share', progress);
  rail.append(fill);
  for (const tick of ticks) {
    const label = element('span', 'meter-tick', tick.label);
    label.style.setProperty('--position', tick.value / max * 100 + '%');
    rail.append(label);
  }
  const dot = element('span', 'meter-dot');
  dot.style.setProperty('--position', progress);
  rail.append(dot);
  rail.setAttribute('aria-hidden', 'true');
  return rail;
}

function numberValue(value, caption = '', unit = '') {
  const summary = element('div', 'result-summary');
  const group = element('div', 'answer-value-group');
  group.append(element('span', 'value', formatDecimal(value)));
  if (unit) group.append(element('span', 'value-unit', unit));
  summary.append(group);
  if (caption) summary.append(element('p', 'result-caption', caption));
  return summary;
}

function showNoul(stage, answer) {
  stage.append(
    numberValue(answer.noul, formatPercent(answer.noul) + ' probability of yes'),
    buildScale([{ value: 0, label: '0 · No' }, { value: .5, label: '0.5' }, { value: 1, label: '1 · Yes' }], answer.noul)
  );
}

function showChoice(stage, answer, request) {
  const options = Object.keys(Object.values(request.questions)[0].criteria).filter(Boolean);
  const bars = element('div', 'bars');
  for (const name of options) {
    const row = element('div', 'bar' + (name === answer.choice ? ' bar--selected' : ''));
    const track = element('div', 'track');
    const fill = element('div', 'fill');
    const probability = answer.probabilities?.[name];
    fill.style.setProperty('--share', Number.isFinite(probability) ? probability * 100 + '%' : '0%');
    track.setAttribute('aria-hidden', 'true');
    track.append(fill);
    row.append(element('strong', '', name), track, element('span', 'pct', formatPercent(probability)));
    bars.append(row);
  }
  stage.append(element('div', 'value value--word', answer.choice), bars);
}

function showScore(stage, answer, request) {
  const levels = Object.values(request.questions)[0].criteria;
  const last = levels.length - 1;
  const ticks = levels.map((_, value) => ({ value, label: String(value) }));
  const rubric = element('div', 'rubric-grid');
  const original = examples.score.find(example => example.id === draft.id);
  for (const [index, level] of levels.entries()) {
    const step = element('div', 'rubric-step');
    const matchedIndex = original.levels.indexOf(level);
    const name = original.levelNames[matchedIndex] ?? level;
    step.append(element('strong', '', String(index)), element('span', '', name || ''));
    step.toggleAttribute('data-nearby', index === Math.floor(answer.score) || index === Math.ceil(answer.score));
    if (name !== level) step.title = level;
    rubric.append(step);
  }
  stage.append(numberValue(answer.score, '', '/ ' + last), buildScale(ticks, answer.score), rubric);
}

function pictureFigure(box) {
  const figure = element('figure', 'box-figure');
  const picture = element('img');
  picture.src = draft.upload?.url ?? draft.asset;
  picture.alt = draft.upload ? 'Uploaded image for the Box question' : draft.imageLabel;
  figure.append(picture);
  if (box) {
    const { left, top, right, bottom } = box;
    const rectangle = element('span', 'rect');
    rectangle.setAttribute('aria-hidden', 'true');
    rectangle.style.left = left * 100 + '%';
    rectangle.style.top = top * 100 + '%';
    rectangle.style.width = (right - left) * 100 + '%';
    rectangle.style.height = (bottom - top) * 100 + '%';
    figure.append(rectangle);
  }
  return figure;
}

function photoCredit() {
  if (draft.upload || !draft.credit) return;
  const source = element('a', '', draft.credit[0]);
  source.href = draft.credit[1];
  const license = element('a', '', 'CC BY 2.0');
  license.href = 'https://creativecommons.org/licenses/by/2.0/';
  const credit = element('p', 'photo-credit');
  credit.append('Photo: ', source, ' · ', license);
  return credit;
}

function showBox(stage, answer) {
  const edges = element('div', 'box-edges');
  for (const name of ['top', 'left', 'bottom', 'right']) {
    const edge = element('div', 'edge');
    edge.append(element('span', '', name[0].toUpperCase() + name.slice(1)), element('strong', '', formatDecimal(answer.box[name])));
    edges.append(edge);
  }
  stage.append(pictureFigure(answer.box), edges);
  const credit = photoCredit();
  if (credit) stage.append(credit);
}

function showReady(phase) {
  const view = element('div', 'ready-view');
  const visual = element('div', 'ready-visual');
  visual.dataset.kind = mode;
  if (mode === 'box') {
    visual.append(pictureFigure());
  } else {
    visual.setAttribute('aria-hidden', 'true');
    visual.append(element('span'), element('span'), element('span'));
  }
  let [title, detail] = readyCopy[mode];
  if (phase === 'running') [title, detail] = ['Asking Jev…', 'Evaluating this input and question.'];
  if (phase === 'edited') [title, detail] = ['Input changed', 'Run Jev again to see the updated result.'];
  if (phase === 'error') [title, detail] = ['Couldn’t run Jev', notice];
  view.append(visual, element('p', 'ready-title', title), element('p', 'ready-note', detail));
  const credit = mode === 'box' ? photoCredit() : undefined;
  if (credit) view.append(credit);
  readout.append(view);
}

function render(reveal = false) {
  const { request, last, current } = inspectorExchange();
  const answer = current && Object.values(current.response.answers)[0];
  const phase = active ? 'running' : notice ? 'error' : answer ? 'answered' : last ? 'edited' : 'ready';
  resultPanel.dataset.phase = phase;
  resultPanel.dataset.kind = mode;
  resultPanel.setAttribute('aria-busy', String(phase === 'running'));
  byId('result-title').textContent = headings[mode];
  byId('result-state').textContent = phase === 'answered' ? 'Live result' : '';
  byId('timing').textContent = phase === 'answered' ? current.elapsedMs + ' ms · ' + current.response.model : '';
  runButton.disabled = Boolean(active || pendingUpload);
  runButton.textContent = active ? 'Running…' : 'Run Jev';
  status.textContent = pendingUpload ? 'Loading image…' : '';

  byId('request-title').textContent = last && !current ? 'Next request' : 'Request';
  byId('response-title').textContent = last && !current ? 'Last response' : 'Response';
  renderJson(byId('request'), request);
  renderJson(byId('response'), last?.response, 'Run Jev to see the response.');
  responseCopy.disabled = !last;

  readout.replaceChildren();
  if (phase !== 'answered') {
    showReady(phase);
    return;
  }
  const stage = element('div', 'answer-stage');
  if (mode === 'noul') showNoul(stage, answer);
  else if (mode === 'choice') showChoice(stage, answer, current.request);
  else if (mode === 'score') showScore(stage, answer, current.request);
  else showBox(stage, answer);
  readout.append(stage);

  if (reveal && !reducedMotion.matches) {
    readout.animate([{ opacity: .6, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(0)' }], {
      duration: 350, easing: 'ease-out'
    });
  }
}

function markEdited() {
  if (active) {
    active.abort();
    active = null;
  }
  notice = '';
  render();
}

function updateImageLabel() {
  byId('image-name').textContent = draft.upload?.name ?? draft.imageLabel ?? '';
  byId('reset-image').hidden = !draft.upload;
}

function selectCase(type, caseId = selections[type], changeUrl = true) {
  if (!Object.hasOwn(drafts, type)) type = 'noul';
  mode = type;
  draft = drafts[mode].find(item => item.id === caseId) ?? drafts[mode][0];
  selections[mode] = draft.id;
  pendingUpload = null;
  draggedLevel = null;
  const isBox = mode === 'box';
  byId('text-input').hidden = isBox;
  imageTools.hidden = !isBox;
  sourceInput.disabled = isBox;
  sourceInput.value = draft.text ?? '';
  byId('input-label').textContent = draft.label ?? 'Input';
  questionInput.value = draft.question;
  upload.value = '';
  updateImageLabel();
  byId('work').setAttribute('aria-labelledby', 'tab-' + mode);

  for (const tab of tabs) {
    const selected = tab.dataset.type === mode;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  if (caseBar.dataset.mode !== mode) {
    const buttons = drafts[mode].map(item => {
      const button = editButton(item.name, () => selectCase(mode, item.id), 'case-button');
      button.dataset.case = item.id;
      return button;
    });
    caseBar.replaceChildren(...buttons);
    caseBar.dataset.mode = mode;
  }
  for (const button of caseBar.children) button.setAttribute('aria-pressed', String(button.dataset.case === draft.id));
  renderCriteria();
  markEdited();
  if (changeUrl) history.replaceState(null, '', '#' + mode + (draft.id === 'penguin' ? '' : '/' + draft.id));
}

async function submit(event) {
  event.preventDefault();
  if (active || pendingUpload) return;
  const problem = inputProblem();
  if (problem) {
    notice = problem;
    render();
    return;
  }
  const request = buildRequest();
  const key = inputKey(request);
  const destination = caseKey();
  const controller = new AbortController();
  const body = mode === 'box' ? {
    type: 'box',
    instructions: request.questions.image_check.instructions,
    sample: draft.id,
    image: draft.upload ? { mime: draft.upload.mime, base64: draft.upload.base64 } : null
  } : request;
  active = controller;
  notice = '';
  render();
  let received = false;
  try {
    const response = await fetch('/api/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: controller.signal
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Jev did not return a result.');
    if (active === controller) {
      results.set(destination, { ...data, key });
      received = true;
    }
  } catch (error) {
    if (active === controller) notice = error.message === 'Failed to fetch' ? 'Start Question Lab and try again.' : error.message;
  } finally {
    if (active === controller) {
      active = null;
      render(received);
    }
  }
}

function loadImage() {
  const file = upload.files[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg'].includes(file.type) || !file.size || file.size > maxImageSize) {
    upload.value = '';
    notice = 'Choose a PNG or JPEG under 4 MB.';
    render();
    return;
  }
  const id = ++nextUploadId;
  pendingUpload = id;
  markEdited();
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    if (pendingUpload !== id) return;
    const previous = draft.upload;
    draft.upload = { id, name: file.name, url: URL.createObjectURL(file), mime: file.type, base64: String(reader.result).split(',')[1] };
    if (previous) URL.revokeObjectURL(previous.url);
    pendingUpload = null;
    updateImageLabel();
    markEdited();
  });
  reader.addEventListener('error', () => {
    if (pendingUpload !== id) return;
    pendingUpload = null;
    notice = 'The image could not be read.';
    render();
  });
  reader.readAsDataURL(file);
}

for (const [index, tab] of tabs.entries()) {
  tab.addEventListener('click', () => selectCase(tab.dataset.type));
  tab.addEventListener('keydown', event => {
    const targets = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: tabs.length - 1 };
    if (!Object.hasOwn(targets, event.key)) return;
    event.preventDefault();
    const next = tabs[(targets[event.key] + tabs.length) % tabs.length];
    selectCase(next.dataset.type);
    next.focus();
  });
}

for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    const kind = button.dataset.copy;
    const { request, last } = inspectorExchange();
    const value = kind === 'request' ? request : last?.response;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = 'Copy'; }, 850);
    } catch {
      byId(kind).focus();
    }
  });
}

sourceInput.addEventListener('input', () => {
  draft.text = sourceInput.value;
  markEdited();
});
questionInput.addEventListener('input', () => {
  draft.question = questionInput.value;
  markEdited();
});
upload.addEventListener('change', loadImage);
byId('reset-image').addEventListener('click', () => {
  if (!draft.upload) return;
  URL.revokeObjectURL(draft.upload.url);
  delete draft.upload;
  pendingUpload = null;
  upload.value = '';
  updateImageLabel();
  markEdited();
});
imageTools.addEventListener('dragover', event => {
  if (!event.dataTransfer.types.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  imageTools.classList.add('drop-active');
});
imageTools.addEventListener('dragleave', event => {
  if (!imageTools.contains(event.relatedTarget)) imageTools.classList.remove('drop-active');
});
imageTools.addEventListener('drop', event => {
  event.preventDefault();
  imageTools.classList.remove('drop-active');
  if (!event.dataTransfer.files.length) return;
  upload.files = event.dataTransfer.files;
  loadImage();
});
byId('editor').addEventListener('submit', submit);

function applyHash() {
  const [type, caseId = 'penguin'] = location.hash.slice(1).split('/');
  selectCase(type, caseId, false);
}

applyHash();
window.addEventListener('hashchange', applyHash);
fetch('/api/status').then(response => response.json()).then(next => {
  settings = next;
  if (!next.connected) notice = 'A TypeSafe API key is required to run live.';
  render();
}).catch(() => {
  notice = 'Open the local Question Lab address to run Jev.';
  render();
});
