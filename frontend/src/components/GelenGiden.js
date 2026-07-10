import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import {
  Archive,
  Beef,
  Boxes,
  Box,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Cookie,
  CupSoda,
  FileText,
  Leaf,
  Package,
  PackageCheck,
  PackageOpen,
  Sandwich,
  ShoppingBasket,
  Wheat,
} from 'lucide-react';

const KATEGORILER = [
  { key: '', label: 'Tümü', Icon: FileText },
  { key: 'icecek', label: 'İçecek', Icon: CupSoda },
  { key: 'kuru_gida', label: 'Kuru Gıda', Icon: Wheat },
  { key: 'et', label: 'Et', Icon: Beef },
  { key: 'sos', label: 'Sos', Icon: ShoppingBasket },
  { key: 'ambalaj', label: 'Ambalaj', Icon: Archive },
  { key: 'manav', label: 'Manav', Icon: Leaf },
  { key: 'ekmek', label: 'Ekmek', Icon: Sandwich },
  { key: 'tatli', label: 'Tatlı', Icon: Cookie },
  { key: 'diger', label: 'Diğer', Icon: Box },
];

const AYLAR = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function tarihFmt(str) {
  if (!str) return '';
  const dotted = str.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotted) {
    return str;
  }
  const d = new Date(str + 'T00:00:00');
  return `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}.${d.getFullYear()}`;
}

