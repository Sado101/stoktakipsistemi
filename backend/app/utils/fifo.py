import json


class FifoStockError(ValueError):
    pass


def _fmt_miktar(value):
    return f'{float(value):g}'


def recalculate_product_fifo(urun):
    """Ürünün tüm çıkış maliyetlerini kronolojik FIFO'ya göre yeniden hesaplar.

    Girişler ayrı parti kabul edilir. Çıkışlar en eski kalan partiden düşer.
    Çıkış satırındaki `birim_fiyat`, çıkışın FIFO ağırlıklı birim maliyeti olur.
    """
    layers = []
    devreden_miktar = float(urun.devreden_stok or 0)
    devreden_fiyat = float(urun.devreden_birim_fiyat if urun.devreden_birim_fiyat is not None else (urun.fiyat or 0))

    if devreden_miktar > 0:
        layers.append({
            'kaynak': 'Devreden stok',
            'hareket_id': None,
            'tarih': None,
            'kalan': devreden_miktar,
            'fiyat': devreden_fiyat,
        })

    from app.models import StokHareketi

    hareketler = StokHareketi.query.filter_by(urun_id=urun.id).order_by(
        StokHareketi.tarih.asc(),
        StokHareketi.id.asc()
    ).all()

    for hareket in hareketler:
        miktar = float(hareket.miktar or 0)
        if miktar <= 0:
            continue

        if hareket.hareket_turu == 'giris':
            fiyat = float(hareket.birim_fiyat if hareket.birim_fiyat is not None else (urun.fiyat or 0))
            layers.append({
                'kaynak': 'Giriş',
                'hareket_id': hareket.id,
                'tarih': hareket.tarih.isoformat() if hareket.tarih else None,
                'kalan': miktar,
                'fiyat': fiyat,
            })
            hareket.fifo_detay = None
            continue

        if hareket.hareket_turu != 'cikis':
            continue

        kalan_cikis = miktar
        toplam_deger = 0.0
        detay = []

        for layer in layers:
            if kalan_cikis <= 0:
                break
            layer_kalan = float(layer.get('kalan') or 0)
            if layer_kalan <= 0:
                continue
            kullanilan = min(layer_kalan, kalan_cikis)
            fiyat = float(layer.get('fiyat') or 0)
            toplam_deger += kullanilan * fiyat
            layer['kalan'] = layer_kalan - kullanilan
            kalan_cikis -= kullanilan
            detay.append({
                'kaynak': layer.get('kaynak') or '',
                'hareket_id': layer.get('hareket_id'),
                'tarih': layer.get('tarih'),
                'miktar': round(kullanilan, 6),
                'birim_fiyat': round(fiyat, 6),
                'tutar': round(kullanilan * fiyat, 2),
            })

        if kalan_cikis > 0.0000001:
            raise FifoStockError(
                f'{urun.ad} için yeterli stok yok. '
                f'Çıkış: {_fmt_miktar(miktar)}, eksik: {_fmt_miktar(kalan_cikis)}'
            )

        hareket.birim_fiyat = round(toplam_deger / miktar, 6) if miktar else 0
        hareket.fifo_detay = json.dumps(detay, ensure_ascii=False)
        layers = [layer for layer in layers if float(layer.get('kalan') or 0) > 0.0000001]
