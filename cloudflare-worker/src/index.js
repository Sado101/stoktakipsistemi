import { checkSubeAccess, clearSessionCookie, readSession, requireSession, sessionCookie, verifyWerkzeugHash } from './auth.js';
import {
  handleGetStokOzet,
  handleGetStokToplam,
  handleGetSubeler,
  handleGetUrun,
  handleGetUrunler,
  KATEGORILER,
} from './domain.js';
import { json, notFound, optionsResponse, withCors } from './response.js';
import { ApiError, handleApiError, selectOne, supabaseFetch } from './supabase.js';

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
      return withCors(handleApiError(error), request, env);
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

  if (path === '/api/auth/login' && request.method === 'POST') return login(request, env);
  if (path === '/api/auth/calisan-giris' && request.method === 'POST') return calisanGiris(request, env);
  if (path === '/api/auth/logout' && request.method === 'POST') {
    return json({ message: 'Çıkış yapıldı' }, 200, { 'set-cookie': clearSessionCookie() });
  }
  if (path === '/api/auth/me' && request.method === 'GET') return me(request, env);

  if (path === '/api/subeler' && request.method === 'GET') return json(await handleGetSubeler(request, env, url));
  if (path === '/api/urunler/kategoriler' && request.method === 'GET') {
    await requireSession(request, env);
    return json(KATEGORILER);
  }
  if (path === '/api/urunler' && request.method === 'GET') return json(await handleGetUrunler(request, env, url));
  const urunMatch = path.match(/^\/api\/urunler\/(\d+)$/);
  if (urunMatch && request.method === 'GET') return json(await handleGetUrun(request, env, urunMatch[1]));
  if (path === '/api/stok/ozet' && request.method === 'GET') return json(await handleGetStokOzet(request, env, url));
  if (path === '/api/stok/toplam' && request.method === 'GET') return json(await handleGetStokToplam(request, env, url));

  return notFound();
}

async function login(request, env) {
  const data = await request.json().catch(() => ({}));
  const username = String(data.username || '').trim();
  const password = String(data.password || '').trim();
  if (!username || !password) throw new ApiError('Kullanıcı adı ve şifre zorunludur', 400);

  const admin = await selectOne(env, '/admin_ayar?select=*&order=id.asc&limit=1');
  if (admin?.username === username && await verifyWerkzeugHash(admin.password_hash, password)) {
    const body = { role: 'admin', username: admin.username };
    return json(body, 200, {
      'set-cookie': await sessionCookie({ is_admin: true, sube_id: null, username: admin.username }, env),
    });
  }

  const subeler = await supabaseFetch(env, '/subeler?select=*&order=id.asc');
  const usernameLc = username.toLocaleLowerCase('tr-TR');
  const sube = subeler.find((item) => String(item.kod || '').toLocaleLowerCase('tr-TR') === usernameLc)
    || subeler.find((item) => String(item.isim || '').toLocaleLowerCase('tr-TR') === usernameLc);
  if (sube && String(sube.sifre || '') === password) {
    checkSubeAccess(sube);
    const calisanlar = await supabaseFetch(env, `/calisanlar?sube_id=eq.${encodeURIComponent(sube.id)}&aktif=eq.true&select=id&limit=1`);
    const body = {
      role: 'sube',
      sube_id: sube.id,
      username: sube.isim,
      branch_name: sube.isim,
      employee_login_required: calisanlar.length > 0,
    };
    return json(body, 200, {
      'set-cookie': await sessionCookie({ is_admin: false, sube_id: sube.id, username: sube.isim, calisan_id: null }, env),
    });
  }

  throw new ApiError('Kullanıcı adı veya şifre hatalı', 401);
}

async function calisanGiris(request, env) {
  const session = await readSession(request, env);
  if (!session?.sube_id || session.is_admin) throw new ApiError('Önce şube girişi yapmalısınız', 401);
  const data = await request.json().catch(() => ({}));
  const pin = String(data.pin || '').trim();
  const calisanlar = await supabaseFetch(env, `/calisanlar?sube_id=eq.${encodeURIComponent(session.sube_id)}&aktif=eq.true&select=*&order=ad.asc`);
  let calisan = null;
  for (const item of calisanlar) {
    if (await verifyWerkzeugHash(item.pin_hash, pin)) {
      calisan = item;
      break;
    }
  }
  if (!calisan) throw new ApiError('Çalışan şifresi hatalı', 401);
  const sube = await selectOne(env, `/subeler?id=eq.${encodeURIComponent(session.sube_id)}&limit=1`);
  checkSubeAccess(sube);
  const body = {
    role: 'sube',
    sube_id: sube.id,
    username: calisan.ad,
    employee_id: calisan.id,
    branch_name: sube.isim,
    employee_login_required: false,
  };
  return json(body, 200, {
    'set-cookie': await sessionCookie({ is_admin: false, sube_id: sube.id, username: calisan.ad, calisan_id: calisan.id }, env),
  });
}

async function me(request, env) {
  const session = await readSession(request, env);
  if (!session) throw new ApiError('Giriş gerekli', 401);
  if (session.is_admin) {
    return json({ role: 'admin', username: session.username || 'admin' });
  }
  const sube = await selectOne(env, `/subeler?id=eq.${encodeURIComponent(session.sube_id)}&limit=1`);
  checkSubeAccess(sube);
  const calisan = session.calisan_id
    ? await selectOne(env, `/calisanlar?id=eq.${encodeURIComponent(session.calisan_id)}&sube_id=eq.${encodeURIComponent(sube.id)}&aktif=eq.true&limit=1`)
    : null;
  const hasEmployees = (await supabaseFetch(env, `/calisanlar?sube_id=eq.${encodeURIComponent(sube.id)}&aktif=eq.true&select=id&limit=1`)).length > 0;
  return json({
    role: 'sube',
    sube_id: sube.id,
    username: calisan?.ad || sube.isim,
    employee_id: calisan?.id || null,
    branch_name: sube.isim,
    employee_login_required: hasEmployees && !calisan,
  });
}
