from datetime import datetime
from io import BytesIO
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile


AYLAR = [
    "",
    "Ocak",
    "Şubat",
    "Mart",
    "Nisan",
    "Mayıs",
    "Haziran",
    "Temmuz",
    "Ağustos",
    "Eylül",
    "Ekim",
    "Kasım",
    "Aralık",
]

KATEGORI_ADLARI = {
    "icecek": "İçecek",
    "kuru_gida": "Kuru Gıda",
    "et": "Et",
    "sos": "Sos",
    "ambalaj": "Ambalaj",
    "manav": "Manav",
    "ekmek": "Ekmek",
    "tatli": "Tatlı",
    "diger": "Diğer",
}


def build_archive_workbook(ay, yil, sube, urunler, hareketler, ciro_kayit, rapor_turu="tam"):
    product_rows = [_product_row(u, hareketler, ay, yil) for u in urunler]
    category_rows = _category_rows(product_rows)
    total_ciro = float(ciro_kayit.ciro) if ciro_kayit else 0
    adisyon = int(ciro_kayit.adisyon) if ciro_kayit else 0
    stok_degeri = sum(r["stok_degeri"] for r in product_rows)
    kullanilan_deger = sum(r["kullanilan_deger"] for r in product_rows)
    devreden_deger = sum(r["devreden_deger"] for r in product_rows)
    gelen_deger = sum(r["gelen_deger"] for r in product_rows)
    kullanim_orani = (kullanilan_deger / total_ciro) if total_ciro > 0 else None

    subtitle = (
        f"Şube: {sube.isim if sube else 'Tüm Şubeler'}  |  "
        f"Oluşturma: {datetime.now().strftime('%d.%m.%Y %H:%M')}  |  Para birimi: TL"
    )

    totals = {
        "total_ciro": total_ciro,
        "stok_degeri": stok_degeri,
        "kullanilan_deger": kullanilan_deger,
        "adisyon": adisyon,
        "ortalama_adisyon": (total_ciro / adisyon) if adisyon > 0 else 0,
        "kullanim_orani": kullanim_orani,
        "devreden_deger": devreden_deger,
        "gelen_deger": gelen_deger,
        "stok_yok": sum(1 for r in product_rows if r["guncel"] <= 0),
        "kritik_urun": sum(1 for r in product_rows if 0 < r["guncel"] <= 5),
        "urun_sayisi": len(product_rows),
    }

    dashboard_sheet = _dashboard_sheet(ay, yil, subtitle, category_rows, product_rows, totals)
    stock_sheet = _monthly_stock_sheet(ay, yil, subtitle, product_rows)
    movements_sheet = _movements_sheet(ay, yil, subtitle, hareketler)
    category_sheet = _category_summary_sheet(ay, yil, subtitle, category_rows, totals)
    guide_sheet = _guide_sheet(ay, yil, subtitle)

    if rapor_turu == "genel":
        sheets = [dashboard_sheet, category_sheet]
    elif rapor_turu == "urun":
        sheets = [stock_sheet]
    elif rapor_turu == "gunluk":
        sheets = [movements_sheet]
    else:
        sheets = [dashboard_sheet, stock_sheet, movements_sheet, category_sheet, guide_sheet]

    return _xlsx_package(sheets)


