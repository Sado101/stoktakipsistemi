import { useState } from 'react';
import { api } from '../api';
import { Info, PackagePlus, Save } from 'lucide-react';

const KAT = {
  ambalaj: 'Ambalaj', icecek: 'İçecek', sos: 'Sos', et: 'Et',
  ekmek: 'Ekmek', tatli: 'Tatlı', kuru_gida: 'Kuru Gıda', manav: 'Manav', diger: 'Diğer'
};

const BOŞ = { urun_id: '', ad: '', fiyat: '', kategori: 'diger', sube_id: '', devreden_stok: '' };

export default function UrunGirisi({ subeler, secilenSube, onKayit, kullanici, onNotify }) {
  const [form, setForm] = useState({ ...BOŞ, sube_id: secilenSube || '' });
  const [yukleniyor, setYukleniyor] = useState(false);

  const set = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const kaydet = async (e) => {
    e.preventDefault();
    if (!form.urun_id || !form.ad || !form.fiyat || !form.sube_id) {
      onNotify?.('error', 'Ürün ID, adı, fiyatı ve şube zorunludur.');
      return;
    }
    setYukleniyor(true);
    try {
      await api.createUrun({
        ...form,
        fiyat: parseFloat(form.fiyat),
        sube_id: parseInt(form.sube_id),
        devreden_stok: parseFloat(form.devreden_stok || 0),
      });
      onNotify?.('success', `"${form.ad}" başarıyla eklendi.`);
      setForm({ ...BOŞ, sube_id: secilenSube || '' });
      onKayit();
    } catch (err) {
      onNotify?.('error', err.message);
    }
    setYukleniyor(false);
  };

  return (
    <div>
      <div className="page-header">
        <h1>Yeni Ürün Girişi</h1>
        <p>Stok takibine yeni ürün ekleyin</p>
      </div>

      <div className="card">
        <div className="card-title"><PackagePlus size={18} /> Ürün Bilgileri</div>
        <form onSubmit={kaydet}>
          <div className="form-grid">
            <div className="form-group">
              <label>Ürün ID *</label>
              <input name="urun_id" value={form.urun_id} onChange={set} placeholder="ör: PRD-001" />
            </div>
            <div className="form-group">
              <label>Ürün Adı *</label>
              <input name="ad" value={form.ad} onChange={set} placeholder="ör: Patates" />
            </div>
            <div className="form-group">
              <label>Birim Fiyat (₺) *</label>
              <input name="fiyat" type="number" step="0.01" min="0" value={form.fiyat} onChange={set} placeholder="0.00" inputMode="decimal" />
            </div>
            <div className="form-group">
              <label>Kategori</label>
              <select name="kategori" value={form.kategori} onChange={set}>
                {Object.entries(KAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Şube *</label>
             <select name="sube_id" value={form.sube_id} onChange={set}
  disabled={kullanici?.role === 'sube'}
  style={kullanici?.role === 'sube' ? { background: '#f8fafc', color: '#94a3b8' } : {}}>
  <option value="">Şube Seçin</option>
  {(kullanici?.role === 'sube'
    ? subeler.filter(s => String(s.id) === secilenSube)
    : subeler
  ).map(s => <option key={s.id} value={String(s.id)}>{s.isim} ({s.kod})</option>)}
</select>
            </div>
            <div className="form-group">
              <label>Başlangıç Devreden Stoku</label>
              <input name="devreden_stok" type="number" step="0.01" min="0" value={form.devreden_stok} onChange={set} placeholder="Ürün ilk eklenirken eldeki stok" inputMode="decimal" />
            </div>
          </div>
          <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
            <button type="submit" className="btn btn-primary" disabled={yukleniyor} style={{ flex: 1 }}>
              <Save size={17} /> {yukleniyor ? 'Kaydediliyor...' : 'Ürünü Kaydet'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setForm({ ...BOŞ, sube_id: secilenSube || '' })}>
              Temizle
            </button>
          </div>
        </form>
      </div>

      <div className="card" style={{ background: 'linear-gradient(135deg,#eff6ff,#f0fdf4)', border: '1px solid #bfdbfe' }}>
        <div className="card-title" style={{ borderColor: '#bfdbfe' }}><Info size={18} /> İpuçları</div>
        <ul style={{ paddingLeft: 18, fontSize: 13, color: '#475569', lineHeight: 2.2 }}>
          <li>Ürün ID benzersiz olmalı — ör: <strong>ET-001</strong>, <strong>SOS-003</strong></li>
          <li>Devreden stok: geçen aydan kalan miktarı girin</li>
          <li>Bu ayki giriş/çıkışları <strong>Hareketler</strong> ekranından kaydedin</li>
          <li>Fiyat güncellemesi için <strong>Düzenle</strong> ekranını kullanın</li>
        </ul>
      </div>
    </div>
  );
}







