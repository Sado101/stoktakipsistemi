import { allowedBranchId, requireSession } from './auth.js';
import { ApiError, selectOne, supabaseFetch } from './supabase.js';

const TEMP_MOVEMENT_ID = 9007199254740991;

export async function handleGetHareketler(request, env, url) {
  await requireSession(request, env);
  const urunId = asPositiveInt(url.searchParams.get('urun_id'), 'urun_id', false);
  const subeId = await allowedBranchId(request, env, url.searchParams.get('sube_id'));
  const kategori = url.searchParams.get('kategori') || '';
  const tarih = parseIsoDate(url.searchParams.get('tarih'), false);
  const period = periodBounds(url.searchParams.get('ay'), url.searchParams.get('yil'));

  const movementFilters = [
    'select=*',
    'order=tarih.asc,id.asc',
  ];
  if (urunId) movementFilters.push(`urun_id=eq.${encodeURIComponent(urunId)}`);
  if (tarih) movementFilters.push(`tarih=eq.${encodeURIComponent(tarih)}`);
  if (period) {
    movementFilters.push(`tarih=gte.${encodeURIComponent(period.start)}`);
    movementFilters.push(`tarih=lt.${encodeURIComponent(period.end)}`);
  }

  let hareketler = await supabaseFetch(env, `/stok_hareketleri?${movementFilters.join('&')}`);

  const productFilters = ['select=id,ad,sube_id,kategori,fiyat'];
  if (urunId) productFilters.push(`id=eq.${encodeURIComponent(urunId)}`);
  if (subeId) productFilters.push(`sube_id=eq.${encodeURIComponent(subeId)}`);
  if (kategori) productFilters.push(`kategori=eq.${encodeURIComponent(kategori)}`);

  const products = await supabaseFetch(env, `/urunler?${productFilters.join('&')}`);
  const productById = new Map(products.map((product) => [Number(product.id), product]));

  if (urunId || subeId || kategori) {
    hareketler = hareketler.filter((hareket) => productById.has(Number(hareket.urun_id)));
  }

  return hareketler.map((hareket) => movementToDict(hareket, productById.get(Number(hareket.urun_id))));
}

export async function handleCreateHareket(request, env) {
  const session = await requireSession(request, env);
  const data = await request.json().catch(() => ({}));
  const urunId = asPositiveInt(data.urun_id, 'urun_id', true);
  const hareketTuru = parseMovementType(data.hareket_turu);
  const miktar = asNumber(data.miktar, 'miktar', true, 0.000001);
  const tarih = parseIsoDate(data.tarih, false) || todayIso();

  const product = await getProductForWrite(request, env, urunId);
  ensureStockWriteAllowed(product.sube);

  const fiyatRaw = data.birim_fiyat ?? data.fiyat;
  const birimFiyat = hareketTuru === 'giris' ? asNumber(fiyatRaw, 'birim_fiyat', true, 0) : null;
  const newProduct = hareketTuru === 'giris' ? { ...product, fiyat: birimFiyat } : product;
  const simulated = {
    id: TEMP_MOVEMENT_ID,
    urun_id: urunId,
    hareket_turu: hareketTuru,
    miktar,
    birim_fiyat: birimFiyat,
    fifo_detay: null,
    tarih,
    aciklama: String(data.aciklama || ''),
    islemi_yapan: activeUserName(session),
    islem_kaynagi: String(data.islem_kaynagi || 'manuel').slice(0, 30),
  };

  const existing = await getMovementsForProduct(env, urunId);
  recalculateProductFifo(newProduct, [...existing, simulated]);

  if (hareketTuru === 'giris') {
    await patchProduct(env, urunId, { fiyat: birimFiyat });
  }

  const inserted = await insertMovement(env, withoutId(simulated));
  try {
    await recalculateAndPersistProduct(env, urunId);
  } catch (error) {
    await deleteMovement(env, inserted.id).catch(() => null);
    if (hareketTuru === 'giris') await patchProduct(env, urunId, { fiyat: product.fiyat }).catch(() => null);
    throw error;
  }

  const saved = await getMovement(env, inserted.id);
  await audit(env, {
    sube_id: product.sube_id,
    islemi_yapan: activeUserName(session),
    islem: hareketTuru === 'giris' ? 'Stok girişi' : 'Stok çıkışı',
    varlik: 'Stok hareketi',
    detay: `${product.ad} · ${formatNumber(miktar)} adet · FIFO fiyat: ${Number(saved?.birim_fiyat || 0).toFixed(2)}`,
  });

  return movementToDict(saved, product);
}