def _product_row(urun, all_hareketler, ay, yil):
    movements = [h for h in all_hareketler if h.urun_id == urun.id]
    giris = sum(float(h.miktar) for h in movements if h.hareket_turu == "giris")
    cikis = sum(float(h.miktar) for h in movements if h.hareket_turu == "cikis")
    devreden, _, _, _ = urun.donem_stoklari(ay, yil)
    fiyat = float(urun.fiyat or 0)
    guncel = devreden + giris - cikis
    gelen_deger = sum(
        float(h.miktar or 0) * float(h.birim_fiyat if h.birim_fiyat is not None else fiyat)
        for h in movements if h.hareket_turu == "giris"
    )
    kullanilan_deger = sum(
        float(h.miktar or 0) * float(h.birim_fiyat if h.birim_fiyat is not None else fiyat)
        for h in movements if h.hareket_turu == "cikis"
    )
    latest = sorted(movements, key=lambda h: (h.tarih, h.id), reverse=True)
    son_hareket = ""
    for h in latest:
        if h.hareket_turu not in {"giris", "cikis"}:
            continue
        sign = "+" if h.hareket_turu == "giris" else "-"
        son_hareket = f"{_date_short(h.tarih)} {'Giriş' if h.hareket_turu == 'giris' else 'Çıkış'} {sign}{_num(h.miktar)}"
        break
    return {
        "urun": urun,
        "movements": movements,
        "devreden": devreden,
        "giris": giris,
        "cikis": cikis,
        "guncel": guncel,
        "fiyat": fiyat,
        "devreden_deger": devreden * fiyat,
        "gelen_deger": gelen_deger,
        "kullanilan_deger": kullanilan_deger,
        "stok_degeri": guncel * fiyat,
        "durum": "Stok Yok" if guncel <= 0 else "Kritik" if guncel <= 5 else "Normal",
        "son_hareket": son_hareket,
    }


def _category_rows(product_rows):
    grouped = {}
    for row in product_rows:
        key = row["urun"].kategori or "diger"
        item = grouped.setdefault(key, {
            "kategori": KATEGORI_ADLARI.get(key, key),
            "urun_sayisi": 0,
            "devreden": 0,
            "giris": 0,
            "cikis": 0,
            "guncel": 0,
            "stok_degeri": 0,
            "kullanilan_deger": 0,
            "devreden_deger": 0,
            "gelen_deger": 0,
        })
        item["urun_sayisi"] += 1
        item["devreden"] += row["devreden"]
        item["giris"] += row["giris"]
        item["cikis"] += row["cikis"]
        item["guncel"] += row["guncel"]
        item["stok_degeri"] += row["stok_degeri"]
        item["kullanilan_deger"] += row["kullanilan_deger"]
        item["devreden_deger"] += row["devreden_deger"]
        item["gelen_deger"] += row["gelen_deger"]
    return [grouped[k] for k in sorted(grouped)]


