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
    product_rows = [_product_row(u, hareketler) for u in urunler]
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

    summary_sheet = _summary_sheet(ay, yil, subtitle, category_rows, {
            "total_ciro": total_ciro,
            "stok_degeri": stok_degeri,
            "kullanilan_deger": kullanilan_deger,
            "adisyon": adisyon,
            "ortalama_adisyon": (total_ciro / adisyon) if adisyon > 0 else 0,
            "kullanim_orani": kullanim_orani,
            "devreden_deger": devreden_deger,
            "gelen_deger": gelen_deger,
            "kritik_urun": sum(1 for r in product_rows if r["guncel"] <= 0),
    })
    stock_sheet = _stock_sheet(ay, yil, subtitle, product_rows)
    product_detail_sheet = _product_detail_sheet(ay, yil, subtitle, product_rows)
    movements_sheet = _movements_sheet(ay, yil, subtitle, hareketler)
    cash_sheet = _cash_sheet(ay, yil, subtitle, ciro_kayit)

    if rapor_turu == "genel":
        sheets = [summary_sheet, cash_sheet]
    elif rapor_turu == "urun":
        sheets = [stock_sheet, product_detail_sheet]
    elif rapor_turu == "gunluk":
        sheets = [movements_sheet]
    else:
        sheets = [summary_sheet, stock_sheet, product_detail_sheet, movements_sheet, cash_sheet]

    return _xlsx_package(sheets)


def _product_row(urun, all_hareketler):
    movements = [h for h in all_hareketler if h.urun_id == urun.id]
    giris = sum(float(h.miktar) for h in movements if h.hareket_turu == "giris")
    cikis = sum(float(h.miktar) for h in movements if h.hareket_turu == "cikis")
    devreden = float(urun.devreden_stok or 0)
    fiyat = float(urun.fiyat or 0)
    guncel = devreden + giris - cikis
    latest = sorted(movements, key=lambda h: (h.tarih, h.id), reverse=True)
    son_hareket = ""
    if latest:
        h = latest[0]
        sign = "+" if h.hareket_turu == "giris" else "-"
        son_hareket = f"{_date_short(h.tarih)} {'Giriş' if h.hareket_turu == 'giris' else 'Çıkış'} {sign}{_num(h.miktar)}"
    return {
        "urun": urun,
        "movements": movements,
        "devreden": devreden,
        "giris": giris,
        "cikis": cikis,
        "guncel": guncel,
        "fiyat": fiyat,
        "devreden_deger": devreden * fiyat,
        "gelen_deger": giris * fiyat,
        "kullanilan_deger": cikis * fiyat,
        "stok_degeri": guncel * fiyat,
        "durum": "Kritik" if guncel <= 0 else "Dikkat" if guncel <= 5 else "Normal",
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
        })
        item["urun_sayisi"] += 1
        item["devreden"] += row["devreden"]
        item["giris"] += row["giris"]
        item["cikis"] += row["cikis"]
        item["guncel"] += row["guncel"]
        item["stok_degeri"] += row["stok_degeri"]
        item["kullanilan_deger"] += row["kullanilan_deger"]
    return [grouped[k] for k in sorted(grouped)]


def _summary_sheet(ay, yil, subtitle, category_rows, totals):
    rows = [
        [_c(f"STOK TAKİP - {AYLAR[int(ay)].upper()} {yil} ARŞİV RAPORU", 1)],
        [_c(subtitle, 2)],
        [],
        [_c("Toplam Ciro", 4), _c(totals["total_ciro"], 5), None, None, _c("Adisyon", 4), _c(totals["adisyon"], 6), None, None, _c("Devreden Stok Değeri", 4), _c(totals["devreden_deger"], 5)],
        [_c("Toplam Stok Değeri", 4), _c(totals["stok_degeri"], 5), None, None, _c("Ortalama Adisyon", 4), _c(totals["ortalama_adisyon"], 5), None, None, _c("Gelen Ürün Değeri", 4), _c(totals["gelen_deger"], 5)],
        [_c("Kullanılan Mal Değeri", 4), _c(totals["kullanilan_deger"], 5), None, None, _c("Kullanım Oranı", 4), _c(totals["kullanim_orani"] if totals["kullanim_orani"] is not None else "", 7), None, None, _c("Kritik Ürün", 4), _c(totals["kritik_urun"], 6)],
        [],
        [],
        [_c("Kategori", 3), _c("Ürün Sayısı", 3), _c("Devreden", 3), _c("Giriş", 3), _c("Çıkış", 3), _c("Güncel", 3), _c("Stok Değeri", 3), _c("Kullanılan Değer", 3), _c("Kullanım %", 3), _c("Durum", 3), _c("Not", 3)],
    ]
    for r in category_rows:
        rate = (r["kullanilan_deger"] / totals["total_ciro"]) if totals["total_ciro"] > 0 else ""
        rows.append([
            r["kategori"], r["urun_sayisi"], r["devreden"], r["giris"], r["cikis"], r["guncel"],
            _c(r["stok_degeri"], 5), _c(r["kullanilan_deger"], 5), _c(rate, 7),
            "Normal" if rate == "" or rate <= 0.36 else "Dikkat" if rate <= 0.38 else "Yüksek",
            "",
        ])
    rows.extend([[], [], [_c("Bu rapor seçilen ay/şube verileriyle otomatik üretilmiştir. Açıklamalar hareket kayıtlarından gelir; boş bırakılmış kayıtlar Excel'de boş görünür.", 12)]])
    return {
        "name": "Yönetici Özeti",
        "rows": rows,
        "merges": ["A1:L1", "A2:L2", "A20:L20"],
        "widths": [18, 13, 11, 11, 11, 11, 15, 16, 12, 14, 20, 4],
    }


