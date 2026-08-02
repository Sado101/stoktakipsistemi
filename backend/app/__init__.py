from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from datetime import timedelta
from werkzeug.exceptions import HTTPException
from dotenv import load_dotenv
import os

db = SQLAlchemy()

def _required_env(name):
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f'{name} ortam değişkeni tanımlı değil')
    return value


def _optional_env(name):
    value = os.getenv(name)
    return value.strip() if value else ''


def _cors_origins():
    raw = os.getenv('CORS_ORIGINS')
    if not raw:
        raw = 'http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:3003,http://localhost:3004'
    return [origin.strip() for origin in raw.split(',') if origin.strip()]


def _database_uri(project_root):
    uri = os.getenv('DATABASE_URL', '').strip()
    if uri:
        if uri.startswith('postgres://'):
            uri = 'postgresql://' + uri[len('postgres://'):]
        if 'supabase.com' in uri and 'sslmode=' not in uri:
            separator = '&' if '?' in uri else '?'
            uri = f'{uri}{separator}sslmode=require'
        return uri

    return 'sqlite:///' + os.path.join(project_root, 'backend', 'stok_v2.db')

def create_app():
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    load_dotenv(os.path.join(project_root, '.env'))
    frontend_build = os.path.join(project_root, 'frontend', 'build')
    app = Flask(__name__, static_folder=frontend_build, static_url_path='')

    app.secret_key = _required_env('SECRET_KEY')
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=20)
    app.config['SESSION_REFRESH_EACH_REQUEST'] = True

    app.config['SQLALCHEMY_DATABASE_URI'] = _database_uri(project_root)
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_pre_ping': True,
        'pool_recycle': 280,
    }
    app.config['PROPAGATE_EXCEPTIONS'] = False

    CORS(app, supports_credentials=True, origins=_cors_origins())

    db.init_app(app)

    from .routes.subeler import subeler_bp
    from .routes.urunler import urunler_bp
    from .routes.stok import stok_bp
    from .routes.hareketler import hareketler_bp
    from .routes.ciro import ciro_bp, AylikCiro
    from .routes.auth import auth_bp

    app.register_blueprint(subeler_bp, url_prefix='/api/subeler')
    app.register_blueprint(urunler_bp, url_prefix='/api/urunler')
    app.register_blueprint(stok_bp, url_prefix='/api/stok')
    app.register_blueprint(hareketler_bp, url_prefix='/api/hareketler')
    app.register_blueprint(ciro_bp, url_prefix='/api/ciro')
    app.register_blueprint(auth_bp, url_prefix='/api/auth')


    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_frontend(path):
        if path.startswith('api/'):
            return jsonify({'error': 'İstek bulunamadı'}), 404
        if app.static_folder and path and os.path.exists(os.path.join(app.static_folder, path)):
            return send_from_directory(app.static_folder, path)
        index_path = os.path.join(app.static_folder or '', 'index.html')
        if os.path.exists(index_path):
            return send_from_directory(app.static_folder, 'index.html')
        return jsonify({'error': 'Frontend build bulunamadı. Önce frontend için npm run build çalıştırın.'}), 404

    @app.errorhandler(HTTPException)
    def handle_http_error(error):
        return jsonify({'error': error.description or 'İstek işlenemedi'}), error.code

    @app.errorhandler(Exception)
    def handle_unexpected_error(error):
        app.logger.exception('Beklenmeyen sunucu hatası')
        return jsonify({'error': 'Beklenmeyen bir hata oluştu'}), 500

    with app.app_context():
        db.create_all()
        if db.engine.dialect.name == 'sqlite':
            _migrate_db()
        elif db.engine.dialect.name == 'postgresql':
            _migrate_postgres_db()
        _ensure_admin_account()

    return app


def _migrate_db():
    """Mevcut tablolara eksik kolonları ekler (SQLite ALTER TABLE)."""
    migrations = [
        "ALTER TABLE subeler ADD COLUMN adres VARCHAR(250)",
        "ALTER TABLE subeler ADD COLUMN telefon VARCHAR(30)",
        "ALTER TABLE subeler ADD COLUMN olusturma DATETIME",
        "UPDATE subeler SET olusturma = CURRENT_TIMESTAMP WHERE olusturma IS NULL",
        "ALTER TABLE subeler ADD COLUMN aktif BOOLEAN DEFAULT 1 NOT NULL",
        "ALTER TABLE subeler ADD COLUMN bloke_bitis DATETIME",
        "ALTER TABLE subeler ADD COLUMN stok_islem_izin BOOLEAN DEFAULT 1 NOT NULL",
        "ALTER TABLE subeler ADD COLUMN rapor_izin BOOLEAN DEFAULT 1 NOT NULL",
        "ALTER TABLE stok_hareketleri ADD COLUMN olusturma DATETIME",
        "UPDATE stok_hareketleri SET olusturma = CURRENT_TIMESTAMP WHERE olusturma IS NULL",
        "ALTER TABLE stok_hareketleri ADD COLUMN islemi_yapan VARCHAR(100)",
        "ALTER TABLE stok_hareketleri ADD COLUMN islem_kaynagi VARCHAR(30)",
    ]
    with db.engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(db.text(sql))
                conn.commit()
            except Exception:
                pass  # Kolon zaten mevcut, atla



def _migrate_postgres_db():
    """Canli PostgreSQL tablolarinda geriye uyumlu kolon duzeltmeleri."""
    migrations = [
        "ALTER TABLE subeler ALTER COLUMN kod TYPE VARCHAR(100)",
        "ALTER TABLE stok_hareketleri ADD COLUMN IF NOT EXISTS islemi_yapan VARCHAR(100)",
        "ALTER TABLE stok_hareketleri ADD COLUMN IF NOT EXISTS islem_kaynagi VARCHAR(30)",
    ]
    with db.engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(db.text(sql))
                conn.commit()
            except Exception:
                conn.rollback()


def _ensure_admin_account():
    from .models import AdminAyar

    if AdminAyar.query.first():
        return

    username = _optional_env('ADMIN_USERNAME')
    password_hash = _optional_env('ADMIN_PASSWORD_HASH')
    if not username or not password_hash:
        raise RuntimeError('İlk admin hesabı için ADMIN_USERNAME ve ADMIN_PASSWORD_HASH ortam değişkenleri tanımlı olmalı')

    admin = AdminAyar(username=username, password_hash=password_hash)
    db.session.add(admin)
    db.session.commit()
