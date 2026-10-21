const { auth, kvGet, kvSet, dataKey, readBody, send } = require('./_lib');

// Keys that hold ENCODED RECORDS. The client always includes these (at least as
// "[]") whenever it has loaded that module. If an incoming save is MISSING one of
// these keys entirely, that means the client snapshot was taken before hydrate
// finished (cold load / another device / race) — NOT a real delete. In that case
// we carry over the server's existing value so a populated account is never wiped
// by an empty or partial push. A genuine "delete all" sends the key present but
// empty ("[]"), which is allowed through.
const PROTECTED_KEYS = [
  'JOSH_PROSPECT_MONITORING_V1_PROSPECTS',
  'JOSH_PROSPECT_MONITORING_V1_GOALS',
  'optimumRecruitPipeline',
  'optimum_calendar_v1',
  'teamJoshClient Summary_v3',
  'prismEmailBankV213'
];

function isNonEmpty(v) {
  if (v == null) return false;
  var s = String(v).trim();
  if (s === '' || s === '[]' || s === '{}' || s === 'null') return false;
  return true;
}

module.exports = async (req, res) => {
  const me = auth(req);
  if (!me) return send(res, 401, { error: 'Unauthorized' });
  try {
    if (req.method === 'GET') {
      const agentId = (req.query && req.query.agentId) || me.uid;
      // Server-side isolation: a non-admin may only read their OWN blob.
      if (me.role !== 'admin' && agentId !== me.uid) return send(res, 403, { error: 'Forbidden' });
      const raw = await kvGet(dataKey(agentId));
      let blob = { keys: {} };
      if (raw) { try { blob = JSON.parse(raw); } catch (e) {} }
      return send(res, 200, { agentId, data: blob });
    }

    if (req.method === 'POST') {
      const b = await readBody(req);
      const agentId = b.agentId || me.uid;
      // Server-side isolation: a non-admin may only write their OWN blob.
      if (me.role !== 'admin' && agentId !== me.uid) return send(res, 403, { error: 'Forbidden' });
      const incoming = (b.keys && typeof b.keys === 'object') ? b.keys : {};

      // Load the existing blob so we can protect record-holding keys.
      let existing = { keys: {} };
      const prevRaw = await kvGet(dataKey(agentId));
      if (prevRaw) { try { existing = JSON.parse(prevRaw); } catch (e) {} }
      const prevKeys = (existing && existing.keys && typeof existing.keys === 'object') ? existing.keys : {};

      // Anti-wipe guard. Start from the incoming payload, then for every protected
      // key that the server already has with real data but the incoming payload
      // OMITS (undefined), keep the server's value. Present-but-empty is allowed
      // through (that is a genuine clear).
      const merged = Object.assign({}, incoming);
      const preserved = [];
      for (let i = 0; i < PROTECTED_KEYS.length; i++) {
        const k = PROTECTED_KEYS[i];
        const incomingHas = Object.prototype.hasOwnProperty.call(incoming, k);
        if (!incomingHas && isNonEmpty(prevKeys[k])) {
          merged[k] = prevKeys[k];
          preserved.push(k);
        }
      }

      // Full-wipe guard: if the incoming payload is effectively empty but the
      // server already holds data, treat it as a no-op rather than destroying it.
      const incomingCount = Object.keys(incoming).length;
      const prevCount = Object.keys(prevKeys).length;
      if (incomingCount === 0 && prevCount > 0) {
        return send(res, 200, { ok: true, agentId, count: prevCount, preserved: Object.keys(prevKeys), skipped: 'empty-push' });
      }

      const savedAt = new Date().toISOString();
      await kvSet(dataKey(agentId), JSON.stringify({ keys: merged, savedAt }));
      return send(res, 200, { ok: true, agentId, count: Object.keys(merged).length, savedAt, preserved });
    }

    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) { return send(res, 500, { error: e.message }); }
};
