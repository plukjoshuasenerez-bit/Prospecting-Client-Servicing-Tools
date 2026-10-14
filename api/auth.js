const { ensureSeed, getUsers, verifyPassword, signToken, readBody, send } = require('./_lib');
module.exports = async (req, res) => {
  try {
    await ensureSeed();
    if (req.method === 'GET') {
      // public list for the login account picker (names + usernames only, no secrets)
      const users = (await getUsers()) || [];
      const list = users.map(u => ({ name: u.name, username: u.username, role: u.role }));
      return send(res, 200, { users: list });
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    const { username, password } = await readBody(req);
    if (!username || !password) return send(res, 400, { error: 'username at password kailangan' });
    const users = (await getUsers()) || [];
    const u = users.find(x => String(x.username).toLowerCase() === String(username).toLowerCase());
    if (!u || !verifyPassword(password, u.pass)) return send(res, 401, { error: 'Maling username o password' });
    const token = signToken({ uid: u.id, role: u.role, name: u.name, status: u.status || '', exp: Date.now() + 1000*60*60*24*30 });
    return send(res, 200, { token, user: { id: u.id, name: u.name, username: u.username, role: u.role, status: u.status || '', dateCoded: u.dateCoded || '', birthday: u.birthday || '', licVariable: !!u.licVariable, licLife: !!u.licLife } });
  } catch (e) { return send(res, 500, { error: e.message }); }
};
