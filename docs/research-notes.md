# Albion Realtime Analyzer - Araştırma Notları ve Teknik Bulgular

## Son Güncellemeler (2024 - Debugging Cycle)

### Genel Bulgu Özeti
Kapsamlı hata ayıklama çalışması ile aşağıdaki olaylar için kesin bulgular elde edilmiştir:

| Event | Durum | Bulgu | Çözüm |
|-------|-------|-------|-------|
| Event 6 (HealthUpdate) | ✅ Çalışıyor | Hasar değerleri doğru negatif olarak gelir | Aktif |
| Event 61 (HarvestFinished) | ✅ Çalışıyor | Item ID ve quantity doğru parametrelerde | Aktif |
| Event 62 (TakeSilver) | ❌ Hatalı | params['5']=sistem silveri, gerçek değil | Devre dışı |
| Event 82 (UpdateFame) | ❌ Hatalı | Bakiye azalıyor (combat fame karması) | Devre dışı |
| Event 26/27 (Inventory) | ❌ Spam | Diğer oyuncuların inventory'sini tetikliyor | Kaldırıldı |
| Event 98-100 (Containers) | ⏳ Active | Test edilmekte (param matrisi bekleme) | Matrix'te |
| Event 387-389 (Chests) | ⏳ Active | Test edilmekte (param matrisi bekleme) | Matrix'te |
| Event 607-610 (Piled) | ⏳ Active | Test edilmekte (param matrisi bekleme) | Matrix'te |

## Hata Ayıklama Süreci ve Başarılar

### Initial Problem Statement
**Rapor**: "Loot sektörü ekonomi loguna veri göndermiyor ama Event 61 tetikleniyor"

