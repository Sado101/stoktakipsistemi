import { useState, useEffect } from 'react';
import { api } from '../api';
import {
  Archive,
  BarChart3,
  CalendarDays,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Package,
  ReceiptText,
  Save,
  TrendingUp,
} from 'lucide-react';

const AYLAR = ['', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

const RAPORLAR = [
  {
    key: 'genel',
    title: 'Genel Özet Excel',
    desc: 'Ciro, adisyon, kullanım yüzdesi ve kategori bazlı toplamlar.',
    Icon: BarChart3,
  },
  {
    key: 'urun',
    title: 'Ürün Ürün Detay Excel',
    desc: 'Her ürün için devreden, giriş, çıkış, güncel stok ve açıklama alanları.',
    Icon: Package,
  },
  {
    key: 'gunluk',
    title: 'Günlük Hareket Excel',
    desc: 'Seçili dönemdeki tüm giriş ve çıkış kayıtları satır satır.',
    Icon: CalendarDays,
  },
  {
    key: 'tam',
    title: 'Tam Arşiv Paketi',
    desc: 'Yönetici özeti, stok özeti, ürün detay, günlük hareket ve ciro sekmeleri.',
    Icon: FileSpreadsheet,
  },
];

export default function Arsiv({ secilenSube, yenile, ay, yil, onNotify }) {
  const [urunler, setUrunler] = useState([]);
  const [hareketler, setHareketler] = useState([]);
  const [ciroData, setCiroData] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [indirilenRapor, setIndirilenRapor] = useState(null);
  const [kaydetDurum, setKaydetDurum] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const getir = async () => {
      setYukleniyor(true);
      try {
        const params = { ay, yil, ...(secilenSube ? { sube_id: secilenSube } : {}) };
        const [stok, hareket, ciro] = await Promise.all([
          api.getStokOzet(params),
          api.getHareketler(params),
          api.getCiro(params),
        ]);
        if (cancelled) return;
        setUrunler(stok);
        setHareketler(hareket);
        setCiroData(ciro);
      } catch (e) {
        if (!cancelled) console.error(e);
      }
      if (!cancelled) setYukleniyor(false);
    };
    getir();
    return () => { cancelled = true; };
  }, [ay, yil, secilenSube, yenile]);

  const ciro = ciroData?.ciro || 0;
  const adisyon = ciroData?.adisyon || 0;
  const stokDegeri = urunler.reduce((acc, u) => acc + (u.guncel_stok * u.fiyat), 0);
  const kullanilanMalDegeri = urunler.reduce((acc, u) => acc + (u.giden * u.fiyat), 0);
  const devredenMalDegeri = urunler.reduce((acc, u) => acc + (u.devreden_stok * u.fiyat), 0);
  const kullanimYuzdesi = ciro > 0 ? Math.round((kullanilanMalDegeri / ciro) * 100) : null;
  const girisSayisi = hareketler.filter(h => h.hareket_turu === 'giris').length;
  const cikisSayisi = hareketler.filter(h => h.hareket_turu === 'cikis').length;

  const para = (value) => `₺${Number(value || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`;

  const raporIndir = async (rapor) => {
    setIndirilenRapor(rapor);
    try {
      await api.downloadArsivExcel({ ay, yil, rapor, ...(secilenSube ? { sube_id: secilenSube } : {}) });
      onNotify?.('success', 'Excel raporu indirildi.');
    } catch (e) {
      onNotify?.('error', e.message);
    } finally {
      setIndirilenRapor(null);
    }
  };

  const kaydet = async () => {
    try {
      const pivotData = await api.getPivot({ ay, yil, ...(secilenSube ? { sube_id: secilenSube } : {}) });
      await api.saveArsiv({
        ay,
        yil,
        sube_id: secilenSube ? parseInt(secilenSube) : null,
        ad: `${AYLAR[ay]} ${yil}`,
        veri: pivotData,
      });
      setKaydetDurum('ok');
      onNotify?.('success', 'Arşiv kaydedildi.');
      setTimeout(() => setKaydetDurum(null), 2500);
    } catch (e) {
      onNotify?.('error', e.message);
    }
  };

  return (
    <div className="archive-page">
      <div className="page-header">
        <h1>Arşiv / Raporlar</h1>
        <p>{AYLAR[ay]} {yil} dönemi için Excel raporları ve kısa dönem özeti</p>
      </div>

      <div className="report-hero card">
        <div>
          <div className="report-eyebrow">Aktif Dönem</div>
          <h2>{AYLAR[ay]} {yil}</h2>
          <p>Dönemi veya şubeyi değiştirmek için sol menüdeki seçimleri kullanın.</p>
        </div>
        <div className="report-hero-actions">
          <button className="btn btn-secondary" onClick={kaydet}>
            <Save size={17} /> Arşive Kaydet
          </button>
          <button className="btn btn-primary" onClick={() => raporIndir('tam')} disabled={indirilenRapor === 'tam'}>
            <Download size={17} /> {indirilenRapor === 'tam' ? 'Hazırlanıyor...' : 'Tam Paketi İndir'}
          </button>
          {kaydetDurum === 'ok' && <span className="saved-pill">Kaydedildi</span>}
        </div>
      </div>

      <div className="report-grid">
        {RAPORLAR.map(r => (
          <button
            key={r.key}
            className="report-card"
            onClick={() => raporIndir(r.key)}
            disabled={indirilenRapor === r.key}
          >
            <span className="report-card-icon"><r.Icon size={22} /></span>
            <span className="report-card-body">
              <strong>{r.title}</strong>
              <small>{r.desc}</small>
            </span>
            <span className="report-card-action">
              {indirilenRapor === r.key ? 'Hazırlanıyor' : 'İndir'}
            </span>
          </button>
        ))}
      </div>

      <div className="stat-grid report-summary-grid">
        <div className="stat-card">
          <div className="stat-label">Ürün Çeşidi</div>
          <div className="stat-value">{urunler.length}</div>
          <div className="stat-icon"><ClipboardList size={24} /></div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Stok Değeri</div>
          <div className="stat-value" style={{ fontSize: 16 }}>{para(stokDegeri)}</div>
          <div className="stat-icon"><Package size={24} /></div>
        </div>
        <div className="stat-card" style={{ '--accent': '#7c3aed' }}>
          <div className="stat-label">Aylık Ciro</div>
          <div className="stat-value" style={{ fontSize: 16, color: '#7c3aed' }}>{ciro > 0 ? para(ciro) : '—'}</div>
          <div className="stat-icon"><TrendingUp size={24} /></div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Kullanılan Mal Değeri</div>
          <div className="stat-value" style={{ fontSize: 16, color: '#dc2626' }}>{para(kullanilanMalDegeri)}</div>
          <div className="stat-icon"><Archive size={24} /></div>
        </div>
        <div className="stat-card" style={{ '--accent': '#0891b2' }}>
          <div className="stat-label">Adisyon</div>
          <div className="stat-value" style={{ color: '#0891b2' }}>{adisyon > 0 ? adisyon.toLocaleString('tr-TR') : '—'}</div>
          <div className="stat-icon"><ReceiptText size={24} /></div>
        </div>
        <div className="stat-card" style={{ '--accent': kullanimYuzdesi === null ? '#94a3b8' : kullanimYuzdesi <= 36 ? '#059669' : kullanimYuzdesi <= 38 ? '#d97706' : '#dc2626' }}>
          <div className="stat-label">Kullanım %</div>
          <div className="stat-value">{kullanimYuzdesi === null ? '—' : `%${kullanimYuzdesi}`}</div>
          <div className="stat-icon"><BarChart3 size={24} /></div>
        </div>
      </div>

      <div className="card report-detail-card">
        <div className="card-title">Dönem İçeriği</div>
        {yukleniyor ? (
          <div className="empty-state">Yükleniyor...</div>
        ) : (
          <div className="report-detail-list">
            <div><span>Devreden mal değeri</span><strong>{para(devredenMalDegeri)}</strong></div>
            <div><span>Toplam hareket</span><strong>{hareketler.length}</strong></div>
            <div><span>Giriş kaydı</span><strong>{girisSayisi}</strong></div>
            <div><span>Çıkış kaydı</span><strong>{cikisSayisi}</strong></div>
          </div>
        )}
      </div>
    </div>
  );
}