def _dashboard_sheet(ay, yil, subtitle, category_rows, product_rows, totals):
    rows = [
        [_c(f"{AYLAR[int(ay)].upper()} {yil} • STOK KONTROL PANELİ", 1)],
        [_c(subtitle, 2)],
        [],
        [],
        [_c("DEVREDEN ÜRÜN DEĞERİ", 11), None, None, _c("GELEN ÜRÜN DEĞERİ", 11), None, None, _c("KULLANILAN ÜRÜN DEĞERİ", 11), None, None, _c("GÜNCEL STOK DEĞERİ", 11), None, None, _c("ÜRÜN SAYISI", 11)],
        [_c(totals["devreden_deger"], 12), None, None, _c(totals["gelen_deger"], 13), None, None, _c(totals["kullanilan_deger"], 14), None, None, _c(totals["stok_degeri"], 15), None, None, _c(totals["urun_sayisi"], 16)],
        [],
        [],
        [],
        [_c("CİRO", 17), None, _c("ADİSYON", 17), None, _c("ORT. ADİSYON", 17), None, _c("TÜKETİM / CİRO", 17), None, _c("STOK YOK", 17), None, _c("KRİTİK", 17), None, _c("KAYNAK DÖNEM", 17)],
        [_c(totals["total_ciro"], 18), None, _c(totals["adisyon"], 19), None, _c(totals["ortalama_adisyon"], 18), None, _c(totals["kullanim_orani"] if totals["kullanim_orani"] is not None else "", 20), None, _c(totals["stok_yok"], 19), None, _c(totals["kritik_urun"], 19), None, _c(f"{AYLAR[int(ay)]} {yil}", 21)],
        [],
        [],
        [],
        [_c("Kategori", 24), _c("Devreden Değeri", 24), _c("Gelen Değeri", 24), _c("Kullanılan Değeri", 24), _c("Güncel Stok Değeri", 24), None, _c("En Çok Kullanılan Ürünler", 24), _c("Kategori", 24), _c("Kullanılan", 24), _c("Kullanılan Değer", 24), _c("Güncel", 24), _c("Durum", 24)],
    ]

    top_products = sorted(product_rows, key=lambda row: row["kullanilan_deger"], reverse=True)[:10]
    detail_count = max(len(category_rows), len(top_products))
    for index in range(detail_count):
        category = category_rows[index] if index < len(category_rows) else None
        product = top_products[index] if index < len(top_products) else None
        category_cells = [None] * 5
        if category:
            current_style = 29 if category["stok_degeri"] < 0 else 5
            category_cells = [
                _c(category["kategori"], 8),
                _c(category["devreden_deger"], 5),
                _c(category["gelen_deger"], 5),
                _c(category["kullanilan_deger"], 5),
                _c(category["stok_degeri"], current_style),
            ]
        product_cells = [None] * 6
        if product:
            product_cells = [
                _c(product["urun"].ad, 8),
                _c(KATEGORI_ADLARI.get(product["urun"].kategori, product["urun"].kategori), 8),
                _c(product["cikis"], 6),
                _c(product["kullanilan_deger"], 5),
                _c(product["guncel"], 6),
                _c(product["durum"], _status_style(product["durum"])),
            ]
        rows.append(category_cells + [None] + product_cells)

    check_row = len(rows) + 2
    rows.extend([[], [_c("KONTROL: DEVREDEN + GELEN − KULLANILAN = GÜNCEL ✓", 28)]])
    return {
        "name": "Kontrol Paneli",
        "rows": rows,
        "merges": [
            "A1:N1", "A2:N2",
            "A5:C5", "D5:F5", "G5:I5", "J5:L5", "M5:N5",
            "A6:C8", "D6:F8", "G6:I8", "J6:L8", "M6:N8",
            "A10:B10", "C10:D10", "E10:F10", "G10:H10", "I10:J10", "K10:L10", "M10:N10",
            "A11:B12", "C11:D12", "E11:F12", "G11:H12", "I11:J12", "K11:L12", "M11:N12",
            f"A{check_row}:N{check_row}",
        ],
        "widths": [21, 17, 17, 19, 19, 3, 24, 16, 13, 18, 12, 13, 13, 13],
        "row_heights": {1: 34, 2: 24, 5: 22, 6: 26, 7: 26, 8: 26, 10: 22, 11: 24, 12: 24, 15: 34, check_row: 24},
        "freeze": {"rows": 2, "cols": 0},
    }


def _monthly_stock_sheet(ay, yil, subtitle, product_rows):
    rows = [
        [_c(f"{AYLAR[int(ay)].upper()} {yil} • AYLIK STOK", 1)],
        [_c("Açık yeşil alanlar kaynak veridir; beyaz alanlar sistem tarafından hesaplanmıştır. " + subtitle, 2)],
        [],
        [],
        [_c("Ürün Kodu", 3), _c("Kategori", 3), _c("Ürün", 3), _c("Birim", 3), _c("Devreden", 3), _c("Gelen", 3), _c("Kullanılan", 3), _c("Güncel", 3), _c("Birim Fiyat", 3), _c("Devreden Değeri", 3), _c("Gelen Değeri", 3), _c("Kullanılan Değeri", 3), _c("Güncel Stok Değeri", 3), _c("Durum", 3)],
    ]
    for row in product_rows:
        u = row["urun"]
        rows.append([
            _c(u.urun_id, 9),
            _c(KATEGORI_ADLARI.get(u.kategori, u.kategori), 9),
            _c(u.ad, 9),
            _c("adet", 9),
            _c(row["devreden"], 9),
            _c(row["giris"], 9),
            _c(row["cikis"], 9),
            _c(row["guncel"], 6),
            _c(row["fiyat"], 30),
            _c(row["devreden_deger"], 5),
            _c(row["gelen_deger"], 5),
            _c(row["kullanilan_deger"], 5),
            _c(row["stok_degeri"], 29 if row["stok_degeri"] < 0 else 5),
            _c(row["durum"], _status_style(row["durum"])),
        ])
    end_row = len(rows)
    return {
        "name": "Aylık Stok",
        "rows": rows,
        "merges": ["A1:N1", "A2:N2"],
        "widths": [14, 17, 27, 10, 12, 12, 12, 12, 14, 18, 18, 20, 20, 13],
        "row_heights": {1: 34, 2: 24, 5: 34},
        "freeze": {"rows": 5, "cols": 3},
        "auto_filter": f"A5:N{end_row}",
    }


