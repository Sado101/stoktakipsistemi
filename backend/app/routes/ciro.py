from flask import Blueprint, request, jsonify
from app import db
from datetime import datetime
from app.routes.auth import login_required
from app.routes.permissions import izinli_sube_id, stok_islem_izni
from app.utils.validation import json_body, parse_float, parse_int, parse_month_year, require_fields

ciro_bp = Blueprint('ciro', __name__)


class AylikCiro(db.Model):
    __tablename__ = 'aylik_ciro'
    id = db.Column(db.Integer, primary_key=True)
    ay = db.Column(db.Integer, nullable=False)
    yil = db.Column(db.Integer, nullable=False)
    sube_id = db.Column(db.Integer, db.ForeignKey('subeler.id'), nullable=True)
    ciro = db.Column(db.Float, nullable=False, default=0.0)
    adisyon = db.Column(db.Integer, nullable=False, default=0)
    guncelleme = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'ay': self.ay,
            'yil': self.yil,
            'sube_id': self.sube_id,
            'ciro': self.ciro,
            'adisyon': self.adisyon,
            'guncelleme': self.guncelleme.strftime('%d.%m.%Y %H:%M') if self.guncelleme else ''
        }


@ciro_bp.route('/', methods=['GET'])
@login_required
def get_ciro():
    ay, yil, hata = parse_month_year(request.args.get('ay'), request.args.get('yil'), default_now=False)
    if hata:
        return hata
    sube_id, hata = izinli_sube_id(request.args.get('sube_id'))
    if hata:
        return hata

    query = AylikCiro.query.filter_by(ay=ay, yil=yil)
    if sube_id:
        query = query.filter_by(sube_id=int(sube_id))
    else:
        query = query.filter_by(sube_id=None)
    kayit = query.first()
    if not kayit:
        return jsonify(None), 200
    return jsonify(kayit.to_dict())


@ciro_bp.route('/', methods=['POST'])
@login_required
def save_ciro():
    data, hata = json_body()
    if hata:
        return hata
    hata = require_fields(data, ['ay', 'yil', 'ciro', 'adisyon'])
    if hata:
        return hata

    ay, yil, hata = parse_month_year(data.get('ay'), data.get('yil'), default_now=False)
    if hata:
        return hata
    ciro, hata = parse_float(data.get('ciro'), 'ciro', required=True, min_value=0)
    if hata:
        return hata
    adisyon, hata = parse_int(data.get('adisyon'), 'adisyon', required=True, min_value=0)
    if hata:
        return hata

    sube_id, hata = izinli_sube_id(data.get('sube_id'))
    if hata:
        return hata
    engel = stok_islem_izni(sube_id) if sube_id else None
    if engel:
        return engel

    kayit = AylikCiro.query.filter_by(
        ay=ay, yil=yil,
        sube_id=sube_id
    ).first()
    if kayit:
        kayit.ciro = ciro
        kayit.adisyon = adisyon
        kayit.guncelleme = datetime.utcnow()
    else:
        kayit = AylikCiro(
            ay=ay, yil=yil,
            sube_id=sube_id,
            ciro=ciro,
            adisyon=adisyon
        )
        db.session.add(kayit)
    db.session.commit()
    return jsonify(kayit.to_dict()), 201
