const { auth, getUsers, saveUsers, hashPassword, dataKey, kvSet, kvDel, readBody, send } = require('./_lib');
module.exports = async (req, res) => {
  const me = auth(req);
  if (!me) return send(res, 401, { error: 'Unauthorized' });
  try {
    let users = (await getUsers()) || [];
    if (req.method === 'GET') {
      // Any authenticated user can read the roster for shared birthdays.
      // Admins get full details; agents get a limited view (name + birthday + status).
      if (me.role === 'admin') {
        const list = users.filter(u => u.role === 'agent').map(u => ({ id: u.id, name: u.name, username: u.username, code: u.code || '', createdAt: u.createdAt, status: u.status || '', dateCoded: u.dateCoded || '', birthday: u.birthday || '', licVariable: !!u.licVariable, licLife: !!u.licLife }));
        return send(res, 200, { agents: list });
      }
      const list = users.filter(u => u.role === 'agent').map(u => ({ id: u.id, name: u.name, code: u.code || '', status: u.status || '', birthday: u.birthday || '' }));
      return send(res, 200, { agents: list });
    }
    if (me.role !== 'admin') return send(res, 403, { error: 'Admin only' });
    if (req.method === 'POST') {
      const b = await readBody(req);
      const { name, username, password, status, dateCoded, birthday, licVariable, licLife, code } = b;
      if (!name || !username || !password) return send(res, 400, { error: 'name, username, password kailangan' });
      if (users.some(u => String(u.username).toLowerCase() === String(username).toLowerCase()))
        return send(res, 409, { error: 'May ganitong username na' });
      const codeV = String(code || '').trim();
      if (codeV && users.some(u => u.role === 'agent' && String(u.code || '').trim().toLowerCase() === codeV.toLowerCase()))
        return send(res, 409, { error: 'May ganitong Agent Code na' });
      const id = 'ag_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
      users.push({ id, name, username, role: 'agent', pass: hashPassword(password), createdAt: new Date().toISOString(),
        status: status || '', dateCoded: dateCoded || '', birthday: birthday || '', licVariable: !!licVariable, licLife: !!licLife, code: codeV });
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
      if (b.code !== undefined) {
        const codeV = String(b.code || '').trim();
        if (codeV && users.some(x => x.id !== u.id && x.role === 'agent' && String(x.code || '').trim().toLowerCase() === codeV.toLowerCase()))
          return send(res, 409, { error: 'May ganitong Agent Code na' });
        u.code = codeV;
      }
      if (b.name) u.name = b.name;
      if (b.username) u.username = b.username;
      if (b.password) u.pass = hashPassword(b.password);
      if (b.status !== undefined) u.status = b.status || '';
      if (b.dateCoded !== undefined) u.dateCoded = b.dateCoded || '';
      if (b.birthday !== undefined) u.birthday = b.birthday || '';
      if (b.licVariable !== undefined) u.licVariable = !!b.licVariable;
      if (b.licLife !== undefined) u.licLife = !!b.licLife;
      await saveUsers(users);
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) { return send(res, 500, { error: e.message }); }
};
