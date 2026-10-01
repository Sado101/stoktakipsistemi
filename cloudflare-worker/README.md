# Stok Takip Cloudflare API

Bu klasör Render/Flask backend'in yerine hazırlanacak Cloudflare Worker API içindir.

Mevcut canlı sistemi bozmaz. İlk hedef yeni API'yi test domaininde ayağa kaldırmak, tüm sonuçları eski Render sürümüyle karşılaştırmak ve domaini en son çevirmektir.

## Gerekli secret/env değerleri

Cloudflare Worker ortamında:

```text
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
SESSION_SECRET=uzun-rastgele-bir-deger
CORS_ORIGINS=https://yeni-front-domain.com,http://localhost:3000
```

`SUPABASE_SERVICE_ROLE_KEY` kesinlikle frontend'e yazılmayacak. Sadece Worker secret olarak tutulacak.

## İlk kontrol endpointleri

```text
GET /api/health
GET /api/_env-check
```

`/api/_env-check` sadece ortam değişkenlerinin tanımlı olup olmadığını söyler; gizli değerleri döndürmez.

## Geçiş notu

FIFO, yetki ve Excel modülleri tamamlanmadan domain yeni sisteme çevrilmemelidir.
