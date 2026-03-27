# Albion Realtime Analyzer

Albion Online ağ trafikini gerçek zamanlı dinleyip olayları web panelinde gösteren Node.js tabanlı analiz aracıdır.

## Özellikler
- Gerçek zamanlı paket dinleme (ao-network)
- Event 6 ile alınan/verilen hasar takibi ve DPS metresi (5s/10s/30s)
- Combat filtreleri (all/dealt/taken) ve DPS pencere seçimi
- **Yüksek kesinlik loot filtreleme (Doğrulanmış Çalışan):**
  - Event 61 (HarvestFinished): Gather item/quantity ✅ Çalışıyor
  - Event 98-100: Container açma işlemleri (Active)
  - Event 387-389: Loot chest işlemleri (Active)
  - Event 607-610: Piled object pickup işlemleri (Active)
- Event ve operation code sözlüğü (otomatik yükleme + fallback)
- WebSocket ile canlı panel yayını
- Item ID çözümleme (ao-bin-dumps formatted/items.json - 11,963 item)
- **Devre Dışı Bırakılan Özellikler (Yapılan Araştırmaları):**
  - ~~Silver tracking~~ (Event 62 sistem silveri getirir, gerçek loot silveri değil - ❌ Devre dışı)
  - ~~Fame tracking~~ (Event 82 combat fame mekanizmasını doğru şekilde takip edemedi - ❌ Devre dışı)
  - ~~Event 26/27 (Inventory)~~ (Diğer oyuncuların inventory değişikliklerini tetikliyordu - ❌ Kaldırıldı)

## Proje Yapısı
- [server.js](server.js): Ana dinleyici, event işleyicisi ve yayıncısı
- [index.html](index.html): Canlı panel arayüzü (Combat + Economy sekmeleri)
- [package.json](package.json): Bağımlılıklar ve npm scriptleri
- [data/loot-matrix.json](data/loot-matrix.json): Loot event/operation matrisi (Sadece Doğrulanmış Olaylar)
- [data/event-catalog.json](data/event-catalog.json): Tüm 615 event + 516 operation code sözlüğü
- [scripts/update-catalog.js](scripts/update-catalog.js): Katalog ve matrix auto-update script
- [ao-bin-dumps-master/](ao-bin-dumps-master/): Item referansları ve loot verileri
- [docs/research-notes.md](docs/research-notes.md): İç araştırma notları ve teknik bulgular

## Gereksinimler
- Node.js 14+
- Windows icin Npcap (WinPcap uyumlu)
- Albion Online istemcisi calisir durumda

## Kurulum
1. Proje klasorune gir
2. Bagimliliklari yukle: `npm install`
3. Npcap kurulu oldugunu dogrula
4. Istege bagh: `npm run update:catalog` (event/operation sozlugunu guncelle)

## Calistirma
1. Sunucuyu baslat: `node server.js`
2. Tarayicida [index.html](index.html) dosyasini ac
3. Oyunda hareket/hasar/gather aksiyonu yap ve panel akisini izle

## Yardimci Komutlar
- `npm run check`: server.js syntax kontrolu
- `npm run update:catalog`: Event/operation katalogunu uzaktan guncelle ve loot-matrix isimlerini senkronla
- `npm start`: `node server.js` kisayolu

## Calisma Mantigi

### Event Flow
1. ao-network UDP paketlerini yakalar
2. Event mesajinda `params['252'] = eventCode` ve `params['253'] = operationCode` okunur
3. **Event 6 (HealthUpdate)**: 
   - Hasar parametresi cikarilir, oyuncu kimligi kilitlenir (ilk tetikleme)
   - Dealt (hucumlanan) ve Taken (alinan) hasarlar ayrilir
   - DPS hesaplanir (5s/10s/30s pencerleri)
4. **Event 61 (HarvestFinished)**: 
   - Oge ID (params['4']) ve miktar (params['5']) okunur
   - Item adi items.json'dan cozulur
   - Panele "Ganimet" olarak gonderilir
