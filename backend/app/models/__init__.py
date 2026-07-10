from app import db
from datetime import datetime
import json

class Sube(db.Model):
    __tablename__ = 'subeler'
    id = db.Column(db.Integer, primary_key=True)
    kod = db.Column(db.String(20), unique=True, nullable=False)
    isim = db.Column(db.String(100), nullable=False)
    sifre = db.Column(db.String(100), nullable=False, default='123456')
    adres = db.Column(db.String(250), nullable=True)
    telefon = db.Column(db.String(30), nullable=True)
    olusturma = db.Column(db.DateTime, nullable=True, default=datetime.utcnow)
    aktif = db.Column(db.Boolean, nullable=False, default=True)
    bloke_bitis = db.Column(db.DateTime, nullable=True)
    stok_islem_izin = db.Column(db.Boolean, nullable=False, default=True)
    rapor_izin = db.Column(db.Boolean, nullable=False, default=True)
    urunler = db.relationship('Urun', backref='sube', lazy=True)

    def to_dict(self):
        bloke_aktif = bool(self.bloke_bitis and self.bloke_bitis > datetime.utcnow())
        return {
            'id': self.id, 'kod': self.kod, 'isim': self.isim,
            'adres': self.adres or '', 'telefon': self.telefon or '',
            'olusturma': self.olusturma.strftime('%d.%m.%Y') if self.olusturma else '',
            'aktif': bool(self.aktif),
            'bloke_bitis': self.bloke_bitis.strftime('%Y-%m-%d') if self.bloke_bitis else '',
            'bloke_bitis_gorunum': self.bloke_bitis.strftime('%d.%m.%Y') if self.bloke_bitis else '',
            'bloke_aktif': bloke_aktif,
            'stok_islem_izin': bool(self.stok_islem_izin),
            'rapor_izin': bool(self.rapor_izin),
        }

class Urun(db.Model):
    __tablename__ = 'urunler'
    id = db.Column(db.Integer, primary_key=True)
    urun_id = db.Column(db.String(50), unique=True, nullable=False)
    ad = db.Column(db.String(150), nullable=False)
    fiyat = db.Column(db.Float, nullable=False, default=0.0)
    kategori = db.Column(db.String(50), nullable=False, default='diger')
    sube_id = db.Column(db.Integer, db.ForeignKey('subeler.id'), nullable=False)
    devreden_stok = db.Column(db.Float, nullable=False, default=0.0)
    hareketler = db.relationship('StokHareketi', backref='urun', lazy=True)

    def to_dict(self, ay=None, yil=None):
        from sqlalchemy import func, extract
        query_giris = db.session.query(func.coalesce(func.sum(StokHareketi.miktar), 0)).filter(
            StokHareketi.urun_id == self.id,
            StokHareketi.hareket_turu == 'giris'
        )
        query_cikis = db.session.query(func.coalesce(func.sum(StokHareketi.miktar), 0)).filter(
            StokHareketi.urun_id == self.id,
            StokHareketi.hareket_turu == 'cikis'
        )
        if ay and yil:
            query_giris = query_giris.filter(
                extract('month', StokHareketi.tarih) == int(ay),
                extract('year', StokHareketi.tarih) == int(yil)
            )
            query_cikis = query_cikis.filter(
                extract('month', StokHareketi.tarih) == int(ay),
                extract('year', StokHareketi.tarih) == int(yil)
            )
        gelen = query_giris.scalar()
        giden = query_cikis.scalar()
        guncel = self.devreden_stok + gelen - giden
        return {
            'id': self.id,
            'urun_id': self.urun_id,
            'ad': self.ad,
            'fiyat': self.fiyat,
            'kategori': self.kategori,
            'sube_id': self.sube_id,
            'sube_isim': self.sube.isim if self.sube else '',
            'devreden_stok': self.devreden_stok,
            'gelen': float(gelen),
            'giden': float(giden),
            'guncel_stok': float(guncel),
            'toplam_deger': round(float(guncel) * self.fiyat, 2)
        }

class StokHareketi(db.Model):
    __tablename__ = 'stok_hareketleri'
    id = db.Column(db.Integer, primary_key=True)
    urun_id = db.Column(db.Integer, db.ForeignKey('urunler.id'), nullable=False)
    hareket_turu = db.Column(db.String(10), nullable=False)
    miktar = db.Column(db.Float, nullable=False)
    tarih = db.Column(db.Date, nullable=False, default=datetime.utcnow)
    aciklama = db.Column(db.String(250))

    def to_dict(self):
        return {
            'id': self.id,
            'urun_id': self.urun_id,
            'urun_ad': self.urun.ad if self.urun else '',
            'hareket_turu': self.hareket_turu,
            'miktar': self.miktar,
            'tarih': self.tarih.strftime('%d.%m.%Y'),
            'tarih_iso': self.tarih.strftime('%Y-%m-%d'),
            'aciklama': self.aciklama
        }

class AylikArsiv(db.Model):
    __tablename__ = 'aylik_arsiv'
    id = db.Column(db.Integer, primary_key=True)
    ay = db.Column(db.Integer, nullable=False)
    yil = db.Column(db.Integer, nullable=False)
    sube_id = db.Column(db.Integer, db.ForeignKey('subeler.id'), nullable=True)
    ad = db.Column(db.String(100))
    veri = db.Column(db.Text)
    olusturma = db.Column(db.DateTime, default=datetime.utcnow)
    guncelleme = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'ay': self.ay,
            'yil': self.yil,
            'sube_id': self.sube_id,
            'ad': self.ad,
            'veri': json.loads(self.veri) if self.veri else {},
            'olusturma': self.olusturma.strftime('%d.%m.%Y %H:%M') if self.olusturma else ''
        }
