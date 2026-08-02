from flask import session
from app import db
from app.models import IslemKaydi


def aktif_kullanici_adi():
    return str(session.get('username') or ('Admin' if session.get('is_admin') else 'Bilinmeyen'))[:100]


def islem_kaydet(sube_id, islem, varlik, detay=''):
    kayit = IslemKaydi(
        sube_id=sube_id,
        islemi_yapan=aktif_kullanici_adi(),
        islem=str(islem)[:50],
        varlik=str(varlik)[:50],
        detay=str(detay or '')[:500],
    )
    db.session.add(kayit)
    return kayit
