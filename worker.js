import { onRequest as adminUsersHandler } from './api/admin-users.js';
import { onRequest as geminiApuHandler } from './api/gemini-apu.js';
import { onRequest as s3PresignHandler } from './api/s3-presign.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '');
    if (path === '/api/admin-users') {
      return adminUsersHandler({ request, env, ctx });
    }
    if (path === '/api/gemini-apu') {
      return geminiApuHandler({ request, env, ctx });
    }
    if (path === '/api/s3-presign') {
      return s3PresignHandler({ request, env, ctx });
    }
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Not Found', { status: 404 });
  }
};
