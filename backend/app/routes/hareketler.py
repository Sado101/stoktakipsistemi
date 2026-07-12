from flask import Blueprint, request, jsonify, send_file, session
from app import db
from app.models import StokHareketi, Urun, AylikArsiv, Sube
from app.routes.ciro import AylikCiro
from app.routes.auth import login_required
from app.routes.permissions import izinli_sube_id, rapor_izni, stok_islem_izni
from app.utils.excel_export import build_archive_workbook
from app.utils.validation import json_body, parse_float, parse_int, parse_iso_date, parse_month_year, require_fields
from datetime import datetime
import json

hareketler_bp = Blueprint('hareketler', __name__)


@hareketler_bp.route('/', methods=['GET'])
@login_required
def get_hareketler():
    urun_id, hata = parse_int(request.args.get('urun_id'), 'urun_id', min_value=1)
    if hata:
        return hata
    tarih, hata = parse_iso_date(request.args.get('tarih'))
    if hata:
        return hata
    ay_raw = request.args.get('ay')
    yil_raw = request.args.get('yil')
    ay = yil = None
    if ay_raw or yil_raw:
        ay, yil, hata = parse_month_year(ay_raw, yil_raw, default_now=False)
        if hata:
            return hata
    kategori = request.args.get('kategori')
    sube_id, hata = izinli_sube_id(request.args.get('sube_id'))
    if hata:
        return hata

    query = StokHareketi.query.join(Urun)
    if urun_id:
        query = query.filter(StokHareketi.urun_id == urun_id)
    if tarih:
        query = query.filter(StokHareketi.tarih == tarih)
    if ay and yil:
        query = query.filter(
            db.extract('month', StokHareketi.tarih) == ay,
            db.extract('year', StokHareketi.tarih) == yil
        )
    if kategori:
        query = query.filter(Urun.kategori == kategori)
    if sube_id:
        query = query.filter(Urun.sube_id == int(sube_id))

    hareketler = query.order_by(StokHareketi.tarih.asc()).all()
    return jsonify([h.to_dict() for h in hareketler])

@hareketler_bp.route('/', methods=['POST'])
@login_required
def create_hareket():
    data, hata = json_body()
    if hata:
        return hata
    hata = require_fields(data, ['urun_id', 'hareket_turu', 'miktar'])
    if hata:
        return hata

    urun_id, hata = parse_int(data.get('urun_id'), 'urun_id', required=True, min_value=1)
    if hata:
        return hata
    hareket_turu = data.get('hareket_turu')
    if hareket_turu not in {'giris', 'cikis'}:
        return jsonify({'error': 'Hareket türü geçersiz'}), 400
    miktar, hata = parse_float(data.get('miktar'), 'miktar', required=True, min_value=0.000001)
    if hata:
        return hata

    urun = Urun.query.get(urun_id)
    if not urun:
        return jsonify({'error': 'Ürün bulunamadı'}), 404
    engel = stok_islem_izni(urun.sube_id)
    if engel:
        return engel

    tarih, hata = parse_iso_date(data.get('tarih'))
    if hata:
        return hata
    if tarih is None:
        tarih = datetime.utcnow().date()

    hareket = StokHareketi(
        urun_id=urun_id,
        hareket_turu=hareket_turu,
        miktar=miktar,
        tarih=tarih,
        aciklama=data.get('aciklama', '')
    )
    db.session.add(hareket)
    db.session.commit()
    return jsonify(hareket.to_dict()), 201

@hareketler_bp.route('/<int:id>', methods=['DELETE'])
@login_required
def delete_hareket(id):
    hareket = StokHareketi.query.get_or_404(id)
    if hareket.urun:
        engel = stok_islem_izni(hareket.urun.sube_id)
        if engel:
            return engel
    db.session.delete(hareket)
    db.session.commit()
    return jsonify({'message': 'Silindi'})

