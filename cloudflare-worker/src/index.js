import {
  allowedBranchId,
  checkSubeAccess,
  clearSessionCookie,
  generateWerkzeugHash,
  readSession,
  requireAdmin,
  requireSession,
  sessionCookie,
  verifyWerkzeugHash,
} from './auth.js';
import {
  handleGetStokOzet,
  handleGetStokToplam,
  handleGetSubeler,
  handleGetUrun,
  handleGetUrunler,
  KATEGORILER,
  productToDict,
  subeToDict,
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
  if (path === '/api/auth/kilidi-ac' && request.method === 'POST') return json(await unlock(request, env));
  if (path === '/api/auth/admin' && request.method === 'GET') return json(await getAdminSettings(request, env));
  if (path === '/api/auth/admin' && request.method === 'PUT') return json(await updateAdminSettings(request, env));

  if (path === '/api/subeler' && request.method === 'GET') return json(await handleGetSubeler(request, env, url));
  if (path === '/api/subeler' && request.method === 'POST') return json(await createSube(request, env), 201);
  const subeBilgiMatch = path.match(/^\/api\/subeler\/(\d+)\/bilgi$/);
  if (subeBilgiMatch && request.method === 'GET') return json(await getSubeBilgi(request, env, subeBilgiMatch[1]));
  if (subeBilgiMatch && request.method === 'PUT') return json(await updateSubeBilgi(request, env, subeBilgiMatch[1]));
  const subeAyarlarMatch = path.match(/^\/api\/subeler\/(\d+)\/ayarlar$/);
  if (subeAyarlarMatch && request.method === 'PUT') return json(await updateSubeAyarlar(request, env, subeAyarlarMatch[1]));
  const subeSifreMatch = path.match(/^\/api\/subeler\/(\d+)\/sifre$/);
  if (subeSifreMatch && request.method === 'PUT') return json(await resetSubeSifre(request, env, subeSifreMatch[1]));
  const calisanlarMatch = path.match(/^\/api\/subeler\/(\d+)\/calisanlar$/);
  if (calisanlarMatch && request.method === 'GET') return json(await getCalisanlar(request, env, calisanlarMatch[1]));
  if (calisanlarMatch && request.method === 'POST') return json(await createCalisan(request, env, calisanlarMatch[1]), 201);
  const calisanMatch = path.match(/^\/api\/subeler\/(\d+)\/calisanlar\/(\d+)$/);
  if (calisanMatch && request.method === 'PUT') return json(await updateCalisan(request, env, calisanMatch[1], calisanMatch[2]));
  if (calisanMatch && request.method === 'DELETE') return json(await deleteCalisan(request, env, calisanMatch[1], calisanMatch[2]));
  const subeMatch = path.match(/^\/api\/subeler\/(\d+)$/);
  if (subeMatch && request.method === 'PUT') return json(await updateSube(request, env, subeMatch[1]));
  if (subeMatch && request.method === 'DELETE') return json(await deleteSube(request, env, subeMatch[1]));
  if (path === '/api/urunler/kategoriler' && request.method === 'GET') {
    await requireSession(request, env);
    return json(KATEGORILER);
  }
  if (path === '/api/urunler' && request.method === 'GET') return json(await handleGetUrunler(request, env, url));
  if (path === '/api/urunler' && request.method === 'POST') return json(await createUrun(request, env), 201);
  const urunMatch = path.match(/^\/api\/urunler\/(\d+)$/);
  if (urunMatch && request.method === 'GET') return json(await handleGetUrun(request, env, urunMatch[1]));
  if (urunMatch && request.method === 'PUT') return json(await updateUrun(request, env, urunMatch[1]));
  if (urunMatch && request.method === 'DELETE') return json(await deleteUrun(request, env, urunMatch[1]));
  if (path === '/api/stok/ozet' && request.method === 'GET') return json(await handleGetStokOzet(request, env, url));
  if (path === '/api/stok/toplam' && request.method === 'GET') return json(await handleGetStokToplam(request, env, url));
  if (path === '/api/ciro' && request.method === 'GET') return json(await getCiro(request, env, url));
  if (path === '/api/ciro' && request.method === 'POST') return json(await saveCiro(request, env), 201);
  if (path === '/api/hareketler/islem-gecmisi' && request.method === 'GET') return json(await getIslemGecmisi(request, env, url));
  if (path === '/api/hareketler/pivot' && request.method === 'GET') return json(await getPivot(request, env, url));
  if (path === '/api/hareketler/arsiv' && request.method === 'GET') return json(await getArsiv(request, env, url));
  if (path === '/api/hareketler/arsiv' && request.method === 'POST') return json(await saveArsiv(request, env), 201);
  if (path === '/api/hareketler/arsiv/excel' && request.method === 'GET') return await exportArsivCsv(request, env, url);
  const arsivMatch = path.match(/^\/api\/hareketler\/arsiv\/(\d+)$/);
  if (arsivMatch && request.method === 'DELETE') return json(await deleteArsiv(request, env, arsivMatch[1]));
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
      olusturma: new Date().toISOString(),
    }),
  });
  return calisanToDict(inserted[0]);
}

