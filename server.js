const AONetwork = require('ao-network');
const WebSocket = require('ws');
const https = require('https');
const fs = require('fs');
const path = require('path');

const wss = new WebSocket.Server({ port: 8080 });
let webClients = [];
wss.on('connection', (ws) => { webClients.push(ws); console.log("🟢 Web Panel Bağlandı!"); });

function webSitesineGonder(veri) {
    webClients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(veri)); });
}

let ITEM_LIST = {};
let EVENT_CODE_MAP = {};
let OPERATION_CODE_MAP = {};
let totalFame = 0;   // YENİ: Fame Sayacı
let totalSilver = 0; // YENİ: Silver Sayacı
let maxItemIndex = 0;

let GUVENLI_LOOT_EVENTLERI = new Set([26, 27, 61, 98, 99, 100, 274, 387, 388, 389, 607, 608, 609, 610]);

let EVENT_SOURCE_MAP = {
    61: "gather",
    26: "inventory",
    27: "inventory",
    98: "loot",
    99: "container",
    100: "container",
    274: "otherplayer",
    387: "chest",
    388: "chest",
    389: "chest",
    607: "piled",
    608: "piled",
    609: "piled",
    610: "piled"
};

const EVENT_CODE_URL = "https://raw.githubusercontent.com/Revalto/ao-network/main/data/events.js";
const OPERATION_CODE_URL = "https://raw.githubusercontent.com/Revalto/ao-network/main/data/operations.js";
const REMOTE_ITEMS_URL = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.json";
const LOCAL_ITEMS_PATH = path.join(__dirname, "ao-bin-dumps-master", "ao-bin-dumps-master", "formatted", "items.json");
const LOCAL_LOOT_MATRIX_PATH = path.join(__dirname, "data", "loot-matrix.json");
const LOCAL_EVENT_CATALOG_PATH = path.join(__dirname, "data", "event-catalog.json");

let GUVENLI_LOOT_OPERASYONLARI = new Set([46, 47, 91, 92, 244, 245, 246, 505, 506]);

const DPS_WINDOWS = {
    s5: 5000,
    s10: 10000,
    s30: 30000
};

let hasarGecmisi = {
    dealt: [],
    taken: []
};

function hasarEkle(tur, miktar) {
    if (!miktar || miktar <= 0) return;
    const ts = Date.now();
    hasarGecmisi[tur].push({ ts, miktar });

    const maxPencere = Math.max(...Object.values(DPS_WINDOWS));
    const altSinir = ts - maxPencere;
    hasarGecmisi.dealt = hasarGecmisi.dealt.filter(x => x.ts >= altSinir);
    hasarGecmisi.taken = hasarGecmisi.taken.filter(x => x.ts >= altSinir);
}

function dpsHesapla(tur, pencereMs) {
    const now = Date.now();
    const altSinir = now - pencereMs;
    const toplam = hasarGecmisi[tur]
        .filter(x => x.ts >= altSinir)
        .reduce((acc, x) => acc + x.miktar, 0);
    return Number((toplam / (pencereMs / 1000)).toFixed(2));
}

function dpsOzetiUret() {
    return {
        dealt: {
            s5: dpsHesapla("dealt", DPS_WINDOWS.s5),
            s10: dpsHesapla("dealt", DPS_WINDOWS.s10),
            s30: dpsHesapla("dealt", DPS_WINDOWS.s30)
        },
        taken: {
            s5: dpsHesapla("taken", DPS_WINDOWS.s5),
            s10: dpsHesapla("taken", DPS_WINDOWS.s10),
            s30: dpsHesapla("taken", DPS_WINDOWS.s30)
        }
    };
}

function lootMatrisiniYukle() {
    try {
        if (!fs.existsSync(LOCAL_LOOT_MATRIX_PATH)) {
            console.log("[⚠️] loot-matrix.json bulunamadı, varsayılan filtreler kullanılacak.");
            return;
        }

        const data = fs.readFileSync(LOCAL_LOOT_MATRIX_PATH, 'utf8');
        const matrix = JSON.parse(data);

        if (Array.isArray(matrix.events)) {
            const eventCodes = matrix.events
                .map(e => Number(e.code))
                .filter(code => !Number.isNaN(code));

            const sourceMap = {};
            matrix.events.forEach(e => {

                const code = Number(e.code);
                if (!Number.isNaN(code) && e.source) sourceMap[code] = e.source;
            });

            if (eventCodes.length > 0) {
                GUVENLI_LOOT_EVENTLERI = new Set(eventCodes);
            }
            EVENT_SOURCE_MAP = { ...EVENT_SOURCE_MAP, ...sourceMap };
        }

        if (Array.isArray(matrix.operations)) {
            const operationCodes = matrix.operations
                .map(o => Number(o.code))
                .filter(code => !Number.isNaN(code));

            if (operationCodes.length > 0) {
                GUVENLI_LOOT_OPERASYONLARI = new Set(operationCodes);
            }
        }

        console.log("[✅] Loot matrisi yüklendi: event/operation filtreleri güncellendi.");
    } catch (err) {
        console.log("[⚠️] loot-matrix.json parse edilemedi, varsayılan filtreler kullanılacak.");
    }
}