def _stock_sheet(ay, yil, subtitle, product_rows):
    rows = [
        [_c("STOK ÖZETİ", 1)],
        [_c(subtitle, 2)],
        [],
        [_c("Ürün ID", 3), _c("Ürün", 3), _c("Kategori", 3), _c("Birim", 3), _c("Birim Fiyat", 3), _c("Devreden", 3), _c("Giriş", 3), _c("Çıkış", 3), _c("Güncel", 3), _c("Stok Değeri", 3)],
    ]
    for row in product_rows:
        u = row["urun"]
        rows.append([
            u.urun_id, u.ad, KATEGORI_ADLARI.get(u.kategori, u.kategori), "adet",
            _c(row["fiyat"], 5), row["devreden"], row["giris"], row["cikis"], row["guncel"], _c(row["stok_degeri"], 5),
        ])
    return {
        "name": "Stok Özeti",
        "rows": rows,
        "merges": ["A1:J1", "A2:J2"],
        "widths": [12, 24, 14, 10, 13, 11, 11, 11, 11, 15],
    }


def _product_detail_sheet(ay, yil, subtitle, product_rows):
    rows = [
        [_c(f"ÜRÜN ÜRÜN {AYLAR[int(ay)].upper()} {yil} DÖKÜMÜ", 1)],
        [_c("Her ürün için devreden, giriş, çıkış, güncel stok ve günlük hareket özeti", 2)],
        [],
        [_c("Ürün", 3), _c("Kategori", 3), _c("Birim Fiyat", 3), _c("Devreden", 3), _c("Giriş", 3), _c("Çıkış", 3), _c("Güncel", 3), _c("Stok Değeri", 3), _c("Durum", 3), _c("Son Hareket", 3), _c("Not", 3)],
    ]
    for row in product_rows:
        u = row["urun"]
        rows.append([
            u.ad, KATEGORI_ADLARI.get(u.kategori, u.kategori), _c(row["fiyat"], 5),
            row["devreden"], row["giris"], row["cikis"], row["guncel"],
            _c(row["stok_degeri"], 5), row["durum"], row["son_hareket"], "",
        ])

    merges = ["A1:L1", "A2:L2"]
    rows.append([])
    for row in product_rows:
        start = len(rows) + 1
        u = row["urun"]
        rows.append([_c(f"{u.ad} - Günlük Hareket", 13 if row["durum"] != "Kritik" else 14)])
        merges.append(f"A{start}:L{start}")
        rows.append([_c("Tarih", 3), _c("Giriş", 3), _c("Çıkış", 3), _c("Net", 3), _c("Gün Sonu Stok", 3), _c("Açıklama", 3)])
        daily = _daily_rows(row)
        if daily:
            for daily_row in daily:
                rows.append(daily_row)
        else:
            rows.append(["", "", "", "", row["devreden"], ""])
        rows.append([])

    return {
        "name": "Ürün Ürün Detay",
        "rows": rows,
        "merges": merges,
        "widths": [16, 18, 13, 11, 11, 11, 11, 14, 12, 18, 18, 4],
    }


