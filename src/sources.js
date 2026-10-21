// Free data sources: Yahoo Finance (chart API), mfapi.in (AMFI NAVs), CoinGecko, Alternative.me.

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/json',
};

async function getJson(url, timeoutMs = 12000) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

const YAHOO_HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

export async function fetchYahoo(symbol, range = '2y') {
  let lastErr;
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false`;
      const json = await getJson(url);
      const r = json?.chart?.result?.[0];
      if (!r?.timestamp) throw new Error(`No data for ${symbol}`);
      const q = r.indicators.quote[0];
      const out = { dates: [], open: [], high: [], low: [], close: [], volume: [] };
      r.timestamp.forEach((t, i) => {
        if (q.close[i] == null) return;
        out.dates.push(t * 1000);
        out.open.push(q.open[i] ?? q.close[i]);
        out.high.push(q.high[i] ?? q.close[i]);
        out.low.push(q.low[i] ?? q.close[i]);
        out.close.push(q.close[i]);
        out.volume.push(q.volume?.[i] ?? 0);
      });
      if (out.close.length < 60) throw new Error(`Insufficient history for ${symbol}`);
      let currency = r.meta.currency || 'USD';
      // Grain futures are quoted in US cents
      if (currency === 'USX') {
        for (const k of ['open', 'high', 'low', 'close']) out[k] = out[k].map((v) => v / 100);
        currency = 'USD';
      }
      return {
        ...out,
        currency,
        exchange: r.meta.fullExchangeName || r.meta.exchangeName,
        longName: r.meta.longName || r.meta.shortName,
        hasVolume: out.volume.some((v) => v > 0),
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export async function fetchMutualFund(code) {
  const json = await getJson(`https://api.mfapi.in/mf/${encodeURIComponent(code)}`);
  const rows = (json.data || []).slice(0, 1100).reverse();
  const dates = [];
  const close = [];
  for (const row of rows) {
    const [d, m, y] = row.date.split('-').map(Number);
    const nav = parseFloat(row.nav);
    if (!Number.isFinite(nav) || nav <= 0) continue;
    dates.push(Date.UTC(y, m - 1, d));
    close.push(nav);
  }
  if (close.length < 60) throw new Error(`Insufficient NAV history for scheme ${code}`);
  return {
    dates,
    close,
    open: close,
    high: close,
    low: close,
    volume: close.map(() => 0),
    hasVolume: false,
    currency: 'INR',
    exchange: json.meta?.fund_house || 'AMFI',
    longName: json.meta?.scheme_name,
    schemeCode: code,
    schemeCategory: json.meta?.scheme_category,
  };
}

export async function fetchCoinGecko(ids) {
  const out = { markets: {}, trending: new Set() };
  try {
    const markets = await getJson(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.join(',')}&price_change_percentage=7d,30d`
    );
    for (const m of markets) {
      out.markets[m.id] = {
        marketCap: m.market_cap,
        rank: m.market_cap_rank,
        image: m.image,
        ath: m.ath,
        athChangePct: m.ath_change_percentage,
      };
    }
  } catch (e) {
    console.warn('[coingecko markets]', e.message);
  }
  try {
    const trending = await getJson('https://api.coingecko.com/api/v3/search/trending');
    for (const c of trending.coins || []) out.trending.add(c.item.id);
  } catch (e) {
    console.warn('[coingecko trending]', e.message);
  }
  return out;
}

export async function fetchFearGreed() {
  try {
    const json = await getJson('https://api.alternative.me/fng/');
    const d = json.data?.[0];
    return d ? { value: Number(d.value), label: d.value_classification } : null;
  } catch (e) {
    console.warn('[fear&greed]', e.message);
    return null;
  }
}