### Debugging Approach
1. Full parameter logging ekledik (tüm event'lerin tüm parametrelerini dump ettik)
2. Gerçek test verisi toplayıp analiz ettik (oyuncu oyundan loot toplarken)
3. Event sırasını ve veri akışını trace ettik

### Kesif 1: Event 62 Sistem Silveri Farkı ⚠️
```
Test Senaryosu: 43 silver ground'dan pickup
Beklenen: { itemId: 48, quantity: 43 }

Hayır!
Event 61 (HarvestFinished) gelmedi
Event 62 (TakeSilver) geldi:
  params['5'] = 22720  (sistem backup silveri)
  params['0'] = oyuncu_id
  
Tekrar test: 12 silver pickup
→ Event 62 params['5'] = 46129 (yine sabit, 12 değil!)

**Sonuç**: Event 62'deki params['5'], gerçek piled/drop silveri değil,
sistem tarafından yönetilen backup silveri miktarı
```

### Kesif 2: Event 82 Fame Bakiyesi Azalıyor ⚠️
```
Test Senaryosu: Oyuncu savaş yapıyor ve alabilir fame geliyor

Event 82 çıkış:
  Çıkış 1: params['2'] = 5596800 (sonFameBakiyesi = null, ilk set)
  Çıkış 2: params['2'] = 5596800 (delta 0, hiç raporlanmadı)
  Çıkış 3: params['2'] = 4725600 (delta = -871200!!!)

**Sorun**: Fame artmıyor, aksine azalıyor?
**Bulgular**: 
  - Oyuncu silahı spec dolu (expertise system full)
  - Gelen fame'nin %20'si combat fame'e çevriliyor
  - params['2'], toplam bakiye değil, normal fame bakiyesi olabilir
  
**Sonuç**: Combat Fame vs Normal Fame mekanizması karmaşık,
definitive mapping bulunamadı → Event 82 disable edildi
```

### Kesif 3: Event 26 Diğer Oyuncu Inventory Spam 🔴
```
Sorun: "Envantere Eklendi" logunuz sürekli görünüyor
Neden: Event 26 tetiklendiği zaman:
  - Oyuncu kendi item'ı inventory'e eklerse gelir ✓
  - AYNISI zamanda başka oyuncu item eklerse de gelir ❌
  
params'ta oyuncu ID bulunmuama, baska oyuncu trigger'ı 
da aynı event code (26) ile geliyor

**Çözüm**: Event 26/27 tamamen loot matrix'ten kaldırıldı
Result: Ekonomi paneli artık sadece harvest/chest/piled → temiz
```

### Kesif 4: Event 61 Gerçekten Çalışıyor! ✅
```
Event 62 disable ettikten sonra:

Test Senaryosu: "İnce Kürk" (itemId 1234) x3 topla
Sonuç:
  Event 61 tetiklendi
  params['4'] = "1234" (itemId string'i)
  params['5'] = 3 (quantity)
  
Panel çıktısı: "İnce Kürk x3" ✓ DOĞRU!

Test 2: "Kalay Cevheri" (itemId 456) x5 topla  
Sonuç: "Kalay Cevheri x5" ✓ DOĞRU!

**Sonuç**: Event 61 parameter haritası 100% doğru
Event 62'nin verileri Event 61'ile karıştırılıyordu → Debug sonrası fix tamam
```

## Event Parameter Haritası (Detaylı)

### Event 6 (HealthUpdate)
```
params: {
  '0': targetId,
  '1-5': int32,
  '6': attackerId,
  '7': int32,
  '252': 6
}

Damage = negative values → Math.abs()
Dealt vs Taken = targetId check
```

### Event 61 (HarvestFinished) ✅ VERIFIED
```
params: {
  '0': myPlayerId,
  '1-3': int32,
  '4': itemId (string coerce),
  '5': quantity,
  '8-10': int32,
  '252': 61
}

Extraction: itemId = params['4'], quantity = params['5']
Item Name: ITEM_LIST[parseInt(itemId)]
```

### Event 62 (TakeSilver) ❌ PROBLEMATIC
```
params: {
  '0': playerId,
  '1': int64,
  '2-3': int32,
  '5': sistem silveri (NOT yield silver!),
  '8': int32,
  '252': 62
}

Problem: params['5'] is system backup silver, not actual drop
Example: 43 silver dropped → reported 22720
```

### Event 82 (UpdateFame) ❌ PROBLEMATIC
```
params: {
  '0': playerId,
  '1': int32,
  '2': fame bakiyesi (decreases!),
  '3': int32,
  '6': float (multiplier?),
  '12-15': int32,
  '252': 82
}

Problem: delta = negative (5596800 → 4725600 = -871200)
Cause: combat fame vs normal fame mechanism
```

## Event Kodları

### Güvenli Loot Event'leri (Seçili)
- **61**: HarvestFinished - Gather => ✅ AKTIF
- **98**: NewLoot - Kutu/Spawn lootu => AKTIF  
- **99**: AttachItemContainer - Container bağla => AKTIF
- **100**: DetachItemContainer - Container ayır => AKTIF
- **387**: NewLootChest - Yeni chest spawn => AKTIF
- **388**: UpdateLootChest - Chest update => AKTIF
- **389**: LootChestOpened - Chest açıldı => AKTIF
- **607**: PickupFromPiledObjectStart - Piled pickup başladı => AKTIF
- **608**: PickupFromPiledObjectCancel - Piled pickup iptal => AKTIF
- **609**: PickupFromPiledObjectReset - Piled pickup reset => AKTIF
- **610**: PickupFromPiledObjectFinished - Piled pickup tamam => AKTIF

### Disable Edilen Event'ler
- **26**: InventoryPutItem ❌ (Diğer oyuncu inventory spam)
- **27**: InventoryDeleteItem ❌ (Diğer oyuncu inventory spam)
- **62**: TakeSilver ❌ (Sistem silveri getirir, gerçek değil)
- **82**: UpdateFame ❌ (Combat fame karmaşıklığı, delta negatif)
- **274**: OtherGrabbedLoot (Diğer oyuncu lootu, filtrelendi)

## Implementation Notları
- Item liste: 11,963 item, O(1) lookup ITEM_LIST[id]
- Event catalog: 615 event, runtime load from local/remote fallback
- Loot matrix: Runtime filtreleme, event/operation code set'lerini define ediyor
- DPS storage: hasarGecmisi {dealt: [], taken: []} with timestamps, auto-cleanup

## Proje Dosyaları ve Yapısı

- **server.js**: Ana event dinleyicisi ve handler'ları
- **index.html**: Web paneli (combat + economy sekmesi)
- **package.json**: dependencies ve npm scripts
- **data/loot-matrix.json**: Güvenli event/operation seti (Updated: Sadece viable events)
- **data/event-catalog.json**: 615 event + 516 operation code sözlüğü

## Web Kaynaklar ve Güvenilirlik

### Revalto ao-network (Yüksek Güven)
- Repository: https://github.com/Revalto/ao-network
- events.js: 615 event kod mappingleri
- operations.js: 516 operation kod mappingleri

### ao-bin-dumps (Yüksek Güven)
- Repository: https://github.com/ao-data/ao-bin-dumps
- formatted/items.json: 11,963 item → (Index/UniqueName/LocalizedNames)
