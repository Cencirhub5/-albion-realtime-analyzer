# Albion Realtime Analyzer

Albion Online ag trafigini gercek zamanli dinleyip olaylari web panelinde gosteren Node.js tabanli analiz aracidir.

## Ozellikler
- Gercek zamanli paket dinleme (ao-network)
- Event 6 ile alinan/verilen hasar takibi
- Gercek zamanli DPS metre (5s/10s/30s)
- Combat filtreleri (all/dealt/taken)
- Event 61 ile gather ve silver takibi
- Event ve operation code sozlugu (otomatik yukleme + fallback)
- Yuksek kesinlik loot event/operation siniflandirmasi
- WebSocket ile canli panel yayini
- Item id cozumleme (ao-bin-dumps formatted/items.json)

## Proje Yapisi
- [server.js](server.js): ana dinleyici ve yayinlayici
- [index.html](index.html): canli panel arayuzu
- [package.json](package.json): bagimliliklar
- [data/loot-matrix.json](data/loot-matrix.json): loot event/operation matrisi ve source/confidence etiketleri
- [ao-bin-dumps-master/ao-bin-dumps-master/formatted/items.json](ao-bin-dumps-master/ao-bin-dumps-master/formatted/items.json): item referanslari
- [ao-bin-dumps-master/ao-bin-dumps-master/lootchests.json](ao-bin-dumps-master/ao-bin-dumps-master/lootchests.json): chest/container verisi
- [ao-bin-dumps-master/ao-bin-dumps-master/loot.json](ao-bin-dumps-master/ao-bin-dumps-master/loot.json): loot havuzlari

## Gereksinimler
- Node.js 14+
- Windows icin Npcap (WinPcap uyumlu)
- Albion Online istemcisi calisir durumda

## Kurulum
1. Proje klasorune gec.
2. Bagimliliklari yukle: `npm install`
3. Gerekirse Npcap kurulu oldugunu dogrula.
4. Event/operation katalogu olustur: `npm run update:catalog`

## Calistirma
1. Sunucuyu baslat: `node server.js`
2. Tarayicida [index.html](index.html) dosyasini ac.
3. Oyunda hareket/hasar/gather aksiyonu uret ve panel akisni izle.

## Yardimci Komutlar
- `npm run check`: server.js syntax kontrolu
- `npm run update:catalog`: event/operation katalogunu gunceller ve loot matrix isimlerini senkronlar

## Calisma Mantigi
1. ao-network UDP paketlerini yakalar.
2. Event mesajlarinda `context.parameters['252']` ile event code okunur.
3. Operation mesajlarinda `context.parameters['253']` ile operation code okunur.
4. Event 6: hasar olayi cozulur, oyuncu kimligi kilitlenir.
5. Event 61: item ve miktar cozulur, item adi dump tabanindan bulunur.
6. Loot ile iliskili guvenli event/operation kodlari siniflandirilir.
7. Sonuclar WebSocket ile panele yayinlanir.

## Notlar
- Silver item id: 48.
- Dump dosyalari yerelden kullanilabildigi icin internet bagimliligi azaltilabilir.
- Event ve operation sozlukleri once yerel [data/event-catalog.json](data/event-catalog.json) dosyasindan yuklenir, sonra uzaktan guncellenmeye calisilir.
- Event ve operation filtreleri runtime'da [data/loot-matrix.json](data/loot-matrix.json) dosyasindan yuklenir.
- Economy panelinde source bazli filtre secimi bulunur (gather/chest/piled/operation vb.).
- Combat panelinde DPS penceresi ve hasar yonu filtresi bulunur.

## Sorun Giderme
- Paket gorulmuyorsa: Npcap kurulumu ve yonetici yetkisi kontrol et.
- Panel veri almiyorsa: WebSocket 8080 portu ve sunucu loglarini kontrol et.
- Bilinmeyen item gorunuyorsa: items dump guncelligini kontrol et.

## Yol Haritasi
- Tum event kodlari icin aciklama sozlugu entegrasyonu
- Loot/chest/piled-object event siniflandirma genisletmesi
- Yerel cache + surum dogrulama mekanizmasi
