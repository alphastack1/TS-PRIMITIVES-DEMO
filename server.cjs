'use strict';

const { execFile } = require('node:child_process');
const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { parseEnv } = require('node:util');

const host = '127.0.0.1';
const port = 48176;
const origin = 'http://' + host + ':' + port;
const endpoint = 'https://api.typesafe.ai/v1/systemone';
const samples = new Map([
  ['penguin', ['box-penguin.png', 'image/png']],
  ['address-label', ['box-mail.jpg', 'image/jpeg']],
  ['vehicle-damage', ['box-damage.jpg', 'image/jpeg']]
]);
const textFields = new Set(['caption', 'agent_report', 'message', 'ticket', 'handoff']);
const imageLimit = 4 * 1024 * 1024;
const model = 'jev-latest';
const boxModel = process.env.TYPESAFE_BOX_MODEL || 'jev-1.14.0';
const files = new Map([
  ['/', [join(__dirname, 'index.html'), 'text/html; charset=utf-8']],
  ['/styles.css', [join(__dirname, 'styles.css'), 'text/css; charset=utf-8']],
  ['/lab.js', [join(__dirname, 'lab.js'), 'text/javascript; charset=utf-8']],
  ...Array.from(samples.values(), ([name, mime]) => ['/' + name, [join(__dirname, 'assets', name), mime]])
]);

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readKey() {
  const envKey = process.env.TYPESAFE_API_KEY?.trim();
  if (validKey(envKey)) return envKey;
  const content = await readFile(join(__dirname, '.env'), 'utf8').catch(() => '');
  const key = parseEnv(content.replace(/^\uFEFF/, '')).TYPESAFE_API_KEY?.trim();
  if (validKey(key)) return key;
  throw new RequestError(503, 'Connect TypeSafe by setting TYPESAFE_API_KEY in the demo’s local .env file.');
}

function validKey(key) {
  return typeof key === 'string' && /^[\x21-\x7e]{20,512}$/.test(key);
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
    throw new RequestError(415, 'Send a JSON request.');
  }
  const chunks = [];
  const limit = Math.ceil(imageLimit * 4 / 3) + 8192;
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new RequestError(413, 'Choose a smaller image or shorten the input.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new RequestError(400, 'The request could not be read.');
  }
}

function required(value, message, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new RequestError(400, message);
  return value;
}

function criteriaFor(type, criteria) {
  if (type === 'score') {
    if (!Array.isArray(criteria) || criteria.length < 2 || criteria.length > 10) {
      throw new RequestError(400, 'Give Score 2 to 10 ordered levels.');
    }
    return criteria.map(level => required(level, 'Describe each level in 240 characters or less.', 240));
  }
  if (type === 'choice') {
    const entries = typeof criteria === 'object' && criteria && !Array.isArray(criteria) ? Object.entries(criteria) : [];
    if (entries.length < 2 || entries.length > 10) throw new RequestError(400, 'Give Choice 2 to 10 different options.');
    for (const [name, description] of entries) {
      required(name, 'Give each option a short name.', 40);
      required(description, 'Describe each option in 240 characters or less.', 240);
    }
    return Object.fromEntries(entries);
  }
  if (criteria !== undefined) {
    if (!criteria || !['true', 'false'].every(key => typeof criteria[key] === 'string' && criteria[key].length <= 240)) {
      throw new RequestError(400, 'Keep yes/no criteria under 240 characters each.');
    }
    return { true: criteria.true, false: criteria.false };
  }
}

function textRequest(draft) {
  const states = Object.entries(draft.state ?? {});
  const [[field, value] = []] = states;
  if (states.length !== 1 || !textFields.has(field)) throw new RequestError(400, 'Supply one text input.');
  const id = field + '_check';
  const original = draft.questions?.[id];
  const type = original?.type;
  if (!['noul', 'choice', 'score'].includes(type)) throw new RequestError(400, 'Select Noul, Choice, or Score.');
  const instructions = required(original.instructions, 'Enter a question of 600 characters or less.', 600);
  const input = required(value, 'Enter an input of 1,200 characters or less.', 1200);
  const criteria = criteriaFor(type, original.criteria);
  const question = criteria === undefined ? { type, instructions } : { type, instructions, criteria };
  return { model, state: { [field]: input }, questions: { [id]: question } };
}

async function imageRequest(draft) {
  const instructions = required(draft?.instructions, 'Describe the target in 600 characters or less.', 600);
  const image = draft?.image;
  let contents;
  let mime = 'image/png';
  if (image) {
    const allowed = ['image/png', 'image/jpeg'];
    if (!allowed.includes(image.mime) || typeof image.base64 !== 'string' || !/^[a-z0-9+/]+={0,2}$/i.test(image.base64)) {
      throw new RequestError(400, 'Choose a PNG or JPEG image.');
    }
    mime = image.mime;
    contents = Buffer.from(image.base64, 'base64');
  } else {
    const sample = samples.get(draft.sample ?? 'penguin');
    if (!sample) throw new RequestError(400, 'Choose a known sample or upload an image.');
    const [name, sampleMime] = sample;
    mime = sampleMime;
    contents = await readFile(join(__dirname, 'assets', name)).catch(() => null);
  }
  if (!contents?.length) throw new RequestError(400, 'Choose a PNG or JPEG image.');
  if (contents.length > imageLimit) throw new RequestError(413, 'Keep the image below 4 MB.');
  const isPng = contents.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'));
  const isJpeg = contents.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'));
  if ((mime === 'image/png' && !isPng) || (mime === 'image/jpeg' && !isJpeg)) {
    throw new RequestError(400, 'Choose a valid PNG or JPEG image.');
  }
  const request = {
    model: boxModel,
    state: { photo: 'asset-image' },
    assets: { 'asset-image': { type: 'image', part: 'photo-upload' } },
    questions: { image_check: { type: 'box', instructions } }
  };
  const form = new FormData();
  form.append('request', new Blob([JSON.stringify(request)], { type: 'application/json' }), 'request.json');
  form.append('photo-upload', new Blob([contents], { type: mime }), mime === 'image/png' ? 'photo.png' : 'photo.jpg');
  return { request, form };
}