5. **Guvenli Loot Event'leri** (98-100, 387-389, 607-610):
   - Loot-matrix.json'dan filtrelenir
   - Guvenli event'ler siniflandirilir (container/chest/piled)
   - Kullanici sahipligi dogrulanir
6. **WebSocket**: Tum sonuclar canli panele JSON'la yayinlanir

### Filtreleme ve Dogrulama
- **Kullanici Sahipligi**: Event 6'nin ilk tetiklemesi ile player ID kilitlenir
- **Guvenli Event Seti**: Sadece loot-matrix.json'da tanimlı event'ler islenir
- **Source Etiketleri**: Her olay `source` alani tasir (gather/chest/piled/container/operation)
- **Confidence**: event/operation'in guvenlilik seviyesi

## Guncel Limitasyonlar

### Disable Edilen Özellikler (Hata Ayıklama ile Doğrulanan)

#### Event 62 (TakeSilver) - ❌ DEVRE DIŞI
- **Problem**: Oyunda 43 silver düşürüldüğünde sistem 162486 silveri rapor ediyor
- **Bulgu**: `params['5']` her zaman sistem silveri getirir, gerçek loot silveri değil
- **Çözüm**: Event 62 tamamen devre dışı bırakıldı
- **İleri Çalışma Gerekli**: Alternatif silver tracking event veya param alanı aranması

#### Event 82 (UpdateFame) - ❌ DEVRE DIŞI
- **Problem**: Fame bakiyesi azalarak gidiyor (5596800→4725600, delta=-871200)
- **Bulgu**: Combat Fame vs Normal Fame mekanizması karmaşık - oyuncu'nun silah uzmanlaştırması dolu olunca aranan fame'in %20'si combat fame'e çevrikliyor
- **Çözüm**: Event 82 tamamen devre dışı bırakıldı
- **İleri Çalışma Gerekli**: Combat fame olmayan event kaynağı veya doğru param alanı aranması

#### Event 26/27 (InventoryPutItem/InventoryDel) - ❌ KALDIRDI
- **Problem**: Diğer oyuncuların inventory değişikliklerini de tetikledikleri için ekonomi logu spam'layıyor
- **Çözüm**: loot-matrix.json'dan tamamen kaldırıldı
- **Sonuç**: Ekonomi paneli sadece harvest, chest ve piled events gösteriyor - temiz ve doğru

### Bilinen Sorunlar
- Silver tracking: Simdiki disable (dogru event veya param alani bulunmasi gerek)
- Fame tracking: Devre disi (combat/normal fame ayrimi veya baska event gerekiyor)
- Item spawn event'leri: Event 387-389'un tum param'lari tam haritaalanamadi

## Notlar
- Silver item ID: 48 (Event 61'de tespit edilebilir)
- Dump dosyalari yerelden kullanilabilior icin internet bagimlilidligi azaltilabilir
- Event/operation sozlukleri once yerel [data/event-catalog.json](data/event-catalog.json)'dan yuklenir
- Loot filtreleri runtime'da [data/loot-matrix.json](data/loot-matrix.json)'dan yuklenir
- Economy panelinde source bazli filtre (gather/chest/piled/container/inventory)
- Combat panelinde DPS penceresi (5s/10s/30s) ve hasar yonu filtresi (all/dealt/taken)

## Sorun Giderme
- **Paket gorulmuyorsa**: Npcap kurulumu ve yonetici yetkisi kontrol et
- **Panel veri almiyorsa**: WebSocket 8080 portu ve `[KIM] KIMLIK KIITLENDI` logunu kontrol et
- **Bilinmeyen item gorunuyorsa**: Items dump guncelligini kontrol et
- **Loot gorulmuyorsa**: Event 61 trigger ettigi kontrol et

## Yol Haritasi (TODO)
- Silver tracking: Event 62 alternatifi veya param haritaasi
- Fame tracking: Combat fame olmayan event veya dogru param alani
- Item spawn event'leri: Event 387-389 param haritaasi tamamnlamasi
- Local cache versiyon eme mekanizmasi
