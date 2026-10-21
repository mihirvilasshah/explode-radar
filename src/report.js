import { UNIVERSE, CATEGORIES, PULSE } from './universe.js';
import { fetchYahoo, fetchMutualFund, fetchCoinGecko, fetchFearGreed } from './sources.js';
import { analyze } from './analysis.js';
import { pctReturn } from './indicators.js';

const CACHE_TTL = 30 * 60 * 1000;
const MIN_REFRESH_GAP = 2 * 60 * 1000;

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { ok: true, value: await fn(items[i]) };
      } catch (e) {
        results[i] = { ok: false, error: e.message };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function buildReport() {
  const t0 = Date.now();
  const yahooSymbols = [...new Set([
    ...UNIVERSE.filter((a) => !a.mfCode).map((a) => a.symbol),
    ...Object.values(CATEGORIES).map((c) => c.benchmark),
    ...PULSE.map((p) => p.symbol),
  ])];
  const funds = UNIVERSE.filter((a) => a.mfCode);
  const geckoIds = UNIVERSE.filter((a) => a.geckoId).map((a) => a.geckoId);

  const [yahooRes, mfRes, gecko, fearGreed] = await Promise.all([
    mapLimit(yahooSymbols, 6, (s) => fetchYahoo(s)),
    mapLimit(funds, 4, (f) => fetchMutualFund(f.mfCode)),
    fetchCoinGecko(geckoIds),
    fetchFearGreed(),
  ]);

  const series = new Map();
  const errors = [];
  yahooSymbols.forEach((s, i) => (yahooRes[i].ok ? series.set(s, yahooRes[i].value) : errors.push(`${s}: ${yahooRes[i].error}`)));

  const barsPerMonth = (s) => (s.endsWith('-USD') ? 30 : 21);
  const benchmarks = {};
  for (const { benchmark } of Object.values(CATEGORIES)) {
    const d = series.get(benchmark);
    if (d) benchmarks[benchmark] = { m3: pctReturn(d.close, barsPerMonth(benchmark) * 3) };
  }

  const ctx = { benchmarks, gecko };
  const assets = [];
  for (const asset of UNIVERSE) {
    let data;
    if (asset.mfCode) {
      const r = mfRes[funds.indexOf(asset)];
      if (!r.ok) { errors.push(`${asset.name}: ${r.error}`); continue; }
      data = r.value;
    } else {
      data = series.get(asset.symbol);
      if (!data) continue;
    }
    try {
      assets.push(analyze(asset, data, ctx));
    } catch (e) {
      errors.push(`${asset.symbol}: analysis failed (${e.message})`);
    }
  }
  assets.sort((a, b) => b.score - a.score);

  const pulse = PULSE.map((p) => {
    const d = series.get(p.symbol);
    if (!d) return null;
    return {
      label: p.label,
      price: d.close[d.close.length - 1],
      currency: d.currency,
      d1: pctReturn(d.close, 1),
      m1: pctReturn(d.close, barsPerMonth(p.symbol)),
    };
  }).filter(Boolean);

  console.log(`[report] ${assets.length} assets analysed in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${errors.length} errors`);
  if (errors.length) console.warn(errors.join('\n'));
  if (!assets.length) throw new Error('No market data could be fetched');

  return {
    generatedAt: Date.now(),
    categories: Object.fromEntries(Object.entries(CATEGORIES).map(([k, v]) => [k, v.label])),
    pulse,
    fearGreed,
    assets,
    errors,
  };
}

const cache = { data: null, ts: 0, pending: null };

export function getReport(force = false) {
  const age = Date.now() - cache.ts;
  if (cache.data && (age < CACHE_TTL && !force || age < MIN_REFRESH_GAP)) return Promise.resolve(cache.data);
  if (!cache.pending) {
    cache.pending = buildReport()
      .then((data) => {
        cache.data = data;
        cache.ts = Date.now();
        return data;
      })
      .finally(() => { cache.pending = null; });
  }
  // Serve stale data while refreshing in the background
  return cache.data && !force ? Promise.resolve(cache.data) : cache.pending;
}