def _movements_sheet(ay, yil, subtitle, hareketler):
    rows = [
        [_c(f"{AYLAR[int(ay)].upper()} {yil} • GÜNLÜK HAREKETLER", 1)],
        [_c("Tüm giriş ve çıkışlar kullanıcı ve kaynak bilgisiyle tek listede. " + subtitle, 2)],
        [],
        [],
        [_c("Tarih", 3), _c("Saat", 3), _c("Kategori", 3), _c("Ürün", 3), _c("İşlem", 3), _c("Miktar", 3), _c("Birim Fiyat", 3), _c("Hareket Değeri", 3), _c("Kullanıcı", 3), _c("Kaynak", 3), _c("Açıklama", 3), _c("Kayıt ID", 3)],
    ]
    for h in hareketler:
        movement = h.to_dict()
        fiyat = float(h.birim_fiyat if h.birim_fiyat is not None else (h.urun.fiyat or 0)) if h.urun else 0
        miktar = float(h.miktar or 0)
        tur = "Giriş" if h.hareket_turu == "giris" else "Çıkış" if h.hareket_turu == "cikis" else "Geçersiz"
        rows.append([
            _date_full(h.tarih),
            movement.get("saat", ""),
            KATEGORI_ADLARI.get(h.urun.kategori, h.urun.kategori) if h.urun else "",
            h.urun.ad if h.urun else "",
            _c(tur, 21 if tur == "Giriş" else 23),
            _c(miktar, 6),
            _c(fiyat, 5),
            _c(miktar * fiyat, 5),
            movement.get("islemi_yapan", "Eski kayıt"),
            movement.get("islem_kaynagi", ""),
            h.aciklama or "",
            f"H-{h.id:04d}",
        ])
    end_row = len(rows)
    return {
        "name": "Günlük Hareketler",
        "rows": rows,
        "merges": ["A1:L1", "A2:L2"],
        "widths": [13, 9, 15, 25, 11, 12, 15, 18, 17, 15, 30, 12],
        "row_heights": {1: 34, 2: 24, 5: 32},
        "freeze": {"rows": 5, "cols": 4},
        "auto_filter": f"A5:L{end_row}",
    }


def _category_summary_sheet(ay, yil, subtitle, category_rows, totals):
    rows = [
        [_c(f"{AYLAR[int(ay)].upper()} {yil} • KATEGORİ ÖZETİ", 1)],
        [_c("Her kategori için stok ve tüketim değerlerini karşılaştırın. " + subtitle, 2)],
        [],
        [],
        [_c("Kategori", 24), _c("Ürün Sayısı", 24), _c("Devreden Değeri", 24), _c("Gelen Değeri", 24), _c("Kullanılan Değeri", 24), _c("Güncel Değer", 24), _c("Tüketim / Ciro", 24), _c("Durum", 24)],
    ]
    for category in category_rows:
        rate = category["kullanilan_deger"] / totals["total_ciro"] if totals["total_ciro"] > 0 else ""
        status = "İncele" if category["stok_degeri"] <= 0 else "Normal"
        rows.append([
            _c(category["kategori"], 8),
            _c(category["urun_sayisi"], 31),
            _c(category["devreden_deger"], 5),
            _c(category["gelen_deger"], 5),
            _c(category["kullanilan_deger"], 5),
            _c(category["stok_degeri"], 29 if category["stok_degeri"] < 0 else 5),
            _c(rate, 7),
            _c(status, 23 if status == "İncele" else 21),
        ])
    end_row = len(rows)
    return {
        "name": "Kategori Özeti",
        "rows": rows,
        "merges": ["A1:H1", "A2:H2"],
        "widths": [20, 13, 19, 19, 20, 19, 17, 13],
        "row_heights": {1: 34, 2: 24, 5: 34},
        "freeze": {"rows": 5, "cols": 1},
        "auto_filter": f"A5:H{end_row}",
    }


