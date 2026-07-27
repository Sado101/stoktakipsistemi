from flask import Blueprint, request, jsonify, session
from app import db
from app.models import Sube, Urun, StokHareketi, AylikArsiv
from app.routes.ciro import AylikCiro
from app.routes.auth import login_required
from app.routes.permissions import izinli_sube_id
from app.utils.validation import json_body, bad_request
from sqlalchemy import func
from datetime import datetime
import functools

subeler_bp = Blueprint('subeler', __name__)


def _clean_text(value):
    return str(value or '').strip()


def _validate_sube_fields(data, require_password=False):
    kod = _clean_text(data.get('kod'))
    isim = _clean_text(data.get('isim'))
    sifre = _clean_text(data.get('sifre'))

    if not kod or not isim:
        return None, None, None, bad_request('Şube kodu ve şube adı zorunlu')
    if len(kod) > 100:
        return None, None, None, bad_request('Şube kodu en fazla 100 karakter olmalı')
    if len(isim) > 100:
        return None, None, None, bad_request('Şube adı en fazla 100 karakter olmalı')
    if require_password and len(sifre) < 6:
        return None, None, None, bad_request('Şube şifresi en az 6 karakter olmalı')
    if sifre and len(sifre) > 100:
        return None, None, None, bad_request('Şube şifresi en fazla 100 karakter olmalı')

    return kod, isim, sifre, None


def admin_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('is_admin'):
            return jsonify({'error': 'Bu işlem için admin girişi gerekli'}), 403
        return f(*args, **kwargs)
    return decorated


@subeler_bp.route('/', methods=['GET'])
@login_required
def get_subeler():
    if session.get('is_admin'):
        subeler = Sube.query.all()
    else:
        sube_id, hata = izinli_sube_id(session.get('sube_id'))
        if hata:
            return hata
        subeler = Sube.query.filter_by(id=sube_id).all()
    result = []
    for sube in subeler:
        data = sube.to_dict()
        urun_idler = [u.id for u in Urun.query.filter_by(sube_id=sube.id).all()]
        son_hareket = None
        if urun_idler:
            son_hareket = StokHareketi.query.filter(StokHareketi.urun_id.in_(urun_idler)).order_by(StokHareketi.tarih.desc(), StokHareketi.id.desc()).first()
        data.update({
            'urun_sayisi': len(urun_idler),
            'son_hareket': son_hareket.tarih.strftime('%d.%m.%Y') if son_hareket else '',
        })
        result.append(data)
    return jsonify(result)


@subeler_bp.route('/', methods=['POST'])
@admin_required
def create_sube():
    data, hata = json_body()
    if hata:
        return hata

    kod, isim, sifre, hata = _validate_sube_fields(data, require_password=True)
    if hata:
        return hata
    if Sube.query.filter_by(kod=kod).first():
        return bad_request('Bu kod zaten kullanılıyor')

    sube = Sube(
        kod=kod,
        isim=isim,
        sifre=sifre,
        olusturma=datetime.utcnow()
    )
    db.session.add(sube)
    db.session.commit()
    return jsonify(sube.to_dict()), 201


@subeler_bp.route('/<int:id>', methods=['PUT'])
@admin_required
def update_sube(id):
    sube = Sube.query.get_or_404(id)
    data, hata = json_body()
    if hata:
        return hata

    kod, isim, _, hata = _validate_sube_fields({
        'kod': data.get('kod', sube.kod),
        'isim': data.get('isim', sube.isim),
    })
    if hata:
        return hata
    if Sube.query.filter(Sube.kod == kod, Sube.id != id).first():
        return bad_request('Bu kod zaten kullanılıyor')

    sube.kod = kod
    sube.isim = isim
    db.session.commit()
    return jsonify(sube.to_dict())


