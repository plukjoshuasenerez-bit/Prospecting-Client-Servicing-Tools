const { auth, getUsers, saveUsers, hashPassword, dataKey, kvSet, kvDel, readBody, send } = require('./_lib');
module.exports = async (req, res) => {
  const me = auth(req);
  if (!me) return send(res, 401, { error: 'Unauthorized' });
  if (me.role !== 'admin') return send(res, 403, { error: 'Admin only' });
  try {
    let users = (await getUsers()) || [];
    if (req.method === 'GET') {
      const list = users.filter(u => u.role === 'agent').map(u => ({ id: u.id, name: u.name, username: u.username, createdAt: u.createdAt }));
      return send(res, 200, { agents: list });
    }
    if (req.method === 'POST') {
      const { name, username, password } = await readBody(req);
      if (!name || !username || !password) return send(res, 400, { error: 'name, username, password kailangan' });
      if (users.some(u => String(u.username).toLowerCase() === String(username).toLowerCase()))
        return send(res, 409, { error: 'May ganitong username na' });
      const id = 'ag_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
      users.push({ id, name, username, role: 'agent', pass: hashPassword(password), createdAt: new Date().toISOString() });
      await saveUsers(users);
      await kvSet(dataKey(id), JSON.stringify({ keys: {} }));
      return send(res, 200, { ok: true, agent: { id, name, username } });
    }
    if (req.method === 'DELETE') {
      const id = (req.query && req.query.id) || (await readBody(req)).id;
      if (!id) return send(res, 400, { error: 'id kailangan' });
      users = users.filter(u => u.id !== id);
      await saveUsers(users);
      try { await kvDel(dataKey(id)); } catch (e) {}
      return send(res, 200, { ok: true });
    }
    if (req.method === 'PATCH') {
      const b = await readBody(req);
      const u = users.find(x => x.id === b.id);
      if (!u) return send(res, 404, { error: 'Wala ang agent' });
      if (b.name) u.name = b.name;
      if (b.username) u.username = b.username;
      if (b.password) u.pass = hashPassword(b.password);
      await saveUsers(users);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) { return send(res, 500, { error: e.message }); }
};
