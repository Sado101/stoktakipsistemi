import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { KeyRound, Plus, Trash2, UserRound } from 'lucide-react';

export default function CalisanYonetimi({ subeId, aktifCalisanId, onNotify, onConfirm }) {
  const [calisanlar, setCalisanlar] = useState([]);
  const [form, setForm] = useState({ ad: '', pin: '' });
  const [islemde, setIslemde] = useState(false);

  const getir = useCallback(async () => {
    if (!subeId) return setCalisanlar([]);
    try { setCalisanlar(await api.getCalisanlar(subeId)); }
    catch (e) { onNotify?.('error', e.message); }
  }, [subeId, onNotify]);

  useEffect(() => { getir(); }, [getir]);

  const ekle = async (e) => {
    e.preventDefault();
    if (!form.ad.trim() || !/^\d{2,12}$/.test(form.pin)) {
      return onNotify?.('error', 'Adı ve 2-12 haneli rakamsal şifreyi girin.');
    }
    setIslemde(true);
    try {
      const ilkKullanici = calisanlar.length === 0;
      await api.createCalisan(subeId, { ad: form.ad.trim(), pin: form.pin });
      setForm({ ad: '', pin: '' });
      await getir();
      onNotify?.('success', 'Çalışan eklendi. Bundan sonraki şube girişlerinde kişisel şifre sorulacak.');
      if (ilkKullanici) window.setTimeout(() => window.location.reload(), 700);
    } catch (e) { onNotify?.('error', e.message); }
    finally { setIslemde(false); }
  };

  const guncelle = async (calisan, data) => {
    setIslemde(true);
    try { await api.updateCalisan(subeId, calisan.id, data); await getir(); onNotify?.('success', 'Çalışan güncellendi.'); }
    catch (e) { onNotify?.('error', e.message); }
    finally { setIslemde(false); }
  };

  const sifreDegistir = (calisan) => {
    const pin = window.prompt(`${calisan.ad} için yeni kişisel şifre (2-12 rakam):`);
    if (pin === null) return;
    if (!/^\d{2,12}$/.test(pin)) return onNotify?.('error', 'Şifre 2-12 rakam olmalı.');
    guncelle(calisan, { pin });
  };

  const sil = (calisan) => onConfirm?.({
    title: 'Çalışan silinsin mi?', message: `“${calisan.ad}” artık bu şubeye kişisel şifresiyle giremeyecek.`,
    confirmText: 'Evet, Sil', onConfirm: async () => {
      await api.deleteCalisan(subeId, calisan.id); await getir(); onNotify?.('success', 'Çalışan silindi.');
    },
  });

  if (!subeId) return <div className="card empty-state">Çalışanları yönetmek için bir şube seçin.</div>;
  return (
    <section className="employee-settings card">
      <div className="employee-settings-head"><div><h2>Şube Kullanıcıları</h2><p>Herkes eşit erişime sahiptir; şifre yalnızca çalışanı tanır.</p></div><UserRound size={24} /></div>
      <form className="employee-add-form" onSubmit={ekle}>
        <input value={form.ad} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))} placeholder="Çalışan adı (ör. Sadık)" />
        <input type="password" inputMode="numeric" value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 12) }))} placeholder="Kişisel şifre " />
        <button className="btn btn-primary" disabled={islemde}><Plus size={17} /> Kullanıcı Ekle</button>
      </form>
      <div className="employee-list">
        {calisanlar.length === 0 && <div className="empty-state">Henüz çalışan eklenmedi.</div>}
        {calisanlar.map(c => <div className="employee-row" key={c.id}>
          <span className="employee-avatar">{c.ad.charAt(0).toUpperCase()}</span>
          <div><strong>{c.ad}{c.id === aktifCalisanId ? ' · Siz' : ''}</strong><small>{c.aktif ? 'Aktif' : 'Pasif'} · Eşit erişim</small></div>
          <button className="btn btn-secondary btn-sm" disabled={islemde} onClick={() => sifreDegistir(c)}><KeyRound size={15} /> Şifre</button>
          <button className={`switch ${c.aktif ? 'on' : ''}`} disabled={islemde || c.id === aktifCalisanId} onClick={() => guncelle(c, { aktif: !c.aktif })} aria-label="Aktiflik" />
          <button className="employee-delete" disabled={islemde || c.id === aktifCalisanId} onClick={() => sil(c)} title="Sil"><Trash2 size={16} /></button>
        </div>)}
      </div>
    </section>
  );
}
