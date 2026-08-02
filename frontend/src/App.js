import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api';
import Login from './components/Login';
import StokBilgisi from './components/StokBilgisi';
import StokDuzenleme from './components/StokDuzenleme';
import GelenGiden from './components/GelenGiden';
import Arsiv from './components/Arsiv';
import SubeAyarlari from './components/SubeAyarlari';
import CalisanGirisi from './components/CalisanGirisi';
import CalisanYonetimi from './components/CalisanYonetimi';
import BarkodIslem from './components/BarkodIslem';
import skLogo from './assets/sk-logo.png';
import { Archive, AlertTriangle, CheckCircle2, ClipboardList, Info, PackagePlus, Repeat2, ScanBarcode, SlidersHorizontal, X, XCircle } from 'lucide-react';
import './App.css';

const SAYFALAR = [
  { key: 'stok-bilgisi',   label: 'Stok',       Icon: ClipboardList },
  { key: 'gelen-giden',    label: 'Hareketler', Icon: Repeat2 },
  { key: 'barkod-islem',   label: 'Barkod',     Icon: ScanBarcode },
  { key: 'stok-duzenleme', label: 'Ürünler',    Icon: PackagePlus },
  { key: 'arsiv',          label: 'Arşiv',      Icon: Archive },
  { key: 'sube-ayarlari',  label: 'Şube Ayarları', Icon: SlidersHorizontal },
];