def _guide_sheet(ay, yil, subtitle):
    rows = [
        [_c("KULLANIM REHBERİ", 1)],
        [_c(f"{AYLAR[int(ay)]} {yil} raporunun sadeleştirilmiş çalışma sırası. {subtitle}", 2)],
        [],
        [],
        [_c("AYLIK ÇALIŞMA AKIŞI", 24)],
        [],
    ]
    steps = [
        ("1", "AY BAŞLANGICI", "Aylık Stok sekmesindeki Devreden ve Birim Fiyat alanlarını kontrol edin."),
        ("2", "GÜNLÜK KAYIT", "Giriş ve çıkışları sistem üzerinden kaydedin; Excel'deki Günlük Hareketler sekmesi bunları satır satır gösterir."),
        ("3", "AYLIK TOPLAMA", "Gelen, Kullanılan, Güncel ve değer alanları sistem verilerinden otomatik hazırlanır."),
        ("4", "KONTROL", "Kontrol Paneli ve Kategori Özeti üzerinden kritik stokları ve tüketim oranını inceleyin."),
        ("5", "ARŞİV", "Ay kapanınca raporu saklayın; sonraki ayın devredeni sistemde bu ayın güncel stokundan hesaplanır."),
    ]
    merges = ["A1:J1", "A2:J2", "A5:J5"]
    row_heights = {1: 34, 2: 24, 5: 24}
    for number, heading, description in steps:
        start = len(rows) + 1
        rows.extend([
            [_c(number, 25), None, _c(heading, 26)],
            [None, None, _c(description, 27)],
            [],
        ])
        merges.extend([f"A{start}:B{start + 1}", f"C{start}:J{start}", f"C{start + 1}:J{start + 1}"])
        row_heights[start] = 22
        row_heights[start + 1] = 25
    legend_row = len(rows) + 1
    rows.extend([
        [_c("RENKLERİN ANLAMI", 17)],
        [],
        [_c("AÇIK YEŞİL • Kaynak veri", 26), None, None, _c("BEYAZ • Sistem hesabı", 11), None, None, _c("KIRMIZI / SARI • Kontrol gerekli", 22)],
        [],
        [_c("Temel formül: Güncel Stok = Devreden + Gelen − Kullanılan. Sonraki ayın devredeni, bu ayın güncel stokudur.", 28)],
    ])
    merges.extend([
        f"A{legend_row}:J{legend_row}",
        f"A{legend_row + 2}:C{legend_row + 3}",
        f"D{legend_row + 2}:F{legend_row + 3}",
        f"G{legend_row + 2}:J{legend_row + 3}",
        f"A{legend_row + 4}:J{legend_row + 4}",
    ])
    row_heights[legend_row] = 22
    row_heights[legend_row + 2] = 24
    row_heights[legend_row + 3] = 24
    row_heights[legend_row + 4] = 30
    return {
        "name": "Kullanım Rehberi",
        "rows": rows,
        "merges": merges,
        "widths": [14] * 10,
        "row_heights": row_heights,
        "freeze": {"rows": 2, "cols": 0},
    }


def _status_style(status):
    if status == "Stok Yok":
        return 23
    if status == "Kritik":
        return 22
    return 21


def _xlsx_package(sheets):
    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", _content_types(len(sheets)))
        zf.writestr("_rels/.rels", _root_rels())
        zf.writestr("xl/workbook.xml", _workbook_xml(sheets))
        zf.writestr("xl/_rels/workbook.xml.rels", _workbook_rels(len(sheets)))
        zf.writestr("xl/styles.xml", _styles_xml())
        for i, sheet in enumerate(sheets, start=1):
            zf.writestr(f"xl/worksheets/sheet{i}.xml", _sheet_xml(sheet))
    output.seek(0)
    return output


