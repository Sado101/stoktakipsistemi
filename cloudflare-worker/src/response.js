export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

export function notFound() {
  return json({ error: 'İstek bulunamadı' }, 404);
}

export function optionsResponse(request, env) {
  return withCors(new Response(null, { status: 204 }), request, env);
}

export function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('origin') || '';
  const allowed = corsOrigins(env);

  if (allowed.includes(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-credentials', 'true');
  }

  headers.set('vary', 'Origin');
  headers.set('access-control-allow-methods', 'GET,POST,PUT,DELETE,OPTIONS');
  headers.set('access-control-allow-headers', 'content-type');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function corsOrigins(env) {
  return String(env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
