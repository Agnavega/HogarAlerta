import { readFile } from 'node:fs/promises';
import { database } from '../database.js';
import { createUser } from '../src/services/auth.js';

const command = process.argv[2];
const db = database({ multipleStatements: command === 'init' });
try {
  if (command === 'init') {
    await db.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8').then(sql => sql.replace(/^\uFEFF/, '')));
    await db.query(await readFile(new URL('./seed.sql', import.meta.url), 'utf8').then(sql => sql.replace(/^\uFEFF/, '')));
    console.log('Esquema y datos de demostración listos.');
  } else if (command === 'user') {
    const user = await createUser(db, {
      name: process.env.INITIAL_USER_NAME,
      email: process.env.INITIAL_USER_EMAIL,
      password: process.env.INITIAL_USER_PASSWORD
    });
    console.log('Cuenta creada para ' + user.email);
  } else {
    throw new Error('Usa init o user.');
  }
} catch (error) {
  console.error(error.status ? error.message : error.code || 'Error al preparar MySQL.');
  process.exitCode = 1;
} finally {
  await db.end();
}
