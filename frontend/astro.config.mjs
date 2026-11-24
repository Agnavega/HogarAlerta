import { defineConfig } from 'astro/config';
import { loadEnvFile } from 'node:process';

try {
  loadEnvFile(new URL('./.env', import.meta.url));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

export default defineConfig({
  vite: {
    server: {
      proxy: { '/api': process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001' }
    }
  }
});
