const { auth, kvGet, kvSet, dataKey, readBody, send } = require('./_lib');

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

      // Count existing keys to protect against a catastrophic wipe only.
      let existing = { keys: {} };
      const prevRaw = await kvGet(dataKey(agentId));
      if (prevRaw) { try { existing = JSON.parse(prevRaw); } catch (e) {} }
      const prevKeys = (existing && existing.keys && typeof existing.keys === 'object') ? existing.keys : {};

      // IMPORTANT: store EXACTLY what the client sent. A previous version merged
      // in preserved keys, which made the stored blob differ from what the client
      // held — the client then kept thinking "the cloud changed" and reloaded in a
      // loop. The only guard we keep is the catastrophic one below: a completely
      // empty push against a populated account is a no-op (cold-load race), never
      // a wipe. Every normal save is stored verbatim, so stored === sent.
      const incomingCount = Object.keys(incoming).length;
      const prevCount = Object.keys(prevKeys).length;
      if (incomingCount === 0 && prevCount > 0) {
        return send(res, 200, { ok: true, agentId, count: prevCount, skipped: 'empty-push' });
      }

      const savedAt = new Date().toISOString();
      await kvSet(dataKey(agentId), JSON.stringify({ keys: incoming, savedAt }));
      return send(res, 200, { ok: true, agentId, count: incomingCount, savedAt });
    }

    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) { return send(res, 500, { error: e.message }); }
};
