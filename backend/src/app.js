import http from 'node:http';
import { createSession, createUser, credentials, sessionCookie, sessionHash, verifyPassword } from './services/auth.js';
import { snapshot } from './services/sensorService.js';

const routes = {
  '/api/health': 'GET',
  '/api/login': 'POST',
  '/api/logout': 'POST',
  '/api/me': 'GET',
  '/api/users': 'POST',
  '/api/sensors': 'GET'
};

async function readJson(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') {
    throw Object.assign(new Error('Se requiere un cuerpo JSON.'), { status: 415 });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > 8192) {
      req.resume();
      throw Object.assign(new Error('La solicitud es demasiado grande.'), { status: 413 });
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('El cuerpo JSON no es válido.'), { status: 400 });
  }
}

export function createApp(db, { origin = process.env.APP_ORIGIN } = {}) {
  let pendingLogin = 0;
  return http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const send = (status, data) => {
      res.statusCode = status;
      res.end(JSON.stringify(data));
    };
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      if (!Object.hasOwn(routes, path)) return send(404, { error: 'Ruta no encontrada.' });
      if (req.method !== routes[path]) {
        res.setHeader('Allow', routes[path]);
        return send(405, { error: 'Método no permitido.' });
      }
      if (req.method === 'POST' && req.headers.origin &&
          !(origin ? req.headers.origin === origin :
            ['http://localhost:4321', 'http://127.0.0.1:4321'].includes(req.headers.origin))) {
        return send(403, { error: 'Origen no permitido.' });
      }
      if (path === '/api/health') {
        await db.query('SELECT 1');
        return send(200, { status: 'ok' });
      }

      const tokenHash = sessionHash(req);
      if (path === '/api/login') {
        const { email, password } = credentials(await readJson(req));
        if (!email || email.length > 254 || !password || Array.from(password).length > 128) {
          return send(401, { error: 'Correo o contraseña incorrectos.' });
        }
        if (pendingLogin >= 4) return send(429, { error: 'Hay demasiados intentos simultáneos. Intenta de nuevo.' });
        pendingLogin++;
        let user;
        try {
          const [[account]] = await db.execute('SELECT id, name, email, password_hash FROM users WHERE email = ?', [email]);
          const valid = await verifyPassword(password, account?.password_hash);
          if (!account || !valid) return send(401, { error: 'Correo o contraseña incorrectos.' });
          user = account;
        } finally {
          pendingLogin--;
        }
        const token = await createSession(db, tokenHash, user.id);
        res.setHeader('Set-Cookie', sessionCookie(token));
        return send(200, { id: user.id, name: user.name, email: user.email });
      }

      if (path === '/api/logout') {
        if (tokenHash) await db.execute('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
        res.setHeader('Set-Cookie', sessionCookie());
        return send(200, { status: 'ok' });
      }

      const user = tokenHash && (await db.execute(`
        SELECT users.id, users.name, users.email FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE token_hash = ? AND expires_at > UTC_TIMESTAMP()
      `, [tokenHash]))[0][0];
      if (!user) return send(401, { error: 'Inicia sesión para continuar.' });
      if (path === '/api/me') return send(200, user);
      if (path === '/api/users') return send(201, await createUser(db, await readJson(req)));
      return send(200, await snapshot(db, url.searchParams.get('scenario')));
    } catch (error) {
      if (error.status) return send(error.status, { error: error.message });
      console.error('Error de API:', error.code || error.name);
      return send(503, { error: 'El servicio no está disponible. Intenta de nuevo.' });
    }
  });
}
