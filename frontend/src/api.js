const BASE = 'http://localhost:5050/api';

async function req(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Bir hata oluştu');
  }
  return res.json();
}

async function download(path) {
  const res = await fetch(BASE + path, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Dosya indirilemedi');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] || 'stok_takip_arsiv.xlsx';
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export const api = {
  getSubeler: () => req('/subeler/'),
  createSube: (data) => req('/subeler/', { method: 'POST', body: JSON.stringify(data) }),
  updateSube: (id, data) => req(`/subeler/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateSubeAyarlar: (id, data) => req(`/subeler/${id}/ayarlar`, { method: 'PUT', body: JSON.stringify(data) }),
  resetSubeSifre: (id, sifre) => req(`/subeler/${id}/sifre`, { method: 'PUT', body: JSON.stringify({ sifre }) }),
  deleteSube: (id) => req(`/subeler/${id}`, { method: 'DELETE' }),
  getSubeBilgi: (id) => req(`/subeler/${id}/bilgi`),
  updateSubeBilgi: (id, data) => req(`/subeler/${id}/bilgi`, { method: 'PUT', body: JSON.stringify(data) }),

  getUrunler: (params = {}) => { const q = new URLSearchParams(params).toString(); return req(`/urunler/${q ? '?' + q : ''}`); },
  createUrun: (data) => req('/urunler/', { method: 'POST', body: JSON.stringify(data) }),
  updateUrun: (id, data) => req(`/urunler/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteUrun: (id) => req(`/urunler/${id}`, { method: 'DELETE' }),

  getStokOzet: (params = {}) => { const q = new URLSearchParams(params).toString(); return req(`/stok/ozet${q ? '?' + q : ''}`); },
  getStokToplam: (params = {}) => { const q = new URLSearchParams(params).toString(); return req(`/stok/toplam${q ? '?' + q : ''}`); },

  getHareketler: (params = {}) => { const q = new URLSearchParams(params).toString(); return req(`/hareketler/${q ? '?' + q : ''}`); },
  createHareket: (data) => req('/hareketler/', { method: 'POST', body: JSON.stringify(data) }),
  updateHareket: (id, data) => req(`/hareketler/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteHareket: (id) => req(`/hareketler/${id}`, { method: 'DELETE' }),
  getPivot: (params = {}) => { const q = new URLSearchParams(params).toString(); return req(`/hareketler/pivot${q ? '?' + q : ''}`); },

  getArsiv: (params = {}) => { const q = new URLSearchParams(params).toString(); return req(`/hareketler/arsiv${q ? '?' + q : ''}`); },
  saveArsiv: (data) => req('/hareketler/arsiv', { method: 'POST', body: JSON.stringify(data) }),
  deleteArsiv: (id) => req(`/hareketler/arsiv/${id}`, { method: 'DELETE' }),
  downloadArsivExcel: (params = {}) => { const q = new URLSearchParams(params).toString(); return download(`/hareketler/arsiv/excel${q ? '?' + q : ''}`); },

  getCiro: (params = {}) => { const q = new URLSearchParams(params).toString(); return req(`/ciro/${q ? '?' + q : ''}`); },
  saveCiro: (data) => req('/ciro/', { method: 'POST', body: JSON.stringify(data) }),

  kilidiAc: (sifre) => req('/auth/kilidi-ac', { method: 'POST', body: JSON.stringify({ sifre }) }),
  getAdminSettings: () => req('/auth/admin'),
  updateAdminSettings: (data) => req('/auth/admin', { method: 'PUT', body: JSON.stringify(data) }),
  login: (data) => req('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  logout: () => req('/auth/logout', { method: 'POST' }),
  getMe: () => req('/auth/me'),
};
