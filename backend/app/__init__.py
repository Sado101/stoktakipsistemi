from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from datetime import timedelta
import os

db = SQLAlchemy()

def create_app():
    app = Flask(__name__)

    app.secret_key = 'stok-takip-secret-key-2024'
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=20)
    app.config['SESSION_REFRESH_EACH_REQUEST'] = True

    basedir = os.path.abspath(os.path.dirname(__file__))
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, '..', 'stok_v2.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    CORS(app, supports_credentials=True, origins=[
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003',
        'http://localhost:3004',
    ])

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

    with app.app_context():
        db.create_all()
        _migrate_db()

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
    ]
    with db.engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(db.text(sql))
                conn.commit()
            except Exception:
                pass  # Kolon zaten mevcut, atla
