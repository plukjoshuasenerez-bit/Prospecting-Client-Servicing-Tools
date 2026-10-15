// Shared store: cross-agent calendar events + activity ranking.
const { auth, kvGet, kvSet, getUsers, dataKey, readBody, send } = require('./_lib');

const SHARED_EVENTS_KEY = 'optimum:shared:events';
const SHARED_BRANDING_KEY = 'optimum:shared:branding';
const SHARED_LINKS_KEY = 'optimum:shared:links';
const ALOG_KEY = 'optimumActivityLog';

module.exports = async (req, res) => {
  const me = auth(req);
  if (!me) return send(res, 401, { error: 'Unauthorized' });
  try {
    const type = (req.query && req.query.type) || '';

    if (req.method === 'GET') {
      if (type === 'events') {
        const raw = await kvGet(SHARED_EVENTS_KEY);
        let events = [];
        if (raw) { try { events = JSON.parse(raw) || []; } catch (e) {} }
        return send(res, 200, { events });
      }
      if (type === 'branding') {
        const raw = await kvGet(SHARED_BRANDING_KEY);
        let branding = null;
        if (raw) { try { branding = JSON.parse(raw); } catch (e) {} }
        return send(res, 200, { branding });
      }
      if (type === 'links') {
        const raw = await kvGet(SHARED_LINKS_KEY);
        let links = [];
        if (raw) { try { links = JSON.parse(raw) || []; } catch (e) {} }
        return send(res, 200, { links });
      }
      if (type === 'ranking') {
        const month = (req.query && req.query.month) || '';
        const users = (await getUsers()) || [];
        const out = [];
        for (const u of users) {
          const raw = await kvGet(dataKey(u.id));
          let pts = 0, count = 0;
          if (raw) {
            try {
              const blob = JSON.parse(raw);
              const keys = (blob && blob.keys) || {};
              const logRaw = keys[ALOG_KEY];
              if (logRaw) {
                const log = JSON.parse(logRaw) || [];
                log.forEach(function (e) {
                  if (!month || String(e.date || '').slice(0, 7) === month) {
                    pts += Number(e.pts) || 0;
                    count += Number(e.count) || 0;
                  }
                });
              }
            } catch (e) {}
          }
          out.push({ id: u.id, name: u.name, role: u.role, totalPts: pts, count: count });
        }
        out.sort(function (a, b) { return b.totalPts - a.totalPts; });
        return send(res, 200, { ranking: out, month: month });
      }
      return send(res, 400, { error: 'Unknown type' });
    }

    if (req.method === 'POST') {
      if (me.role !== 'admin') return send(res, 403, { error: 'Admin only' });
      const b = await readBody(req);
      if ((b.type || type) === 'events') {
        const events = Array.isArray(b.events) ? b.events : [];
        await kvSet(SHARED_EVENTS_KEY, JSON.stringify(events));
        return send(res, 200, { ok: true, count: events.length });
      }
      if ((b.type || type) === 'branding') {
        const branding = (b.branding && typeof b.branding === 'object') ? b.branding : {};
        await kvSet(SHARED_BRANDING_KEY, JSON.stringify(branding));
        return send(res, 200, { ok: true });
      }
      if ((b.type || type) === 'links') {
        const links = Array.isArray(b.links) ? b.links : [];
        await kvSet(SHARED_LINKS_KEY, JSON.stringify(links));
        return send(res, 200, { ok: true, count: links.length });
      }
      return send(res, 400, { error: 'Unknown type' });
    }

    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) { return send(res, 500, { error: e.message }); }
};
