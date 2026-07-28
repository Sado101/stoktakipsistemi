import { useState, useEffect, useRef } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { api } from '../api';
import { ArrowDown, ArrowUp, Camera, MousePointer2, PackagePlus, Pencil, Save, Search, Trash2, X } from 'lucide-react';

const KAT = {
  ambalaj: 'Ambalaj', icecek: 'İçecek', sos: 'Sos', et: 'Et',
  ekmek: 'Ekmek', tatli: 'Tatlı', kuru_gida: 'Kuru Gıda', manav: 'Manav', diger: 'Diğer'
};

const BOS_FORM = { urun_id: '', ad: '', fiyat: '', kategori: 'diger', sube_id: '', devreden_stok: '' };

export default function StokDuzenleme({ subeler, secilenSube, onGuncelle, kullanici, onNotify, onConfirm }) {
  const [urunler, setUrunler] = useState([]);
  const [arama, setArama] = useState('');
  const [secili, setSecili] = useState(null);
  const [form, setForm] = useState({ ...BOS_FORM, sube_id: secilenSube || '' });
  const [mod, setMod] = useState('empty');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hareketler, setHareketler] = useState([]);
  const [kameraAcik, setKameraAcik] = useState(false);
  const [kameraMesaji, setKameraMesaji] = useState('');
  const videoRef = useRef(null);
  const scannerControlsRef = useRef(null);
  const scanningRef = useRef(false);

  const subeSecenekleri = kullanici?.role === 'sube'
    ? subeler.filter(s => String(s.id) === secilenSube)
    : subeler;

  const subeEtiketi = (s) => {
    if (!s?.kod) return s?.isim || '';
    const kod = String(s.kod);
    const kisaKod = kod.length > 22 ? `${kod.slice(0, 22)}...` : kod;
    return `${s.isim} (${kisaKod})`;
  };

  const ara = async () => {
    try {
      const params = {};
      if (secilenSube) params.sube_id = secilenSube;
      if (arama) params.q = arama;
      setUrunler(await api.getUrunler(params));
    } catch (e) {
      onNotify?.('error', e.message);
    }
  };

  useEffect(() => {
    ara();
    setForm(f => ({ ...f, sube_id: secilenSube || f.sube_id || '' }));
  }, [secilenSube]);

  useEffect(() => () => kamerayiKapat(), []);

  const yeniUrunAc = () => {
    setSecili(null);
    setHareketler([]);
    setMod('new');
    setForm({ ...BOS_FORM, sube_id: secilenSube || '' });
  };

  const sec = async (u) => {
    setSecili(u);
    setMod('edit');
    setForm({
      urun_id: u.urun_id || '',
      ad: u.ad || '',
      fiyat: u.fiyat ?? '',
      kategori: u.kategori || 'diger',
      sube_id: String(u.sube_id || ''),
      devreden_stok: u.devreden_stok ?? ''
    });
    try {
      const data = await api.getHareketler({ urun_id: u.id });
      setHareketler(data.reverse());
    } catch (e) {
      setHareketler([]);
    }
  };

  const temizle = () => {
    if (mod === 'new') {
      setForm({ ...BOS_FORM, sube_id: secilenSube || '' });
      return;
    }
    setSecili(null);
    setHareketler([]);
    setMod('empty');
    setForm({ ...BOS_FORM, sube_id: secilenSube || '' });
  };


  const kamerayiKapat = () => {
    scanningRef.current = false;
    if (scannerControlsRef.current) {
      scannerControlsRef.current.stop();
      scannerControlsRef.current = null;
    }
    setKameraAcik(false);
  };

  const kameraBaslat = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onNotify?.('error', 'Bu tarayıcı kamera erişimini desteklemiyor. USB okuyucu veya manuel giriş kullanın.');
      return;
    }

    try {
      setKameraMesaji('Kamera açılıyor...');
      setKameraAcik(true);
      window.setTimeout(() => barkodTara(), 0);
    } catch (e) {
      setKameraMesaji('');
      onNotify?.('error', 'Kamera açılamadı. Tarayıcı kamera iznini kontrol edin.');
    }
  };

  const barkodTara = async () => {
    if (!videoRef.current) return;

    scanningRef.current = true;
    setKameraMesaji('Barkodu kameraya gösterin.');

    try {
      const reader = new BrowserMultiFormatReader();
      scannerControlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current,
        (result) => {
          if (!result || !scanningRef.current) return;
          const kod = result.getText();
          setForm(f => ({ ...f, urun_id: kod }));
          kamerayiKapat();
          onNotify?.('success', 'Barkod alanı dolduruldu.');
        }
      );
    } catch (e) {
      setKameraMesaji('');
      setKameraAcik(false);
      onNotify?.('error', 'Kamera ile barkod okunamadı. Kamera iznini ve bağlantıyı kontrol edin.');
    }
  };

  const formPayload = () => ({
    ...form,
    urun_id: String(form.urun_id || '').trim(),
    ad: String(form.ad || '').trim(),
    fiyat: parseFloat(form.fiyat),
    sube_id: parseInt(form.sube_id),
    devreden_stok: parseFloat(form.devreden_stok || 0)
  });

  const kaydet = async (e) => {
    e.preventDefault();
    if (!form.urun_id || !form.ad || form.fiyat === '' || !form.sube_id) {
      onNotify?.('error', 'Ürün ID/Barkod, ürün adı, fiyat ve şube zorunludur.');
      return;
    }

    setYukleniyor(true);
    try {
      const payload = formPayload();
      if (mod === 'new') {
        await api.createUrun(payload);
        onNotify?.('success', `"${payload.ad}" ürünü eklendi.`);
        setForm({ ...BOS_FORM, sube_id: secilenSube || '' });
      } else if (secili) {
        const guncel = await api.updateUrun(secili.id, payload);
        setSecili(guncel);
        onNotify?.('success', 'Ürün başarıyla güncellendi.');
      }
      onGuncelle?.();
      await ara();
      if (mod === 'new') setMod('empty');
    } catch (err) {
      onNotify?.('error', err.message);
    } finally {
      setYukleniyor(false);
    }
  };

  const sil = async (id) => {
    try {
      await api.deleteUrun(id);
      temizle();
      onGuncelle?.();
      await ara();
      onNotify?.('success', 'Ürün silindi.');
    } catch (err) {
      onNotify?.('error', err.message);
    }
  };

  const formBaslik = mod === 'new' ? 'Yeni Ürün Ekle' : secili ? `Düzenle: ${secili.ad}` : 'Ürün Seçin';
  const formAcik = mod === 'new' || Boolean(secili);

  return (
    <div>
      <div className="page-header product-page-header">
        <div>
          <h1>Ürünler</h1>
          <p>Ürün ekleyin, barkod/ID ve stok bilgilerini tek ekrandan yönetin</p>
        </div>
        <button className="btn btn-primary" onClick={yeniUrunAc}>
          <PackagePlus size={17} /> Ürün Ekle
        </button>
      </div>

      <div className="edit-layout product-manager-layout">
        <div className="card edit-product-list-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #efe6d8' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ flex: 1, padding: '8px 10px', border: '1.5px solid var(--sk-line)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: '#fff' }}
                placeholder="Ürün adı veya barkod ara..."
                value={arama}
                onChange={e => setArama(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && ara()}
              />
              <button className="btn btn-primary btn-sm" onClick={ara}><Search size={15} /> Ara</button>
            </div>
          </div>
          <div className="edit-product-list">
            {urunler.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: '#8a928c', fontSize: 13 }}>Ürün bulunamadı</div>
            )}
            {urunler.map(u => (
              <button
                type="button"
                key={u.id}
                onClick={() => sec(u)}
                className={`product-row-button ${secili?.id === u.id ? 'active' : ''}`}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--sk-ink)' }}>{u.ad}</div>
                  <div style={{ fontSize: 12, color: '#8a928c', marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span>{u.urun_id}</span>
                    <span>₺{u.fiyat}</span>
                    <span style={{ color: u.guncel_stok <= 0 ? '#ef4444' : '#607064' }}>Stok: {u.guncel_stok}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card edit-form-card">
          {!formAcik ? (
            <div style={{ textAlign: 'center', padding: '42px 0', color: '#8a928c' }}>
              <div style={{ marginBottom: 12 }}><MousePointer2 size={38} strokeWidth={1.7} /></div>
              <div style={{ fontWeight: 700, color: '#607064' }}>Soldan ürün seçin veya sağ üstten yeni ürün ekleyin</div>
            </div>
          ) : (
            <>
              <div className="card-title product-form-title">
                {mod === 'new' ? <PackagePlus size={18} /> : <Pencil size={18} />}
                {formBaslik}
                <button type="button" className="icon-soft-btn" onClick={temizle} title="Paneli kapat">
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={kaydet}>
                <div className="form-grid">
                  <div className="form-group product-barcode-group">
                    <label>Ürün ID / Barkod *</label>
                    <div className="product-barcode-input-row">
                      <input
                        value={form.urun_id || ''}
                        onChange={e => setForm(f => ({ ...f, urun_id: e.target.value }))}
                        placeholder="Barkodu okutun veya yazın"
                        inputMode="numeric"
                        autoComplete="off"
                      />
                      <button type="button" onClick={kameraBaslat} disabled={kameraAcik} title="Kamera ile barkod okut">
                        <Camera size={17} />
                      </button>
                    </div>
                    {kameraAcik && (
                      <div className="product-barcode-camera-box">
                        <video ref={videoRef} muted playsInline />
                        <div className="product-barcode-camera-frame" />
                        <div className="product-barcode-camera-message">{kameraMesaji}</div>
                        <button type="button" onClick={kamerayiKapat} className="product-barcode-camera-close">
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Ürün Adı *</label>
                    <input value={form.ad || ''} onChange={e => setForm(f => ({ ...f, ad: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Birim Fiyat (₺) *</label>
                    <input type="number" step="0.01" min="0" value={form.fiyat ?? ''} onChange={e => setForm(f => ({ ...f, fiyat: e.target.value }))} inputMode="decimal" />
                  </div>
                  <div className="form-group">
                    <label>Kategori</label>
                    <select value={form.kategori || 'diger'} onChange={e => setForm(f => ({ ...f, kategori: e.target.value }))}>
                      {Object.entries(KAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Şube *</label>
                    <select
                      value={form.sube_id || ''}
                      onChange={e => setForm(f => ({ ...f, sube_id: e.target.value }))}
                      disabled={kullanici?.role === 'sube'}
                      style={kullanici?.role === 'sube' ? { background: '#f4f1ea', color: '#8a928c' } : {}}
                    >
                      <option value="">Şube Seçin</option>
                      {subeSecenekleri.map(s => <option key={s.id} value={String(s.id)}>{subeEtiketi(s)}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Devreden Stok</label>
                    <input type="number" step="0.01" min="0" value={form.devreden_stok ?? ''} onChange={e => setForm(f => ({ ...f, devreden_stok: e.target.value }))} inputMode="decimal" />
                  </div>
                </div>

                <div className="edit-form-actions">
                  <button type="submit" className="btn btn-primary" disabled={yukleniyor}>
                    <Save size={17} /> {yukleniyor ? 'Kaydediliyor...' : mod === 'new' ? 'Ürünü Kaydet' : 'Güncelle'}
                  </button>
                  {mod === 'new' ? (
                    <button type="button" className="btn btn-secondary" onClick={() => setForm({ ...BOS_FORM, sube_id: secilenSube || '' })}>
                      Temizle
                    </button>
                  ) : (
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
                  )}
                </div>
              </form>

              {mod === 'edit' && (
                <div style={{ marginTop: 24, borderTop: '1px solid #efe6d8', paddingTop: 20 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#607064', marginBottom: 10 }}>
                    Hareket Geçmişi
                    <span style={{ marginLeft: 8, fontWeight: 500, color: '#8a928c' }}>{hareketler.length} kayıt</span>
                  </div>
                  {hareketler.length === 0 ? (
                    <div style={{ color: '#8a928c', fontSize: 13 }}>Hareket kaydı bulunamadı.</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: '#f7f1e8' }}>
                            <th style={{ padding: '7px 10px', textAlign: 'left', color: '#607064', fontWeight: 800, borderBottom: '1px solid #efe6d8' }}>Tarih</th>
                            <th style={{ padding: '7px 10px', textAlign: 'center', color: '#607064', fontWeight: 800, borderBottom: '1px solid #efe6d8' }}>Tür</th>
                            <th style={{ padding: '7px 10px', textAlign: 'right', color: '#607064', fontWeight: 800, borderBottom: '1px solid #efe6d8' }}>Miktar</th>
                            <th style={{ padding: '7px 10px', textAlign: 'left', color: '#607064', fontWeight: 800, borderBottom: '1px solid #efe6d8' }}>Açıklama</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hareketler.map(h => (
                            <tr key={h.id} style={{ borderBottom: '1px solid #f4eadc' }}>
                              <td style={{ padding: '7px 10px', color: '#526559' }}>{h.tarih}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                {h.hareket_turu === 'giris'
                                  ? <span style={{ color: '#059669', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowUp size={14} /> Giriş</span>
                                  : <span style={{ color: '#dc2626', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowDown size={14} /> Çıkış</span>}
                              </td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 800 }}>{h.miktar}</td>
                              <td style={{ padding: '7px 10px', color: '#8a928c', fontSize: 12 }}>{h.aciklama || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
