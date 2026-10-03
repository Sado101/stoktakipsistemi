import { checkSubeAccess, clearSessionCookie, generateWerkzeugHash, readSession, requireSession, sessionCookie, verifyWerkzeugHash } from './auth.js';
import {
  handleGetStokOzet,
  handleGetStokToplam,
  handleGetSubeler,
  handleGetUrun,
  handleGetUrunler,
  KATEGORILER,
} from './domain.js';
import {
  handleCreateHareket,
  handleDeleteHareket,
  handleGetHareketler,
  handleUpdateHareket,
} from './movements.js';
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
  const calisanlarMatch = path.match(/^\/api\/subeler\/(\d+)\/calisanlar$/);
  if (calisanlarMatch && request.method === 'GET') return json(await getCalisanlar(request, env, calisanlarMatch[1]));
  if (calisanlarMatch && request.method === 'POST') return json(await createCalisan(request, env, calisanlarMatch[1]), 201);
  const calisanMatch = path.match(/^\/api\/subeler\/(\d+)\/calisanlar\/(\d+)$/);
  if (calisanMatch && request.method === 'PUT') return json(await updateCalisan(request, env, calisanMatch[1], calisanMatch[2]));
  if (calisanMatch && request.method === 'DELETE') return json(await deleteCalisan(request, env, calisanMatch[1], calisanMatch[2]));
  if (path === '/api/urunler/kategoriler' && request.method === 'GET') {
    await requireSession(request, env);
    return json(KATEGORILER);
  }
  if (path === '/api/urunler' && request.method === 'GET') return json(await handleGetUrunler(request, env, url));
  const urunMatch = path.match(/^\/api\/urunler\/(\d+)$/);
  if (urunMatch && request.method === 'GET') return json(await handleGetUrun(request, env, urunMatch[1]));
  if (path === '/api/stok/ozet' && request.method === 'GET') return json(await handleGetStokOzet(request, env, url));
  if (path === '/api/stok/toplam' && request.method === 'GET') return json(await handleGetStokToplam(request, env, url));
  if (path === '/api/hareketler' && request.method === 'GET') return json(await handleGetHareketler(request, env, url));
  if (path === '/api/hareketler' && request.method === 'POST') return json(await handleCreateHareket(request, env), 201);
  const hareketMatch = path.match(/^\/api\/hareketler\/(\d+)$/);
  if (hareketMatch && request.method === 'PUT') return json(await handleUpdateHareket(request, env, hareketMatch[1]));
  if (hareketMatch && request.method === 'DELETE') return json(await handleDeleteHareket(request, env, hareketMatch[1]));

  return notFound();
}

async function ensureCanManageEmployees(request, env, subeId) {
  const session = await requireSession(request, env);
  const id = Number(subeId);
  if (!Number.isInteger(id)) throw new ApiError('Şube bulunamadı', 404);
  const sube = await selectOne(env, `/subeler?id=eq.${encodeURIComponent(id)}&limit=1`);
  checkSubeAccess(sube);

  if (session.is_admin) return { session, sube };
  if (Number(session.sube_id) !== id) throw new ApiError('Bu şubeye erişim yetkiniz yok', 403);

  const existing = await supabaseFetch(env, `/calisanlar?sube_id=eq.${encodeURIComponent(id)}&select=id&limit=1`);
  if (existing.length > 0 && !session.calisan_id) {
    throw new ApiError('Çalışan şifresi gerekli', 401, { employee_login_required: true });
  }
  return { session, sube };
}

async function getCalisanlar(request, env, subeId) {
  await ensureCanManageEmployees(request, env, subeId);
  const rows = await supabaseFetch(
    env,
    `/calisanlar?sube_id=eq.${encodeURIComponent(subeId)}&select=id,sube_id,ad,aktif,olusturma&order=ad.asc`
  );
  return rows.map(calisanToDict);
}

async function createCalisan(request, env, subeId) {
  await ensureCanManageEmployees(request, env, subeId);
  const data = await request.json().catch(() => ({}));
  const ad = cleanText(data.ad);
  const pin = cleanText(data.pin);
  validateEmployeeName(ad);
  await validateUniqueEmployeeName(env, subeId, ad);
  await validateEmployeePin(env, subeId, pin);

  const inserted = await supabaseFetch(env, '/calisanlar', {
    method: 'POST',
    body: JSON.stringify({
      sube_id: Number(subeId),
      ad,
      pin_hash: generateWerkzeugHash(pin),
      aktif: true,
    }),
  });
  return calisanToDict(inserted[0]);
}

