import { readFileSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import mysql from 'mysql2/promise';

try {
  loadEnvFile(new URL('../.env', import.meta.url));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

export function database(extra = {}) {
  const caPath = process.env.DB_SSL_CA_PATH;
  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'hogar_alerta',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'hogar_alerta',
    charset: 'utf8mb4',
    timezone: 'Z',
    decimalNumbers: true,
    ...(caPath && { ssl: { ca: readFileSync(caPath), rejectUnauthorized: true, verifyIdentity: true } }),
    ...extra
  });
}
