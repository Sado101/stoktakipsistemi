import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { History, RefreshCw, UserRound } from 'lucide-react';

export default function IslemGecmisi({ secilenSube, onNotify }) {
  const [kayitlar, setKayitlar] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(false);

  const getir = useCallback(async () => {
    setYukleniyor(true);
    try {
      setKayitlar(await api.getIslemGecmisi(secilenSube ? { sube_id: secilenSube } : {}));
    } catch (e) { onNotify?.('error', e.message); }
    finally { setYukleniyor(false); }
  }, [secilenSube, onNotify]);

  useEffect(() => { getir(); }, [getir]);

  return <div className="audit-page">
    <div className="page-header audit-header">
      <div><h1>İşlem Geçmişi</h1><p>Şubelerde kimin, ne zaman, hangi işlemi yaptığını inceleyin.</p></div>
      <button className="btn btn-secondary" onClick={getir} disabled={yukleniyor}><RefreshCw size={16} /> Yenile</button>
    </div>
    <div className="card audit-card">
      <div className="audit-summary"><History size={19} /> Son {kayitlar.length} işlem <span>En fazla 500 kayıt gösterilir.</span></div>
      <div className="table-wrap">
        <table className="audit-table">
          <thead><tr><th>Tarih / Saat</th><th>Şube</th><th>Çalışan</th><th>İşlem</th><th>Tür</th><th>Detay</th></tr></thead>
          <tbody>
            {!yukleniyor && kayitlar.length === 0 && <tr><td colSpan="6" className="empty-state">Henüz işlem kaydı yok.</td></tr>}
            {kayitlar.map(k => <tr key={k.id}>
              <td><strong>{k.tarih}</strong><small>{k.saat}</small></td>
              <td>{k.sube_isim}</td>
              <td><span className="audit-user"><UserRound size={14} /> {k.islemi_yapan}</span></td>
              <td><strong>{k.islem}</strong></td><td>{k.varlik}</td><td>{k.detay || '-'}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </div>;
}
