import { allowedBranchId } from './auth.js';
import { ApiError, selectOne, supabaseFetch } from './supabase.js';

export const KATEGORILER = ['ambalaj', 'icecek', 'sos', 'et', 'ekmek', 'tatli', 'kuru_gida', 'manav', 'diger'];

export async function getProducts(env, { subeId = null, kategori = '', q = '', select = '*' } = {}) {
  const filters = [`select=${encodeURIComponent(select)}`, 'order=id.asc'];
  if (subeId) filters.push(`sube_id=eq.${encodeURIComponent(subeId)}`);
  if (kategori) filters.push(`kategori=eq.${encodeURIComponent(kategori)}`);
  if (q) {
    const escaped = escapeLike(q);
    filters.push(`or=${encodeURIComponent(`(ad.ilike.*${escaped}*,urun_id.ilike.*${escaped}*)`)}`);
  }
  return supabaseFetch(env, `/urunler?${filters.join('&')}`);
}

export async function productToDict(env, product, ay = null, yil = null) {
  const hareketler = await supabaseFetch(
    env,
    `/stok_hareketleri?urun_id=eq.${encodeURIComponent(product.id)}&select=*&order=tarih.asc,id.asc`
  );
  const period = ay && yil ? periodBounds(ay, yil) : null;
  const allGiris = sumMovements(hareketler, 'giris');
  const allCikis = sumMovements(hareketler, 'cikis');
  let devreden = Number(product.devreden_stok || 0);
  let gelen = allGiris;
  let giden = allCikis;
  let guncel = devreden + gelen - giden;
  let devredenDeger = round2(devreden * unitPrice(product.devreden_birim_fiyat, product.fiyat));
  let toplamDeger = fifoStockValue(product, hareketler);

  if (period) {
    const before = hareketler.filter((h) => dateKey(h.tarih) < period.start);
    const within = hareketler.filter((h) => dateKey(h.tarih) >= period.start && dateKey(h.tarih) < period.end);
    const oncekiGiris = sumMovements(before, 'giris');
    const oncekiCikis = sumMovements(before, 'cikis');
    devreden = Number(product.devreden_stok || 0) + oncekiGiris - oncekiCikis;
    gelen = sumMovements(within, 'giris');
    giden = sumMovements(within, 'cikis');
    guncel = devreden + gelen - giden;
    devredenDeger = fifoStockValue(product, before);
    toplamDeger = fifoStockValue(product, hareketler.filter((h) => dateKey(h.tarih) < period.end));
  }

  return {
    id: product.id,
    urun_id: product.urun_id,
    ad: product.ad,
    fiyat: Number(product.fiyat || 0),
    devreden_birim_fiyat: unitPrice(product.devreden_birim_fiyat, product.fiyat),
    kategori: product.kategori,
    sube_id: product.sube_id,
    sube_isim: product.subeler?.isim || product.sube_isim || '',
    devreden_stok: Number(devreden),
    gelen: Number(gelen),
    giden: Number(giden),
    guncel_stok: Number(guncel),
    devreden_deger: devredenDeger,
    gelen_deger: movementValue(product, hareketler, 'giris', period),
    kullanilan_deger: movementValue(product, hareketler, 'cikis', period),
    toplam_deger: toplamDeger,
  };
}

export async function handleGetSubeler(request, env, url) {
  const session = await import('./auth.js').then((m) => m.requireSession(request, env));
  const subeler = session.is_admin
    ? await supabaseFetch(env, '/subeler?select=*&order=id.asc')
    : await supabaseFetch(env, `/subeler?id=eq.${encodeURIComponent(session.sube_id)}&select=*&order=id.asc`);

  const result = [];
  for (const sube of subeler) {
    const urunler = await supabaseFetch(env, `/urunler?sube_id=eq.${encodeURIComponent(sube.id)}&select=id`);
    let sonHareket = '';
    if (urunler.length) {
      const ids = urunler.map((u) => u.id).join(',');
      const hareketler = await supabaseFetch(
        env,
        `/stok_hareketleri?urun_id=in.(${ids})&select=tarih&order=tarih.desc,id.desc&limit=1`
      );
      sonHareket = hareketler[0]?.tarih ? formatDateTR(hareketler[0].tarih) : '';
    }
    result.push({
      ...subeToDict(sube),
      urun_sayisi: urunler.length,
      son_hareket: sonHareket,
    });
  }
  return result;
}

export async function handleGetUrunler(request, env, url) {
  const subeId = await allowedBranchId(request, env, url.searchParams.get('sube_id'));
  const kategori = url.searchParams.get('kategori') || '';
  if (kategori && !KATEGORILER.includes(kategori)) throw new ApiError('Kategori geçersiz', 400);
  const products = await getProducts(env, {
    subeId,
    kategori,
    q: (url.searchParams.get('q') || '').trim(),
    select: '*,subeler(isim)',
  });
  return Promise.all(products.map((product) => productToDict(env, product)));
}