export async function handleUpdateHareket(request, env, id) {
  const session = await requireSession(request, env);
  const hareketId = asPositiveInt(id, 'id', true);
  const original = await getMovement(env, hareketId);
  if (!original) throw new ApiError('Hareket bulunamadı', 404);
  const originalProduct = await getProductForWrite(request, env, original.urun_id);
  ensureStockWriteAllowed(originalProduct.sube);

  const data = await request.json().catch(() => ({}));
  const newUrunId = data.urun_id !== undefined && data.urun_id !== ''
    ? asPositiveInt(data.urun_id, 'urun_id', true)
    : original.urun_id;
  const targetProduct = newUrunId === original.urun_id
    ? originalProduct
    : await getProductForWrite(request, env, newUrunId);
  ensureStockWriteAllowed(targetProduct.sube);

  const hareketTuru = data.hareket_turu !== undefined ? parseMovementType(data.hareket_turu) : original.hareket_turu;
  const miktar = data.miktar !== undefined ? asNumber(data.miktar, 'miktar', true, 0.000001) : Number(original.miktar || 0);
  const tarih = data.tarih ? parseIsoDate(data.tarih, true) : dateKey(original.tarih);
  const fiyatGonderildi = data.birim_fiyat !== undefined || data.fiyat !== undefined;
  let birimFiyat = original.birim_fiyat;
  if (hareketTuru === 'giris') {
    if (fiyatGonderildi) {
      birimFiyat = asNumber(data.birim_fiyat ?? data.fiyat, 'birim_fiyat', true, 0);
    } else if (birimFiyat === null || birimFiyat === undefined) {
      throw new ApiError('Giriş işlemlerinde fiyat zorunlu', 400);
    }
  } else {
    birimFiyat = null;
  }

  const updated = {
    ...original,
    urun_id: newUrunId,
    hareket_turu: hareketTuru,
    miktar,
    birim_fiyat: birimFiyat,
    fifo_detay: hareketTuru === 'giris' ? null : original.fifo_detay,
    tarih,
    aciklama: data.aciklama !== undefined ? String(data.aciklama || '') : original.aciklama,
    islemi_yapan: activeUserName(session),
  };

  const affectedIds = [...new Set([original.urun_id, newUrunId])];
  await validateAffectedProducts(env, affectedIds, (productId, movements) => {
    if (productId === original.urun_id) movements = movements.filter((item) => Number(item.id) !== hareketId);
    if (productId === newUrunId) movements = [...movements.filter((item) => Number(item.id) !== hareketId), updated];
    const product = productId === originalProduct.id
      ? { ...originalProduct, fiyat: originalProduct.id === newUrunId && hareketTuru === 'giris' ? birimFiyat : originalProduct.fiyat }
      : { ...targetProduct, fiyat: hareketTuru === 'giris' ? birimFiyat : targetProduct.fiyat };
    recalculateProductFifo(product, movements);
  });

  if (hareketTuru === 'giris') {
    await patchProduct(env, newUrunId, { fiyat: birimFiyat });
  }

  await patchMovement(env, hareketId, {
    urun_id: updated.urun_id,
    hareket_turu: updated.hareket_turu,
    miktar: updated.miktar,
    birim_fiyat: updated.birim_fiyat,
    fifo_detay: updated.hareket_turu === 'giris' ? null : updated.fifo_detay,
    tarih: updated.tarih,
    aciklama: updated.aciklama,
    islemi_yapan: updated.islemi_yapan,
  });
  for (const productId of affectedIds) {
    await recalculateAndPersistProduct(env, productId);
  }

  await audit(env, {
    sube_id: targetProduct.sube_id,
    islemi_yapan: activeUserName(session),
    islem: 'Hareket güncellendi',
    varlik: 'Stok hareketi',
    detay: `${targetProduct.ad} · ${formatNumber(miktar)} adet · Fiyat: ${Number(birimFiyat || 0).toFixed(2)}`,
  });

  return movementToDict(await getMovement(env, hareketId), targetProduct);
}

export async function handleDeleteHareket(request, env, id) {
  const session = await requireSession(request, env);
  const hareketId = asPositiveInt(id, 'id', true);
  const hareket = await getMovement(env, hareketId);
  if (!hareket) throw new ApiError('Hareket bulunamadı', 404);
  const product = await getProductForWrite(request, env, hareket.urun_id);
  ensureStockWriteAllowed(product.sube);

  const existing = await getMovementsForProduct(env, product.id);
  recalculateProductFifo(product, existing.filter((item) => Number(item.id) !== hareketId));

  await audit(env, {
    sube_id: product.sube_id,
    islemi_yapan: activeUserName(session),
    islem: 'Hareket silindi',
    varlik: 'Stok hareketi',
    detay: `${product.ad} · ${formatNumber(hareket.miktar)} adet`,
  });
  await deleteMovement(env, hareketId);
  await recalculateAndPersistProduct(env, product.id);
  return { message: 'Silindi' };
}

