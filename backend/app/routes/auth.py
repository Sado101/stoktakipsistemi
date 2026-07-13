from flask import Blueprint, request, jsonify, session
from app import db
from app.models import AdminAyar, Sube
from datetime import datetime, timedelta
from werkzeug.security import check_password_hash, generate_password_hash
import functools
import os

auth_bp = Blueprint('auth', __name__)

_auth_failures = {}


def _admin_record():
    return AdminAyar.query.order_by(AdminAyar.id.asc()).first()


def _admin_username():
    admin = _admin_record()
    return admin.username if admin else ''


def _admin_password_matches(password):
    admin = _admin_record()
    return bool(admin and check_password_hash(admin.password_hash, password))


def admin_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('is_admin'):
            return jsonify({'error': 'Bu işlem için admin girişi gerekli'}), 403
        return f(*args, **kwargs)
    return decorated


def _env_int(name, default):
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _client_ip():
    forwarded_for = request.headers.get('X-Forwarded-For', '')
    if forwarded_for:
        return forwarded_for.split(',')[0].strip()
    return request.remote_addr or 'unknown'


def _rate_key(scope, identifier=''):
    normalized_identifier = str(identifier or '').strip().lower() or 'anonymous'
    return f"{scope}:{_client_ip()}:{normalized_identifier}"


def _rate_limited_response(key):
    entry = _auth_failures.get(key)
    if not entry:
        return None
    locked_until = entry.get('locked_until')
    now = datetime.utcnow()
    if locked_until and locked_until > now:
        retry_after = max(1, int((locked_until - now).total_seconds()))
        return jsonify({
            'error': 'Çok fazla hatalı deneme. Lütfen birkaç dakika sonra tekrar deneyin.',
            'retry_after': retry_after
        }), 429
    if locked_until and locked_until <= now:
        _auth_failures.pop(key, None)
    return None


def _record_failed_attempt(key):
    max_attempts = _env_int('AUTH_MAX_ATTEMPTS', 5)
    lock_seconds = _env_int('AUTH_LOCK_SECONDS', 600)
    now = datetime.utcnow()
    entry = _auth_failures.setdefault(key, {'count': 0, 'locked_until': None})
    entry['count'] += 1
    if entry['count'] >= max_attempts:
        entry['locked_until'] = now + timedelta(seconds=lock_seconds)
    return _rate_limited_response(key)


def _clear_failed_attempts(key):
    _auth_failures.pop(key, None)

def login_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('sube_id') and not session.get('is_admin'):
            return jsonify({'error': 'Giriş gerekli'}), 401
        return f(*args, **kwargs)
    return decorated


def _sube_erisim_hatasi(sube):
    if not sube:
        return jsonify({'error': 'Şube bulunamadı'}), 404
    if not sube.aktif:
        return jsonify({'error': 'Bu şube geçici olarak bloke edilmiştir.'}), 403
    if sube.bloke_bitis and sube.bloke_bitis > datetime.utcnow():
        return jsonify({'error': f"Bu şube {sube.bloke_bitis.strftime('%d.%m.%Y')} tarihine kadar bloke edilmiştir."}), 403
    return None

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json(silent=True) or {}
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    rate_key = _rate_key('login', username)
    blocked = _rate_limited_response(rate_key)
    if blocked:
        return blocked

    if username == _admin_username() and _admin_password_matches(password):
        _clear_failed_attempts(rate_key)
        session.permanent = True
        session['is_admin'] = True
        session['sube_id'] = None
        session['username'] = _admin_username()
        return jsonify({'role': 'admin', 'username': _admin_username()})

    sube = Sube.query.filter_by(kod=username).first()
    if sube and sube.sifre == password:
        hata = _sube_erisim_hatasi(sube)
        if hata:
            return hata
        _clear_failed_attempts(rate_key)
        session.permanent = True
        session['is_admin'] = False
        session['sube_id'] = sube.id
        session['username'] = sube.isim
        return jsonify({'role': 'sube', 'sube_id': sube.id, 'username': sube.isim})

    limited = _record_failed_attempt(rate_key)
    if limited:
        return limited
    return jsonify({'error': 'Kullanıcı adı veya şifre hatalı'}), 401