export async function handleGetUrun(request, env, id) {
  const product = await selectOne(env, `/urunler?id=eq.${encodeURIComponent(id)}&select=*,subeler(isim)&limit=1`);
  if (!product) throw new ApiError('Ürün bulunamadı', 404);
  await allowedBranchId(request, env, product.sube_id);
  return productToDict(env, product);
}

export async function handleGetStokOzet(request, env, url) {
  const subeId = await allowedBranchId(request, env, url.searchParams.get('sube_id'));
  const kategori = url.searchParams.get('kategori') || '';
  const products = await getProducts(env, {
    subeId,
    kategori,
    q: (url.searchParams.get('q') || '').trim(),
    select: '*,subeler(isim)',
  });
  return Promise.all(products.map((product) => productToDict(env, product, url.searchParams.get('ay'), url.searchParams.get('yil'))));
}

export async function handleGetStokToplam(request, env, url) {
  const items = await handleGetStokOzet(request, env, url);
  return {
    toplam_urun_cesidi: items.length,
    toplam_stok_degeri: round2(items.reduce((sum, item) => sum + Number(item.toplam_deger || 0), 0)),
  };
}

export function subeToDict(sube) {
  return {
    id: sube.id,
    kod: sube.kod,
    isim: sube.isim,
    adres: sube.adres || '',
    telefon: sube.telefon || '',
    olusturma: sube.olusturma ? formatDateTR(sube.olusturma) : '',
    aktif: Boolean(sube.aktif),
    bloke_bitis: sube.bloke_bitis ? String(sube.bloke_bitis).slice(0, 10) : '',
    bloke_bitis_gorunum: sube.bloke_bitis ? formatDateTR(sube.bloke_bitis) : '',
    bloke_aktif: sube.bloke_bitis ? new Date(sube.bloke_bitis).getTime() > Date.now() : false,
    stok_islem_izin: Boolean(sube.stok_islem_izin),
    rapor_izin: Boolean(sube.rapor_izin),
  };
}

function sumMovements(hareketler, type) {
  return hareketler
    .filter((h) => h.hareket_turu === type)
    .reduce((sum, h) => sum + Number(h.miktar || 0), 0);
}

function movementValue(product, hareketler, type, period = null) {
  return round2(hareketler
    .filter((h) => h.hareket_turu === type)
    .filter((h) => !period || (dateKey(h.tarih) >= period.start && dateKey(h.tarih) < period.end))
    .reduce((sum, h) => sum + Number(h.miktar || 0) * unitPrice(h.birim_fiyat, product.fiyat), 0));
}

function fifoStockValue(product, hareketler) {
  const layers = [];
  const devreden = Number(product.devreden_stok || 0);
  if (devreden > 0) layers.push({ miktar: devreden, fiyat: unitPrice(product.devreden_birim_fiyat, product.fiyat) });
  for (const hareket of [...hareketler].sort((a, b) => `${dateKey(a.tarih)}:${a.id}`.localeCompare(`${dateKey(b.tarih)}:${b.id}`))) {
    const miktar = Number(hareket.miktar || 0);
    if (miktar <= 0) continue;
    if (hareket.hareket_turu === 'giris') {
      layers.push({ miktar, fiyat: unitPrice(hareket.birim_fiyat, product.fiyat) });
    } else if (hareket.hareket_turu === 'cikis') {
      let kalan = miktar;
      for (const layer of layers) {
        if (kalan <= 0) break;
        const used = Math.min(layer.miktar, kalan);
        layer.miktar -= used;
        kalan -= used;
      }
      for (let i = layers.length - 1; i >= 0; i -= 1) {
        if (layers[i].miktar <= 0.0000001) layers.splice(i, 1);
      }
    }
  }
  return round2(layers.reduce((sum, layer) => sum + layer.miktar * layer.fiyat, 0));
}

function unitPrice(value, fallback) {
  return Number(value ?? fallback ?? 0);
}

function periodBounds(ay, yil) {
  const month = Number(ay);
  const year = Number(yil);
  if (!Number.isInteger(month) || !Number.isInteger(year) || month < 1 || month > 12) return null;
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endYear = month === 12 ? year + 1 : year;
  const endMonth = month === 12 ? 1 : month + 1;
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
  return { start, end };
}

function dateKey(value) {
  return String(value || '').slice(0, 10);
}

function formatDateTR(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul' }).format(d);
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function escapeLike(value) {
  return String(value).replace(/[*,()]/g, '');
}
