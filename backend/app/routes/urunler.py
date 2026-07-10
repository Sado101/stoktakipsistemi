from flask import Blueprint, request, jsonify
from app import db
from app.models import Urun, Sube, StokHareketi
from app.routes.auth import login_required
from app.routes.permissions import izinli_sube_id, stok_islem_izni
from app.utils.validation import json_body, parse_float, parse_int, require_fields, bad_request

urunler_bp = Blueprint('urunler', __name__)

KATEGORILER = ['ambalaj', 'icecek', 'sos', 'et', 'ekmek', 'tatli', 'kuru_gida', 'manav', 'diger']


def _kategori_dogrula(kategori):
    kategori = kategori or 'diger'
    if kategori not in KATEGORILER:
        return None, bad_request('Kategori geçersiz')
    return kategori, None


@urunler_bp.route('/', methods=['GET'])
@login_required
def get_urunler():
    sube_id, hata = izinli_sube_id(request.args.get('sube_id'))
    if hata:
        return hata
    kategori = request.args.get('kategori')
    if kategori and kategori not in KATEGORILER:
        return bad_request('Kategori geçersiz')
    q = request.args.get('q', '').strip()

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
    return jsonify([u.to_dict() for u in urunler])


@urunler_bp.route('/<int:id>', methods=['GET'])
@login_required
def get_urun(id):
    urun = Urun.query.get_or_404(id)
    _, hata = izinli_sube_id(urun.sube_id)
    if hata:
        return hata
    return jsonify(urun.to_dict())


@urunler_bp.route('/', methods=['POST'])
@login_required
def create_urun():
    data, hata = json_body()
    if hata:
        return hata
    hata = require_fields(data, ['urun_id', 'ad', 'fiyat', 'sube_id'])
    if hata:
        return hata

    urun_id = str(data['urun_id']).strip()
    ad = str(data['ad']).strip()
    if not urun_id or not ad:
        return bad_request('Ürün ID ve ad boş olamaz')

    fiyat, hata = parse_float(data.get('fiyat'), 'fiyat', required=True, min_value=0)
    if hata:
        return hata
    devreden_stok, hata = parse_float(data.get('devreden_stok', 0), 'devreden_stok', min_value=0)
    if hata:
        return hata
    sube_id, hata = parse_int(data.get('sube_id'), 'sube_id', required=True, min_value=1)
    if hata:
        return hata
    kategori, hata = _kategori_dogrula(data.get('kategori', 'diger'))
    if hata:
        return hata

    if Urun.query.filter_by(urun_id=urun_id).first():
        return jsonify({'error': 'Bu ürün ID zaten kullanılıyor'}), 400
    if not Sube.query.get(data['sube_id']):
        return jsonify({'error': 'Şube bulunamadı'}), 400
    engel = stok_islem_izni(data['sube_id'])
    if engel:
        return engel
    urun = Urun(
        urun_id=data['urun_id'],
        ad=data['ad'],
        fiyat=float(data['fiyat']),
        kategori=data.get('kategori', 'diger'),
        sube_id=data['sube_id'],
        devreden_stok=float(data.get('devreden_stok', 0))
    )
    db.session.add(urun)
    db.session.commit()
    return jsonify(urun.to_dict()), 201

@urunler_bp.route('/<int:id>', methods=['PUT'])
@login_required
def update_urun(id):
    urun = Urun.query.get_or_404(id)
    data = request.get_json()
    hedef_sube_id = data.get('sube_id', urun.sube_id)
    engel = stok_islem_izni(urun.sube_id) or stok_islem_izni(hedef_sube_id)
    if engel:
        return engel
    urun.ad = data.get('ad', urun.ad)
    urun.fiyat = float(data.get('fiyat', urun.fiyat))
    urun.kategori = data.get('kategori', urun.kategori)
    urun.sube_id = data.get('sube_id', urun.sube_id)
    urun.devreden_stok = float(data.get('devreden_stok', urun.devreden_stok))
    db.session.commit()
    return jsonify(urun.to_dict())

@urunler_bp.route('/<int:id>', methods=['DELETE'])
@login_required
def delete_urun(id):
    urun = Urun.query.get_or_404(id)
    engel = stok_islem_izni(urun.sube_id)
    if engel:
        return engel
    StokHareketi.query.filter_by(urun_id=id).delete()
    db.session.delete(urun)
    db.session.commit()
    return jsonify({'message': 'Silindi'})

@urunler_bp.route('/kategoriler', methods=['GET'])
@login_required
def get_kategoriler():
    return jsonify(KATEGORILER)