async function createSube(request, env) {
  await requireAdmin(request, env);
  const data = await request.json().catch(() => ({}));
  const { kod, isim, sifre } = validateSubePayload(data, true);
  await ensureUniqueSubeCode(env, kod);
  const rows = await supabaseFetch(env, '/subeler?select=*', {
    method: 'POST',
    body: JSON.stringify({
      kod,
      isim,
      sifre,
      adres: cleanText(data.adres).slice(0, 250),
      telefon: cleanText(data.telefon).slice(0, 30),
      aktif: true,
      stok_islem_izin: true,
      rapor_izin: true,
      olusturma: new Date().toISOString(),
    }),
  });
  return subeToDict(rows[0]);
}

async function updateSube(request, env, subeId) {
  await requireAdmin(request, env);
  const sube = await findSube(env, subeId);
  const data = await request.json().catch(() => ({}));
  const { kod, isim } = validateSubePayload({
    kod: Object.prototype.hasOwnProperty.call(data, 'kod') ? data.kod : sube.kod,
    isim: Object.prototype.hasOwnProperty.call(data, 'isim') ? data.isim : sube.isim,
  }, false);
  await ensureUniqueSubeCode(env, kod, sube.id);
  const rows = await supabaseFetch(env, `/subeler?id=eq.${encodeURIComponent(sube.id)}&select=*`, {
    method: 'PATCH',
    body: JSON.stringify({ kod, isim }),
  });
  return subeToDict(rows[0]);
}

async function updateSubeAyarlar(request, env, subeId) {
  await requireAdmin(request, env);
  const sube = await findSube(env, subeId);
  const data = await request.json().catch(() => ({}));
  const update = {};
  for (const key of ['aktif', 'stok_islem_izin', 'rapor_izin']) {
    if (Object.prototype.hasOwnProperty.call(data, key)) update[key] = Boolean(data[key]);
  }
  if (Object.prototype.hasOwnProperty.call(data, 'bloke_bitis')) {
    update.bloke_bitis = data.bloke_bitis ? parseIsoDate(data.bloke_bitis, true) : null;
  }
  if (!Object.keys(update).length) return subeToDict(sube);
  const rows = await supabaseFetch(env, `/subeler?id=eq.${encodeURIComponent(sube.id)}&select=*`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  });
  return subeToDict(rows[0]);
}

async function resetSubeSifre(request, env, subeId) {
  await requireAdmin(request, env);
  const sube = await findSube(env, subeId);
  const data = await request.json().catch(() => ({}));
  const sifre = cleanText(data.sifre);
  if (sifre.length < 4) throw new ApiError('Şube şifresi en az 4 karakter olmalı', 400);
  if (sifre.length > 100) throw new ApiError('Şube şifresi en fazla 100 karakter olmalı', 400);
  await supabaseFetch(env, `/subeler?id=eq.${encodeURIComponent(sube.id)}&select=id`, {
    method: 'PATCH',
    body: JSON.stringify({ sifre }),
  });
  return { message: 'Şube şifresi güncellendi' };
}

async function getSubeBilgi(request, env, subeId) {
  const id = await allowedBranchId(request, env, subeId);
  const sube = await findSube(env, id);
  const ciroRows = await supabaseFetch(env, `/aylik_ciro?sube_id=eq.${encodeURIComponent(id)}&select=ciro,adisyon`);
  return {
    ...subeToDict(sube),
    toplam_ciro: round(ciroRows.reduce((sum, row) => sum + Number(row.ciro || 0), 0), 2),
    toplam_adisyon: ciroRows.reduce((sum, row) => sum + Number(row.adisyon || 0), 0),
  };
}

