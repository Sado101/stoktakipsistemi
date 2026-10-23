import json


class FifoStockError(ValueError):
    pass


def _fmt_miktar(value):
    return f'{float(value):g}'


def preview_exit_fifo(urun, tarih, miktar):
    """Yeni çıkış kaydedilmeden önce FIFO maliyetini önizler."""
    from app.models import StokHareketi

    miktar = float(miktar or 0)
    hareketler = StokHareketi.query.filter(
        StokHareketi.urun_id == urun.id,
        StokHareketi.tarih <= tarih,
    ).order_by(StokHareketi.tarih.asc(), StokHareketi.id.asc()).all()
    ilk_giris = next(
        (float(h.birim_fiyat) for h in hareketler
         if h.hareket_turu == 'giris' and float(h.birim_fiyat or 0) > 0.01),
        float(urun.fiyat or 0),
    )
    devreden_fiyat = float(urun.devreden_birim_fiyat or 0)
    if devreden_fiyat <= 0.01:
        devreden_fiyat = ilk_giris
    layers = [{'kalan': float(urun.devreden_stok or 0), 'fiyat': devreden_fiyat}]
    for hareket in hareketler:
        adet = float(hareket.miktar or 0)
        if adet <= 0:
            continue
        if hareket.hareket_turu == 'giris':
            fiyat = float(hareket.birim_fiyat or 0)
            if fiyat <= 0.01:
                fiyat = ilk_giris
            layers.append({'kalan': adet, 'fiyat': fiyat})
        elif hareket.hareket_turu == 'cikis':
            kalan = adet
            for layer in layers:
                if kalan <= 0:
                    break
                kullanilan = min(layer['kalan'], kalan)
                layer['kalan'] -= kullanilan
                kalan -= kullanilan
            layers = [l for l in layers if l['kalan'] > 0.0000001]
    kalan = miktar
    toplam = 0.0
    for layer in layers:
        if kalan <= 0:
            break
        kullanilan = min(layer['kalan'], kalan)
        toplam += kullanilan * layer['fiyat']
        kalan -= kullanilan
    return {
        'birim_fiyat': round(toplam / miktar, 6) if miktar else 0,
        'tutar': round(toplam, 2),
        'eksik': round(max(kalan, 0), 6),
    }


def recalculate_product_fifo(urun):
    """Ürünün tüm çıkış maliyetlerini kronolojik FIFO'ya göre yeniden hesaplar.

    Girişler ayrı parti kabul edilir. Çıkışlar en eski kalan partiden düşer.
    Çıkış satırındaki `birim_fiyat`, çıkışın FIFO ağırlıklı birim maliyeti olur.
    """
    layers = []
    oversold_debt = 0.0
    devreden_miktar = float(urun.devreden_stok or 0)
    from app.models import StokHareketi

    hareketler = StokHareketi.query.filter_by(urun_id=urun.id).order_by(
        StokHareketi.tarih.asc(),
        StokHareketi.id.asc()
    ).all()
    # Devreden fiyatı 0 (ve eski migration'lardan kalan 0,01 gibi yer tutucu)
    # ise, devreden partiyi ilk gerçek giriş partisinin fiyatına bağla.
    ilk_gercek_giris = next(
        (float(h.birim_fiyat) for h in hareketler
         if h.hareket_turu == 'giris' and float(h.birim_fiyat or 0) > 0.01),
        float(urun.fiyat or 0),
    )
    # Eski kayıtlarda devreden_birim_fiyat 0 olarak saklanmış olabilir. 0 gerçek
    # bir alış fiyatı değilse FIFO'nun ilk partiyi ücretsiz tüketmesine izin
    # verme; ürünün geçerli fiyatını kullan.
    devreden_fiyat = float(urun.devreden_birim_fiyat or 0)
    if devreden_fiyat <= 0.01 and ilk_gercek_giris > 0:
        devreden_fiyat = ilk_gercek_giris
        urun.devreden_birim_fiyat = devreden_fiyat

    if devreden_miktar > 0:
        layers.append({
            'kaynak': 'Devreden stok',
            'hareket_id': None,
            'tarih': None,
            'kalan': devreden_miktar,
            'fiyat': devreden_fiyat,
        })

    for hareket in hareketler:
        miktar = float(hareket.miktar or 0)
        if miktar <= 0:
            continue

        if hareket.hareket_turu == 'giris':
            fiyat = float(hareket.birim_fiyat or 0)
            if fiyat <= 0:
                fiyat = ilk_gercek_giris if ilk_gercek_giris > 0 else float(urun.fiyat or 0)
            debt_payment = min(oversold_debt, miktar)
            oversold_debt -= debt_payment
            kalan_giris = miktar - debt_payment
            if kalan_giris <= 0.0000001:
                hareket.fifo_detay = None
                continue
            layers.append({
                'kaynak': 'Giriş',
                'hareket_id': hareket.id,
                'tarih': hareket.tarih.isoformat() if hareket.tarih else None,
                'kalan': kalan_giris,
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

        # Eski verilerdeki fazla çıkışlar yeni kayıtları kilitlememeli.
        # Eksik bölüm borç olarak izlenir ve sonraki girişlerle kapanır.
        if kalan_cikis > 0.0000001:
            oversold_debt += kalan_cikis
            detay.append({
                'kaynak': 'Geçmiş eksik stok',
                'hareket_id': None,
                'tarih': None,
                'miktar': round(kalan_cikis, 6),
                'birim_fiyat': 0,
                'tutar': 0,
            })

        hareket.birim_fiyat = round(toplam_deger / miktar, 6) if miktar else 0
        hareket.fifo_detay = json.dumps(detay, ensure_ascii=False)
        layers = [layer for layer in layers if float(layer.get('kalan') or 0) > 0.0000001]