def _sheet_xml(sheet):
    max_row = max(len(sheet["rows"]), 1)
    max_col = max(len(sheet["widths"]), 1)
    dimension = f"A1:{_cell_ref(max_row, max_col)}"
    cols = "".join(
        f'<col min="{i}" max="{i}" width="{width}" customWidth="1"/>'
        for i, width in enumerate(sheet["widths"], start=1)
    )
    row_heights = sheet.get("row_heights", {})
    rows_xml = []
    for r_idx, row in enumerate(sheet["rows"], start=1):
        cells = []
        for c_idx, cell in enumerate(row, start=1):
            if cell is None:
                continue
            cells.append(_cell_xml(_cell_ref(r_idx, c_idx), cell))
        height = row_heights.get(r_idx)
        height_attr = f' ht="{height}" customHeight="1"' if height else ""
        rows_xml.append(f'<row r="{r_idx}"{height_attr}>{"".join(cells)}</row>')

    freeze = sheet.get("freeze", {})
    frozen_rows = int(freeze.get("rows", 0) or 0)
    frozen_cols = int(freeze.get("cols", 0) or 0)
    pane_xml = ""
    if frozen_rows or frozen_cols:
        top_left = _cell_ref(frozen_rows + 1, frozen_cols + 1)
        pane = "bottomRight" if frozen_rows and frozen_cols else "bottomLeft" if frozen_rows else "topRight"
        split_attrs = ""
        if frozen_cols:
            split_attrs += f' xSplit="{frozen_cols}"'
        if frozen_rows:
            split_attrs += f' ySplit="{frozen_rows}"'
        pane_xml = f'<pane{split_attrs} topLeftCell="{top_left}" activePane="{pane}" state="frozen"/><selection pane="{pane}" activeCell="{top_left}" sqref="{top_left}"/>'
    sheet_views = f'<sheetViews><sheetView showGridLines="0" workbookViewId="0">{pane_xml}</sheetView></sheetViews>'

    auto_filter = sheet.get("auto_filter")
    filter_xml = f'<autoFilter ref="{auto_filter}"/>' if auto_filter else ""
    merges = sheet.get("merges", [])
    merge_xml = ""
    if merges:
        merge_xml = f'<mergeCells count="{len(merges)}">' + "".join(f'<mergeCell ref="{m}"/>' for m in merges) + "</mergeCells>"
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<dimension ref="{dimension}"/>{sheet_views}<sheetFormatPr defaultRowHeight="18"/>'
        f"<cols>{cols}</cols><sheetData>{''.join(rows_xml)}</sheetData>{filter_xml}{merge_xml}"
        '<pageMargins left="0.35" right="0.35" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>'
        '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>'
        "</worksheet>"
    )


def _cell_xml(ref, cell):
    value = cell.get("value") if isinstance(cell, dict) else cell
    style = cell.get("style", 0) if isinstance(cell, dict) else 0
    style_attr = f' s="{style}"' if style else ""
    if value is None or value == "":
        return f'<c r="{ref}"{style_attr}/>'
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f'<c r="{ref}"{style_attr}><v>{value}</v></c>'
    return f'<c r="{ref}" t="inlineStr"{style_attr}><is><t>{escape(str(value))}</t></is></c>'