const AYLAR = ['','Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const OTURUM_ZAMAN_ASIMI = 20 * 60 * 1000;
const OTURUM_MESAJI = 'Oturum süreniz doldu. Lütfen tekrar giriş yapın.';

function ToastHost({ bildirimler, onKapat }) {
  if (bildirimler.length === 0) return null;
  return (
    <div className="toast-host" aria-live="polite">
      {bildirimler.map(b => {
        const Icon = b.tip === 'success' ? CheckCircle2 : b.tip === 'error' ? XCircle : Info;
        return (
          <div key={b.id} className={`toast toast-${b.tip || 'info'}`}>
            <Icon size={18} />
            <div className="toast-message">{b.metin}</div>
            <button type="button" className="toast-close" onClick={() => onKapat(b.id)} aria-label="Bildirimi kapat">
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function ConfirmModal({ config, busy, onKapat, onOnayla }) {
  if (!config) return null;
  return (
    <div className="modal-overlay" onClick={busy ? undefined : onKapat}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <div className={`confirm-icon ${config.tone || 'danger'}`}>
          <AlertTriangle size={24} />
        </div>
        <div className="confirm-content">
          <h3>{config.title}</h3>
          <p>{config.message}</p>
          {config.detail && <div className="confirm-detail">{config.detail}</div>}
        </div>
        <div className="confirm-actions">
          <button className="btn btn-secondary" onClick={onKapat} disabled={busy}>
            {config.cancelText || 'Vazgeç'}
          </button>
          <button className="btn btn-danger" onClick={onOnayla} disabled={busy}>
            {busy ? 'İşleniyor...' : (config.confirmText || 'Evet, Sil')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const now = new Date();
  const [kullanici, setKullanici] = useState(null);
  const [oturumMesaji, setOturumMesaji] = useState('');
  const [bildirimler, setBildirimler] = useState([]);
  const [confirmConfig, setConfirmConfig] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [sayfa, setSayfa] = useState('stok-bilgisi');
  const [subeler, setSubeler] = useState([]);
  const [secilenSube, setSecilenSube] = useState('');
  const [yenile, setYenile] = useState(0);
  const [subeModal, setSubeModal] = useState(false);
  const [subeForm, setSubeForm] = useState({ kod: '', isim: '', sifre: '' });
  const [subeBilgiModal, setSubeBilgiModal] = useState(false);
  const [subeBilgiData, setSubeBilgiData] = useState(null);
  const [subeBilgiForm, setSubeBilgiForm] = useState({ isim: '', adres: '', telefon: '', kod: '', sifre: '' });
  const [donemAcik, setDonemAcik] = useState(false);
  const [kilitModal, setKilitModal] = useState(false);
  const [kilitSifre, setKilitSifre] = useState('');
  const [kilitHata, setKilitHata] = useState('');
  const [ay, setAy] = useState(now.getMonth() + 1);
  const [yil, setYil] = useState(now.getFullYear());
  const zamanlayiciRef = useRef(null);
  const sonAktiviteRef = useRef(Date.now());

  const yillar = [];
  for (let y = 2024; y <= now.getFullYear() + 1; y++) yillar.push(y);

  const bildir = useCallback((tip, metin, sure = 3200) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setBildirimler(liste => [...liste, { id, tip, metin }]);
    if (sure) {
      window.setTimeout(() => {
        setBildirimler(liste => liste.filter(b => b.id !== id));
      }, sure);
    }
  }, []);

  const bildirimiKapat = useCallback((id) => {
    setBildirimler(liste => liste.filter(b => b.id !== id));
  }, []);

  const onayIste = useCallback((config) => {
    setConfirmConfig(config);
  }, []);

  const onayKapat = useCallback(() => {
    if (confirmBusy) return;
    setConfirmConfig(null);
  }, [confirmBusy]);

  const onayla = useCallback(async () => {
    if (!confirmConfig?.onConfirm) return;
    setConfirmBusy(true);
    try {
      await confirmConfig.onConfirm();
      setConfirmConfig(null);
    } finally {
      setConfirmBusy(false);
    }
  }, [confirmConfig]);

  useEffect(() => {
    const kontrol = async () => {
      try {
        const data = await api.getMe();
        setKullanici(data);
        if (data.role === 'sube') setSecilenSube(String(data.sube_id));
      } catch (e) { setKullanici(null); }
      setYukleniyor(false);
    };
    kontrol();
  }, []);

  const subeleriGetir = useCallback(async () => {
    try {
      const data = await api.getSubeler();
      setSubeler(data);
      if (kullanici?.role === 'admin' && data.length > 0 && !secilenSube) {
        setSecilenSube(String(data[0].id));
      }
    } catch (e) { console.error(e); }
  }, [secilenSube, kullanici]);

  useEffect(() => { if (kullanici) subeleriGetir(); }, [yenile, kullanici]);

  const tetikleYenile = () => setYenile(y => y + 1);

  const girisYap = (data) => {
    setOturumMesaji('');
    sonAktiviteRef.current = Date.now();
    setKullanici(data);
    if (data.role === 'sube') setSecilenSube(String(data.sube_id));
  };

  const cikisYap = async () => {
    try { await api.logout(); } catch (e) {}
    setOturumMesaji('');
    setKullanici(null);
    setSecilenSube('');
  };

  const oturumuZamanAsiminaUgrat = useCallback(async () => {
    try { await api.logout(); } catch (e) {}
    setKullanici(null);
    setSecilenSube('');
    setDonemAcik(false);
    setKilitModal(false);
    setSubeModal(false);
    setSubeBilgiModal(false);
    setOturumMesaji(OTURUM_MESAJI);
  }, []);

  useEffect(() => {
    if (!kullanici) return undefined;

    const temizleZamanlayici = () => {
      if (zamanlayiciRef.current) window.clearTimeout(zamanlayiciRef.current);
    };

    const kontrolEt = () => {
      const kalan = OTURUM_ZAMAN_ASIMI - (Date.now() - sonAktiviteRef.current);
      if (kalan <= 0) {
        temizleZamanlayici();
        oturumuZamanAsiminaUgrat();
        return;
      }
      zamanlayiciRef.current = window.setTimeout(kontrolEt, Math.min(kalan, 60 * 1000));
    };

    const aktiviteKaydet = () => {
      sonAktiviteRef.current = Date.now();
      temizleZamanlayici();
      kontrolEt();
    };

    const olaylar = ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'];
    olaylar.forEach(olay => window.addEventListener(olay, aktiviteKaydet, { passive: true }));
    document.addEventListener('visibilitychange', kontrolEt);
    aktiviteKaydet();

    return () => {
      temizleZamanlayici();
      olaylar.forEach(olay => window.removeEventListener(olay, aktiviteKaydet));
      document.removeEventListener('visibilitychange', kontrolEt);
    };
  }, [kullanici, oturumuZamanAsiminaUgrat]);

  const kilitAc = async () => {
    setKilitHata('');
    try {
      await api.kilidiAc(kilitSifre);
      setDonemAcik(true);
      setKilitModal(false);
      setKilitSifre('');
    } catch (e) {
      setKilitHata('Hatalı şifre. Lütfen tekrar deneyin.');
    }
  };

  const acSubeBilgi = async () => {
    const id = kullanici.role === 'sube' ? kullanici.sube_id : parseInt(secilenSube);
    if (!id) return;
    try {
      const data = await api.getSubeBilgi(id);
      setSubeBilgiData(data);
      setSubeBilgiForm({ isim: data.isim, adres: data.adres || '', telefon: data.telefon || '', kod: data.kod, sifre: '' });
      setSubeBilgiModal(true);
    } catch (e) { bildir('error', e.message); }
  };

  const kaydetSubeBilgi = async () => {
    const id = kullanici.role === 'sube' ? kullanici.sube_id : parseInt(secilenSube);
    try {
      await api.updateSubeBilgi(id, subeBilgiForm);
      setSubeBilgiModal(false);
      if (kullanici.role === 'sube' && subeBilgiForm.isim) {
        setKullanici(k => ({ ...k, username: subeBilgiForm.isim }));
      }
      tetikleYenile();
      bildir('success', 'Şube bilgileri kaydedildi.');
    } catch (e) { bildir('error', e.message); }
  };

  const subeEkle = async () => {
    if (!subeForm.kod || !subeForm.isim || !subeForm.sifre) {
      bildir('error', 'Tüm alanlar zorunludur.');
      return;
    }
    try {
      await api.createSube(subeForm);
      setSubeModal(false);
      setSubeForm({ kod: '', isim: '', sifre: '' });
      tetikleYenile();
      bildir('success', 'Şube eklendi.');
    } catch (e) { bildir('error', e.message); }
  };

  if (yukleniyor) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#2f5d40' }}>Yükleniyor...</div>
      </div>
    );
  }

  if (!kullanici) return <Login onGiris={girisYap} mesaj={oturumMesaji} />;

  if (kullanici.role === 'sube' && kullanici.employee_login_required) {
    return <CalisanGirisi subeAdi={kullanici.branch_name || kullanici.username} onGiris={girisYap} onCikis={cikisYap} />;
  }

  const gorunenSayfalar = SAYFALAR;
  const sayfaLabel = gorunenSayfalar.find(s => s.key === sayfa)?.label || '';

  return (
    <div className="app">

      {/* Mobil üst bar */}
      <div className="mobile-header">
        <div className="mobile-header-left">
          <div className="mobile-header-title"> {sayfaLabel}</div>
        </div>
        <div className="mobile-header-right">
          <span className="mobile-user-badge">{kullanici.role === 'sube' ? `${kullanici.branch_name || ''} · ${kullanici.username}` : kullanici.username}</span>
          <button onClick={cikisYap} style={{
            background: 'rgba(239,68,68,0.2)', border: 'none',
            color: '#fca5a5', borderRadius: 6, padding: '5px 8px',
            fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600
          }}>Çıkış</button>
        </div>
      </div>

      {/* Mobil dönem seçici */}
      <div className="mobile-donem">
        <span className="mobile-donem-label">Dönem</span>
        <div className="mobile-donem-secici">
          {kullanici.role === 'admin' && (
            <select className="mobile-branch-select" value={secilenSube} onChange={e => setSecilenSube(e.target.value)}>
              <option value="">Tüm Şubeler</option>
              {subeler.map(s => <option key={s.id} value={String(s.id)}>{s.isim}</option>)}
            </select>
          )}
          <select value={ay} onChange={e => setAy(Number(e.target.value))}>
            {AYLAR.slice(1).map((a, i) => <option key={i+1} value={i+1}>{a}</option>)}
          </select>
          <select value={yil} onChange={e => setYil(Number(e.target.value))}>
            {yillar.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {(kullanici.role === 'sube' || (kullanici.role === 'admin' && secilenSube)) && (
            <button onClick={acSubeBilgi} style={{
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
              color: '#cbd5e1', borderRadius: 7, padding: '5px 10px',
              fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
              minHeight: 32, whiteSpace: 'nowrap'
            }}>Bilgiler</button>
          )}
        </div>
      </div>

      {/* Masaüstü sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src={skLogo} alt="Stok Takip" className="sidebar-logo-img" />
        </div>

        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {kullanici.role === 'admin' ? 'Admin' : (kullanici.branch_name || 'Şube')}
            </div>
            <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 500, marginTop: 2 }}>
              {kullanici.username}
            </div>
          </div>
          <button onClick={cikisYap} style={{
            background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#fca5a5', borderRadius: 6, padding: '5px 10px',
            fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600
          }}>Çıkış</button>
        </div>

        {kullanici.role === 'admin' && (
          <div className="sube-secici">
            <label>Aktif Şube</label>
            <select value={secilenSube} onChange={e => setSecilenSube(e.target.value)}>
              <option value="">Tüm Şubeler</option>
              {subeler.map(s => <option key={s.id} value={String(s.id)}>{s.isim} · {s.kod}</option>)}
            </select>
          </div>
        )}

        {(kullanici.role === 'sube' || (kullanici.role === 'admin' && secilenSube)) && (
          <div style={{ padding: '0 12px 8px' }}>
            <button onClick={acSubeBilgi} style={{
              width: '100%', background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
              color: '#cbd5e1', padding: '9px 12px', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 500,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <span>
                {kullanici.role === 'sube'
                  ? (kullanici.branch_name || kullanici.username)
                  : subeler.find(s => String(s.id) === secilenSube)?.isim || 'Şube'}
              </span>
              <span style={{ color: '#475569', fontSize: 11 }}>Bilgiler →</span>
            </button>
          </div>
        )}

        <div className="sube-secici">
          <label>Aktif Dönem</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select value={ay} onChange={e => setAy(Number(e.target.value))} style={{
              flex: 1, background: 'rgba(255,255,255,0.06)', color: '#e2e8f0',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
              padding: '7px 6px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {AYLAR.slice(1).map((a, i) => <option key={i+1} value={i+1}>{a}</option>)}
            </select>
            <select value={yil} onChange={e => setYil(Number(e.target.value))} style={{
              width: 68, background: 'rgba(255,255,255,0.06)', color: '#e2e8f0',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
              padding: '7px 6px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {yillar.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 5 }}>{AYLAR[ay]} {yil} dönemi</div>
        </div>

        <nav>
          <div className="nav-section-label">Menü</div>
          {gorunenSayfalar.map(s => (
            <button key={s.key} className={`nav-btn ${sayfa === s.key ? 'active' : ''}`} onClick={() => setSayfa(s.key)}>
              <span className="nav-icon-wrap"><s.Icon size={17} strokeWidth={2.2} /></span>
              <span>{s.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Ana içerik */}
      <main className="main">
        <div className="page-wrap">
          {sayfa === 'stok-bilgisi'   && <StokBilgisi secilenSube={secilenSube} yenile={yenile} ay={ay} yil={yil} donemAcik={donemAcik} onKilitAc={() => setKilitModal(true)} onNotify={bildir} />}
          {sayfa === 'stok-duzenleme' && <StokDuzenleme subeler={subeler} secilenSube={secilenSube} onGuncelle={tetikleYenile} kullanici={kullanici} onNotify={bildir} onConfirm={onayIste} />}
          {sayfa === 'gelen-giden'    && <GelenGiden secilenSube={secilenSube} yenile={yenile} onHareket={tetikleYenile} ay={ay} yil={yil} donemAcik={donemAcik} onKilitAc={() => setKilitModal(true)} onNotify={bildir} onConfirm={onayIste} />}
          {sayfa === 'barkod-islem'   && <BarkodIslem secilenSube={secilenSube} yenile={yenile} onHareket={tetikleYenile} ay={ay} yil={yil} donemAcik={donemAcik} onKilitAc={() => setKilitModal(true)} onNotify={bildir} />}
          {sayfa === 'arsiv'          && <Arsiv secilenSube={secilenSube} yenile={yenile} ay={ay} yil={yil} onNotify={bildir} />}
          {sayfa === 'sube-ayarlari' && kullanici.role === 'admin' && <>
            <SubeAyarlari subeler={subeler} onYenile={subeleriGetir} onYeniSube={() => setSubeModal(true)} onNotify={bildir} onConfirm={onayIste} />
            <CalisanYonetimi subeId={Number(secilenSube) || null} onNotify={bildir} onConfirm={onayIste} />
          </>}
          {sayfa === 'sube-ayarlari' && kullanici.role === 'sube' &&
            <CalisanYonetimi subeId={kullanici.sube_id} aktifCalisanId={kullanici.employee_id} onNotify={bildir} onConfirm={onayIste} />}
        </div>
      </main>

      {/* Mobil alt navigasyon */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          {gorunenSayfalar.map(s => (
            <button key={s.key} className={`bottom-nav-btn ${sayfa === s.key ? 'active' : ''}`} onClick={() => setSayfa(s.key)}>
              <span className="bn-icon"><s.Icon size={21} strokeWidth={2.2} /></span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Şube ekleme modal */}
      {subeModal && (
        <div className="modal-overlay" onClick={() => setSubeModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Yeni Şube Ekle</div>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
              <div className="form-group">
                <label>Şube Kodu (Kullanıcı Adı)</label>
                <input placeholder="ör: SB-01" value={subeForm.kod} onChange={e => setSubeForm(f => ({ ...f, kod: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Şube Adı</label>
                <input placeholder="ör: Merkez Şube" value={subeForm.isim} onChange={e => setSubeForm(f => ({ ...f, isim: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Şifre</label>
                <input placeholder="ör: 1234" value={subeForm.sifre} onChange={e => setSubeForm(f => ({ ...f, sifre: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setSubeModal(false)}>İptal</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={subeEkle}>Şube Ekle</button>
            </div>
          </div>
        </div>
      )}

      {/* Şube Bilgileri modal */}
      {subeBilgiModal && subeBilgiData && (
        <div className="modal-overlay" onClick={() => setSubeBilgiModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
            <div className="modal-title">ss  Şube Bilgileri</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
              <div style={{ flex: 1, background: '#f0fdf4', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 3 }}>Toplam Ciro</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#059669' }}>
                  ₺{subeBilgiData.toplam_ciro.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div style={{ flex: 1, background: '#eff6ff', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 3 }}>Toplam Adisyon</div>
                <div style={{ fontSize: 17, fontWeight: 700, color: '#3b82f6' }}>
                  {subeBilgiData.toplam_adisyon.toLocaleString('tr-TR')}
                </div>
              </div>
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
              <div className="form-group">
                <label>Şube Adı</label>
                <input value={subeBilgiForm.isim} onChange={e => setSubeBilgiForm(f => ({ ...f, isim: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Adres</label>
                <input value={subeBilgiForm.adres} onChange={e => setSubeBilgiForm(f => ({ ...f, adres: e.target.value }))} placeholder="Şube adresi..." />
              </div>
              <div className="form-group">
                <label>Telefon</label>
                <input value={subeBilgiForm.telefon} onChange={e => setSubeBilgiForm(f => ({ ...f, telefon: e.target.value }))} placeholder="0555 000 00 00" inputMode="tel" />
              </div>
              <div className="form-group">
                <label>Kullanıcı Adı (Giriş)</label>
                <input value={subeBilgiForm.kod} onChange={e => setSubeBilgiForm(f => ({ ...f, kod: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Yeni Şifre <span style={{ color: '#94a3b8', fontWeight: 400, fontSize: 11 }}>boş bırakılırsa değişmez</span></label>
                <input type="password" value={subeBilgiForm.sifre} onChange={e => setSubeBilgiForm(f => ({ ...f, sifre: e.target.value }))} placeholder="••••••" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setSubeBilgiModal(false)}>İptal</button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={kaydetSubeBilgi}>Kaydet</button>
            </div>
          </div>
        </div>
      )}

      {/* Dönem kilidi açma modal */}
      {kilitModal && (
        <div className="modal-overlay" onClick={() => { setKilitModal(false); setKilitSifre(''); setKilitHata(''); }}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="modal-title">Kapalı Dönemi Aç</div>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 18 }}>
              Bu dönemde değişiklik yapabilmek için şifrenizi girin.
            </p>
            {kilitHata && (
              <div className="alert alert-error" style={{ marginBottom: 14 }}>{kilitHata}</div>
            )}
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Şifre</label>
              <input
                type="password"
                value={kilitSifre}
                onChange={e => { setKilitSifre(e.target.value); setKilitHata(''); }}
                placeholder="••••"
                onKeyDown={e => e.key === 'Enter' && kilitAc()}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }}
                onClick={() => { setKilitModal(false); setKilitSifre(''); setKilitHata(''); }}>
                İptal
              </button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={kilitAc}>
                Dönemi Aç
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastHost bildirimler={bildirimler} onKapat={bildirimiKapat} />
      <ConfirmModal config={confirmConfig} busy={confirmBusy} onKapat={onayKapat} onOnayla={onayla} />
    </div>
  );
}
