from flask import Blueprint, request, jsonify
from app import db
from app.models import Urun, StokHareketi
from app.routes.auth import login_required
from app.routes.permissions import izinli_sube_id

stok_bp = Blueprint('stok', __name__)

@stok_bp.route('/ozet', methods=['GET'])
@login_required
def get_stok_ozet():
    sube_id, hata = izinli_sube_id(request.args.get('sube_id'))
    if hata:
        return hata
    kategori = request.args.get('kategori')
    q = request.args.get('q', '').strip()
    ay = request.args.get('ay')
    yil = request.args.get('yil')

    query = Urun.query
    if sube_id:
        query = query.filter_by(sube_id=sube_id)
    if kategori:
        query = query.filter_by(kategori=kategori)
    if q:
        query = query.filter(
            (Urun.ad.ilike(f'%{q}%')) | (Urun.urun_id.ilike(f'%{q}%'))
        )
    urunler = query.all()
    return jsonify([u.to_dict(ay=ay, yil=yil) for u in urunler])

@stok_bp.route('/toplam', methods=['GET'])
@login_required
def get_toplam():
    sube_id, hata = izinli_sube_id(request.args.get('sube_id'))
    if hata:
        return hata
    ay = request.args.get('ay')
    yil = request.args.get('yil')

    query = Urun.query
    if sube_id:
        query = query.filter_by(sube_id=sube_id)
    urunler = query.all()
    dicts = [u.to_dict(ay=ay, yil=yil) for u in urunler]
    toplam_deger = sum(d['toplam_deger'] for d in dicts)
    return jsonify({
        'toplam_urun_cesidi': len(dicts),
        'toplam_stok_degeri': round(toplam_deger, 2)
    })
