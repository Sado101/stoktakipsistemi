import { useMemo, useState } from 'react';
import { api } from '../api';
import {
  Ban,
  CalendarClock,
  KeyRound,
  Shield,
  LockKeyhole,
  Plus,
  Search,
  ShieldCheck,
  Store,
  Trash2,
} from 'lucide-react';

function durum(sube) {
  if (!sube.aktif) return { label: 'Blokeli', cls: 'blocked' };
  if (sube.bloke_aktif) return { label: 'Geçici Bloke', cls: 'limited' };
  if (!sube.stok_islem_izin) return { label: 'İşlem Kapalı', cls: 'paused' };
  return { label: 'Aktif', cls: 'active' };
}

export default function SubeAyarlari({ subeler, onYenile, onYeniSube, onNotify, onConfirm }) {
  const [arama, setArama] = useState('');
  const [seciliId, setSeciliId] = useState(subeler[0]?.id || null);
  const [islemde, setIslemde] = useState(false);
  const [yeniSifre, setYeniSifre] = useState('');
  const [adminPanelAcik, setAdminPanelAcik] = useState(false);
  const [adminForm, setAdminForm] = useState({ username: '', current_password: '', new_password: '', new_password_confirm: '' });

  const filtreliSubeler = useMemo(() => {
    const q = arama.trim().toLowerCase();
    if (!q) return subeler;
    return subeler.filter(s =>
      s.isim.toLowerCase().includes(q) ||
      s.kod.toLowerCase().includes(q)
    );
  }, [subeler, arama]);

  const secili = subeler.find(s => s.id === seciliId) || filtreliSubeler[0] || subeler[0] || null;
  const seciliDurum = secili ? durum(secili) : null;

  const guncelle = async (id, data) => {
    setIslemde(true);
    try {
      await api.updateSubeAyarlar(id, data);
      await onYenile();
      onNotify?.('success', 'Şube ayarı güncellendi.');
    } catch (e) {
      onNotify?.('error', e.message);
    } finally {
      setIslemde(false);
    }
  };

  const sil = async (id) => {
    setIslemde(true);
    try {
      await api.deleteSube(id);
      setSeciliId(null);
      await onYenile();
      onNotify?.('success', 'Şube silindi.');
    } catch (e) {
      onNotify?.('error', e.message);
    } finally {
      setIslemde(false);
    }
  };

  const sifreSifirla = async (e) => {
    e.preventDefault();
    if (!secili) return;
    const temizSifre = yeniSifre.trim();
    if (temizSifre.length < 6) {
      onNotify?.('error', 'Şube şifresi en az 6 karakter olmalı.');
      return;
    }

    setIslemde(true);
    try {
      await api.resetSubeSifre(secili.id, temizSifre);
      setYeniSifre('');
      onNotify?.('success', 'Şube şifresi güncellendi.');
    } catch (e) {
      onNotify?.('error', e.message);
    } finally {
      setIslemde(false);
    }
  };

  const adminBilgiGetir = async () => {
    try {
      const data = await api.getAdminSettings();
      setAdminForm(f => ({ ...f, username: data.username || '' }));
    } catch (e) {
      onNotify?.('error', e.message);
    }
  };

  const adminPanelToggle = async () => {
    const acilacak = !adminPanelAcik;
    setAdminPanelAcik(acilacak);
    if (acilacak && !adminForm.username) {
      await adminBilgiGetir();
    }
  };

  const adminKaydet = async (e) => {
    e.preventDefault();
    if (!adminForm.current_password) {
      onNotify?.('error', 'Mevcut admin şifresi zorunludur.');
      return;
    }
    if (!adminForm.username.trim()) {
      onNotify?.('error', 'Admin kullanıcı adı boş olamaz.');
      return;
    }
    if (adminForm.new_password && adminForm.new_password !== adminForm.new_password_confirm) {
      onNotify?.('error', 'Yeni şifreler eşleşmiyor.');
      return;
    }

    setIslemde(true);
    try {
      const data = await api.updateAdminSettings({
        username: adminForm.username.trim(),
        current_password: adminForm.current_password,
        new_password: adminForm.new_password,
        new_password_confirm: adminForm.new_password_confirm,
      });
      setAdminForm(f => ({ ...f, username: data.username || f.username, current_password: '', new_password: '', new_password_confirm: '' }));
      onNotify?.('success', 'Admin bilgileri güncellendi.');
    } catch (e) {
      onNotify?.('error', e.message);
    } finally {
      setIslemde(false);
    }
  };

  return (
    <div className="branch-settings-page">
      <div className="page-header">
        <h1>Şube Ayarları</h1>
        <p>Şubeleri yönetin, erişim ve işlem durumlarını kontrol edin.</p>
      </div>

      <div className="branch-toolbar card">
        <div className="branch-search">
          <Search size={17} />
          <input value={arama} onChange={e => setArama(e.target.value)} placeholder="Şube adı veya kod ara..." />
        </div>
        <button className="btn btn-primary" onClick={onYeniSube}>
          <Plus size={17} /> Yeni Şube Ekle
        </button>
      </div>

      <div className="admin-security-card card">
        <button className="admin-security-toggle" type="button" onClick={adminPanelToggle}>
          <span><Shield size={18} /> Admin Güvenliği</span>
          <strong>{adminPanelAcik ? 'Kapat' : 'Aç'}</strong>
        </button>
        {adminPanelAcik && (
          <form className="admin-security-form" onSubmit={adminKaydet}>
            <div className="form-group">
              <label>Admin Kullanıcı Adı</label>
              <input value={adminForm.username} onChange={e => setAdminForm(f => ({ ...f, username: e.target.value }))} autoComplete="username" />
            </div>
            <div className="form-group">
              <label>Mevcut Admin Şifresi</label>
              <input type="password" value={adminForm.current_password} onChange={e => setAdminForm(f => ({ ...f, current_password: e.target.value }))} autoComplete="current-password" />
            </div>
            <div className="form-group">
              <label>Yeni Şifre</label>
              <input type="password" value={adminForm.new_password} onChange={e => setAdminForm(f => ({ ...f, new_password: e.target.value }))} placeholder="Değişmeyecekse boş bırak" autoComplete="new-password" />
            </div>
            <div className="form-group">
              <label>Yeni Şifre Tekrar</label>
              <input type="password" value={adminForm.new_password_confirm} onChange={e => setAdminForm(f => ({ ...f, new_password_confirm: e.target.value }))} placeholder="Değişmeyecekse boş bırak" autoComplete="new-password" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={islemde}>Admin Bilgilerini Kaydet</button>
          </form>
        )}
      </div>

      <div className="branch-settings-layout">
        <div className="branch-list">
          {filtreliSubeler.length === 0 && (
            <div className="card empty-state">Şube bulunamadı.</div>
          )}
          {filtreliSubeler.map(s => {
            const d = durum(s);
            return (
              <button
                key={s.id}
                className={`branch-row ${secili?.id === s.id ? 'selected' : ''}`}
                onClick={() => setSeciliId(s.id)}
              >
                <span className="branch-row-icon"><Store size={21} /></span>
                <span className="branch-row-main">
                  <span className="branch-row-head">
                    <strong>{s.isim}</strong>
                    <span className="branch-status-line">
                      <em className={`branch-status ${d.cls}`}>{d.label}</em>
                      <span className="branch-created">Oluşturma: {s.olusturma || '-'}</span>
                    </span>
                  </span>
                  <span className="branch-row-meta">
                    <span>Kod: {s.kod}</span>
                    <span>{s.urun_sayisi || 0} ürün</span>
                    <span>Son hareket: {s.son_hareket || 'Yok'}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="branch-detail card">
          {!secili ? (
            <div className="empty-state">Bir şube seçin.</div>
          ) : (
            <>
              <div className="branch-detail-head">
                <div>
                  <div className="branch-detail-title">{secili.isim}</div>
                  <div className="branch-detail-code">{secili.kod}</div>
                </div>
                <div className="branch-status-line">
                  <span className={`branch-status ${seciliDurum.cls}`}>{seciliDurum.label}</span>
                  <span className="branch-created">Oluşturma: {secili.olusturma || '-'}</span>
                </div>
              </div>

              <div className="branch-action-grid">
                <button className="branch-action" disabled={islemde} onClick={() => guncelle(secili.id, { aktif: !secili.aktif })}>
                  <Ban size={18} />
                  <span>{secili.aktif ? 'Bloke Et' : 'Aktif Et'}</span>
                </button>
                <button className="branch-action" disabled={islemde} onClick={() => guncelle(secili.id, { stok_islem_izin: !secili.stok_islem_izin })}>
                  <LockKeyhole size={18} />
                  <span>{secili.stok_islem_izin ? 'İşlemleri Kapat' : 'İşlemleri Aç'}</span>
                </button>
                <button className="branch-action" disabled={islemde} onClick={() => guncelle(secili.id, { rapor_izin: !secili.rapor_izin })}>
                  <ShieldCheck size={18} />
                  <span>{secili.rapor_izin ? 'Raporu Kapat' : 'Raporu Aç'}</span>
                </button>
                <button
                  className="branch-action danger"
                  disabled={islemde}
                  onClick={() => onConfirm?.({
                    title: 'Şube silinsin mi?',
                    message: `"${secili.isim}" şubesi silinecek.`,
                    detail: 'Şubeye bağlı ürünler, hareket kayıtları, ciro ve arşiv kayıtları da silinir. Bu işlem geri alınamaz.',
                    confirmText: 'Evet, Sil',
                    onConfirm: () => sil(secili.id),
                  })}
                >
                  <Trash2 size={18} />
                  <span>Şubeyi Sil</span>
                </button>
              </div>

              <div className="branch-form-section">
                <label>Geçici bloke bitiş tarihi</label>
                <div className="branch-date-control">
                  <CalendarClock size={17} />
                  <input
                    type="date"
                    value={secili.bloke_bitis || ''}
                    disabled={islemde}
                    onChange={e => guncelle(secili.id, { bloke_bitis: e.target.value })}
                  />
                  {secili.bloke_bitis && (
                    <button className="btn btn-secondary btn-sm" disabled={islemde} onClick={() => guncelle(secili.id, { bloke_bitis: '' })}>
                      Temizle
                    </button>
                  )}
                </div>
              </div>

              <form className="branch-form-section branch-password-section" onSubmit={sifreSifirla}>
                <label>Şube şifresi sıfırla</label>
                <div className="branch-password-control">
                  <KeyRound size={17} />
                  <input
                    type="password"
                    value={yeniSifre}
                    disabled={islemde}
                    onChange={e => setYeniSifre(e.target.value)}
                    placeholder="Yeni şifre"
                    autoComplete="new-password"
                  />
                  <button className="btn btn-secondary btn-sm" type="submit" disabled={islemde || yeniSifre.trim().length < 6}>
                    Sıfırla
                  </button>
                </div>
                <div className="branch-password-hint">Yeni şifre en az 6 karakter olmalı.</div>
              </form>

              <div className="branch-toggle-list">
                <div>
                  <span>Girişe izin ver</span>
                  <button className={`switch ${secili.aktif ? 'on' : ''}`} onClick={() => guncelle(secili.id, { aktif: !secili.aktif })} disabled={islemde} />
                </div>
                <div>
                  <span>Stok hareketi ekleyebilir</span>
                  <button className={`switch ${secili.stok_islem_izin ? 'on' : ''}`} onClick={() => guncelle(secili.id, { stok_islem_izin: !secili.stok_islem_izin })} disabled={islemde} />
                </div>
                <div>
                  <span>Rapor indirebilir</span>
                  <button className={`switch ${secili.rapor_izin ? 'on' : ''}`} onClick={() => guncelle(secili.id, { rapor_izin: !secili.rapor_izin })} disabled={islemde} />
                </div>
              </div>

            </>
          )}
        </div>
      </div>
    </div>
  );
}
