from flask import Blueprint, request, jsonify, session
from app import db
from app.models import Sube
from datetime import datetime
import functools

auth_bp = Blueprint('auth', __name__)

ADMIN_USERNAME = 'sado'
ADMIN_PASSWORD = 'A1234'

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
    data = request.get_json()
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()

    if username == ADMIN_USERNAME and password == ADMIN_PASSWORD:
        session.permanent = True
        session['is_admin'] = True
        session['sube_id'] = None
        session['username'] = 'Admin'
        return jsonify({'role': 'admin', 'username': 'Admin'})

    sube = Sube.query.filter_by(kod=username).first()
    if sube and sube.sifre == password:
        hata = _sube_erisim_hatasi(sube)
        if hata:
            return hata
        session.permanent = True
        session['is_admin'] = False
        session['sube_id'] = sube.id
        session['username'] = sube.isim
        return jsonify({'role': 'sube', 'sube_id': sube.id, 'username': sube.isim})

    return jsonify({'error': 'Kullanıcı adı veya şifre hatalı'}), 401


@auth_bp.route('/kilidi-ac', methods=['POST'])
def kilidi_ac():
    data = request.get_json()
    girilen_sifre = data.get('sifre', '').strip()

    # Admin şifresiyle açılabilir
    if girilen_sifre == ADMIN_PASSWORD:
        return jsonify({'ok': True})

    # Şube kendi şifresiyle açabilir
    sube_id = session.get('sube_id')
    if sube_id:
        sube = Sube.query.get(sube_id)
        hata = _sube_erisim_hatasi(sube)
        if hata:
            return hata
        if sube and sube.sifre == girilen_sifre:
            return jsonify({'ok': True})

    return jsonify({'error': 'Hatalı şifre'}), 401

@auth_bp.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'message': 'Çıkış yapıldı'})

@auth_bp.route('/me', methods=['GET'])
def me():
    if session.get('is_admin'):
        return jsonify({'role': 'admin', 'username': 'Admin'})
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
