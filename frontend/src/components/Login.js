import { useState } from 'react';
import { api } from '../api';
import skLogo from '../assets/sk-logo.png';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Store, UserRound } from 'lucide-react';

export default function Login({ onGiris, mesaj = '' }) {
  const [form, setForm] = useState({ username: '', password: '' });
  const [hata, setHata] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [sifreGoster, setSifreGoster] = useState(false);
  const [yardimAcik, setYardimAcik] = useState(false);

  const girisYap = async (e) => {
    e.preventDefault();
    if (!form.username || !form.password) { setHata('Tüm alanlar zorunludur.'); return; }
    setYukleniyor(true);
    setHata('');
    try {
      const data = await api.login(form);
      onGiris(data);
    } catch (e) { setHata(e.message); }
    setYukleniyor(false);
  };

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="login-illustration" aria-hidden="true">
          <div className="login-tagline">
            <span className="login-tagline-icon"></span>
            <span>Stoklarınızı kolayca takip edin, kontrolde kalın.</span>
          </div>
          <div className="shelf shelf-one">
            <span></span><span></span><span></span>
          </div>
          <div className="shelf shelf-two">
            <span></span><span></span>
          </div>
          <div className="plant-lines"></div>
          <div className="login-brand">
            <img src={skLogo} alt="Stok Takip" />
            <div className="login-brand-divider">
              <span></span>
              <i></i>
              <span></span>
            </div>
            <div className="login-brand-sub">Şube yönetim paneli</div>
          </div>
        </div>

        <div className="login-divider" aria-hidden="true"></div>

        <div className="login-panel">
          <div className="login-panel-head">
            <div className="login-panel-icon"><Store size={22} /></div>
            <div>
              <h1>Hoş geldiniz</h1>
              <p>Hesabınıza giriş yaparak devam edin.</p>
            </div>
          </div>

          <div className="login-panel-line"></div>

          {hata && (
            <div className="login-error">
              {hata}
            </div>
          )}
          {!hata && mesaj && (
            <div className="login-info">
              {mesaj}
            </div>
          )}

          <form onSubmit={girisYap} className="login-form">
            <div className="login-field">
              <label>Kullanıcı Adı</label>
              <div className="login-input-wrap">
                <span><UserRound size={17} /></span>
                <input
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  placeholder="Kullanıcı adınızı giriniz"
                />
              </div>
            </div>

            <div className="login-field">
              <label>Şifre</label>
              <div className="login-input-wrap">
                <span><LockKeyhole size={17} /></span>
                <input
                  type={sifreGoster ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="login-eye"
                  onClick={() => setSifreGoster(v => !v)}
                  aria-label={sifreGoster ? 'Şifreyi gizle' : 'Şifreyi göster'}
                >
                  {sifreGoster ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={yukleniyor} className="login-submit">
              <ArrowRight size={20} />
              {yukleniyor ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>

            <div className="login-help">
              <button
                type="button"
                className="login-help-btn"
                onClick={() => setYardimAcik(v => !v)}
              >
                Yardım
              </button>
              {yardimAcik && (
                <div className="login-help-popover">
                  <span>İletişim</span>
                  <a href="tel:+905066024898">506 602 48 98</a>
                </div>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