function safeUpstreamError(status) {
  if (status === 401 || status === 403) return 'TypeSafe did not accept the configured API access.';
  if (status === 402) return 'This TypeSafe account is out of API credit.';
  if (status === 429) return 'TypeSafe is rate limiting requests. Try again in a moment.';
  if (status === 400) return 'TypeSafe could not accept this request. Check the input and criteria.';
  return 'TypeSafe could not answer this request. Try again.';
}

function unitInterval(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function validateAnswer(request, data) {
  const [id] = Object.keys(request.questions);
  const type = request.questions[id].type;
  const answer = data?.answers?.[id];
  if (answer?.type !== type) throw new RequestError(502, 'TypeSafe returned a different result type.');
  if (type === 'noul' && unitInterval(answer.noul)) return;
  if (type === 'choice' && typeof answer.choice === 'string' &&
    answer.probabilities && Object.values(answer.probabilities).every(unitInterval)) return;
  if (type === 'score' && Number.isFinite(answer.score) && answer.score >= 0 &&
    answer.score <= request.questions[id].criteria.length - 1) return;
  if (type === 'box' && answer.box &&
    ['top', 'bottom', 'left', 'right'].every(edge => unitInterval(answer.box[edge])) &&
    answer.box.left < answer.box.right && answer.box.top < answer.box.bottom) return;
  throw new RequestError(502, 'TypeSafe returned an unexpected result.');
}

async function ask(req, res) {
  const draft = await readJson(req);
  if (!draft || typeof draft !== 'object') throw new RequestError(400, 'The request could not be read.');
  const box = draft.type === 'box';
  const { request, form } = box ? await imageRequest(draft) : { request: textRequest(draft) };
  const key = await readKey();
  const headers = { Authorization: 'Bearer ' + key };
  if (box) headers['TypeSafe-Danger-Zone-Images'] = 'true';
  else headers['Content-Type'] = 'application/json';
  const disconnect = new AbortController();
  res.once('close', () => disconnect.abort());
  const signal = AbortSignal.any([disconnect.signal, AbortSignal.timeout(15000)]);
  const started = performance.now();
  let response;
  try {
    const upstream = await fetch(endpoint, {
      method: 'POST', headers, body: form || JSON.stringify(request), redirect: 'error', signal
    });
    if (!upstream.ok) {
      await upstream.body?.cancel().catch(() => {});
      throw new RequestError(upstream.status, safeUpstreamError(upstream.status));
    }
    response = await upstream.json();
  } catch (error) {
    if (error instanceof RequestError) throw error;
    if (signal.aborted) throw new RequestError(504, 'TypeSafe took too long. Try again.');
    throw new RequestError(502, 'Could not connect to TypeSafe. Check the connection and try again.');
  }
  const elapsedMs = Math.round(performance.now() - started);
  validateAnswer(request, response);
  if (JSON.stringify({ request, response }).includes(JSON.stringify(key).slice(1, -1))) {
    throw new RequestError(502, 'TypeSafe returned an unexpected result.');
  }
  json(res, 200, { request, response, elapsedMs });
}

async function handle(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  if (req.headers.host !== host + ':' + port || (req.headers.origin && req.headers.origin !== origin)) {
    throw new RequestError(403, 'Open the local Question Lab address.');
  }
  if (req.method === 'GET' && req.url === '/api/status') {
    const connected = await readKey().then(() => true, () => false);
    return json(res, 200, { connected, model, boxModel, app: 'jev-question-lab' });
  }
  if (req.method === 'POST' && req.url === '/api/ask') {
    if (req.headers.origin !== origin) throw new RequestError(403, 'Open the local Question Lab address.');
    return ask(req, res);
  }
  if (req.method === 'GET' && req.url === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  const asset = req.method === 'GET' && files.get(req.url);
  if (!asset) throw new RequestError(404, 'Not found.');
  const [file, contentType] = asset;
  const content = await readFile(file).catch(() => null);
  if (!content) throw new RequestError(404, 'This file is unavailable.');
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
}

function openBrowser() {
  if (!process.argv.includes('--open')) return;
  const env = { ...process.env };
  delete env.TYPESAFE_API_KEY;
  execFile('rundll32.exe', ['url.dll,FileProtocolHandler', origin], { windowsHide: true, env }, () => {});
}

const server = createServer({ requestTimeout: 20000, headersTimeout: 5000 }, (req, res) => {
  handle(req, res).catch(error => {
    if (res.destroyed || res.writableEnded) return;
    const known = error instanceof RequestError;
    json(res, known ? error.status : 500, { error: known ? error.message : 'The local lab hit a problem.' });
  });
});

server.on('error', async error => {
  const existing = error.code === 'EADDRINUSE' && await fetch(origin + '/api/status', { signal: AbortSignal.timeout(1800) })
    .then(r => r.ok ? r.json() : null).catch(() => null);
  if (existing?.app === 'jev-question-lab') {
    console.log('Question Lab is already running at ' + origin);
    openBrowser();
    return;
  }
  console.error('Question Lab could not open ' + origin);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log('Question Lab is ready at ' + origin);
  openBrowser();
});