@auth_bp.route('/kilidi-ac', methods=['POST'])
def kilidi_ac():
    data = request.get_json(silent=True) or {}
    girilen_sifre = data.get('sifre', '').strip()
    sube_id = session.get('sube_id')
    rate_identifier = session.get('username') or sube_id or 'admin-unlock'
    rate_key = _rate_key('unlock', rate_identifier)
    blocked = _rate_limited_response(rate_key)
    if blocked:
        return blocked

    # Admin şifresiyle açılabilir
    if _admin_password_matches(girilen_sifre):
        _clear_failed_attempts(rate_key)
        return jsonify({'ok': True})

    # Şube kendi şifresiyle açabilir
    if sube_id:
        sube = Sube.query.get(sube_id)
        hata = _sube_erisim_hatasi(sube)
        if hata:
            return hata
        if sube and sube.sifre == girilen_sifre:
            _clear_failed_attempts(rate_key)
            return jsonify({'ok': True})

    limited = _record_failed_attempt(rate_key)
    if limited:
        return limited
    return jsonify({'error': 'Hatalı şifre'}), 401



@auth_bp.route('/admin', methods=['GET'])
@admin_required
def get_admin_settings():
    admin = _admin_record()
    if not admin:
        return jsonify({'error': 'Admin hesabı bulunamadı'}), 404
    return jsonify(admin.to_dict())


@auth_bp.route('/admin', methods=['PUT'])
@admin_required
def update_admin_settings():
    admin = _admin_record()
    if not admin:
        return jsonify({'error': 'Admin hesabı bulunamadı'}), 404

    data = request.get_json(silent=True) or {}
    mevcut_sifre = str(data.get('current_password', '')).strip()
    yeni_kullanici = str(data.get('username', '')).strip()
    yeni_sifre = str(data.get('new_password', '')).strip()
    yeni_sifre_tekrar = str(data.get('new_password_confirm', '')).strip()

    if not mevcut_sifre:
        return jsonify({'error': 'Mevcut admin şifresi zorunludur'}), 400
    if not check_password_hash(admin.password_hash, mevcut_sifre):
        return jsonify({'error': 'Mevcut admin şifresi hatalı'}), 401
    if not yeni_kullanici:
        return jsonify({'error': 'Admin kullanıcı adı boş olamaz'}), 400
    if len(yeni_kullanici) < 3:
        return jsonify({'error': 'Admin kullanıcı adı en az 3 karakter olmalı'}), 400

    degisti = False
    if yeni_kullanici != admin.username:
        if AdminAyar.query.filter(AdminAyar.username == yeni_kullanici, AdminAyar.id != admin.id).first():
            return jsonify({'error': 'Bu admin kullanıcı adı zaten kullanılıyor'}), 400
        admin.username = yeni_kullanici
        session['username'] = yeni_kullanici
        degisti = True

    if yeni_sifre:
        if len(yeni_sifre) < 8:
            return jsonify({'error': 'Yeni admin şifresi en az 8 karakter olmalı'}), 400
        if yeni_sifre != yeni_sifre_tekrar:
            return jsonify({'error': 'Yeni şifreler eşleşmiyor'}), 400
        admin.password_hash = generate_password_hash(yeni_sifre)
        degisti = True

    if not degisti:
        return jsonify({'error': 'Değişiklik yapılmadı'}), 400

    db.session.commit()
    return jsonify({'message': 'Admin bilgileri güncellendi', **admin.to_dict()})


@auth_bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Çıkış yapıldı'})

@auth_bp.route('/me', methods=['GET'])
def me():
    if session.get('is_admin'):
        return jsonify({'role': 'admin', 'username': session.get('username') or _admin_username()})
    sube_id = session.get('sube_id')
    if sube_id:
        sube = Sube.query.get(sube_id)
        hata = _sube_erisim_hatasi(sube)
        if hata:
            session.clear()
            return hata
        if sube:
            return jsonify({'role': 'sube', 'sube_id': sube_id, 'username': sube.isim})
    return jsonify({'error': 'Giriş gerekli'}), 401