async function updateCalisan(request, env, subeId, calisanId) {
  const { session } = await ensureCanManageEmployees(request, env, subeId);
  const calisan = await findEmployee(env, subeId, calisanId);
  const data = await request.json().catch(() => ({}));
  const update = {};

  if (Object.prototype.hasOwnProperty.call(data, 'ad')) {
    const ad = cleanText(data.ad);
    validateEmployeeName(ad);
    await validateUniqueEmployeeName(env, subeId, ad, calisan.id);
    update.ad = ad;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'aktif')) {
    if (Number(session.calisan_id) === Number(calisan.id) && !Boolean(data.aktif)) {
      throw new ApiError('Aktif olarak kullandığınız çalışanı pasif yapamazsınız', 400);
    }
    update.aktif = Boolean(data.aktif);
  }

  if (data.pin) {
    const pin = cleanText(data.pin);
    await validateEmployeePin(env, subeId, pin, calisan.id);
    update.pin_hash = generateWerkzeugHash(pin);
  }

  if (!Object.keys(update).length) return calisanToDict(calisan);

  const updated = await supabaseFetch(
    env,
    `/calisanlar?id=eq.${encodeURIComponent(calisanId)}&sube_id=eq.${encodeURIComponent(subeId)}`,
    { method: 'PATCH', body: JSON.stringify(update) }
  );
  return calisanToDict(updated[0]);
}

async function deleteCalisan(request, env, subeId, calisanId) {
  const { session } = await ensureCanManageEmployees(request, env, subeId);
  const calisan = await findEmployee(env, subeId, calisanId);
  if (Number(session.calisan_id) === Number(calisan.id)) {
    throw new ApiError('Aktif olarak kullandığınız çalışanı silemezsiniz', 400);
  }
  await supabaseFetch(
    env,
    `/calisanlar?id=eq.${encodeURIComponent(calisanId)}&sube_id=eq.${encodeURIComponent(subeId)}`,
    { method: 'DELETE' }
  );
  return { message: 'Çalışan silindi' };
}

async function findEmployee(env, subeId, calisanId) {
  const calisan = await selectOne(
    env,
    `/calisanlar?id=eq.${encodeURIComponent(calisanId)}&sube_id=eq.${encodeURIComponent(subeId)}&limit=1`
  );
  if (!calisan) throw new ApiError('Çalışan bulunamadı', 404);
  return calisan;
}

function cleanText(value) {
  return String(value || '').trim();
}

function validateEmployeeName(ad) {
  if (!ad || ad.length > 100) throw new ApiError('Çalışan adı 1-100 karakter olmalı', 400);
}

async function validateUniqueEmployeeName(env, subeId, ad, exceptId = null) {
  let path = `/calisanlar?sube_id=eq.${encodeURIComponent(subeId)}&ad=eq.${encodeURIComponent(ad)}&select=id&limit=1`;
  if (exceptId) path += `&id=neq.${encodeURIComponent(exceptId)}`;
  const existing = await supabaseFetch(env, path);
  if (existing.length) throw new ApiError('Bu isimde bir çalışan zaten var', 400);
}

async function validateEmployeePin(env, subeId, pin, exceptId = null) {
  if (!/^\d{2,12}$/.test(pin)) {
    throw new ApiError('Çalışan şifresi 2-12 haneli ve yalnızca rakamlardan oluşmalı', 400);
  }
  const employees = await supabaseFetch(env, `/calisanlar?sube_id=eq.${encodeURIComponent(subeId)}&select=id,pin_hash`);
  for (const employee of employees) {
    if (exceptId && Number(employee.id) === Number(exceptId)) continue;
    if (await verifyWerkzeugHash(employee.pin_hash, pin)) {
      throw new ApiError('Bu kişisel şifre başka bir çalışan tarafından kullanılıyor', 400);
    }
  }
}

function calisanToDict(calisan) {
  return {
    id: calisan.id,
    sube_id: calisan.sube_id,
    ad: calisan.ad,
    aktif: Boolean(calisan.aktif),
    olusturma: calisan.olusturma ? formatDateTR(calisan.olusturma) : '',
  };
}

function formatDateTR(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul' }).format(d);
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
