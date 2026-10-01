# Stok Takip — Render'dan Cloudflare/Supabase mimarisine geçiş planı

Bu geçişin hedefi Render free planındaki uyku/loading sorununu kaldırmak ve sistemi daha profesyonel, düşük maliyetli bir yapıya taşımaktır.

## Hedef mimari

- Frontend: Cloudflare Pages
- API: Cloudflare Worker / Pages Functions
- Veritabanı: Mevcut Supabase PostgreSQL
- Kritik iş kuralları: API + Supabase tarafında
- Eski Render sistemi: Geçiş tamamlanana kadar yedek olarak duracak

## Neden kontrollü paralel geçiş?

Bu sistem artık sadece ekran değil; stok, para değeri, FIFO maliyet, şube yetkisi ve işlem geçmişi tutuyor. Bu yüzden eski sistemi silmeden yeni sistemi paralel kurmak gerekir.

## Taşınacak ana modüller

1. Oturum ve yetki
   - Admin giriş
   - Şube giriş
   - Çalışan PIN girişi
   - Şube bazlı yetki kontrolü
   - Stok işlem izni
   - Rapor izni

2. Şubeler
   - Şube listeleme
   - Şube ekleme/düzenleme/silme
   - Şube şifre sıfırlama
   - Şube bilgi alanları
   - Şube çalışanları

3. Ürünler
   - Aynı barkodun farklı şubelerde kullanılabilmesi
   - Aynı şube içinde barkod çakışmasının engellenmesi
   - Ürün ekleme/düzenleme/silme
   - Devreden stok ve devreden birim fiyat

4. Hareketler
   - Girişte fiyat zorunlu
   - Çıkışta fiyat sorulmaması
   - FIFO maliyet hesaplama
   - Hareket silme/güncellemede FIFO'nun yeniden hesaplanması
   - Stok yetersizse çıkışın engellenmesi

5. Stok ekranları
   - Dönem devreden stok
   - Gelen/giden toplam
   - FIFO stok değeri
   - Kullanılan mal değeri

6. Ciro
   - Aylık ciro/adisyon kaydı
   - Şube bazlı ciro

7. Arşiv / Excel
   - Genel özet
   - Ürün detay
   - Günlük hareket
   - Tam paket

## En kritik teknik kararlar

### FIFO hesaplama

FIFO hesaplaması frontend'de yapılmayacak. Çıkış hareketi kaydedilirken backend/Supabase tarafında hesaplanacak.

Sebep:

- Aynı anda iki kullanıcı işlem yaparsa stok çakışması olmamalı.
- Çıkış satırının maliyeti kalıcı kayıt olarak saklanmalı.
- Sonradan rapor alınırken aynı sonuç tekrar üretilebilmeli.

### Şifre/hash uyumluluğu

Mevcut sistemde:

- Admin şifresi hash olarak duruyor.
- Çalışan PIN'leri hash olarak duruyor.
- Şube şifresi düz metin duruyor.

Cloudflare tarafına geçerken mevcut admin/çalışan hash formatını desteklemek veya kontrollü şekilde yeni hash formatına geçirmek gerekir.

### Excel export

Python openpyxl yerine JavaScript tarafında Excel üretilecek. Bu modül en sona bırakılmalı; önce stok ve hareket doğruluğu bitmeli.

## Geçiş aşamaları

### Aşama 1 — Hazırlık

- Cloudflare Worker iskeleti oluştur.
- Supabase bağlantı ayarlarını ortam değişkeni olarak planla.
- `/api/health` endpointini hazırla.
- Frontend'in API adresini Cloudflare ortamına uygun hale getir.

### Aşama 2 — Okuma endpointleri

- `/api/auth/me`
- `/api/subeler/`
- `/api/urunler/`
- `/api/stok/ozet`
- `/api/stok/toplam`
- `/api/hareketler/`
- `/api/ciro/`

### Aşama 3 — Yazma endpointleri

- Ürün ekleme/düzenleme/silme
- Hareket ekleme/düzenleme/silme
- Ciro kaydetme
- Şube ayarları
- Çalışan yönetimi

### Aşama 4 — FIFO güvenliği

- Giriş fiyat zorunluluğu
- Çıkış fiyatının otomatik hesaplanması
- Stok yetersizliğinde çıkışın engellenmesi
- Hareket düzenleme/silme sonrası FIFO yeniden hesaplama
- Render sürümüyle sonuç karşılaştırması

### Aşama 5 — Excel

- Mevcut Excel tasarımını JS tarafında yeniden üret.
- Rapor değerlerini Render sürümüyle karşılaştır.

### Aşama 6 — Yayın

- Cloudflare Pages test domaininde yayınla.
- Canlı veride kontrollü test yap.
- Domain yönlendirmesini en son değiştir.
- Render sistemini birkaç gün yedek olarak tut.

## Geçiş öncesi gereken bilgiler

Cloudflare tarafında şu ortam değişkenleri gerekecek:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET`
- `CORS_ORIGINS`

Service role key tarayıcıya asla gönderilmeyecek. Sadece Worker ortamında kalacak.

## Test listesi

- Admin giriş yapılabiliyor mu?
- Şube giriş yapılabiliyor mu?
- Çalışan PIN ekranı doğru çalışıyor mu?
- Aynı barkod farklı şubede eklenebiliyor mu?
- Aynı barkod aynı şubede engelleniyor mu?
- Giriş fiyatı zorunlu mu?
- Barkodla girişte fiyat zorunlu mu?
- Çıkışta fiyat sorulmuyor mu?
- FIFO eski partiden düşüyor mu?
- Stok yetersizse çıkış engelleniyor mu?
- Stok değeri Render sürümüyle aynı mı?
- Kullanılan mal değeri Render sürümüyle aynı mı?
- Ciro/adisyon kaydı çalışıyor mu?
- Excel indiriliyor mu?
- Mobilde barkod çalışıyor mu?
