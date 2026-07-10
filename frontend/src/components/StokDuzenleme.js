import { useState, useEffect } from 'react';
import { api } from '../api';
import { ArrowDown, ArrowUp, MousePointer2, Pencil, Save, Search, Trash2 } from 'lucide-react';

const KAT = {
  ambalaj: 'Ambalaj', icecek: 'İçecek', sos: 'Sos', et: 'Et',
  ekmek: 'Ekmek', tatli: 'Tatlı', kuru_gida: 'Kuru Gıda', manav: 'Manav', diger: 'Diğer'
};

export default function StokDuzenleme({ subeler, secilenSube, onGuncelle, kullanici, onNotify, onConfirm }) {
  const [urunler, setUrunler] = useState([]);
  const [arama, setArama] = useState('');
  const [secili, setSecili] = useState(null);
  const [form, setForm] = useState({});
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hareketler, setHareketler] = useState([]);

  const ara = async () => {
    try {
      const params = {};
      if (secilenSube) params.sube_id = secilenSube;
      if (arama) params.q = arama;
      setUrunler(await api.getUrunler(params));
    } catch (e) { console.error(e); }
  };

  useEffect(() => { ara(); }, [secilenSube]);

  const sec = async (u) => {
    setSecili(u);
    setForm({ ad: u.ad, fiyat: u.fiyat, kategori: u.kategori, sube_id: String(u.sube_id), devreden_stok: u.devreden_stok });
    try {
      const data = await api.getHareketler({ urun_id: u.id });
      setHareketler(data.reverse());
    } catch (e) { setHareketler([]); }
  };

  const guncelle = async (e) => {
    e.preventDefault();
    setYukleniyor(true);
    try {
      await api.updateUrun(secili.id, {
        ...form,
        fiyat: parseFloat(form.fiyat),
        sube_id: parseInt(form.sube_id),
        devreden_stok: parseFloat(form.devreden_stok)
      });
      onNotify?.('success', 'Ürün başarıyla güncellendi.');
      onGuncelle();
      ara();
    } catch (err) {
      onNotify?.('error', err.message);
    }
    setYukleniyor(false);
  };

  const sil = async (id) => {
    try {
      await api.deleteUrun(id);
      setSecili(null);
      onGuncelle();
      ara();
      onNotify?.('success', 'Ürün silindi.');
    } catch (err) { onNotify?.('error', err.message); }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Stok Düzenleme</h1>
        <p>Mevcut ürünleri güncelleyin veya kaldırın</p>
      </div>

      <div className="edit-layout">
        {/* Sol: Arama listesi */}
        <div className="card edit-product-list-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ flex: 1, padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit' }}
                placeholder="Ara..."
                value={arama}
                onChange={e => setArama(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && ara()}
              />
              <button className="btn btn-primary btn-sm" onClick={ara}><Search size={15} /> Ara</button>
            </div>
          </div>
          <div className="edit-product-list">
            {urunler.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Ürün bulunamadı</div>
            )}
            {urunler.map(u => (
              <div
                key={u.id}
                onClick={() => sec(u)}
                style={{
                  padding: '11px 16px',
                  cursor: 'pointer',
                  borderBottom: '1px solid #f8fafc',
                  background: secili?.id === u.id ? '#eff6ff' : 'transparent',
                  borderLeft: secili?.id === u.id ? '3px solid #3b82f6' : '3px solid transparent',
                  transition: 'all 0.12s'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>{u.ad}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'flex', gap: 8 }}>
                  <span>{u.urun_id}</span>
                  <span>·</span>
                  <span>₺{u.fiyat}</span>
                  <span>·</span>
                  <span style={{ color: u.guncel_stok <= 0 ? '#ef4444' : '#64748b' }}>
                    Stok: {u.guncel_stok}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sağ: Düzenleme formu */}
        <div className="card edit-form-card">
          {!secili ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
              <div style={{ marginBottom: 12 }}><MousePointer2 size={38} strokeWidth={1.7} /></div>
              <div style={{ fontWeight: 500, color: '#64748b' }}>Soldan düzenlemek istediğiniz ürüne tıklayın</div>
            </div>
          ) : (
            <>
              <div className="card-title">
                <Pencil size={18} /> Düzenle: {secili.ad}
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8', fontWeight: 400 }}>ID: {secili.urun_id}</span>
              </div>
              <form onSubmit={guncelle}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Ürün Adı</label>
                    <input value={form.ad || ''} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Birim Fiyat (₺)</label>
                    <input type="number" step="0.01" min="0" value={form.fiyat ?? ''} onChange={e => setForm(f => ({ ...f, fiyat: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Kategori</label>
                    <select value={form.kategori || ''} onChange={e => setForm(f => ({ ...f, kategori: e.target.value }))}>
                      {Object.entries(KAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                     <label>Şube</label>
                    <select
                      value={form.sube_id || ''}
                      onChange={e => setForm(f => ({ ...f, sube_id: e.target.value }))}
                      disabled={kullanici?.role === 'sube'}
                      style={kullanici?.role === 'sube' ? { background: '#f8fafc', color: '#94a3b8' } : {}}>{(kullanici?.role === 'sube'
                        ? subeler.filter(s => String(s.id) === secilenSube)
                        : subeler
                        ).map(s => <option key={s.id} value={String(s.id)}>{s.isim}</option>)}
                      </select>
                    </div>
                  <div className="form-group">
                    <label>Devreden Stok</label>
                    <input type="number" step="0.01" min="0" value={form.devreden_stok ?? ''} onChange={e => setForm(f => ({ ...f, devreden_stok: e.target.value }))} />
                  </div>
                </div>

                <div className="edit-form-actions">
                  <button type="submit" className="btn btn-primary" disabled={yukleniyor}>
                    <Save size={17} /> {yukleniyor ? 'Güncelleniyor...' : 'Güncelle'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => onConfirm?.({
                      title: 'Ürün silinsin mi?',
                      message: `"${secili.ad}" ürünü silinecek.`,
                      detail: 'Bu ürüne bağlı tüm hareket kayıtları da silinir. Bu işlem geri alınamaz.',
                      confirmText: 'Evet, Sil',
                      onConfirm: () => sil(secili.id),
                    })}
                  >
                    <Trash2 size={17} /> Ürünü Sil
                  </button>
                </div>
              </form>

              {/* Hareket geçmişi */}
              <div style={{ marginTop: 24, borderTop: '1px solid #f1f5f9', paddingTop: 20 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#64748b', marginBottom: 10 }}>
                  Hareket Geçmişi
                  <span style={{ marginLeft: 8, fontWeight: 400, color: '#94a3b8' }}>{hareketler.length} kayıt</span>
                </div>
                {hareketler.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: 13 }}>Hareket kaydı bulunamadı.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ padding: '6px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>Tarih</th>
                          <th style={{ padding: '6px 10px', textAlign: 'center', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>Tür</th>
                          <th style={{ padding: '6px 10px', textAlign: 'right', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>Miktar</th>
                          <th style={{ padding: '6px 10px', textAlign: 'left', color: '#64748b', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>Açıklama</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hareketler.map(h => (
                          <tr key={h.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                            <td style={{ padding: '6px 10px', color: '#475569' }}>{h.tarih}</td>
                            <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                              {h.hareket_turu === 'giris'
                                ? <span style={{ color: '#059669', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowUp size={14} /> Giriş</span>
                                : <span style={{ color: '#dc2626', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowDown size={14} /> Çıkış</span>}
                            </td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600 }}>{h.miktar}</td>
                            <td style={{ padding: '6px 10px', color: '#94a3b8', fontSize: 12 }}>{h.aciklama || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