async function getProductForWrite(request, env, productId) {
  const product = await selectOne(env, `/urunler?id=eq.${encodeURIComponent(productId)}&select=*&limit=1`);
  if (!product) throw new ApiError('Ürün bulunamadı', 404);
  await allowedBranchId(request, env, product.sube_id);
  const sube = await selectOne(env, `/subeler?id=eq.${encodeURIComponent(product.sube_id)}&select=*&limit=1`);
  return { ...product, sube };
}

function ensureStockWriteAllowed(sube) {
  if (sube?.stok_islem_izin === false) {
    throw new ApiError('Bu şube için stok işlemleri geçici olarak kapatılmıştır.', 403);
  }
}

async function validateAffectedProducts(env, productIds, validator) {
  for (const productId of productIds) {
    const movements = await getMovementsForProduct(env, productId);
    validator(productId, movements);
  }
}

async function recalculateAndPersistProduct(env, productId) {
  const product = await selectOne(env, `/urunler?id=eq.${encodeURIComponent(productId)}&select=*&limit=1`);
  if (!product) return;
  const movements = await getMovementsForProduct(env, productId);
  const recalculated = recalculateProductFifo(product, movements);
  for (const movement of recalculated) {
    await patchMovement(env, movement.id, {
      birim_fiyat: movement.birim_fiyat,
      fifo_detay: movement.fifo_detay,
    });
  }
}

function recalculateProductFifo(product, movements) {
  const layers = [];
  const devredenMiktar = Number(product.devreden_stok || 0);
  const devredenFiyat = unitPrice(product.devreden_birim_fiyat, product.fiyat);
  if (devredenMiktar > 0) {
    layers.push({
      kaynak: 'Devreden stok',
      hareket_id: null,
      tarih: null,
      kalan: devredenMiktar,
      fiyat: devredenFiyat,
    });
  }

  const changed = [];
  const ordered = [...movements].sort(compareMovements);
  for (const movement of ordered) {
    const miktar = Number(movement.miktar || 0);
    if (miktar <= 0) continue;

    if (movement.hareket_turu === 'giris') {
      layers.push({
        kaynak: 'Giriş',
        hareket_id: movement.id === TEMP_MOVEMENT_ID ? null : movement.id,
        tarih: dateKey(movement.tarih) || null,
        kalan: miktar,
        fiyat: unitPrice(movement.birim_fiyat, product.fiyat),
      });
      if (movement.id !== TEMP_MOVEMENT_ID && movement.fifo_detay !== null) {
        changed.push({ ...movement, fifo_detay: null });
      }
      continue;
    }

    if (movement.hareket_turu !== 'cikis') continue;

    let kalanCikis = miktar;
    let toplamDeger = 0;
    const detay = [];
    for (const layer of layers) {
      if (kalanCikis <= 0) break;
      const layerKalan = Number(layer.kalan || 0);
      if (layerKalan <= 0) continue;
      const kullanilan = Math.min(layerKalan, kalanCikis);
      const fiyat = Number(layer.fiyat || 0);
      toplamDeger += kullanilan * fiyat;
      layer.kalan = layerKalan - kullanilan;
      kalanCikis -= kullanilan;
      detay.push({
        kaynak: layer.kaynak || '',
        hareket_id: layer.hareket_id,
        tarih: layer.tarih,
        miktar: round(kullanilan, 6),
        birim_fiyat: round(fiyat, 6),
        tutar: round(kullanilan * fiyat, 2),
      });
    }

    if (kalanCikis > 0.0000001) {
      throw new ApiError(
        `${product.ad} için yeterli stok yok. Çıkış: ${formatNumber(miktar)}, eksik: ${formatNumber(kalanCikis)}`,
        400
      );
    }

    const nextPrice = round(toplamDeger / miktar, 6);
    const nextDetail = JSON.stringify(detay);
    if (
      movement.id !== TEMP_MOVEMENT_ID
      && (round(movement.birim_fiyat, 6) !== nextPrice || String(movement.fifo_detay || '') !== nextDetail)
    ) {
      changed.push({ ...movement, birim_fiyat: nextPrice, fifo_detay: nextDetail });
    }
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      if (Number(layers[i].kalan || 0) <= 0.0000001) layers.splice(i, 1);
    }
  }
  return changed;
}