@subeler_bp.route('/<int:id>/ayarlar', methods=['PUT'])
@admin_required
def update_sube_ayarlar(id):
    sube = Sube.query.get_or_404(id)
    data = request.get_json()

    if 'aktif' in data:
        sube.aktif = bool(data['aktif'])
    if 'stok_islem_izin' in data:
        sube.stok_islem_izin = bool(data['stok_islem_izin'])
    if 'rapor_izin' in data:
        sube.rapor_izin = bool(data['rapor_izin'])
    if 'bloke_bitis' in data:
        if data.get('bloke_bitis'):
            try:
                sube.bloke_bitis = datetime.strptime(data['bloke_bitis'], '%Y-%m-%d')
            except ValueError:
                return jsonify({'error': 'Bloke bitiş tarihi gg.aa.yyyy formatında gösterilir; seçim alanı geçerli bir tarih olmalı'}), 400
        else:
            sube.bloke_bitis = None

    db.session.commit()
    return jsonify(sube.to_dict())


@subeler_bp.route('/<int:id>/sifre', methods=['PUT'])
@admin_required
def reset_sube_sifre(id):
    sube = Sube.query.get_or_404(id)
    data, hata = json_body()
    if hata:
        return hata

    yeni_sifre = str(data.get('sifre', '')).strip()
    if len(yeni_sifre) < 6:
        return bad_request('Şube şifresi en az 6 karakter olmalı')

    sube.sifre = yeni_sifre
    db.session.commit()
    return jsonify({'message': 'Şube şifresi güncellendi'})


@subeler_bp.route('/<int:id>/bilgi', methods=['GET'])
@login_required
def get_sube_bilgi(id):
    _, hata = izinli_sube_id(id)
    if hata:
        return hata
    sube = Sube.query.get_or_404(id)
    from .ciro import AylikCiro
    sonuc = db.session.query(
        func.coalesce(func.sum(AylikCiro.ciro), 0),
        func.coalesce(func.sum(AylikCiro.adisyon), 0)
    ).filter(AylikCiro.sube_id == id).first()
    return jsonify({
        **sube.to_dict(),
        'toplam_ciro': float(sonuc[0]),
        'toplam_adisyon': int(sonuc[1]),
    })


@subeler_bp.route('/<int:id>/bilgi', methods=['PUT'])
@login_required
def update_sube_bilgi(id):
    _, hata = izinli_sube_id(id)
    if hata:
        return hata
    sube = Sube.query.get_or_404(id)
    data, hata = json_body()
    if hata:
        return hata
    if 'adres' in data:
        sube.adres = _clean_text(data['adres'])[:250]
    if 'telefon' in data:
        sube.telefon = _clean_text(data['telefon'])[:30]
    if data.get('isim') or data.get('kod'):
        kod, isim, _, hata = _validate_sube_fields({
            'kod': data.get('kod', sube.kod),
            'isim': data.get('isim', sube.isim),
        })
        if hata:
            return hata
        if Sube.query.filter(Sube.kod == kod, Sube.id != id).first():
            return bad_request('Bu kullanıcı adı zaten kullanılıyor')
        sube.kod = kod
        sube.isim = isim
    if data.get('sifre'):
        sifre = _clean_text(data['sifre'])
        if len(sifre) < 6:
            return bad_request('Şube şifresi en az 6 karakter olmalı')
        if len(sifre) > 100:
            return bad_request('Şube şifresi en fazla 100 karakter olmalı')
        sube.sifre = sifre
    db.session.commit()
    return jsonify(sube.to_dict())


@subeler_bp.route('/<int:id>', methods=['DELETE'])
@admin_required
def delete_sube(id):
    sube = Sube.query.get_or_404(id)
    urun_idler = [u.id for u in Urun.query.filter_by(sube_id=id).all()]
    if urun_idler:
        StokHareketi.query.filter(StokHareketi.urun_id.in_(urun_idler)).delete(synchronize_session=False)
    Urun.query.filter_by(sube_id=id).delete()
    AylikArsiv.query.filter_by(sube_id=id).delete()
    AylikCiro.query.filter_by(sube_id=id).delete()
    db.session.delete(sube)
    db.session.commit()
    return jsonify({'message': 'Silindi'})
