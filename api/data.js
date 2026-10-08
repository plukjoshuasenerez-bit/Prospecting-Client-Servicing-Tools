const { auth, kvGet, kvSet, dataKey, getUsers, readBody, send } = require('./_lib');
module.exports = async (req, res) => {
  const me = auth(req);
  if (!me) return send(res, 401, { error: 'Unauthorized' });
  try {
    if (req.method === 'GET') {
      const agentId = (req.query && req.query.agentId) || me.uid;
      if (me.role !== 'admin' && agentId !== me.uid) return send(res, 403, { error: 'Forbidden' });
      const raw = await kvGet(dataKey(agentId));
      let blob = { keys: {} };
      if (raw) { try { blob = JSON.parse(raw); } catch (e) {} }
      return send(res, 200, { agentId, data: blob });
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      const agentId = b.agentId || me.uid;
      if (me.role !== 'admin' && agentId !== me.uid) return send(res, 403, { error: 'Forbidden' });
      const keys = (b.keys && typeof b.keys === 'object') ? b.keys : {};
      await kvSet(dataKey(agentId), JSON.stringify({ keys, savedAt: new Date().toISOString() }));
      return send(res, 200, { ok: true, agentId, count: Object.keys(keys).length });
    }
    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) { return send(res, 500, { error: e.message }); }
};
