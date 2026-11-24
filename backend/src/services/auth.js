import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const dummyHash = '00000000000000000000000000000000:' + '0'.repeat(128);
const sessionHours = 24;

export function credentials(input) {
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input?.password === 'string' ? input.password : '';
  return { email, password };
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  return salt + ':' + key.toString('hex');
}

export async function verifyPassword(password, stored = dummyHash) {
  const [salt, key] = stored.split(':');
  return timingSafeEqual(await derive(password, salt, 64), Buffer.from(key, 'hex'));
}

export async function createUser(db, input) {
  const { email, password } = credentials(input);
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 100 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      Array.from(password).length < 12 || Array.from(password).length > 128) {
    throw Object.assign(new Error('Escribe un nombre, un correo válido y una contraseña de 12 a 128 caracteres.'), { status: 400 });
  }
  try {
    const [result] = await db.execute('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [name, email, await hashPassword(password)]);
    return { id: result.insertId, name, email };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw Object.assign(new Error('Ya existe una cuenta con ese correo.'), { status: 409 });
    }
    throw error;
  }
}

export function sessionHash(request) {
  const token = request.headers.cookie?.match(/(?:^|;\s*)hogar_session=([a-f0-9]{64})(?:;|$)/)?.[1];
  return token ? tokenHash(token) : null;
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest();
}

export async function createSession(db, previousHash, userId) {
  const token = randomBytes(32).toString('hex');
  if (previousHash) await db.execute('DELETE FROM sessions WHERE token_hash = ?', [previousHash]);
  await db.execute('DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP()');
  await db.execute('INSERT INTO sessions VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? HOUR))',
    [tokenHash(token), userId, sessionHours]);
  return token;
}

export function sessionCookie(token = '') {
  const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
  return 'hogar_session=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (token ? sessionHours * 3600 : 0) + secure;
}