def _styles_xml():
    return """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;₺&quot;#,##0.00;[Red](&quot;₺&quot;#,##0.00);-"/><numFmt numFmtId="165" formatCode="0.0%;[Red](0.0%);-"/><numFmt numFmtId="166" formatCode="#,##0.00;[Red](#,##0.00);-"/></numFmts>
  <fonts count="13">
    <font><sz val="10"/><color rgb="FF1B2B26"/><name val="Aptos"/></font>
    <font><b/><sz val="20"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font>
    <font><i/><sz val="10"/><color rgb="FF66756F"/><name val="Aptos"/></font>
    <font><b/><sz val="9"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font>
    <font><b/><sz val="9"/><color rgb="FF66756F"/><name val="Aptos"/></font>
    <font><b/><sz val="17"/><color rgb="FFE6A928"/><name val="Aptos Display"/></font>
    <font><b/><sz val="17"/><color rgb="FF009B63"/><name val="Aptos Display"/></font>
    <font><b/><sz val="17"/><color rgb="FFC73A32"/><name val="Aptos Display"/></font>
    <font><b/><sz val="17"/><color rgb="FF24538A"/><name val="Aptos Display"/></font>
    <font><b/><sz val="12"/><color rgb="FF1B2B26"/><name val="Aptos"/></font>
    <font><b/><sz val="10"/><color rgb="FF8C1D18"/><name val="Aptos"/></font>
    <font><b/><sz val="10"/><color rgb="FF006B46"/><name val="Aptos"/></font>
    <font><b/><sz val="10"/><color rgb="FFC73A32"/><name val="Aptos"/></font>
  </fonts>
  <fills count="11">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF006B46"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF7F5EF"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF8C1D18"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE8F7F0"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1B2B26"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF4D6"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFBEDEA"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAF1F9"/></patternFill></fill>
  </fills>
  <borders count="6">
    <border/>
    <border><left style="thin"><color rgb="FFD7DED9"/></left><right style="thin"><color rgb="FFD7DED9"/></right><top style="thin"><color rgb="FFD7DED9"/></top><bottom style="thin"><color rgb="FFD7DED9"/></bottom></border>
    <border><left style="thin"><color rgb="FFD7DED9"/></left><right style="thin"><color rgb="FFD7DED9"/></right><top style="medium"><color rgb="FFE6A928"/></top><bottom style="thin"><color rgb="FFD7DED9"/></bottom></border>
    <border><left style="thin"><color rgb="FFD7DED9"/></left><right style="thin"><color rgb="FFD7DED9"/></right><top style="medium"><color rgb="FF009B63"/></top><bottom style="thin"><color rgb="FFD7DED9"/></bottom></border>
    <border><left style="thin"><color rgb="FFD7DED9"/></left><right style="thin"><color rgb="FFD7DED9"/></right><top style="medium"><color rgb="FFC73A32"/></top><bottom style="thin"><color rgb="FFD7DED9"/></bottom></border>
    <border><left style="thin"><color rgb="FFD7DED9"/></left><right style="thin"><color rgb="FFD7DED9"/></right><top style="medium"><color rgb="FF24538A"/></top><bottom style="thin"><color rgb="FFD7DED9"/></bottom></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="32">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="0" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="166" fontId="0" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="165" fontId="0" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="4" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="5" fillId="7" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="6" fillId="7" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="7" fillId="7" borderId="4" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="8" fillId="7" borderId="5" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="3" fontId="6" fillId="7" borderId="3" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="9" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="3" fontId="9" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="165" fontId="9" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="11" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="10" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="12" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="11" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="11" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="12" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="0" fillId="5" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="3" fontId="0" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>"""


def _content_types(sheet_count):
    sheets = "".join(
        f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for i in range(1, sheet_count + 1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        f"{sheets}</Types>"
    )


def _root_rels():
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )


def _workbook_xml(sheets):
    sheet_xml = "".join(
        f'<sheet name="{escape(sheet["name"])}" sheetId="{i}" r:id="rId{i}"/>'
        for i, sheet in enumerate(sheets, start=1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f"<sheets>{sheet_xml}</sheets></workbook>"
    )


def _workbook_rels(sheet_count):
    rels = "".join(
        f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>'
        for i in range(1, sheet_count + 1)
    )
    rels += f'<Relationship Id="rId{sheet_count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{rels}</Relationships>'
    )


def _c(value, style=0):
    return {"value": value, "style": style}


def _cell_ref(row, col):
    letters = ""
    while col:
        col, rem = divmod(col - 1, 26)
        letters = chr(65 + rem) + letters
    return f"{letters}{row}"


def _date_short(date_value):
    return date_value.strftime("%d.%m.%Y")


def _date_full(date_value):
    return date_value.strftime("%d.%m.%Y")


def _num(value):
    value = float(value or 0)
    return int(value) if value.is_integer() else round(value, 2)