function sayi(value) {
  return Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

function kategoriBilgi(key) {
  return KATEGORILER.find(k => k.key === key) || KATEGORILER[0];
}

export default function GelenGiden({ secilenSube, yenile, onHareket, ay, yil, donemAcik, onKilitAc, onNotify, onConfirm }) {
  const now = new Date();
  const ayKapaliHam = yil < now.getFullYear() || (yil === now.getFullYear() && ay < now.getMonth() + 1);
  const ayKapali = ayKapaliHam && !donemAcik;

  const [kategori, setKategori] = useState('');
  const [urunler, setUrunler] = useState([]);
  const [hareketler, setHareketler] = useState([]);
  const [seciliUrunId, setSeciliUrunId] = useState(null);
  const [form, setForm] = useState({
    urun_id: '', hareket_turu: 'giris', miktar: '', aciklama: '',
    tarih: now.toISOString().split('T')[0]
  });
  const [yukleniyor, setYukleniyor] = useState(false);
  const [harModal, setHarModal] = useState(false);
  const [duzenlenenHareket, setDuzenlenenHareket] = useState(null);
  const [acikMenu, setAcikMenu] = useState(null);

  useEffect(() => {
    const getir = async () => {
      setYukleniyor(true);
      try {
        const params = { ay, yil };
        if (kategori) params.kategori = kategori;
        if (secilenSube) params.sube_id = secilenSube;

        const [stokData, hareketData] = await Promise.all([
          api.getStokOzet(params),
          api.getHareketler(params)
        ]);

        setUrunler(stokData);
        setHareketler(hareketData);
        setSeciliUrunId(id => (id && stokData.some(u => u.id === id) ? id : null));
      } catch (e) {
        console.error(e);
      }
      setYukleniyor(false);
    };
    getir();
  }, [ay, yil, kategori, secilenSube, yenile]);

  const seciliUrun = useMemo(
    () => urunler.find(u => u.id === seciliUrunId) || null,
    [urunler, seciliUrunId]
  );

  const seciliHareketler = useMemo(() => {
    if (!seciliUrun) return [];
    return hareketler.filter(h => h.urun_id === seciliUrun.id);
  }, [hareketler, seciliUrun]);

  const kategoriAktif = kategoriBilgi(kategori);
  const KategoriIcon = kategoriAktif.Icon;

  const modalAc = (urun = null, hareketTuru = 'giris') => {
    setDuzenlenenHareket(null);
    setForm(f => ({
      ...f,
      urun_id: urun ? String(urun.id) : '',
      hareket_turu: hareketTuru,
      miktar: '',
      aciklama: ''
    }));
    setHarModal(true);
  };

  const duzenleModalAc = (hareket) => {
    setDuzenlenenHareket(hareket);
    setAcikMenu(null);
    setForm({
      urun_id: String(hareket.urun_id),
      hareket_turu: hareket.hareket_turu,
      miktar: String(hareket.miktar),
      aciklama: hareket.aciklama || '',
      tarih: hareket.tarih_iso || hareket.tarih
    });
    setHarModal(true);
  };

  const kaydet = async (e) => {
    e.preventDefault();
    if (!form.urun_id || !form.miktar) {
      onNotify?.('error', 'Ürün ve miktar zorunludur.');
      return;
    }
    try {
      const payload = { ...form, urun_id: parseInt(form.urun_id), miktar: parseFloat(form.miktar) };
      if (duzenlenenHareket) {
        await api.updateHareket(duzenlenenHareket.id, payload);
      } else {
        await api.createHareket(payload);
      }
      onNotify?.('success', `${form.hareket_turu === 'giris' ? 'Giriş' : 'Çıkış'} ${duzenlenenHareket ? 'güncellendi' : 'kaydedildi'}.`);
      setForm(f => ({ ...f, urun_id: '', miktar: '', aciklama: '' }));
      setDuzenlenenHareket(null);
      setHarModal(false);
      onHareket();
    } catch (err) {
      onNotify?.('error', err.message);
    }
  };

  const silHareket = async (id) => {
    try {
      await api.deleteHareket(id);
      setAcikMenu(null);
      onHareket();
      onNotify?.('success', 'Hareket kaydı silindi.');
    } catch (e) {
      onNotify?.('error', e.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Gelen / Giden</h1>
        <p>{AYLAR[ay]} {yil} — Ürün bazlı stok hareketleri</p>
      </div>

      <div className="kat-tabs">
        {KATEGORILER.map(k => (
          <button
            key={k.key}
            className={`kat-tab ${kategori === k.key ? 'active' : ''}`}
            onClick={() => {
              setKategori(k.key);
              setSeciliUrunId(null);
            }}
          >
            <span><k.Icon size={16} strokeWidth={2.2} /></span>
            {k.label}
          </button>
        ))}
      </div>

      <div className="movement-toolbar">
        {ayKapaliHam && !donemAcik && (
          <button onClick={onKilitAc} className="period-lock-btn">
            Bu dönem kapalıdır — Açmak için tıkla
          </button>
        )}
        {ayKapaliHam && donemAcik && (
          <span className="period-open-badge">Dönem Açık</span>
        )}
        {!ayKapali && (
          <div className="movement-action-group">
            <button className="btn btn-success" onClick={() => modalAc(null, 'giris')}>
              <ChevronUp size={17} /> Giriş Ekle
            </button>
            <button className="btn btn-danger" onClick={() => modalAc(null, 'cikis')}>
              <ChevronDown size={17} /> Çıkış Ekle
            </button>
          </div>
        )}
      </div>

      {!seciliUrun ? (
        <div className="card">
          <div className="product-list-head">
            <div>
              <div className="product-list-title">
                <span><KategoriIcon size={20} strokeWidth={2.2} /></span>
                {kategoriAktif.label} Ürünleri
              </div>
              <div className="product-list-subtitle">Detay görmek için bir ürüne tıklayın.</div>
            </div>
            <div className="product-list-count">{urunler.length} ürün</div>
          </div>

          {yukleniyor ? (
            <div className="empty-state">Yükleniyor...</div>
          ) : urunler.length === 0 ? (
            <div className="empty-state">Bu kategori için ürün bulunamadı.</div>
          ) : (
            <div className="product-card-grid">
              {urunler.map(u => {
                const durum = u.guncel_stok <= 0 ? 'empty' : u.guncel_stok < 10 ? 'low' : 'ok';
                return (
                  <button key={u.id} className={`product-stock-card ${durum}`} onClick={() => setSeciliUrunId(u.id)}>
                    <div className="product-stock-top">
                      <div>
                        <div className="product-name">{u.ad}</div>
                        <div className="product-code">{u.urun_id}</div>
                      </div>
                      <span className="badge badge-cat">{kategoriBilgi(u.kategori).label}</span>
                    </div>
                    <div className="product-stock-main">
                      <div>
                        <span className="metric-label">Güncel</span>
                        <strong>{sayi(u.guncel_stok)}</strong>
                      </div>
                      <div>
                        <span className="metric-label">Gelen</span>
                        <strong className="metric-green">+{sayi(u.gelen)}</strong>
                      </div>
                      <div>
                        <span className="metric-label">Çıkış</span>
                        <strong className="metric-red">-{sayi(u.giden)}</strong>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="product-detail-shell">
          <div className="detail-header">
            <button className="btn btn-secondary btn-sm" onClick={() => setSeciliUrunId(null)}>← Ürünler</button>
            <div className="detail-title">
              <span>{(() => {
                const Icon = kategoriBilgi(seciliUrun.kategori).Icon;
                return <Icon size={20} strokeWidth={2.2} />;
              })()}</span>
              <strong>{seciliUrun.ad}</strong>
              <span>— {AYLAR[ay]} {yil}</span>
            </div>
          </div>

          <div className="detail-meta-row">
            <span className="detail-label">Ürün ID</span>
            <strong>{seciliUrun.urun_id}</strong>
            <span className="detail-label">Kategori</span>
            <strong>{kategoriBilgi(seciliUrun.kategori).label}</strong>
            <span className="detail-label">Birim Fiyat</span>
            <strong>₺{Number(seciliUrun.fiyat || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong>
          </div>

          <div className="detail-stat-grid">
            <div className="detail-stat amber">
              <div className="detail-stat-icon"><Boxes size={27} /></div>
              <div>
                <span>Devreden (Eski Stok)</span>
                <strong>{sayi(seciliUrun.devreden_stok)}</strong>
                <small>adet</small>
              </div>
            </div>
            <div className="detail-stat green">
              <div className="detail-stat-icon"><PackageCheck size={27} /></div>
              <div>
                <span>Gelen Ürün</span>
                <strong>{sayi(seciliUrun.gelen)}</strong>
                <small>adet</small>
              </div>
            </div>
            <div className="detail-stat red">
              <div className="detail-stat-icon"><PackageOpen size={27} /></div>
              <div>
                <span>Çıkış</span>
                <strong>{sayi(seciliUrun.giden)}</strong>
                <small>adet</small>
              </div>
            </div>
            <div className="detail-stat blue">
              <div className="detail-stat-icon"><Package size={27} /></div>
              <div>
                <span>Güncel Stok</span>
                <strong>{sayi(seciliUrun.guncel_stok)}</strong>
                <small>adet</small>
              </div>
            </div>
          </div>

          <div className="detail-table-card">
            <div className="detail-table-title"><CalendarDays size={17} /> Günlük Hareket Listesi</div>
            <div className="table-wrap movement-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th style={{ textAlign: 'center' }}>Giriş</th>
                    <th style={{ textAlign: 'center' }}>Çıkış</th>
                    <th>Açıklama</th>
                    <th style={{ width: 54 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {seciliHareketler.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: 28 }}>
                        Bu ürün için seçili ayda hareket yok.
                      </td>
                    </tr>
                  )}
                  {[...seciliHareketler].reverse().map(h => (
                    <tr key={h.id}>
                      <td style={{ fontWeight: 600 }}>{tarihFmt(h.tarih)}</td>
                      <td style={{ textAlign: 'center', color: '#059669', fontWeight: 700 }}>
                        {h.hareket_turu === 'giris' ? sayi(h.miktar) : '-'}
                      </td>
                      <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 700 }}>
                        {h.hareket_turu === 'cikis' ? sayi(h.miktar) : '-'}
                      </td>
                      <td style={{ color: '#94a3b8', fontSize: 12 }}>{h.aciklama || '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {!ayKapali && (
                          <div className="row-action-wrap">
                            <button className="row-action-btn" onClick={() => setAcikMenu(acikMenu === h.id ? null : h.id)} title="İşlemler">⋮</button>
                            {acikMenu === h.id && (
                              <div className="row-action-menu">
                                <button onClick={() => duzenleModalAc(h)}>Düzenle</button>
                                <button
                                  className="danger"
                                  onClick={() => onConfirm?.({
                                    title: 'Hareket kaydı silinsin mi?',
                                    message: `${tarihFmt(h.tarih)} tarihli ${h.hareket_turu === 'giris' ? 'giriş' : 'çıkış'} kaydı silinecek.`,
                                    detail: 'Bu işlem stok hesaplarını etkiler ve geri alınamaz.',
                                    confirmText: 'Evet, Sil',
                                    onConfirm: () => silHareket(h.id),
                                  })}
                                >
                                  Sil
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-movement-list">
              {seciliHareketler.length === 0 && (
                <div className="empty-state">Bu ürün için seçili ayda hareket yok.</div>
              )}
              {[...seciliHareketler].reverse().map(h => (
                <div key={h.id} className={`mobile-movement-item ${h.hareket_turu === 'giris' ? 'giris' : 'cikis'}`}>
                  <div className="mobile-movement-main">
                    <div>
                      <div className="mobile-movement-date">{tarihFmt(h.tarih)}</div>
                      <div className="mobile-movement-note">{h.aciklama || 'Açıklama yok'}</div>
                    </div>
                    <div className="mobile-movement-amount">
                      <span>{h.hareket_turu === 'giris' ? 'Giriş' : 'Çıkış'}</span>
                      <strong>{h.hareket_turu === 'giris' ? '+' : '-'}{sayi(h.miktar)}</strong>
                    </div>
                  </div>
                  {!ayKapali && (
                    <div className="mobile-movement-actions">
                      <button onClick={() => duzenleModalAc(h)}>Düzenle</button>
                      <button
                        className="danger"
                        onClick={() => onConfirm?.({
                          title: 'Hareket kaydı silinsin mi?',
                          message: `${tarihFmt(h.tarih)} tarihli ${h.hareket_turu === 'giris' ? 'giriş' : 'çıkış'} kaydı silinecek.`,
                          detail: 'Bu işlem stok hesaplarını etkiler ve geri alınamaz.',
                          confirmText: 'Evet, Sil',
                          onConfirm: () => silHareket(h.id),
                        })}
                      >
                        Sil
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {harModal && (
        <div className="modal-overlay" onClick={() => setHarModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className={`modal-title movement-modal-title ${form.hareket_turu === 'giris' ? 'giris' : 'cikis'}`}>
                {form.hareket_turu === 'giris' ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                {form.hareket_turu === 'giris'
                  ? `Giriş ${duzenlenenHareket ? 'Düzenle' : 'Ekle'}`
                  : `Çıkış ${duzenlenenHareket ? 'Düzenle' : 'Ekle'}`}
              </div>
              <button className="modal-close-btn" type="button" onClick={() => { setHarModal(false); setDuzenlenenHareket(null); }}>×</button>
            </div>

            <form onSubmit={kaydet}>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Tarih</label>
                <input type="date" value={form.tarih} onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Ürün</label>
                <select value={form.urun_id} onChange={e => setForm(f => ({ ...f, urun_id: e.target.value }))}>
                  <option value="">Ürün Seçin</option>
                  {urunler.map(u => <option key={u.id} value={String(u.id)}>{u.ad} — Stok: {sayi(u.guncel_stok)}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Miktar</label>
                <input type="number" step="0.01" min="0.01" value={form.miktar}
                  onChange={e => setForm(f => ({ ...f, miktar: e.target.value }))}
                  placeholder="0" inputMode="decimal" />
              </div>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label>Açıklama (opsiyonel)</label>
                <input value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} placeholder="Not ekle..." />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setHarModal(false); setDuzenlenenHareket(null); }}>İptal</button>
                <button type="submit" className={`btn ${form.hareket_turu === 'giris' ? 'btn-success' : 'btn-danger'}`} style={{ flex: 2 }}>
                  {form.hareket_turu === 'giris' ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
                  {form.hareket_turu === 'giris'
                    ? `Giriş ${duzenlenenHareket ? 'Güncelle' : 'Kaydet'}`
                    : `Çıkış ${duzenlenenHareket ? 'Güncelle' : 'Kaydet'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