def _daily_rows(product_row):
    grouped = {}
    for h in sorted(product_row["movements"], key=lambda x: (x.tarih, x.id)):
        item = grouped.setdefault(h.tarih, {"giris": 0, "cikis": 0, "aciklama": []})
        item[h.hareket_turu] += float(h.miktar)
        if h.aciklama:
            item["aciklama"].append(h.aciklama)

    running = product_row["devreden"]
    rows = []
    for tarih, data in grouped.items():
        net = data["giris"] - data["cikis"]
        running += net
        rows.append([
            _date_short(tarih),
            _num(data["giris"]) if data["giris"] else "",
            _num(data["cikis"]) if data["cikis"] else "",
            _num(net),
            _num(running),
            " / ".join(data["aciklama"]),
        ])
    return rows


def _movements_sheet(ay, yil, subtitle, hareketler):
    rows = [
        [_c("GÜNLÜK HAREKETLER", 1)],
        [_c(subtitle, 2)],
        [],
        [_c("Tarih", 3), _c("Ürün", 3), _c("Kategori", 3), _c("Tür", 3), _c("Miktar", 3), _c("Birim", 3), _c("Açıklama", 3), _c("Kayıt ID", 3)],
    ]
    for h in hareketler:
        rows.append([
            _date_full(h.tarih),
            h.urun.ad if h.urun else "",
            KATEGORI_ADLARI.get(h.urun.kategori, h.urun.kategori) if h.urun else "",
            "Giriş" if h.hareket_turu == "giris" else "Çıkış",
            h.miktar,
            "adet",
            h.aciklama or "",
            f"H-{h.id:04d}",
        ])
    return {
        "name": "Günlük Hareketler",
        "rows": rows,
        "merges": ["A1:H1", "A2:H2"],
        "widths": [13, 24, 14, 10, 10, 9, 28, 12],
    }


def _cash_sheet(ay, yil, subtitle, ciro_kayit):
    ciro = float(ciro_kayit.ciro) if ciro_kayit else 0
    adisyon = int(ciro_kayit.adisyon) if ciro_kayit else 0
    rows = [
        [_c("CİRO VE ADİSYON", 1)],
        [_c(subtitle, 2)],
        [],
        [_c("Ay", 3), _c("Ciro", 3), _c("Adisyon", 3), _c("Ort. Adisyon", 3), _c("Güncelleme", 3)],
        [
            f"{AYLAR[int(ay)]} {yil}",
            _c(ciro, 5),
            adisyon,
            _c((ciro / adisyon) if adisyon > 0 else 0, 5),
            ciro_kayit.guncelleme.strftime("%d.%m.%Y %H:%M") if ciro_kayit and ciro_kayit.guncelleme else "",
        ],
    ]
    return {
        "name": "Ciro ve Adisyon",
        "rows": rows,
        "merges": ["A1:I1", "A2:I2"],
        "widths": [18, 15, 12, 15, 18, 12, 12, 12, 12],
    }


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
    cols = "".join(
        f'<col min="{i}" max="{i}" width="{width}" customWidth="1"/>'
        for i, width in enumerate(sheet["widths"], start=1)
    )
    rows_xml = []
    for r_idx, row in enumerate(sheet["rows"], start=1):
        cells = []
        for c_idx, cell in enumerate(row, start=1):
            if cell is None:
                continue
            cells.append(_cell_xml(_cell_ref(r_idx, c_idx), cell))
        rows_xml.append(f'<row r="{r_idx}">{"".join(cells)}</row>')
    merges = sheet.get("merges", [])
    merge_xml = ""
    if merges:
        merge_xml = f'<mergeCells count="{len(merges)}">' + "".join(f'<mergeCell ref="{m}"/>' for m in merges) + "</mergeCells>"
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f"<cols>{cols}</cols><sheetData>{''.join(rows_xml)}</sheetData>{merge_xml}</worksheet>"
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
  <numFmts count="3"><numFmt numFmtId="164" formatCode="₺#,##0.00"/><numFmt numFmtId="165" formatCode="0.0%"/><numFmt numFmtId="166" formatCode="#,##0.##"/></numFmts>
  <fonts count="6"><font><sz val="10"/><name val="Inter"/></font><font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Inter"/></font><font><sz val="10"/><color rgb="FFCBD5E1"/><name val="Inter"/></font><font><b/><sz val="10"/><color rgb="FF334155"/><name val="Inter"/></font><font><sz val="10"/><color rgb="FF64748B"/><name val="Inter"/></font><font><b/><sz val="10"/><color rgb="FF0F172A"/><name val="Inter"/></font></fonts>
  <fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF2FF"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/></patternFill></fill></fills>
  <borders count="2"><border/><border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="15">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="5" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
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
