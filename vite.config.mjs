import { defineConfig } from 'vite';

// dist/ is the site itself (plain static files); Vite is only used as a local file server.
export default defineConfig({ server: { host: '127.0.0.1' } });