async function updateSubeBilgi(request, env, subeId) {
  const id = await allowedBranchId(request, env, subeId);
  const sube = await findSube(env, id);
  const data = await request.json().catch(() => ({}));
  const update = {};

  if (Object.prototype.hasOwnProperty.call(data, 'adres')) update.adres = cleanText(data.adres).slice(0, 250);
  if (Object.prototype.hasOwnProperty.call(data, 'telefon')) update.telefon = cleanText(data.telefon).slice(0, 30);
  if (data.isim || data.kod) {
    const { kod, isim } = validateSubePayload({
      kod: data.kod || sube.kod,
      isim: data.isim || sube.isim,
    }, false);
    await ensureUniqueSubeCode(env, kod, sube.id);
    update.kod = kod;
    update.isim = isim;
  }
  if (data.sifre) {
    const sifre = cleanText(data.sifre);
    if (sifre.length < 4) throw new ApiError('Şube şifresi en az 4 karakter olmalı', 400);
    if (sifre.length > 100) throw new ApiError('Şube şifresi en fazla 100 karakter olmalı', 400);
    update.sifre = sifre;
  }
  if (!Object.keys(update).length) return subeToDict(sube);
  const rows = await supabaseFetch(env, `/subeler?id=eq.${encodeURIComponent(sube.id)}&select=*`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  });
  return subeToDict(rows[0]);
}

async function deleteSube(request, env, subeId) {
  await requireAdmin(request, env);
  const sube = await findSube(env, subeId);
  const products = await supabaseFetch(env, `/urunler?sube_id=eq.${encodeURIComponent(sube.id)}&select=id`);
  const productIds = products.map((product) => Number(product.id)).filter(Number.isFinite);
  if (productIds.length) {
    await supabaseFetch(env, `/stok_hareketleri?urun_id=in.(${productIds.join(',')})`, { method: 'DELETE' });
  }
  await supabaseFetch(env, `/calisanlar?sube_id=eq.${encodeURIComponent(sube.id)}`, { method: 'DELETE' });
  await supabaseFetch(env, `/urunler?sube_id=eq.${encodeURIComponent(sube.id)}`, { method: 'DELETE' });
  await supabaseFetch(env, `/aylik_arsiv?sube_id=eq.${encodeURIComponent(sube.id)}`, { method: 'DELETE' });
  await supabaseFetch(env, `/aylik_ciro?sube_id=eq.${encodeURIComponent(sube.id)}`, { method: 'DELETE' });
  await supabaseFetch(env, `/subeler?id=eq.${encodeURIComponent(sube.id)}`, { method: 'DELETE' });
  return { message: 'Silindi' };
}