@hareketler_bp.route('/<int:id>', methods=['PUT'])
@login_required
def update_hareket(id):
    hareket = StokHareketi.query.get_or_404(id)
    data, hata = json_body()
    if hata:
        return hata
    kontrol_urun = hareket.urun
    yeni_urun_id = None
    if data.get('urun_id') not in (None, ''):
        yeni_urun_id, hata = parse_int(data.get('urun_id'), 'urun_id', required=True, min_value=1)
        if hata:
            return hata
        kontrol_urun = Urun.query.get(yeni_urun_id)
    if hareket.urun:
        engel = stok_islem_izni(hareket.urun.sube_id)
        if engel:
            return engel
    if kontrol_urun:
        engel = stok_islem_izni(kontrol_urun.sube_id)
        if engel:
            return engel

    if yeni_urun_id:
        if not kontrol_urun:
            return jsonify({'error': 'Ürün bulunamadı'}), 404
        hareket.urun_id = yeni_urun_id

    if data.get('hareket_turu'):
        if data['hareket_turu'] not in {'giris', 'cikis'}:
            return jsonify({'error': 'Hareket türü geçersiz'}), 400
        hareket.hareket_turu = data['hareket_turu']
    if data.get('miktar') is not None:
        miktar, hata = parse_float(data.get('miktar'), 'miktar', required=True, min_value=0.000001)
        if hata:
            return hata
        hareket.miktar = miktar
    if data.get('tarih'):
        tarih, hata = parse_iso_date(data.get('tarih'), required=True)
        if hata:
            return hata
        hareket.tarih = tarih
    if 'aciklama' in data:
        hareket.aciklama = data.get('aciklama', '')

    db.session.commit()
    return jsonify(hareket.to_dict())

@hareketler_bp.route('/pivot', methods=['GET'])
@login_required
def get_pivot():
    ay, yil, hata = parse_month_year(request.args.get('ay'), request.args.get('yil'), default_now=True)
    if hata:
        return hata
    kategori = request.args.get('kategori')
    sube_id, hata = izinli_sube_id(request.args.get('sube_id'))
    if hata:
        return hata

    import calendar
    from datetime import date
    gun_sayisi = calendar.monthrange(yil, ay)[1]
    tum_gunler = [
        date(yil, ay, g).strftime('%Y-%m-%d')
        for g in range(1, gun_sayisi + 1)
    ]

    query = StokHareketi.query.join(Urun).filter(
        db.extract('month', StokHareketi.tarih) == ay,
        db.extract('year', StokHareketi.tarih) == yil
    )
    if kategori:
        query = query.filter(Urun.kategori == kategori)
    if sube_id:
        query = query.filter(Urun.sube_id == int(sube_id))

    hareketler = query.order_by(StokHareketi.tarih.asc()).all()

    urun_ids = sorted(set(h.urun_id for h in hareketler))

    # Hareketleri olan ürünlere ek olarak devreden stoğu olan ürünleri de ekle
    urun_query = Urun.query
    if sube_id:
        urun_query = urun_query.filter(Urun.sube_id == int(sube_id))
    if kategori:
        urun_query = urun_query.filter(Urun.kategori == kategori)

    tum_urunler = {u.id: u for u in urun_query.all()}

    # Hem hareketi olan hem devreden stoğu olan ürünleri birleştir
    ozet_urun_ids = set(urun_ids)
    for uid, u in tum_urunler.items():
        if u.devreden_stok > 0:
            ozet_urun_ids.add(uid)

    urunler_obj = {uid: tum_urunler[uid] for uid in ozet_urun_ids if uid in tum_urunler}

    pivot = {gun: {} for gun in tum_gunler}

    for h in hareketler:
        if h.hareket_turu not in {'giris', 'cikis'}:
            continue
        t = h.tarih.strftime('%Y-%m-%d')
        if h.urun_id not in pivot[t]:
            pivot[t][h.urun_id] = {'giris': 0, 'cikis': 0}
        pivot[t][h.urun_id][h.hareket_turu] = pivot[t][h.urun_id].get(h.hareket_turu, 0) + h.miktar

    urun_ozet = {}
    for uid in ozet_urun_ids:   
        if uid not in tum_urunler:
            continue
        u = tum_urunler[uid]
        toplam_giris = sum(
            pivot[t].get(uid, {}).get('giris', 0) for t in tum_gunler
        )
        toplam_cikis = sum(
            pivot[t].get(uid, {}).get('cikis', 0) for t in tum_gunler
        )
        urun_ozet[str(uid)] = {
            'devreden': u.devreden_stok,
            'toplam_stok': u.devreden_stok + toplam_giris,
            'gelen_urun': toplam_giris,
            'toplam_cikis': toplam_cikis,
            'guncel_stok': u.devreden_stok + toplam_giris - toplam_cikis
        }

    return jsonify({
        'tarihler': tum_gunler,
        'urunler': [{'id': uid, 'ad': urunler_obj[uid].ad} for uid in sorted(ozet_urun_ids) if uid in urunler_obj],
        'pivot': pivot,
        'urun_ozet': urun_ozet
    })

