// Shared store: cross-agent calendar events + activity ranking.
const { auth, kvGet, kvSet, getUsers, dataKey, readBody, send } = require('./_lib');

const SHARED_EVENTS_KEY = 'optimum:shared:events';
const SHARED_BRANDING_KEY = 'optimum:shared:branding';
const SHARED_LINKS_KEY = 'optimum:shared:links';
const SHARED_PURGE_KEY = 'optimum:shared:purge';
const SHARED_REMARKS_KEY = 'optimum:shared:remarks';
const SHARED_ANNOUNCE_KEY = 'optimum:shared:announce';
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
        // Safety net: an event explicitly marked admin-only must never reach an
        // agent through the API, even if one was accidentally pushed into the
        // shared blob. Admins still receive everything. This cannot hide a
        // legitimately shared event (those are never 'adminonly').
        if (me.role !== 'admin') {
          events = events.filter(function (e) {
            var rf = String((e && e.reqFor) || '').toLowerCase();
            return rf !== 'adminonly' && rf !== 'admin_only' && rf !== 'private';
          });
        }
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
      if (type === 'purge') {
        const raw = await kvGet(SHARED_PURGE_KEY);
        let token = 0;
        if (raw) { try { token = JSON.parse(raw).token || 0; } catch (e) {} }
        return send(res, 200, { token });
      }
      if (type === 'announce') {
        const raw = await kvGet(SHARED_ANNOUNCE_KEY);
        let announce = null;
        if (raw) { try { announce = JSON.parse(raw); } catch (e) {} }
        return send(res, 200, { announce });
      }
      if (type === 'remarks') {
        const raw = await kvGet(SHARED_REMARKS_KEY);
        let all = [];
        if (raw) { try { all = JSON.parse(raw) || []; } catch (e) {} }
        if (me.role === 'admin') return send(res, 200, { remarks: all });
        // Agents may ONLY receive remarks explicitly shared with them. Private
        // (admin_only) remarks and other agents' remarks are never returned.
        const mine = all.filter(r => r && r.visibility === 'shared_with_agent' && r.agentId === me.uid);
        return send(res, 200, { remarks: mine });
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
      if ((b.type || type) === 'purge') {
        const token = Number(b.token) || Date.now();
        await kvSet(SHARED_PURGE_KEY, JSON.stringify({ token: token }));
        return send(res, 200, { ok: true, token: token });
      }
      if ((b.type || type) === 'announce') {
        const announce = { text: String(b.text || ''), active: !!b.active, updatedAt: new Date().toISOString(), by: me.name || 'Admin' };
        await kvSet(SHARED_ANNOUNCE_KEY, JSON.stringify(announce));
        return send(res, 200, { ok: true, announce });
      }
      if ((b.type || type) === 'remarks') {
        // Admin-only (already enforced above). Add / edit / delete internal remarks.
        const raw = await kvGet(SHARED_REMARKS_KEY);
        let all = [];
        if (raw) { try { all = JSON.parse(raw) || []; } catch (e) {} }
        const action = b.action || 'save';
        const now = new Date().toISOString();
        if (action === 'delete') {
          all = all.filter(r => r.id !== b.id);
        } else if (b.id && all.some(r => r.id === b.id)) {
          all = all.map(r => r.id === b.id ? Object.assign({}, r, {
            remarkText: (b.remarkText != null ? String(b.remarkText) : r.remarkText),
            visibility: (b.visibility === 'shared_with_agent' ? 'shared_with_agent' : (b.visibility === 'admin_only' ? 'admin_only' : r.visibility)),
            updatedAt: now
          }) : r);
        } else {
          all.push({
            id: 'rm' + Date.now() + Math.random().toString(36).slice(2, 6),
            prospectId: String(b.prospectId || ''),
            agentId: String(b.agentId || ''),
            adminUserId: me.uid,
            adminName: me.name || 'Admin',
            remarkText: String(b.remarkText || ''),
            visibility: (b.visibility === 'shared_with_agent' ? 'shared_with_agent' : 'admin_only'),
            createdAt: now,
            updatedAt: now
          });
        }
        await kvSet(SHARED_REMARKS_KEY, JSON.stringify(all));
        return send(res, 200, { ok: true, count: all.length });
      }
      return send(res, 400, { error: 'Unknown type' });
    }

    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) { return send(res, 500, { error: e.message }); }
};
