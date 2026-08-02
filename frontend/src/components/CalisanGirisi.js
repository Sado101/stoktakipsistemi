import { useState } from 'react';
import { api } from '../api';
import skLogo from '../assets/sk-logo.png';
import { ArrowRight, KeyRound, LogOut, Store } from 'lucide-react';

export default function CalisanGirisi({ subeAdi, onGiris, onCikis }) {
  const [pin, setPin] = useState('');
  const [hata, setHata] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);

  const giris = async (e) => {
    e.preventDefault();
    if (!pin.trim()) return setHata('Kişisel şifrenizi girin.');
    setYukleniyor(true);
    setHata('');
    try {
      onGiris(await api.calisanGiris(pin.trim()));
    } catch (err) {
      setHata(err.message);
    } finally {
      setYukleniyor(false);
    }
  };

  return (
    <div className="employee-login-page">
      <form className="employee-login-card" onSubmit={giris}>
        <img src={skLogo} alt="Stok Takip" />
        <div className="employee-branch"><Store size={17} /> {subeAdi}</div>
        <h1>Kim işlem yapıyor?</h1>
        <p>Kişisel şifrenizi girin; sistem sizi otomatik tanısın.</p>
        {hata && <div className="login-error">{hata}</div>}
        <label>Kişisel şifre</label>
        <div className="employee-pin-wrap">
          <KeyRound size={19} />
          <input type="password" inputMode="numeric" pattern="[0-9]*" autoFocus value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 12))} placeholder="••••" />
        </div>
        <button className="login-submit" disabled={yukleniyor}>
          <ArrowRight size={20} /> {yukleniyor ? 'Tanınıyor...' : 'Devam Et'}
        </button>
        <button className="employee-back" type="button" onClick={onCikis}><LogOut size={15} /> Şube girişine dön</button>
      </form>
    </div>
  );
}