async function getMovementsForProduct(env, productId) {
  return supabaseFetch(
    env,
    `/stok_hareketleri?urun_id=eq.${encodeURIComponent(productId)}&select=*&order=tarih.asc,id.asc`
  );
}

async function getMovement(env, movementId) {
  const movement = await selectOne(env, `/stok_hareketleri?id=eq.${encodeURIComponent(movementId)}&select=*&limit=1`);
  if (!movement) return null;
  const product = await selectOne(
    env,
    `/urunler?id=eq.${encodeURIComponent(movement.urun_id)}&select=id,ad,sube_id,kategori,fiyat&limit=1`
  );
  return { ...movement, urunler: product };
}

async function insertMovement(env, payload) {
  const rows = await supabaseFetch(env, '/stok_hareketleri?select=*', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return rows[0];
}

async function patchMovement(env, id, payload) {
  const rows = await supabaseFetch(env, `/stok_hareketleri?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return rows[0];
}

async function deleteMovement(env, id) {
  return supabaseFetch(env, `/stok_hareketleri?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: 'DELETE',
  });
}

async function patchProduct(env, id, payload) {
  return supabaseFetch(env, `/urunler?id=eq.${encodeURIComponent(id)}&select=*`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

async function audit(env, payload) {
  await supabaseFetch(env, '/islem_kayitlari', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      detay: String(payload.detay || '').slice(0, 500),
    }),
  }).catch(() => null);
}

function movementToDict(movement, product = null) {
  const urun = product || movement.urunler || {};
  const fiyat = unitPrice(movement.birim_fiyat, urun.fiyat);
  return {
    id: movement.id,
    urun_id: movement.urun_id,
    urun_ad: urun.ad || '',
    hareket_turu: movement.hareket_turu,
    miktar: Number(movement.miktar || 0),
    birim_fiyat: fiyat,
    hareket_degeri: round(Number(movement.miktar || 0) * fiyat, 2),
    fifo_detay: parseFifoDetail(movement.fifo_detay),
    tarih: formatDateTR(movement.tarih),
    tarih_iso: dateKey(movement.tarih),
    saat: formatTimeTR(movement.olusturma),
    olusturma: formatDateTimeTR(movement.olusturma),
    aciklama: movement.aciklama || '',
    islemi_yapan: movement.islemi_yapan || 'Eski kayıt',
    islem_kaynagi: movement.islem_kaynagi || '',
  };
}

function parseFifoDetail(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function withoutId(value) {
  const { id, ...rest } = value;
  return rest;
}

function activeUserName(session) {
  return session?.username || (session?.is_admin ? 'admin' : 'Kullanıcı');
}

function parseMovementType(value) {
  if (value !== 'giris' && value !== 'cikis') throw new ApiError('Hareket türü geçersiz', 400);
  return value;
}

function asPositiveInt(value, field, required) {
  if (value === null || value === undefined || value === '') {
    if (required) throw new ApiError(`${field} zorunlu`, 400);
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new ApiError(`${field} geçersiz`, 400);
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

function parseIsoDate(value, required) {
  if (!value) {
    if (required) throw new ApiError('Tarih zorunlu', 400);
    return null;
  }
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new ApiError('Tarih formatı geçersiz', 400);
  const d = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text) {
    throw new ApiError('Tarih formatı geçersiz', 400);
  }
  return text;
}

function periodBounds(ay, yil) {
  if (!ay && !yil) return null;
  const month = Number(ay);
  const year = Number(yil);
  if (!Number.isInteger(month) || !Number.isInteger(year) || month < 1 || month > 12) {
    throw new ApiError('Ay/yıl geçersiz', 400);
  }
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endYear = month === 12 ? year + 1 : year;
  const endMonth = month === 12 ? 1 : month + 1;
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
  return { start, end };
}

function compareMovements(a, b) {
  return `${dateKey(a.tarih)}:${String(a.id).padStart(16, '0')}`
    .localeCompare(`${dateKey(b.tarih)}:${String(b.id).padStart(16, '0')}`);
}

function unitPrice(value, fallback) {
  return Number(value ?? fallback ?? 0);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function dateKey(value) {
  return String(value || '').slice(0, 10);
}

function formatDateTR(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul' }).format(d);
}

function formatTimeTR(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
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

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
}

function formatNumber(value) {
  const n = Number(value || 0);
  return Number.isInteger(n) ? String(n) : String(n).replace(/0+$/, '').replace(/\.$/, '');
}
