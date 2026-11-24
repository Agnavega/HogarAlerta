import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/services/auth.js';

test('autenticación, cuentas sin roles y datos del historial', async () => {
  const password = 'Una contraseña larga';
  const users = new Map([['ana@example.test', {
    id: 1, name: 'Ana', email: 'ana@example.test', password_hash: await hashPassword(password)
  }]]);
  const sessions = new Map();
  const timestamp = new Date('2026-01-01T12:00:00Z');
  const db = {
    async query(sql) {
      if (sql.includes('FROM scenarios')) return [[{ id: 'prueba', name: 'Prueba' }]];
      if (sql.includes('FROM sensors')) return [[{
        id: 'new-sensor', name: 'Sensor de prueba', location: 'Sala', unit: '°C',
        warningThreshold: 10, criticalThreshold: 20
      }]];
      throw new Error(sql);
    },
    async execute(sql, args) {
      if (sql.includes('INSERT INTO users')) {
        const [name, email, password_hash] = args;
        if (users.has(email)) throw Object.assign(new Error(), { code: 'ER_DUP_ENTRY' });
        const id = users.size + 1;
        users.set(email, { id, name, email, password_hash });
        return [{ insertId: id }];
      }
      if (sql.includes('FROM users WHERE email')) return [[users.get(args[0])].filter(Boolean)];
      if (sql.includes('JOIN users')) {
        const id = sessions.get(args[0].toString('hex'));
        const account = [...users.values()].find(user => user.id === id);
        return [account ? [{ id, name: account.name, email: account.email }] : []];
      }
      if (sql.includes('INSERT INTO sessions')) {
        sessions.set(args[0].toString('hex'), args[1]);
        return [];
      }
      if (sql.includes('DELETE FROM sessions')) {
        if (args) sessions.delete(args[0].toString('hex'));
        return [];
      }
      if (sql.includes('FROM readings')) {
        assert.deepEqual(args, ['prueba', 'prueba']);
        return [[{ timestamp, sensorId: 'new-sensor', value: 15 }]];
      }
      throw new Error(sql);
    }
  };
  const server = createApp(db, { origin: 'http://localhost:4321' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = 'http://127.0.0.1:' + server.address().port;
    const request = (path, { body, cookie, origin } = {}) => fetch(address + path, {
      ...(body && { method: 'POST', body: JSON.stringify(body) }),
      headers: {
        ...(body && { 'Content-Type': 'application/json' }),
        ...(cookie && { Cookie: cookie }),
        ...(origin && { Origin: origin })
      }
    });
    const login = (email, pass) => request('/api/login', { body: { email, password: pass } });
    async function loginCookie(email) {
      const response = await login(email, password);
      assert.equal(response.status, 200);
      assert.equal(Object.hasOwn(await response.json(), 'password_hash'), false);
      const cookie = response.headers.get('set-cookie');
      assert.match(cookie, /HttpOnly; SameSite=Lax/);
      return cookie.split(';')[0];
    }

    assert.equal((await request('/api/sensors')).status, 401);
    assert.equal((await request('/api/users', { body: {} })).status, 401);
    assert.equal((await request('/api/login', { body: {}, origin: 'https://example.test' })).status, 403);
    assert.equal((await login('ana@example.test', 'contraseña incorrecta')).status, 401);
    const cookie = await loginCookie('ANA@example.test');
    assert.equal((await request('/api/me', { cookie })).status, 200);
    assert.equal((await request('/api/sensors?scenario=inexistente', { cookie })).status, 400);
    const data = await (await request('/api/sensors', { cookie })).json();
    assert.equal(data.sensors[0].name, 'Sensor de prueba');
    assert.equal(data.history[0].values['new-sensor'], 15);
    assert.deepEqual(data.activity, [{ timestamp: timestamp.toISOString(), state: 'warning' }]);

    const body = { name: 'Luis', email: 'luis@example.test', password };
    assert.equal((await request('/api/users', { cookie, body })).status, 201);
    assert.equal((await request('/api/users', { cookie, body })).status, 409);
    const second = await loginCookie(body.email);
    const shared = await (await request('/api/sensors', { cookie: second })).json();
    assert.deepEqual(shared, data);
    assert.equal((await request('/api/users', { cookie: second, body: { ...body, email: 'otro@example.test' } })).status, 201);
    assert.equal((await request('/api/logout', { cookie, body: {} })).status, 200);
    assert.equal((await request('/api/me', { cookie })).status, 401);
    assert.equal((await request('/api/me', { cookie: second })).status, 200);
    assert.equal((await request('/missing')).status, 404);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