function localEventKataloguYukle() {
    try {
        if (!fs.existsSync(LOCAL_EVENT_CATALOG_PATH)) {
            console.log("[ℹ️] Yerel event kataloğu bulunamadı, uzaktan yüklenecek.");
            return;
        }

        const data = fs.readFileSync(LOCAL_EVENT_CATALOG_PATH, 'utf8');
        const catalog = JSON.parse(data);

        if (catalog.events && typeof catalog.events === 'object') {
            const eventMap = {};
            Object.keys(catalog.events).forEach(code => {
                eventMap[Number(code)] = catalog.events[code];
            });
            EVENT_CODE_MAP = eventMap;
        }

        if (catalog.operations && typeof catalog.operations === 'object') {
            const opMap = {};
            Object.keys(catalog.operations).forEach(code => {
                opMap[Number(code)] = catalog.operations[code];
            });
            OPERATION_CODE_MAP = opMap;
        }

        console.log(`[✅] Yerel event kataloğu yüklendi:q${Object.keys(EVENT_CODE_MAP).length} event, ${Object.keys(OPERATION_CODE_MAP).length} operation.`);
    } catch (err) {
        console.log("[⚠️] Yerel event kataloğu okunamadı, uzaktan yüklenecek.");
    }
}

function httpsGetText(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = "";
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode}: ${url}`));
                    return;
                }
                resolve(data);
            });
        }).on('error', reject);
    });
}

function jsMapOlustur(jsText) {
    const map = {};
    const regex = /^\s*([A-Za-z0-9_]+):\s*(\d+),?\s*$/gm;
    let match;

    while ((match = regex.exec(jsText)) !== null) {
        const ad = match[1];
        const code = Number(match[2]);
        if (!Number.isNaN(code)) {
            map[code] = ad;
        }
    }

    return map;
}

async function eventSozlugunuYukle() {
    try {
        const text = await httpsGetText(EVENT_CODE_URL);
        EVENT_CODE_MAP = jsMapOlustur(text);
        console.log(`[✅] Event sözlüğü yüklendi: ${Object.keys(EVENT_CODE_MAP).length} event.`);
    } catch (err) {
        if (Object.keys(EVENT_CODE_MAP).length === 0) {
            EVENT_CODE_MAP = {};
            console.log("[⚠️] Event sözlüğü yüklenemedi. UnknownEvent_<code> fallback kullanılacak.");
        } else {
            console.log("[⚠️] Event sözlüğü uzaktan yüklenemedi, yerel katalog kullanılmaya devam edecek.");
        }
    }
}

async function operationSozlugunuYukle() {
    try {
        const text = await httpsGetText(OPERATION_CODE_URL);
        OPERATION_CODE_MAP = jsMapOlustur(text);
        console.log(`[✅] Operation sözlüğü yüklendi: ${Object.keys(OPERATION_CODE_MAP).length} operation.`);
    } catch (err) {
        if (Object.keys(OPERATION_CODE_MAP).length === 0) {
            OPERATION_CODE_MAP = {};
            console.log("[⚠️] Operation sözlüğü yüklenemedi. UnknownOperation_<code> fallback kullanılacak.");
        } else {
            console.log("[⚠️] Operation sözlüğü uzaktan yüklenemedi, yerel katalog kullanılmaya devam edecek.");
        }
    }
}

function eventAdiBul(eventCode) {
    return EVENT_CODE_MAP[eventCode] || `UnknownEvent_${eventCode}`;
}

function operationAdiBul(operationCode) {
    return OPERATION_CODE_MAP[operationCode] || `UnknownOperation_${operationCode}`;
}

function itemListesiniDoldur(items) {
    items.forEach(item => {
        let name = item.UniqueName;
        if (item.LocalizedNames && item.LocalizedNames['TR-TR']) name = item.LocalizedNames['TR-TR'];
        else if (item.LocalizedNames && item.LocalizedNames['EN-US']) name = item.LocalizedNames['EN-US'];
        ITEM_LIST[item.Index] = name;
        const idx = Number(item.Index);
        if (!Number.isNaN(idx) && idx > maxItemIndex) maxItemIndex = idx;
    });
}

function veritabaniniIndir() {
    console.log("=====================================================");
    console.log("[⏳] Adım 1 & 2: Item isimleri yükleniyor...");

    try {
        if (fs.existsSync(LOCAL_ITEMS_PATH)) {
            const localData = fs.readFileSync(LOCAL_ITEMS_PATH, 'utf8');
            const localItems = JSON.parse(localData);
            itemListesiniDoldur(localItems);
            console.log(`[✅] YEREL BAŞARILI: ${Object.keys(ITEM_LIST).length} eşya yüklendi.`);
            console.log("[🚀] ADIM 3: FAME VE SILVER SİSTEMİ AKTİF!");
            console.log("=====================================================");
            return;
        }
    } catch (err) {
        console.log("[⚠️] Yerel items.json okunamadı, uzaktan denenecek.");
    }

    https.get(REMOTE_ITEMS_URL, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
            try {
                const items = JSON.parse(data);
                itemListesiniDoldur(items);
                console.log(`[✅] UZAK BAŞARILI: ${Object.keys(ITEM_LIST).length} eşya yüklendi.`);
                console.log("[🚀] ADIM 3: FAME VE SILVER SİSTEMİ AKTİF!");
                console.log("=====================================================");
            } catch (err) {
                console.log("[❌] items.json parse hatası, item çözümleme devre dışı kalabilir.");
            }
        });
    }).on('error', () => {
        console.log("[❌] Uzak items.json indirilemedi, item çözümleme devre dışı kalabilir.");
    });
}

function sayisalDegerleriTopla(obj, out = []) {
    if (obj === null || obj === undefined) return out;

    if (typeof obj === 'number') {
        out.push(obj);
        return out;
    }

    if (Array.isArray(obj)) {
        obj.forEach(v => sayisalDegerleriTopla(v, out));
        return out;
    }

    if (typeof obj === 'object') {
        Object.values(obj).forEach(v => sayisalDegerleriTopla(v, out));
    }

    return out;
}

function lootOzetiUret(params) {
    const numbers = sayisalDegerleriTopla(params, []);
    const bulunanItemlar = [];
    const itemSet = new Set();

    numbers.forEach(value => {
        const key = String(value);
        // Oyuncu/entity id'leri genelde çok büyük olduğu için item üst sınırıyla filtreliyoruz.
        if (ITEM_LIST[key] && value > 0 && (maxItemIndex === 0 || value <= maxItemIndex) && !itemSet.has(key)) {
            itemSet.add(key);
            bulunanItemlar.push({ id: key, ad: ITEM_LIST[key], miktar: 1 });
        }
    });

    return bulunanItemlar;
}

function lootDetayiOlustur(eventCode, params) {
    // Event 61 parametreleri net: 4=itemId, 5=miktar
    if (eventCode === 61) {
        const itemId = String(params['4'] || '');
        const miktar = Number(params['5'] || 1);
        if (ITEM_LIST[itemId]) {
            return [{ id: itemId, ad: ITEM_LIST[itemId], miktar: Number.isNaN(miktar) ? 1 : miktar }];
        }
    }

    return lootOzetiUret(params);
}

const aoNet = new AONetwork();
let myPlayerId = null;

veritabaniniIndir();
localEventKataloguYukle();
eventSozlugunuYukle();
operationSozlugunuYukle();
lootMatrisiniYukle();

aoNet.events.on(aoNet.AODecoder.messageType.Event, (context) => {
    let params = context.parameters;
    if (!params) return;
    let eventCode = params['252'];
    if (!eventCode) return;
    const eventName = eventAdiBul(eventCode);

    // --- ⚔️ ADIM 1: SAVAŞ ---
    if (eventCode === 6) {
        let hasarMiktari = 0, targetId = params['0'], attackerId = params['6']; 
        for (let key in params) {
            if (typeof params[key] === 'number' && params[key] < 0) hasarMiktari = Math.abs(params[key]);
        }
        if (hasarMiktari > 0) {
            if (myPlayerId === null && attackerId) {
                myPlayerId = attackerId;
                console.log(`\n[👑] KİMLİK KİLİTLENDİ: ${myPlayerId}\n`);
            }
            if (myPlayerId !== null) {
                let values = Object.values(params);
                if (!values.includes(myPlayerId)) return;
                let islem = (targetId === myPlayerId) ? "🩸 Hasar Aldın" : "🗡️ Hasar Vurdun";
                let detay = (targetId === myPlayerId) ? `Sana: ${hasarMiktari} HP` : `Senin: ${hasarMiktari} HP`;
                const combatType = (targetId === myPlayerId) ? "taken" : "dealt";
                hasarEkle(combatType, hasarMiktari);
                const dps = dpsOzetiUret();
                webSitesineGonder({
                    tur: "Savas",
                    islem,
                    detay,
                    eventCode,
                    eventName,
                    combatType,
                    dps,
                    confidence: "high",
                    zaman: new Date().toLocaleTimeString()
                });
            }
        }
    }

    // --- 📦 ADIM 2 & 3: ECONOMY LOG VE SILVER ---
    else if (eventCode === 61 && myPlayerId !== null) {
        if (params['0'] === myPlayerId) {
            let miktar = params['5'] || 1;
            let esyaId = String(params['4']); 

            // YENİ: Gümüş (Silver) Kontrolü
            if (esyaId === "48") {
                totalSilver += miktar;
                console.log(`[💰] Silver Kazanıldı: +${miktar} (Toplam: ${totalSilver})`);
                webSitesineGonder({ 
                    tur: "Ekonomi", 
                    islem: "💰 Silver", 
                    detay: `+${miktar} Silver`, 
                    eventCode,
                    eventName,
                    source: "gather",
                    confidence: "high",
                    totalSilver: totalSilver, // Sayacı güncellemesi için
                    zaman: new Date().toLocaleTimeString() 
                });
            } 
            // Normal Ganimet (Kütük, Maden vs.)
            else if (esyaId) {
                let esyaAdi = ITEM_LIST[esyaId] || `Bilinmeyen Eşya (ID: ${esyaId})`;
                webSitesineGonder({
                    tur: "Ekonomi",
                    islem: "📦 Ganimet",
                    detay: `${esyaAdi} x${miktar}`,
                    eventCode,
                    eventName,
                    source: "gather",
                    confidence: "high",
                    zaman: new Date().toLocaleTimeString()
                });
            }
        }
    }

    // --- 🎯 YENİ: YÜKSEK KESİNLİK LOOT EVENT SINIFLANDIRMASI ---
    else if (myPlayerId !== null && GUVENLI_LOOT_EVENTLERI.has(eventCode)) {
        const values = Object.values(params);
        const benBuOlaydaVarim = values.includes(myPlayerId) || params['0'] === myPlayerId || params['6'] === myPlayerId;
        if (!benBuOlaydaVarim) return;

        const bulunanItemlar = lootDetayiOlustur(eventCode, params);
        const source = EVENT_SOURCE_MAP[eventCode] || "loot";

        if (bulunanItemlar.length > 0) {
            const detay = bulunanItemlar
                .slice(0, 6)
                .map(x => `${x.ad} x${x.miktar || 1} (ID: ${x.id})`)
                .join(", ");
            webSitesineGonder({
                tur: "Ekonomi",
                islem: "🎒 Loot Event",
                detay,
                eventCode,
                eventName,
                source,
                confidence: "high",
                zaman: new Date().toLocaleTimeString()
            });
        } else {
            webSitesineGonder({
                tur: "Ekonomi",
                islem: "🎒 Loot Olayı",
                detay: `${eventName} (ID çözümlenemedi)`,
                eventCode,
                eventName,
                source,
                confidence: "high",
                zaman: new Date().toLocaleTimeString()
            });
        }
    }


});

function lootOperasyonuIsle(context, tur) {
    const params = context.parameters || {};
    const operationCode = params['253'];
    if (!operationCode || !GUVENLI_LOOT_OPERASYONLARI.has(operationCode)) return;

    const operationName = operationAdiBul(operationCode);
    const bulunanItemlar = lootOzetiUret(params);
    const detay = bulunanItemlar.length > 0
        ? bulunanItemlar.slice(0, 6).map(x => `${x.ad} x${x.miktar || 1} (ID: ${x.id})`).join(", ")
        : `${operationName} algılandı`;

    webSitesineGonder({
        tur: "Ekonomi",
        islem: tur === "request" ? "🧭 Loot OperationRequest" : "🧭 Loot OperationResponse",
        detay,
        operationCode,
        operationName,
        source: "operation",
        confidence: "high",
        zaman: new Date().toLocaleTimeString()
    });
}

// DISABLED: Operation handlers - sadece events'e bağlı kalıyoruz
/*
aoNet.events.on(aoNet.AODecoder.messageType.OperationRequest, (context) => {
    lootOperasyonuIsle(context, "request");
});

aoNet.events.on(aoNet.AODecoder.messageType.OperationResponse, (context) => {
    lootOperasyonuIsle(context, "response");
});
*/