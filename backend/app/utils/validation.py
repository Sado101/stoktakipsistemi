from datetime import datetime
from flask import jsonify, request


def bad_request(message, **extra):
    payload = {'error': message}
    payload.update(extra)
    return jsonify(payload), 400


def json_body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return None, bad_request('JSON gövdesi geçersiz')
    return data, None


def require_fields(data, fields):
    missing = [field for field in fields if data.get(field) in (None, '')]
    if missing:
        return bad_request('Zorunlu alan eksik', fields=missing)
    return None


def parse_int(value, field, required=False, min_value=None, max_value=None):
    if value in (None, ''):
        if required:
            return None, bad_request('Zorunlu alan eksik', fields=[field])
        return None, None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None, bad_request(f'{field} tam sayı olmalı')
    if min_value is not None and parsed < min_value:
        return None, bad_request(f'{field} en az {min_value} olmalı')
    if max_value is not None and parsed > max_value:
        return None, bad_request(f'{field} en fazla {max_value} olmalı')
    return parsed, None


def parse_float(value, field, required=False, min_value=None):
    if value in (None, ''):
        if required:
            return None, bad_request('Zorunlu alan eksik', fields=[field])
        return None, None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None, bad_request(f'{field} sayısal olmalı')
    if min_value is not None and parsed < min_value:
        return None, bad_request(f'{field} en az {min_value} olmalı')
    return parsed, None


def parse_month_year(ay_value, yil_value, default_now=False):
    now = datetime.utcnow()
    ay_raw = ay_value if ay_value not in (None, '') else (now.month if default_now else None)
    yil_raw = yil_value if yil_value not in (None, '') else (now.year if default_now else None)
    ay, hata = parse_int(ay_raw, 'ay', required=not default_now, min_value=1, max_value=12)
    if hata:
        return None, None, hata
    yil, hata = parse_int(yil_raw, 'yil', required=not default_now, min_value=2000, max_value=2100)
    if hata:
        return None, None, hata
    return ay, yil, None


def parse_iso_date(value, field='tarih', required=False):
    if value in (None, ''):
        if required:
            return None, bad_request('Zorunlu alan eksik', fields=[field])
        return None, None
    try:
        return datetime.strptime(value, '%Y-%m-%d').date(), None
    except (TypeError, ValueError):
        return None, bad_request(f'{field} formatı geçersiz')