@hareketler_bp.route('/arsiv', methods=['GET'])
@login_required
def get_arsiv():
    sube_id, hata = rapor_izni(request.args.get('sube_id'))
    if hata:
        return hata
    query = AylikArsiv.query
    if sube_id:
        query = query.filter_by(sube_id=int(sube_id))
    return jsonify([a.to_dict() for a in query.order_by(AylikArsiv.yil.desc(), AylikArsiv.ay.desc()).all()])

@hareketler_bp.route('/arsiv/excel', methods=['GET'])
@login_required
def export_arsiv_excel():
    ay, yil, hata = parse_month_year(request.args.get('ay'), request.args.get('yil'), default_now=True)
    if hata:
        return hata
    sube_id, hata = rapor_izni(request.args.get('sube_id'))
    if hata:
        return hata
    rapor_turu = request.args.get('rapor', 'tam')
    if rapor_turu not in {'tam', 'genel', 'urun', 'gunluk'}:
        rapor_turu = 'tam'
    sube = Sube.query.get(int(sube_id)) if sube_id else None

    urun_query = Urun.query
    hareket_query = StokHareketi.query.join(Urun).filter(
        db.extract('month', StokHareketi.tarih) == ay,
        db.extract('year', StokHareketi.tarih) == yil
    )
    ciro_query = AylikCiro.query.filter_by(ay=ay, yil=yil)

    if sube_id:
        urun_query = urun_query.filter(Urun.sube_id == int(sube_id))
        hareket_query = hareket_query.filter(Urun.sube_id == int(sube_id))
        ciro_query = ciro_query.filter_by(sube_id=int(sube_id))
    else:
        ciro_query = ciro_query.filter_by(sube_id=None)

    urunler = urun_query.order_by(Urun.kategori.asc(), Urun.ad.asc()).all()
    hareketler = hareket_query.order_by(StokHareketi.tarih.asc(), StokHareketi.id.asc()).all()
    ciro_kayit = ciro_query.first()

    workbook = build_archive_workbook(ay, yil, sube, urunler, hareketler, ciro_kayit, rapor_turu)
    sube_kod = (sube.kod if sube else 'tum_subeler').replace(' ', '_')
    filename = f"stok_takip_{rapor_turu}_rapor_{sube_kod}_{yil}_{str(ay).zfill(2)}.xlsx"

    return send_file(
        workbook,
        as_attachment=True,
        download_name=filename,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

@hareketler_bp.route('/arsiv', methods=['POST'])
@login_required
def save_arsiv():
    data = request.get_json()
    sube_id, hata = rapor_izni(data.get('sube_id'))
    if hata:
        return hata
    mevcut = AylikArsiv.query.filter_by(ay=data['ay'], yil=data['yil'], sube_id=sube_id).first()
    if mevcut:
        mevcut.veri = json.dumps(data['veri'], ensure_ascii=False)
        mevcut.guncelleme = datetime.utcnow()
    else:
        a = AylikArsiv(
            ay=data['ay'], yil=data['yil'],
            sube_id=sube_id,
            ad=data.get('ad', f"{data['yil']}-{str(data['ay']).zfill(2)}"),
            veri=json.dumps(data['veri'], ensure_ascii=False)
        )
        db.session.add(a)
    db.session.commit()
    return jsonify({'message': 'Arşivlendi'}), 201

@hareketler_bp.route('/arsiv/<int:id>', methods=['DELETE'])
@login_required
def delete_arsiv(id):
    a = AylikArsiv.query.get_or_404(id)
    _, hata = rapor_izni(a.sube_id)
    if hata:
        return hata
    db.session.delete(a)
    db.session.commit()
    return jsonify({'message': 'Silindi'})
