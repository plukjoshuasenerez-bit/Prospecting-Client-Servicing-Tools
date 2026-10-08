// Shared helpers: Neon Postgres (HTTP serverless) KV table, password hashing, tokens.
const crypto = require('crypto');
const { neon } = require('@neondatabase/serverless');

function dbUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL
      || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL_UNPOOLED || process.env.NEON_DATABASE_URL;
}
let _sql = null;
function getSql() {
  const url = dbUrl();
  if (!url) throw new Error('Database not configured. Connect a Neon Postgres database to this Vercel project (it sets DATABASE_URL / POSTGRES_URL), then Redeploy.');
  if (!_sql) _sql = neon(url);
  return _sql;
}
let _ready = null;
async function ensureTable() {
  if (!_ready) { const sql = getSql(); _ready = sql`CREATE TABLE IF NOT EXISTS kv (k text PRIMARY KEY, v text)`; }
  await _ready;
}
async function kvGet(k) {
  await ensureTable();
  const rows = await getSql()`SELECT v FROM kv WHERE k = ${k}`;
  return rows.length ? rows[0].v : null;
}
async function kvSet(k, v) {
  await ensureTable();
  await getSql()`INSERT INTO kv (k, v) VALUES (${k}, ${v}) ON CONFLICT (k) DO UPDATE SET v = ${v}`;
}
async function kvDel(k) {
  await ensureTable();
  await getSql()`DELETE FROM kv WHERE k = ${k}`;
}

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
