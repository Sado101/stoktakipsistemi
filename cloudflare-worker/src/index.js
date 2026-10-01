import { json, notFound, optionsResponse, withCors } from './response.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return optionsResponse(request, env);
    }

    try {
      const response = await route(request, env, url);
      return withCors(response, request, env);
    } catch (error) {
      console.error(error);
      return withCors(json({ error: 'Beklenmeyen bir hata oluştu' }, 500), request, env);
    }
  },
};

async function route(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (path === '/api/health') {
    return json({
      ok: true,
      service: 'stoktakip-api',
      runtime: 'cloudflare-worker',
    });
  }

  if (path === '/api/_env-check') {
    return json({
      ok: true,
      supabase_url: Boolean(env.SUPABASE_URL),
      supabase_service_role_key: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
      session_secret: Boolean(env.SESSION_SECRET),
    });
  }

  return notFound();
}
