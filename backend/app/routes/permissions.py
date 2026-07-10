from datetime import datetime
from flask import jsonify, session

from app.models import Sube


def _as_int(value):
    if value in (None, ''):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _sube_erisim_hatasi(sube):
    if not sube:
        return jsonify({'error': 'Şube bulunamadı'}), 404
    if not sube.aktif:
        return jsonify({'error': 'Bu şube geçici olarak bloke edilmiştir.'}), 403
    if sube.bloke_bitis and sube.bloke_bitis > datetime.utcnow():
        tarih = sube.bloke_bitis.strftime('%d.%m.%Y')
        return jsonify({'error': f'Bu şube {tarih} tarihine kadar bloke edilmiştir.'}), 403
    return None


def izinli_sube_id(istenen_sube_id=None):
    if session.get('is_admin'):
        return _as_int(istenen_sube_id), None

    aktif_sube_id = _as_int(session.get('sube_id'))
    if not aktif_sube_id:
        return None, (jsonify({'error': 'Giriş gerekli'}), 401)

    istenen = _as_int(istenen_sube_id)
    if istenen and istenen != aktif_sube_id:
        return None, (jsonify({'error': 'Bu şube için yetkiniz yok'}), 403)

    sube = Sube.query.get(aktif_sube_id)
    hata = _sube_erisim_hatasi(sube)
    if hata:
        return None, hata
    return aktif_sube_id, None


def stok_islem_izni(sube_id):
    if session.get('is_admin'):
        return None

    izinli_id, hata = izinli_sube_id(sube_id)
    if hata:
        return hata

    sube = Sube.query.get(izinli_id)
    if sube and not sube.stok_islem_izin:
        return jsonify({'error': 'Bu şube için stok işlemleri geçici olarak kapatılmıştır.'}), 403
    return None


def rapor_izni(sube_id=None):
    if session.get('is_admin'):
        return _as_int(sube_id), None

    izinli_id, hata = izinli_sube_id(sube_id)
    if hata:
        return None, hata

    sube = Sube.query.get(izinli_id)
    if sube and not sube.rapor_izin:
        return None, (jsonify({'error': 'Bu şube için rapor indirme geçici olarak kapatılmıştır.'}), 403)
    return izinli_id, None
