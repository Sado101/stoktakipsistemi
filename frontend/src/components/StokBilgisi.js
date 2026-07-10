import { useState, useEffect } from 'react';
import { api } from '../api';
import { AlertTriangle, BarChart3, CreditCard, Package, ReceiptText, TrendingUp, WalletCards } from 'lucide-react';

const KAT = {
  '': 'Tümü', ambalaj: 'Ambalaj', icecek: 'İçecek', sos: 'Sos', et: 'Et',
  ekmek: 'Ekmek', tatli: 'Tatlı', kuru_gida: 'Kuru Gıda', manav: 'Manav', diger: 'Diğer'
};

export default function StokBilgisi({ secilenSube, yenile, ay, yil, donemAcik, onKilitAc, onNotify }) {
  const now = new Date();
  const ayKapaliHam = yil < now.getFullYear() || (yil === now.getFullYear() && ay < now.getMonth() + 1);
const ayKapali = ayKapaliHam && !donemAcik;
  const [urunler, setUrunler] = useState([]);
  const [toplam, setToplam] = useState({});
  const [kategori, setKategori] = useState('');
  const [arama, setArama] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [ciro, setCiro] = useState('');
  const [adisyon, setAdisyon] = useState('');
  const [ciroDurum, setCiroDurum] = useState(null);

  useEffect(() => {
    const getir = async () => {
      setYukleniyor(true);
      try {
        const params = { ay, yil };
        if (secilenSube) params.sube_id = secilenSube;
        if (kategori) params.kategori = kategori;
        if (arama) params.q = arama;
        const [u, t] = await Promise.all([
          api.getStokOzet(params),
          api.getStokToplam({ ay, yil, ...(secilenSube ? { sube_id: secilenSube } : {}) })
        ]);
        setUrunler(u);
        setToplam(t);
      } catch (e) { console.error(e); }
      setYukleniyor(false);
    };
    getir();
  }, [secilenSube, yenile, kategori, arama, ay, yil]);

  useEffect(() => {
    let cancelled = false;
    const getir = async () => {
      try {
        const params = { ay, yil };
        if (secilenSube) params.sube_id = secilenSube;
        const data = await api.getCiro(params);
        if (cancelled) return;
        if (data) {
          setCiro(String(data.ciro));
          setAdisyon(String(data.adisyon));
          setCiroDurum('saved');
        } else {
          setCiro(''); setAdisyon(''); setCiroDurum(null);
        }
      } catch (e) { if (!cancelled) console.error(e); }
    };
    getir();
    return () => { cancelled = true; };
  }, [secilenSube, ay, yil]);

  const kaydetCiro = async () => {
    try {
      await api.saveCiro({
        ay, yil,
        sube_id: secilenSube ? parseInt(secilenSube) : null,
        ciro: parseFloat(ciro),
        adisyon: parseInt(adisyon)
      });
      setCiroDurum('saved');
      onNotify?.('success', 'Ciro ve adisyon kaydedildi.');
    } catch (e) { onNotify?.('error', e.message); }
  };

  const kritikStok = urunler.filter(u => u.guncel_stok <= 0).length;
  const ortAdisyon = ciro && adisyon && parseInt(adisyon) > 0
    ? (parseFloat(ciro) / parseInt(adisyon)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })
    : null;
  const toplamKullanilanDeger = urunler.reduce((acc, u) => acc + (u.giden * u.fiyat), 0);
  const kullanimYuzdesi = ciro && parseFloat(ciro) > 0
    ? Math.round((toplamKullanilanDeger / parseFloat(ciro)) * 100)
    : null;
  const kullanimRenk = kullanimYuzdesi === null ? '#94a3b8'
    : kullanimYuzdesi <= 36 ? '#059669'
    : kullanimYuzdesi <= 38 ? '#d97706'
    : '#dc2626';
  const ciroSayisi = ciro ? parseFloat(ciro) : 0;
  const urunKullanimYuzdesi = (u) => ciroSayisi > 0
    ? Math.round(((u.giden * u.fiyat) / ciroSayisi) * 100)
    : null;
  const urunKullanimRenk = (oran) => oran === null ? '#94a3b8'
    : oran <= 10 ? '#059669'
    : oran <= 20 ? '#d97706'
    : '#dc2626';

  return (
    <div>
      <div className="page-header">
        <h1>Stok Bilgisi</h1>
        <p>Güncel stok durumu ve ürün listesi</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Ürün Çeşidi</div>
          <div className="stat-value">{toplam.toplam_urun_cesidi ?? 0}</div>
          <div className="stat-icon"><Package size={24} /></div>
        </div>
        <div className="stat-card green">
          <div className="stat-label">Stok Değeri</div>
          <div className="stat-value" style={{ fontSize: 16 }}>
            ₺{(toplam.toplam_stok_degeri ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
          <div className="stat-icon"><WalletCards size={24} /></div>
        </div>
        {kritikStok > 0 && (
          <div className="stat-card red">
            <div className="stat-label">Stok Bitti</div>
            <div className="stat-value">{kritikStok}</div>
            <div className="stat-icon"><AlertTriangle size={24} /></div>
          </div>
        )}
        {ciro && (
          <div className="stat-card" style={{ '--accent': '#8b5cf6' }}>
            <div className="stat-label">Aylık Ciro</div>
            <div className="stat-value" style={{ fontSize: 16, color: '#7c3aed' }}>
              ₺{parseFloat(ciro).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </div>
            <div className="stat-icon"><TrendingUp size={24} /></div>
          </div>
        )}
        {adisyon && (
          <div className="stat-card" style={{ '--accent': '#0891b2' }}>
            <div className="stat-label">Adisyon</div>
            <div className="stat-value" style={{ color: '#0891b2' }}>
              {parseInt(adisyon).toLocaleString('tr-TR')}
            </div>
            <div className="stat-icon"><ReceiptText size={24} /></div>
          </div>
        )}
        {ortAdisyon && (
          <div className="stat-card" style={{ '--accent': '#059669' }}>
            <div className="stat-label">Ort. Adisyon</div>
            <div className="stat-value" style={{ fontSize: 16, color: '#059669' }}>₺{ortAdisyon}</div>
            <div className="stat-icon"><CreditCard size={24} /></div>
          </div>
        )}
        {kullanimYuzdesi !== null && (
          <div className="stat-card" style={{ '--accent': kullanimRenk }}>
            <div className="stat-label">Kullanım %</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 4 }}>
              <div className="stat-value" style={{ color: kullanimRenk }}>%{kullanimYuzdesi}</div>
              <div style={{ fontSize: 11, fontWeight: 500, color: kullanimRenk, marginBottom: 3 }}>
                {kullanimYuzdesi <= 36 ? 'Normal' : kullanimYuzdesi <= 38 ? 'Dikkat' : 'Yüksek'}
              </div>
            </div>
            <div style={{ marginTop: 8, height: 5, background: '#f1f5f9', borderRadius: 3 }}>
              <div style={{ width: `${Math.min(kullanimYuzdesi, 100)}%`, height: '100%', background: kullanimRenk, borderRadius: 3 }} />
            </div>
            <div className="stat-icon"><BarChart3 size={24} /></div>
          </div>
        )}
      </div>

      {/* Ciro & Adisyon */}
      <div className="card">
        <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          Aylık Ciro & Adisyon Girişi
        {ayKapaliHam && !donemAcik && (
  <button onClick={onKilitAc} style={{
    fontSize: 11, fontWeight: 600, background: '#fee2e2', color: '#dc2626',
    borderRadius: 5, padding: '4px 10px', marginLeft: 4, border: 'none',
    cursor: 'pointer', fontFamily: 'inherit'
  }}>
    Kapalı Dönem — Açmak için tıkla
  </button>
)}
{ayKapaliHam && donemAcik && (
  <span style={{ fontSize: 11, fontWeight: 600, background: '#d1fae5', color: '#065f46', borderRadius: 5, padding: '2px 8px', marginLeft: 4 }}>
    Dönem Açık
  </span>
)}
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 140 }}>
            <label>Aylık Ciro (₺)</label>
            <input type="number" min="0" step="0.01" value={ciro}
              onChange={e => { if (!ayKapali) { setCiro(e.target.value); setCiroDurum(null); } }}
              placeholder="0.00" inputMode="decimal" readOnly={ayKapali}
              style={ayKapali ? { background: '#f8fafc', color: '#94a3b8', cursor: 'not-allowed' } : {}} />
          </div>
          <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 120 }}>
            <label>Adisyon Sayısı</label>
            <input type="number" min="0" value={adisyon}
              onChange={e => { if (!ayKapali) { setAdisyon(e.target.value); setCiroDurum(null); } }}
              placeholder="0" inputMode="numeric" readOnly={ayKapali}
              style={ayKapali ? { background: '#f8fafc', color: '#94a3b8', cursor: 'not-allowed' } : {}} />
          </div>
          {!ayKapali && (
            <button className="btn btn-primary" onClick={kaydetCiro} disabled={!ciro || !adisyon}
              style={{ alignSelf: 'flex-end' }}>
              Kaydet
            </button>
          )}
          {ciroDurum === 'saved' && (
            <span style={{ fontSize: 13, color: '#059669', fontWeight: 600, alignSelf: 'center' }}>✓ Kaydedildi</span>
          )}
        </div>
      </div>

      {/* Stok listesi */}
      <div className="card stock-list-card">
        <div className="search-bar">
          <input placeholder="Ürün adı veya ID..." value={arama} onChange={e => setArama(e.target.value)} />
          <select value={kategori} onChange={e => setKategori(e.target.value)}>
            {Object.entries(KAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {yukleniyor ? (
          <div style={{ padding: '30px 0', textAlign: 'center', color: '#94a3b8' }}>Yükleniyor...</div>
        ) : (
          <div className="table-wrap stock-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ürün Adı</th>
                  <th>Kategori</th>
                  <th>Fiyat</th>
                  <th>Devreden</th>
                  <th>Gelen</th>
                  <th>Giden</th>
                  <th>Güncel</th>
                  <th>Değer</th>
                  <th>Kullanım %</th>
                </tr>
              </thead>
              <tbody>
                {urunler.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>Ürün bulunamadı</td></tr>
                )}
                {urunler.map((u, i) => (
                  <tr key={u.id} style={u.guncel_stok <= 0 ? { background: '#fff5f5' } : {}}>
                    <td style={{ color: '#94a3b8', fontSize: 12 }}>{i + 1}</td>
                    <td style={{ fontWeight: 600, color: '#1e293b' }}>{u.ad}</td>
                    <td><span className="badge badge-cat">{KAT[u.kategori] || u.kategori}</span></td>
                    <td>₺{u.fiyat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                    <td style={{ color: '#64748b' }}>{u.devreden_stok}</td>
                    <td><span style={{ color: '#059669', fontWeight: 600 }}>+{u.gelen}</span></td>
                    <td><span style={{ color: '#dc2626', fontWeight: 600 }}>-{u.giden}</span></td>
                    <td>
                      <span style={{ fontWeight: 700, color: u.guncel_stok <= 0 ? '#dc2626' : u.guncel_stok < 10 ? '#d97706' : '#0f172a' }}>
                        {u.guncel_stok}{u.guncel_stok <= 0 && <span style={{ fontSize: 11, marginLeft: 3 }}>!</span>}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>₺{u.toplam_deger.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                    <td>
                      {(() => {
                        const oran = urunKullanimYuzdesi(u);
                        const renk = urunKullanimRenk(oran);
                        return (
                          <div className="product-usage-cell">
                            <div className="product-usage-head">
                              <span style={{ color: renk }}>{oran === null ? '—' : `%${oran}`}</span>
                            </div>
                            <div className="product-usage-track">
                              <div style={{ width: `${Math.min(oran ?? 0, 100)}%`, background: renk }} />
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!yukleniyor && (
          <div className="mobile-stock-list">
            {urunler.length === 0 && (
              <div className="empty-state">Ürün bulunamadı</div>
            )}
            {urunler.map(u => (
              <div key={u.id} className={`mobile-stock-item ${u.guncel_stok <= 0 ? 'empty' : u.guncel_stok < 10 ? 'low' : ''}`}>
                <div className="mobile-stock-item-head">
                  <div>
                    <div className="mobile-stock-name">{u.ad}</div>
                    <div className="mobile-stock-code">{u.urun_id}</div>
                  </div>
                  <span className="badge badge-cat">{KAT[u.kategori] || u.kategori}</span>
                </div>
                <div className="mobile-stock-metrics">
                  <div>
                    <span>Devreden</span>
                    <strong>{u.devreden_stok}</strong>
                  </div>
                  <div>
                    <span>Gelen</span>
                    <strong className="metric-green">+{u.gelen}</strong>
                  </div>
                  <div>
                    <span>Giden</span>
                    <strong className="metric-red">-{u.giden}</strong>
                  </div>
                  <div>
                    <span>Güncel</span>
                    <strong>{u.guncel_stok}</strong>
                  </div>
                </div>
                <div className="mobile-stock-value">
                  <span>Değer</span>
                  <strong>₺{u.toplam_deger.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</strong>
                </div>
                {(() => {
                  const oran = urunKullanimYuzdesi(u);
                  const renk = urunKullanimRenk(oran);
                  return (
                    <div className="mobile-stock-usage">
                      <div className="mobile-stock-usage-head">
                        <span>Kullanım %</span>
                        <strong style={{ color: renk }}>{oran === null ? '—' : `%${oran}`}</strong>
                      </div>
                      <div className="product-usage-track">
                        <div style={{ width: `${Math.min(oran ?? 0, 100)}%`, background: renk }} />
                      </div>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
