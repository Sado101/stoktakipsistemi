# API geçiş envanteri

Frontend'in kullandığı tüm API'ler aşağıdadır. Cloudflare geçişinde bu liste tamamlanmadan canlı domain çevrilmeyecek.

## Auth

- `POST /api/auth/login`
- `POST /api/auth/calisan-giris`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/kilidi-ac`
- `GET /api/auth/admin`
- `PUT /api/auth/admin`

## Şubeler

- `GET /api/subeler/`
- `POST /api/subeler/`
- `PUT /api/subeler/:id`
- `DELETE /api/subeler/:id`
- `PUT /api/subeler/:id/ayarlar`
- `PUT /api/subeler/:id/sifre`
- `GET /api/subeler/:id/bilgi`
- `PUT /api/subeler/:id/bilgi`
- `GET /api/subeler/:id/calisanlar`
- `POST /api/subeler/:id/calisanlar`
- `PUT /api/subeler/:id/calisanlar/:calisanId`
- `DELETE /api/subeler/:id/calisanlar/:calisanId`

## Ürünler

- `GET /api/urunler/`
- `POST /api/urunler/`
- `GET /api/urunler/:id`
- `PUT /api/urunler/:id`
- `DELETE /api/urunler/:id`
- `GET /api/urunler/kategoriler`

## Stok

- `GET /api/stok/ozet`
- `GET /api/stok/toplam`

## Hareketler

- `GET /api/hareketler/`
- `POST /api/hareketler/`
- `PUT /api/hareketler/:id`
- `DELETE /api/hareketler/:id`
- `GET /api/hareketler/islem-gecmisi`
- `GET /api/hareketler/pivot`

## Arşiv

- `GET /api/hareketler/arsiv`
- `POST /api/hareketler/arsiv`
- `DELETE /api/hareketler/arsiv/:id`
- `GET /api/hareketler/arsiv/excel`

## Ciro

- `GET /api/ciro/`
- `POST /api/ciro/`

## Geçişte özel dikkat isteyenler

### Oturum

Flask session yerine Cloudflare imzalı cookie kullanılacak.

### Şifre doğrulama

Mevcut `werkzeug.security` hash formatları Cloudflare tarafında ayrıca desteklenmeli veya kontrollü şekilde yeni hash formatına taşınmalı.

### FIFO

Çıkış hareketi kaydında:

- kullanıcıdan fiyat alınmayacak;
- en eski maliyet partileri tüketilecek;
- çıkış satırına FIFO ortalama birim fiyat yazılacak;
- `fifo_detay` satırda kalıcı tutulacak.

### Excel

Python tarafındaki Excel mantığı JavaScript tarafında yeniden üretilecek. Bu en son taşınacak modül.
