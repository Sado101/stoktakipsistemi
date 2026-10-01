import { json } from './response.js';

export class ApiError extends Error {
  constructor(message, status = 400, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function requireSupabaseEnv(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new ApiError('Supabase ortam değişkenleri eksik', 500);
  }
}

export async function supabaseFetch(env, path, options = {}) {
  requireSupabaseEnv(env);
  const url = `${String(env.SUPABASE_URL).replace(/\/$/, '')}/rest/v1${path}`;
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    prefer: 'return=representation',
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const details = await response.json().catch(() => null);
    throw new ApiError(details?.message || 'Supabase isteği başarısız', response.status, details);
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

export async function selectOne(env, path) {
  const rows = await supabaseFetch(env, path);
  return Array.isArray(rows) ? rows[0] || null : rows;
}

export function handleApiError(error) {
  if (error instanceof ApiError) {
    return json({ error: error.message, ...(error.details || {}) }, error.status);
  }
  console.error(error);
  return json({ error: 'Beklenmeyen bir hata oluştu' }, 500);
}
