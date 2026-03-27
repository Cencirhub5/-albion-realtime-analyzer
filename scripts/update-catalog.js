const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const EVENT_CATALOG_PATH = path.join(DATA_DIR, 'event-catalog.json');
const LOOT_MATRIX_PATH = path.join(DATA_DIR, 'loot-matrix.json');

const EVENTS_URL = 'https://raw.githubusercontent.com/Revalto/ao-network/main/data/events.js';
const OPERATIONS_URL = 'https://raw.githubusercontent.com/Revalto/ao-network/main/data/operations.js';

function httpsGetText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${url}`));
            return;
          }
          resolve(data);
        });
      })
      .on('error', reject);
  });
}

function parseJsCodeMap(text) {
  const map = {};
  const regex = /^\s*([A-Za-z0-9_]+):\s*(\d+),?\s*$/gm;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const name = match[1];
    const code = Number(match[2]);
    if (!Number.isNaN(code)) {
      map[String(code)] = name;
    }
  }

  return map;
}

function updateLootMatrixNames(eventsMap, operationsMap) {
  if (!fs.existsSync(LOOT_MATRIX_PATH)) return false;

  const matrix = JSON.parse(fs.readFileSync(LOOT_MATRIX_PATH, 'utf8'));
  let changed = false;

  if (Array.isArray(matrix.events)) {
    matrix.events.forEach((entry) => {
      const key = String(entry.code);
      if (eventsMap[key] && entry.name !== eventsMap[key]) {
        entry.name = eventsMap[key];
        changed = true;
      }
    });
  }

  if (Array.isArray(matrix.operations)) {
    matrix.operations.forEach((entry) => {
      const key = String(entry.code);
      if (operationsMap[key] && entry.name !== operationsMap[key]) {
        entry.name = operationsMap[key];
        changed = true;
      }
    });
  }

  if (changed) {
    fs.writeFileSync(LOOT_MATRIX_PATH, `${JSON.stringify(matrix, null, 2)}\n`, 'utf8');
  }

  return changed;
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const [eventsText, operationsText] = await Promise.all([
    httpsGetText(EVENTS_URL),
    httpsGetText(OPERATIONS_URL)
  ]);

  const events = parseJsCodeMap(eventsText);
  const operations = parseJsCodeMap(operationsText);

  const catalog = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: {
        events: EVENTS_URL,
        operations: OPERATIONS_URL
      },
      counts: {
        events: Object.keys(events).length,
        operations: Object.keys(operations).length
      }
    },
    events,
    operations
  };

  fs.writeFileSync(EVENT_CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  const matrixUpdated = updateLootMatrixNames(events, operations);

  console.log(`[ok] event-catalog.json updated (${catalog.meta.counts.events} events, ${catalog.meta.counts.operations} operations)`);
  console.log(`[ok] loot-matrix.json sync: ${matrixUpdated ? 'updated' : 'no changes'}`);
}

main().catch((err) => {
  console.error('[error] catalog update failed:', err.message);
  process.exit(1);
});