async function createUrun(request, env) {
  await requireSession(request, env);
  const data = await request.json().catch(() => ({}));
  const payload = await productPayload(request, env, data, null, true);
  const rows = await supabaseFetch(env, '/urunler?select=*,subeler(isim)', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  await audit(env, {
    sube_id: payload.sube_id,
    islemi_yapan: await sessionUserName(request, env),
    islem: 'Ürün eklendi',
    varlik: 'Ürün',
    detay: `${payload.ad} · Barkod: ${payload.urun_id} · Devreden stok: ${formatNumber(payload.devreden_stok)}`,
  });
  return productToDict(env, rows[0]);
}

async function updateUrun(request, env, productId) {
  await requireSession(request, env);
  const product = await findProduct(env, productId);
  await allowedBranchId(request, env, product.sube_id);
  await ensureStockWriteAllowed(env, product.sube_id);
  const data = await request.json().catch(() => ({}));
  const payload = await productPayload(request, env, data, product, false);
  await ensureStockWriteAllowed(env, payload.sube_id);

  const eskiOzet = `${product.ad} · Barkod: ${product.urun_id} · Stok: ${formatNumber(product.devreden_stok)}`;
  const rows = await supabaseFetch(env, `/urunler?id=eq.${encodeURIComponent(product.id)}&select=*,subeler(isim)`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  await audit(env, {
    sube_id: payload.sube_id,
    islemi_yapan: await sessionUserName(request, env),
    islem: 'Ürün güncellendi',
    varlik: 'Ürün',
    detay: `${eskiOzet} → ${payload.ad} · Barkod: ${payload.urun_id} · Stok: ${formatNumber(payload.devreden_stok)}`,
  });
  return productToDict(env, rows[0]);
}

async function deleteUrun(request, env, productId) {
  await requireSession(request, env);
  const product = await findProduct(env, productId);
  await allowedBranchId(request, env, product.sube_id);
  await ensureStockWriteAllowed(env, product.sube_id);
  await audit(env, {
    sube_id: product.sube_id,
    islemi_yapan: await sessionUserName(request, env),
    islem: 'Ürün silindi',
    varlik: 'Ürün',
    detay: `${product.ad} · Barkod: ${product.urun_id}`,
  });
  await supabaseFetch(env, `/stok_hareketleri?urun_id=eq.${encodeURIComponent(product.id)}`, { method: 'DELETE' });
  await supabaseFetch(env, `/urunler?id=eq.${encodeURIComponent(product.id)}`, { method: 'DELETE' });
  return { message: 'Silindi' };
}

async function getCiro(request, env, url) {
  const ay = asMonth(url.searchParams.get('ay'));
  const yil = asYear(url.searchParams.get('yil'));
  const subeId = await allowedBranchId(request, env, url.searchParams.get('sube_id'));
  const rows = await supabaseFetch(env, `/aylik_ciro?ay=eq.${encodeURIComponent(ay)}&yil=eq.${encodeURIComponent(yil)}&${ciroSubeFilter(subeId)}&select=*&limit=1`);
  return rows.length ? ciroToDict(rows[0]) : null;
}

async function saveCiro(request, env) {
  const data = await request.json().catch(() => ({}));
  const ay = asMonth(data.ay);
  const yil = asYear(data.yil);
  const ciro = asNumber(data.ciro, 'ciro', true, 0);
  const adisyon = asPositiveInt(data.adisyon, 'adisyon', true, 0);
  const subeId = await allowedBranchId(request, env, data.sube_id);
  if (subeId) await ensureStockWriteAllowed(env, subeId);

  const existing = await supabaseFetch(env, `/aylik_ciro?ay=eq.${encodeURIComponent(ay)}&yil=eq.${encodeURIComponent(yil)}&${ciroSubeFilter(subeId)}&select=*&limit=1`);
  const payload = { ay, yil, sube_id: subeId, ciro, adisyon, guncelleme: new Date().toISOString() };
  const rows = existing.length
    ? await supabaseFetch(env, `/aylik_ciro?id=eq.${encodeURIComponent(existing[0].id)}&select=*`, { method: 'PATCH', body: JSON.stringify(payload) })
    : await supabaseFetch(env, '/aylik_ciro?select=*', { method: 'POST', body: JSON.stringify(payload) });
  return ciroToDict(rows[0]);
}

async function getIslemGecmisi(request, env, url) {
  await requireAdmin(request, env);
  const filters = ['select=*', 'order=olusturma.desc,id.desc', 'limit=500'];
  const subeId = url.searchParams.get('sube_id');
  if (subeId) filters.push(`sube_id=eq.${encodeURIComponent(asPositiveInt(subeId, 'sube_id', true))}`);
  const rows = await supabaseFetch(env, `/islem_kayitlari?${filters.join('&')}`);
  const subeler = await supabaseFetch(env, '/subeler?select=id,isim');
  const subeById = new Map(subeler.map((sube) => [Number(sube.id), sube.isim]));
  return rows.map((row) => islemKaydiToDict(row, subeById));
}

async function getPivot(request, env, url) {
  const ay = asMonth(url.searchParams.get('ay'), true);
  const yil = asYear(url.searchParams.get('yil'), true);
  const kategori = url.searchParams.get('kategori') || '';
  if (kategori && !KATEGORILER.includes(kategori)) throw new ApiError('Kategori geçersiz', 400);
  const subeId = await allowedBranchId(request, env, url.searchParams.get('sube_id'));
  const { start, end } = periodBounds(ay, yil);
  const productFilters = ['select=*', 'order=ad.asc'];
  if (subeId) productFilters.push(`sube_id=eq.${encodeURIComponent(subeId)}`);
  if (kategori) productFilters.push(`kategori=eq.${encodeURIComponent(kategori)}`);
  const products = await supabaseFetch(env, `/urunler?${productFilters.join('&')}`);
  const ids = products.map((product) => Number(product.id)).filter(Number.isFinite);
  let movements = [];
  const movementsByProduct = new Map(products.map((product) => [Number(product.id), []]));
  if (ids.length) {
    const allMovements = await supabaseFetch(
      env,
      `/stok_hareketleri?urun_id=in.(${ids.join(',')})&select=*&order=tarih.asc,id.asc`
    );
    for (const hareket of allMovements) {
      const productId = Number(hareket.urun_id);
      if (!movementsByProduct.has(productId)) movementsByProduct.set(productId, []);
      movementsByProduct.get(productId).push(hareket);
    }
    movements = allMovements.filter((hareket) => {
      const key = String(hareket.tarih).slice(0, 10);
      return key >= start && key < end;
    });
  }
  const dates = monthDates(ay, yil);
  const pivot = Object.fromEntries(dates.map((date) => [date, {}]));
  for (const hareket of movements) {
    if (hareket.hareket_turu !== 'giris' && hareket.hareket_turu !== 'cikis') continue;
    const key = String(hareket.tarih).slice(0, 10);
    const urunId = Number(hareket.urun_id);
    if (!pivot[key]) pivot[key] = {};
    if (!pivot[key][urunId]) pivot[key][urunId] = { giris: 0, cikis: 0 };
    pivot[key][urunId][hareket.hareket_turu] += Number(hareket.miktar || 0);
  }
  const productDicts = await Promise.all(products.map((product) => productToDict(
    env,
    product,
    ay,
    yil,
    movementsByProduct.get(Number(product.id)) || []
  )));
  const urunOzet = {};
  for (const product of productDicts) {
    urunOzet[String(product.id)] = {
      devreden: product.devreden_stok,
      toplam_stok: product.devreden_stok + product.gelen,
      gelen_urun: product.gelen,
      toplam_cikis: product.giden,
      guncel_stok: product.guncel_stok,
    };
  }
  return {
    tarihler: dates,
    urunler: products.map((product) => ({ id: product.id, ad: product.ad })),
    pivot,
    urun_ozet: urunOzet,
  };
}

async function getArsiv(request, env, url) {
  const subeId = await allowedReportBranchId(request, env, url.searchParams.get('sube_id'));
  const filters = ['select=*', 'order=yil.desc,ay.desc'];
  if (subeId) filters.push(`sube_id=eq.${encodeURIComponent(subeId)}`);
  const rows = await supabaseFetch(env, `/aylik_arsiv?${filters.join('&')}`);
  return rows.map(arsivToDict);
}

async function saveArsiv(request, env) {
  const data = await request.json().catch(() => ({}));
  const ay = asMonth(data.ay);
  const yil = asYear(data.yil);
  const subeId = await allowedReportBranchId(request, env, data.sube_id);
  const existing = await supabaseFetch(env, `/aylik_arsiv?ay=eq.${encodeURIComponent(ay)}&yil=eq.${encodeURIComponent(yil)}&${ciroSubeFilter(subeId)}&select=*&limit=1`);
  const payload = {
    ay,
    yil,
    sube_id: subeId,
    ad: cleanText(data.ad) || `${yil}-${String(ay).padStart(2, '0')}`,
    veri: JSON.stringify(data.veri || {}),
    guncelleme: new Date().toISOString(),
  };
  if (!existing.length) payload.olusturma = new Date().toISOString();
  if (existing.length) {
    await supabaseFetch(env, `/aylik_arsiv?id=eq.${encodeURIComponent(existing[0].id)}&select=*`, { method: 'PATCH', body: JSON.stringify(payload) });
  } else {
    await supabaseFetch(env, '/aylik_arsiv?select=*', { method: 'POST', body: JSON.stringify(payload) });
  }
  return { message: 'Arşivlendi' };
}

async function deleteArsiv(request, env, arsivId) {
  await requireSession(request, env);
  const arsiv = await selectOne(env, `/aylik_arsiv?id=eq.${encodeURIComponent(arsivId)}&select=*&limit=1`);
  if (!arsiv) throw new ApiError('Arşiv bulunamadı', 404);
  await allowedReportBranchId(request, env, arsiv.sube_id);
  await supabaseFetch(env, `/aylik_arsiv?id=eq.${encodeURIComponent(arsiv.id)}`, { method: 'DELETE' });
  return { message: 'Silindi' };
}

async function exportArsivCsv(request, env, url) {
  const ay = asMonth(url.searchParams.get('ay'), true);
  const yil = asYear(url.searchParams.get('yil'), true);
  const subeId = await allowedReportBranchId(request, env, url.searchParams.get('sube_id'));
  const productsUrl = new URL(url);
  productsUrl.searchParams.set('ay', String(ay));
  productsUrl.searchParams.set('yil', String(yil));
  if (subeId) productsUrl.searchParams.set('sube_id', String(subeId));
  const products = await handleGetStokOzet(request, env, productsUrl);
  const lines = [
    ['Rapor', `${ay}.${yil}`],
    [],
    ['Ürün ID', 'Ürün adı', 'Kategori', 'Fiyat', 'Devreden', 'Gelen', 'Giden', 'Güncel', 'Toplam Değer'],
    ...products.map((u) => [
      u.urun_id,
      u.ad,
      u.kategori,
      u.fiyat,
      u.devreden_stok,
      u.gelen,
      u.giden,
      u.guncel_stok,
      u.toplam_deger,
    ]),
  ];
  const csv = `\uFEFF${lines.map((line) => line.map(csvEscape).join(';')).join('\n')}`;
  const filename = `stok_takip_rapor_${yil}_${String(ay).padStart(2, '0')}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}

async function unlock(request, env) {
  const data = await request.json().catch(() => ({}));
  const password = cleanText(data.sifre);
  const session = await readSession(request, env);
  const admin = await selectOne(env, '/admin_ayar?select=*&order=id.asc&limit=1');
  if (admin && await verifyWerkzeugHash(admin.password_hash, password)) return { ok: true };
  if (session?.sube_id) {
    const sube = await selectOne(env, `/subeler?id=eq.${encodeURIComponent(session.sube_id)}&select=*&limit=1`);
    checkSubeAccess(sube);
    if (sube?.sifre === password) return { ok: true };
  }
  throw new ApiError('Hatalı şifre', 401);
}

async function getAdminSettings(request, env) {
  await requireAdmin(request, env);
  const admin = await selectOne(env, '/admin_ayar?select=*&order=id.asc&limit=1');
  if (!admin) throw new ApiError('Admin hesabı bulunamadı', 404);
  return adminToDict(admin);
}

async function updateAdminSettings(request, env) {
  const session = await requireAdmin(request, env);
  const admin = await selectOne(env, '/admin_ayar?select=*&order=id.asc&limit=1');
  if (!admin) throw new ApiError('Admin hesabı bulunamadı', 404);
  const data = await request.json().catch(() => ({}));
  const currentPassword = cleanText(data.current_password);
  const username = cleanText(data.username);
  const newPassword = cleanText(data.new_password);
  const newPasswordConfirm = cleanText(data.new_password_confirm);
  if (!currentPassword) throw new ApiError('Mevcut admin şifresi zorunludur', 400);
  if (!await verifyWerkzeugHash(admin.password_hash, currentPassword)) throw new ApiError('Mevcut admin şifresi hatalı', 401);
  if (!username) throw new ApiError('Admin kullanıcı adı boş olamaz', 400);
  if (username.length < 3) throw new ApiError('Admin kullanıcı adı en az 3 karakter olmalı', 400);

  const update = {};
  if (username !== admin.username) {
    const existing = await supabaseFetch(env, `/admin_ayar?username=eq.${encodeURIComponent(username)}&id=neq.${encodeURIComponent(admin.id)}&select=id&limit=1`);
    if (existing.length) throw new ApiError('Bu admin kullanıcı adı zaten kullanılıyor', 400);
    update.username = username;
  }
  if (newPassword) {
    if (newPassword.length < 8) throw new ApiError('Yeni admin şifresi en az 8 karakter olmalı', 400);
    if (newPassword !== newPasswordConfirm) throw new ApiError('Yeni şifreler eşleşmiyor', 400);
    update.password_hash = generateWerkzeugHash(newPassword);
  }
  if (!Object.keys(update).length) throw new ApiError('Değişiklik yapılmadı', 400);
  update.guncelleme = new Date().toISOString();
  const rows = await supabaseFetch(env, `/admin_ayar?id=eq.${encodeURIComponent(admin.id)}&select=*`, {
    method: 'PATCH',
    body: JSON.stringify(update),
  });
  return {
    message: 'Admin bilgileri güncellendi',
    ...adminToDict(rows[0]),
    session_username: session.username,
  };
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

function validateSubePayload(data, requirePassword) {
  const kod = cleanText(data.kod);
  const isim = cleanText(data.isim);
  const sifre = cleanText(data.sifre);
  if (!kod || !isim) throw new ApiError('Şube kodu ve şube adı zorunlu', 400);
  if (kod.length > 100) throw new ApiError('Şube kodu en fazla 100 karakter olmalı', 400);
  if (isim.length > 100) throw new ApiError('Şube adı en fazla 100 karakter olmalı', 400);
  if (requirePassword && sifre.length < 4) throw new ApiError('Şube şifresi en az 4 karakter olmalı', 400);
  if (sifre && sifre.length > 100) throw new ApiError('Şube şifresi en fazla 100 karakter olmalı', 400);
  return { kod, isim, sifre };
}

async function ensureUniqueSubeCode(env, kod, exceptId = null) {
  let path = `/subeler?kod=eq.${encodeURIComponent(kod)}&select=id&limit=1`;
  if (exceptId) path += `&id=neq.${encodeURIComponent(exceptId)}`;
  const rows = await supabaseFetch(env, path);
  if (rows.length) throw new ApiError('Bu kod zaten kullanılıyor', 400);
}

async function findSube(env, id) {
  const subeId = asPositiveInt(id, 'sube_id', true);
  const sube = await selectOne(env, `/subeler?id=eq.${encodeURIComponent(subeId)}&select=*&limit=1`);
  if (!sube) throw new ApiError('Şube bulunamadı', 404);
  return sube;
}

async function findProduct(env, id) {
  const productId = asPositiveInt(id, 'id', true);
  const product = await selectOne(env, `/urunler?id=eq.${encodeURIComponent(productId)}&select=*,subeler(isim)&limit=1`);
  if (!product) throw new ApiError('Ürün bulunamadı', 404);
  return product;
}

async function productPayload(request, env, data, current, requireAll) {
  const payload = {};
  const urunId = Object.prototype.hasOwnProperty.call(data, 'urun_id') ? cleanText(data.urun_id) : current?.urun_id;
  const ad = Object.prototype.hasOwnProperty.call(data, 'ad') ? cleanText(data.ad) : current?.ad;
  const subeIdRaw = Object.prototype.hasOwnProperty.call(data, 'sube_id') ? data.sube_id : current?.sube_id;
  const subeId = asPositiveInt(subeIdRaw, 'sube_id', requireAll || subeIdRaw !== undefined);

  if (requireAll && (!urunId || !ad || !subeId)) throw new ApiError('Ürün ID, ad, fiyat ve şube zorunlu', 400);
  if (urunId !== undefined) {
    if (!urunId) throw new ApiError('Ürün ID boş olamaz', 400);
    payload.urun_id = urunId;
  }
  if (ad !== undefined) {
    if (!ad) throw new ApiError('Ürün adı boş olamaz', 400);
    payload.ad = ad;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'fiyat') || requireAll) {
    payload.fiyat = asNumber(data.fiyat, 'fiyat', true, 0);
  } else if (current) {
    payload.fiyat = current.fiyat;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'kategori') || requireAll) {
    const kategori = data.kategori || 'diger';
    if (!KATEGORILER.includes(kategori)) throw new ApiError('Kategori geçersiz', 400);
    payload.kategori = kategori;
  } else if (current) {
    payload.kategori = current.kategori;
  }
  if (subeId) {
    await allowedBranchId(request, env, subeId);
    await findSube(env, subeId);
    payload.sube_id = subeId;
  }
  if (Object.prototype.hasOwnProperty.call(data, 'devreden_stok') || requireAll) {
    payload.devreden_stok = asNumber(data.devreden_stok ?? 0, 'devreden_stok', true, 0);
  } else if (current) {
    payload.devreden_stok = current.devreden_stok;
  }

  await ensureUniqueProductCode(env, payload.sube_id ?? current?.sube_id, payload.urun_id ?? current?.urun_id, current?.id);
  return payload;
}

async function ensureUniqueProductCode(env, subeId, urunId, exceptId = null) {
  let path = `/urunler?sube_id=eq.${encodeURIComponent(subeId)}&urun_id=eq.${encodeURIComponent(urunId)}&select=id&limit=1`;
  if (exceptId) path += `&id=neq.${encodeURIComponent(exceptId)}`;
  const rows = await supabaseFetch(env, path);
  if (rows.length) throw new ApiError('Bu ürün ID bu şubede zaten kullanılıyor', 400);
}

async function ensureStockWriteAllowed(env, subeId) {
  if (!subeId) return;
  const sube = await findSube(env, subeId);
  checkSubeAccess(sube);
  if (sube.stok_islem_izin === false) {
    throw new ApiError('Bu şube için stok işlemleri geçici olarak kapatılmıştır.', 403);
  }
}

async function allowedReportBranchId(request, env, requestedSubeId) {
  const subeId = await allowedBranchId(request, env, requestedSubeId);
  if (!subeId) return null;
  const sube = await findSube(env, subeId);
  if (sube.rapor_izin === false) {
    throw new ApiError('Bu şube için rapor indirme geçici olarak kapatılmıştır.', 403);
  }
  return subeId;
}

async function sessionUserName(request, env) {
  const session = await readSession(request, env);
  return session?.username || (session?.is_admin ? 'admin' : 'Kullanıcı');
}

async function audit(env, payload) {
  await supabaseFetch(env, '/islem_kayitlari', {
    method: 'POST',
    body: JSON.stringify({
      sube_id: payload.sube_id ?? null,
      islemi_yapan: cleanText(payload.islemi_yapan) || 'Kullanıcı',
      islem: cleanText(payload.islem).slice(0, 50),
      varlik: cleanText(payload.varlik).slice(0, 50),
      detay: cleanText(payload.detay).slice(0, 500),
      olusturma: new Date().toISOString(),
    }),
  }).catch(() => null);
}

function ciroToDict(row) {
  return {
    id: row.id,
    ay: row.ay,
    yil: row.yil,
    sube_id: row.sube_id,
    ciro: Number(row.ciro || 0),
    adisyon: Number(row.adisyon || 0),
    guncelleme: formatDateTimeTR(row.guncelleme),
  };
}

function adminToDict(row) {
  return {
    username: row.username,
    guncelleme: formatDateTimeTR(row.guncelleme),
  };
}

function arsivToDict(row) {
  return {
    id: row.id,
    ay: row.ay,
    yil: row.yil,
    sube_id: row.sube_id,
    ad: row.ad,
    veri: parseJson(row.veri, {}),
    olusturma: formatDateTimeTR(row.olusturma),
  };
}

function islemKaydiToDict(row, subeById) {
  const d = new Date(row.olusturma);
  return {
    id: row.id,
    sube_id: row.sube_id,
    sube_isim: row.sube_id ? (subeById.get(Number(row.sube_id)) || 'Şube') : 'Genel',
    islemi_yapan: row.islemi_yapan,
    islem: row.islem,
    varlik: row.varlik,
    detay: row.detay || '',
    tarih: Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul' }).format(d),
    saat: Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' }).format(d),
  };
}

function ciroSubeFilter(subeId) {
  return subeId ? `sube_id=eq.${encodeURIComponent(subeId)}` : 'sube_id=is.null';
}

function asPositiveInt(value, field, required, minValue = 1) {
  if (value === null || value === undefined || value === '') {
    if (required) throw new ApiError(`${field} zorunlu`, 400);
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < minValue) throw new ApiError(`${field} geçersiz`, 400);
  return n;
}

function asNumber(value, field, required, minValue = null) {
  if (value === null || value === undefined || value === '') {
    if (required) throw new ApiError(`${field} zorunlu`, 400);
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new ApiError(`${field} geçersiz`, 400);
  if (minValue !== null && n < minValue) throw new ApiError(`${field} en az ${minValue} olmalıdır`, 400);
  return n;
}

function asMonth(value, defaultNow = false) {
  const fallback = defaultNow ? new Date().getMonth() + 1 : null;
  const n = value === null || value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 12) throw new ApiError('Ay/yıl geçersiz', 400);
  return n;
}

function asYear(value, defaultNow = false) {
  const fallback = defaultNow ? new Date().getFullYear() : null;
  const n = value === null || value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(n) || n < 2000 || n > 2100) throw new ApiError('Ay/yıl geçersiz', 400);
  return n;
}

function parseIsoDate(value, required) {
  if (!value) {
    if (required) throw new ApiError('Tarih zorunlu', 400);
    return null;
  }
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new ApiError('Tarih formatı geçersiz', 400);
  const d = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text) {
    throw new ApiError('Tarih formatı geçersiz', 400);
  }
  return text;
}

function periodBounds(ay, yil) {
  const start = `${yil}-${String(ay).padStart(2, '0')}-01`;
  const endYear = ay === 12 ? yil + 1 : yil;
  const endMonth = ay === 12 ? 1 : ay + 1;
  return { start, end: `${endYear}-${String(endMonth).padStart(2, '0')}-01` };
}

function monthDates(ay, yil) {
  const count = new Date(yil, ay, 0).getDate();
  return Array.from({ length: count }, (_, i) => `${yil}-${String(ay).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
}

function formatDateTimeTR(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function formatNumber(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : String(n).replace(/0+$/, '').replace(/\.$/, '');
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
