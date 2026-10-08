// Shared helpers: KV (Upstash/Vercel KV REST), password hashing, tokens. No external deps.
const crypto = require('crypto');

function kvCreds() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}
async function kvCmd(cmd) {
  const { url, token } = kvCreds();
  if (!url || !token) throw new Error('KV not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL/TOKEN) in Vercel env.');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  if (!res.ok) throw new Error('KV error ' + res.status + ': ' + (await res.text()).slice(0,200));
  const j = await res.json();
  return j.result;
}
const kvGet = (k) => kvCmd(['GET', k]);
const kvSet = (k, v) => kvCmd(['SET', k, v]);
const kvDel = (k) => kvCmd(['DEL', k]);

const USERS_KEY = 'optimum:users';
const dataKey = (id) => 'optimum:data:' + id;

async function getUsers() {
  const raw = await kvGet(USERS_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
async function saveUsers(arr) { await kvSet(USERS_KEY, JSON.stringify(arr)); }

async function ensureSeed() {
  let users = await getUsers();
  if (users && users.length) return users;
  const adminUser = process.env.ADMIN_USERNAME || 'JOSHUA SENEREZ';
  const adminPass = process.env.ADMIN_PASSWORD || '70117295';
  users = [{
    id: 'admin', name: process.env.ADMIN_NAME || 'JOSHUA SENEREZ',
    username: adminUser, role: 'admin',
    pass: hashPassword(adminPass), createdAt: new Date().toISOString()
  }];
  await saveUsers(users);
  return users;
}

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.pbkdf2Sync(String(pw), salt, 100000, 32, 'sha256').toString('hex');
  return salt + ':' + h;
}
function verifyPassword(pw, stored) {
  if (!stored || stored.indexOf(':') < 0) return false;
  const [salt, h] = stored.split(':');
  const cand = crypto.pbkdf2Sync(String(pw), salt, 100000, 32, 'sha256').toString('hex');
  try { return crypto.timingSafeEqual(Buffer.from(cand, 'hex'), Buffer.from(h, 'hex')); } catch (e) { return false; }
}

function secret() { return process.env.AUTH_SECRET || 'CHANGE_ME_optimum_default_secret_please_set_env'; }
function b64url(s) { return Buffer.from(s).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
function b64urlDec(s) { s = s.replace(/-/g,'+').replace(/_/g,'/'); return Buffer.from(s, 'base64').toString(); }
function signToken(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  return body + '.' + sig;
}
function verifyToken(tok) {
  if (!tok || tok.indexOf('.') < 0) return null;
  const [body, sig] = tok.split('.');
  const exp = crypto.createHmac('sha256', secret()).update(body).digest('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  if (sig !== exp) return null;
  let p; try { p = JSON.parse(b64urlDec(body)); } catch (e) { return null; }
  if (p.exp && Date.now() > p.exp) return null;
  return p;
}
function auth(req) {
  const h = req.headers['authorization'] || req.headers['Authorization'] || '';
  const tok = h.replace(/^Bearer\s+/i, '').trim();
  return verifyToken(tok);
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve) => {
    let d = ''; req.on('data', c => d += c); req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); } });
  });
}
function send(res, code, obj) { res.statusCode = code; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(obj)); }

module.exports = { kvGet, kvSet, kvDel, getUsers, saveUsers, ensureSeed, dataKey, hashPassword, verifyPassword, signToken, verifyToken, auth, readBody, send };
