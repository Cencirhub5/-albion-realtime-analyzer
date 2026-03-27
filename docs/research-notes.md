## Albion Research Notebook (27 Mart 2026)

### 1) Incelenen Proje Dosyalari
- [server.js](server.js): ao-network Event dinleme, event 6 (hasar), event 61 (gather/silver), WebSocket yayin.
- [index.html](index.html): canli panel, combat/economy log, silver/fame sayac alanlari.
- [package.json](package.json): bagimliliklar (ao-network, ws, cap, photon-packet-parser).
- [data/loot-matrix.json](data/loot-matrix.json): loot event/operation filtre matrisi.
- [ao-bin-dumps-master/ao-bin-dumps-master/formatted/items.json](ao-bin-dumps-master/ao-bin-dumps-master/formatted/items.json): item Index -> isim cozumleme.
- [ao-bin-dumps-master/ao-bin-dumps-master/lootchests.json](ao-bin-dumps-master/ao-bin-dumps-master/lootchests.json): chest/container tanimlari, RareState/LootListReference.
- [ao-bin-dumps-master/ao-bin-dumps-master/loot.json](ao-bin-dumps-master/ao-bin-dumps-master/loot.json): loot pool ve zincir referanslari.

### 2) Web Kaynaklari ve Bulunan Konular

1. Kaynak: https://github.com/Revalto/ao-network
- Bulunan konu: ao-network kutuphanesinin event odakli packet yakalama akisi.
- Not: README icinde Event, OperationRequest, OperationResponse dinleme ornekleri mevcut.
- Guven: Yuksek.

2. Kaynak: https://raw.githubusercontent.com/Revalto/ao-network/main/data/events.js
- Bulunan konu: event code -> event adi eslemesi (600+ event).
- Kritik loot iliskili eventler: 61 HarvestFinished, 26 InventoryPutItem, 27 InventoryDeleteItem, 98 NewLoot, 99 AttachItemContainer, 100 DetachItemContainer, 274 OtherGrabbedLoot, 387 NewLootChest, 388 UpdateLootChest, 389 LootChestOpened, 607-610 PickupFromPiledObject*.
- Guven: Yuksek.

3. Kaynak: https://raw.githubusercontent.com/Revalto/ao-network/main/data/operations.js
- Bulunan konu: operation code eslemesi ve container/chest operasyonlari (ContainerOpen, UseLootChest vb.).
- Guven: Yuksek.

4. Kaynak: https://www.npmjs.com/package/ao-network
- Bulunan konu: kurulum onkosullari (Windows icin Npcap), temel kullanim ornekleri.
- Guven: Yuksek.

5. Kaynak: https://github.com/ao-data/ao-bin-dumps
- Bulunan konu: guncel static dump deposu, lootchests.json/loot.json/items.json varligi ve guncellik.
- Guven: Yuksek.

6. Kaynak: https://github.com/ao-data/ao-bin-dumps/blob/master/loot.json
- Bulunan konu: loot listeleri, LootListReference zincirleri, item type dagilimi.
- Guven: Yuksek.

### 3) Dogrulanan Teknik Notlar
- Event kodu context.parameters['252'] alaninda geliyor.
- event 6 ile player kimligi kilitlenmesi mevcut akista calisiyor.
- event 61 ile itemId context.parameters['4'], quantity context.parameters['5'].
- Silver ozel durumu itemId 48 olarak ele aliniyor.
- test.js icinde lootchest endpoint adi formatted/lootchest.json olarak geciyor; bu isim/konum riski var, yerelde kok dump dosyasinda lootchests.json bulunuyor.

### 4) Acik Riskler
- SPAM_KODLARI statik ve eksik kalabilir.
- yanlis container eslesmesi false-positive loot uretebilir.
- dump sema degisiminde parser adaptasyonu gerekebilir.

### 5) Sonraki Uygulama Icin Net Kararlar
- Event sozlugu kapsami: tum event kodlari (tam sozluk).
- Loot algilama modu: yuksek kesinlik.
- Mevcut combat + gather davranisi korunacak, loot genislemesi kademeli acilacak.

### 6) Durum Guncellemesi
- test.js kaldirildi, ana akis tek dosya olarak [server.js](server.js) uzerinden ilerliyor.
- UI tarafinda economy source filtresi eklendi.
- Loot event/operation seti [data/loot-matrix.json](data/loot-matrix.json) ile yonetiliyor.
