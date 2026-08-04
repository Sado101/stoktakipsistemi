import { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserMultiFormatOneDReader } from '@zxing/browser';
import { api } from '../api';
import { barkodSesiniHazirla, basariliBarkodSesiCal } from '../barkodSesi';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Keyboard,
  FlipHorizontal2,
  PackageCheck,
  ScanBarcode,
  Send,
  Trash2,
  X,
} from 'lucide-react';

const AYLAR = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const HIZLI_KAMERA_KISITLARI = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  },
};

function sayi(value) {
  return Number(value || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

function tarihIso() {
  return new Date().toISOString().split('T')[0];
}

export default function BarkodIslem({ secilenSube, yenile, onHareket, ay, yil, donemAcik, onKilitAc, onNotify }) {
  const now = new Date();
  const ayKapaliHam = yil < now.getFullYear() || (yil === now.getFullYear() && ay < now.getMonth() + 1);
  const ayKapali = ayKapaliHam && !donemAcik;

  const [urunler, setUrunler] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [islemTuru, setIslemTuru] = useState('giris');
  const [barkod, setBarkod] = useState('');
  const [miktar, setMiktar] = useState('1');
  const [tarih, setTarih] = useState(tarihIso());
  const [seciliUrun, setSeciliUrun] = useState(null);
  const [liste, setListe] = useState([]);
  const [aktariliyor, setAktariliyor] = useState(false);
  const [kameraAcik, setKameraAcik] = useState(false);
  const [kameraTers, setKameraTers] = useState(false);
  const videoRef = useRef(null);
  const miktarRef = useRef(null);
  const scannerControlsRef = useRef(null);
  const scanningRef = useRef(false);

  useEffect(() => {
    const getir = async () => {
      setYukleniyor(true);
      try {
        const params = { ay, yil };
        if (secilenSube) params.sube_id = secilenSube;
        setUrunler(await api.getStokOzet(params));
      } catch (e) {
        onNotify?.('error', e.message);
      } finally {
        setYukleniyor(false);
      }
    };
    getir();
  }, [ay, yil, secilenSube, yenile]);

  useEffect(() => () => kamerayiKapat(), []);

  const toplamAdet = useMemo(() => liste.reduce((acc, item) => acc + Number(item.miktar || 0), 0), [liste]);
  const girisAdet = useMemo(() => liste.filter(item => item.hareket_turu === 'giris').reduce((acc, item) => acc + Number(item.miktar || 0), 0), [liste]);
  const cikisAdet = useMemo(() => liste.filter(item => item.hareket_turu === 'cikis').reduce((acc, item) => acc + Number(item.miktar || 0), 0), [liste]);

  const urunBul = (kod) => {
    const temizKod = String(kod || '').trim().toLowerCase();
    return urunler.find(u => String(u.urun_id || '').trim().toLowerCase() === temizKod) || null;
  };

  const barkoduSec = (kod = barkod) => {
    const temizKod = String(kod || '').trim();
    if (!temizKod) {
      onNotify?.('error', 'Önce barkod veya Ürün ID okutun.');
      return null;
    }

    const urun = urunBul(temizKod);
    if (!urun) {
      setSeciliUrun(null);
      onNotify?.('error', 'Bu barkod/Ürün ID ile kayıtlı ürün bulunamadı.');
      return null;
    }

    setBarkod(temizKod);
    setSeciliUrun(urun);
    window.setTimeout(() => miktarRef.current?.focus(), 0);
    onNotify?.('success', `${urun.ad} bulundu. Miktarı girin.`);
    return urun;
  };

  const listeyeEkle = () => {
    if (ayKapali) {
      onNotify?.('error', 'Bu dönem kapalı. İşlem eklemek için önce dönemi açın.');
      return;
    }

    const urun = seciliUrun || barkoduSec();
    if (!urun) return;

    const temizMiktar = parseFloat(String(miktar).replace(',', '.'));
    if (!temizMiktar || temizMiktar <= 0) {
      onNotify?.('error', 'Miktar 0’dan büyük olmalı.');
      return;
    }

    setListe(items => [
      {
        tempId: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        urun,
        miktar: temizMiktar,
        hareket_turu: islemTuru,
        tarih,
      },
      ...items,
    ]);
    setBarkod('');
    setMiktar('1');
    setSeciliUrun(null);
    onNotify?.('success', `${urun.ad} listeye eklendi.`);
  };

  const tumunuAktar = async () => {
    if (liste.length === 0) {
      onNotify?.('error', 'Aktarılacak barkod işlemi yok.');
      return;
    }
    if (ayKapali) {
      onNotify?.('error', 'Bu dönem kapalı. İşlem eklemek için önce dönemi açın.');
      return;
    }

    setAktariliyor(true);
    try {
      for (const item of [...liste].reverse()) {
        await api.createHareket({
          urun_id: item.urun.id,
          hareket_turu: item.hareket_turu,
          miktar: item.miktar,
          tarih: item.tarih,
          aciklama: '',
          islem_kaynagi: 'barkod',
        });
      }
      setListe([]);
      setSeciliUrun(null);
      onHareket?.();
      onNotify?.('success', 'Barkod işlemleri aktarıldı.');
    } catch (e) {
      onNotify?.('error', e.message);
    } finally {
      setAktariliyor(false);
    }
  };

  const listedenSil = (tempId) => {
    setListe(items => items.filter(item => item.tempId !== tempId));
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
      barkodSesiniHazirla();
      setKameraAcik(true);
      window.setTimeout(() => barkodTara(), 0);
    } catch (e) {
      onNotify?.('error', 'Kamera açılamadı. Tarayıcı kamera iznini kontrol edin.');
    }
  };

  const barkodTara = async () => {
    if (!videoRef.current) return;

    scanningRef.current = true;
    try {
      // Ürün barkodlarında yalnızca 1D formatları arayıp varsayılan
      // 500 ms tarama beklemesini düşürmek okumayı belirgin hızlandırır.
      const reader = new BrowserMultiFormatOneDReader(undefined, {
        delayBetweenScanAttempts: 60,
        delayBetweenScanSuccess: 300,
      });
      scannerControlsRef.current = await reader.decodeFromConstraints(
        HIZLI_KAMERA_KISITLARI,
        videoRef.current,
        (result) => {
          if (!result || !scanningRef.current) return;
          const kod = result.getText();
          basariliBarkodSesiCal();
          kamerayiKapat();
          barkoduSec(kod);
        }
      );
    } catch (e) {
      setKameraAcik(false);
      onNotify?.('error', 'Kamera ile barkod okunamadı. Kamera iznini ve bağlantıyı kontrol edin.');
    }
  };

  return (
    <div className="barcode-page">
      <div className="page-header">
        <h1>Barkod İşlem</h1>
        <p>{AYLAR[ay]} {yil} — Barkodla giriş ve çıkış aktarımı</p>
      </div>

      {ayKapaliHam && !donemAcik && (
        <button onClick={onKilitAc} className="period-lock-btn barcode-period-lock">
          Bu dönem kapalıdır — Açmak için tıkla
        </button>
      )}
      {ayKapaliHam && donemAcik && <span className="period-open-badge barcode-period-badge">Dönem Açık</span>}

      <div className="barcode-workspace">
        <section className="barcode-panel card">
          <div className="barcode-panel-head">
            <div>
              <div className="barcode-panel-title"><ScanBarcode size={20} /> Okutma Paneli</div>
              <div className="barcode-panel-subtitle">USB okuyucu, manuel giriş veya mobil kamera ile işlem ekleyin.</div>
            </div>
          </div>

          <div className="barcode-mode-large">
            <button type="button" className={islemTuru === 'giris' ? 'active giris' : ''} onClick={() => setIslemTuru('giris')}>
              <ChevronUp size={18} /> Giriş
            </button>
            <button type="button" className={islemTuru === 'cikis' ? 'active cikis' : ''} onClick={() => setIslemTuru('cikis')}>
              <ChevronDown size={18} /> Çıkış
            </button>
          </div>

          <form className="barcode-entry-form" onSubmit={(e) => { e.preventDefault(); seciliUrun ? listeyeEkle() : barkoduSec(); }}>
            <div className="form-group barcode-input-group">
              <label>1. Barkod / Ürün ID</label>
              <div className="barcode-input-row">
                <Keyboard size={18} />
                <input
                  value={barkod}
                  onChange={e => { setBarkod(e.target.value); setSeciliUrun(null); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !seciliUrun) {
                      e.preventDefault();
                      barkoduSec();
                    }
                  }}
                  placeholder=" barkodu giriniz"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                />
              </div>
            </div>

            <button className="btn btn-secondary barcode-find-btn" type="button" onClick={() => barkoduSec()} disabled={ayKapali || yukleniyor}>
              Ürünü Bul
            </button>

            <div className="barcode-camera-actions">
              <button type="button" className="btn btn-secondary" onClick={kameraBaslat} disabled={kameraAcik || ayKapali}>
                <Camera size={17} /> Kamera ile Tara
              </button>
              {kameraAcik && (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => setKameraTers(v => !v)}>
                    <FlipHorizontal2 size={17} /> Görüntüyü Çevir
                  </button>
                  <button type="button" className="btn btn-danger" onClick={kamerayiKapat}>
                    <X size={17} /> Kamerayı Kapat
                  </button>
                </>
              )}
            </div>

            {kameraAcik && (
              <div className="barcode-camera-box">
                <video ref={videoRef} muted playsInline style={{ transform: kameraTers ? 'scaleX(-1)' : 'none' }} />
                <div className="barcode-camera-line" />
              </div>
            )}

            {seciliUrun && (
              <div className="barcode-found-card">
                <div className="barcode-found-icon"><PackageCheck size={22} /></div>
                <div>
                  <strong>{seciliUrun.ad}</strong>
                  <span>Barkod: {seciliUrun.urun_id} · Güncel stok: {sayi(seciliUrun.guncel_stok)}</span>
                </div>
              </div>
            )}

            <div className="form-group">
              <label>2. Miktar</label>
              <input ref={miktarRef} value={miktar} onChange={e => setMiktar(e.target.value)} type="number" step="0.01" min="0.01" inputMode="decimal" disabled={!seciliUrun} />
            </div>
            <div className="form-group">
              <label>Tarih</label>
              <input type="date" value={tarih} onChange={e => setTarih(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit" disabled={ayKapali || yukleniyor || !seciliUrun}>Listeye Ekle</button>
          </form>
        </section>

        <section className="barcode-panel card">
          <div className="barcode-panel-head barcode-list-head">
            <div>
              <div className="barcode-panel-title"><Send size={20} /> Aktarım Listesi</div>
              <div className="barcode-panel-subtitle">{liste.length} işlem · Toplam {sayi(toplamAdet)} adet</div>
            </div>
            <button className="btn btn-primary" onClick={tumunuAktar} disabled={aktariliyor || liste.length === 0 || ayKapali}>
              <Send size={17} /> {aktariliyor ? 'Aktarılıyor...' : 'Tümünü Aktar'}
            </button>
          </div>

          {liste.length > 0 && (
            <div className="barcode-transfer-summary">
              <span className="giris">Giriş <strong>+{sayi(girisAdet)}</strong></span>
              <span className="cikis">Çıkış <strong>-{sayi(cikisAdet)}</strong></span>
            </div>
          )}

          <div className="barcode-transfer-list">
            {liste.length === 0 && <div className="empty-state">Henüz barkod işlemi eklenmedi.</div>}
            {liste.map((item, index) => (
              <div key={item.tempId} className={`barcode-transfer-item ${item.hareket_turu}`}>
                <div className="barcode-transfer-index">{liste.length - index}</div>
                <div>
                  <strong>{item.urun.ad}</strong>
                  <span>{item.urun.urun_id} · {item.tarih.split('-').reverse().join('.')}</span>
                </div>
                <div className="barcode-transfer-meta">
                  <em>{item.hareket_turu === 'giris' ? 'Giriş' : 'Çıkış'}</em>
                  <strong className={item.hareket_turu === 'giris' ? 'amount-in' : 'amount-out'}>{item.hareket_turu === 'giris' ? '+' : '-'}{sayi(item.miktar)}</strong>
                </div>
                <button type="button" onClick={() => listedenSil(item.tempId)} title="Listeden kaldır">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
