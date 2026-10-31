// Free news sources (no API keys): Yahoo Finance ticker RSS, Google News RSS search,
// Economic Times markets RSS and CoinDesk RSS. Impact is a transparent keyword-based estimate.
import { UNIVERSE } from './universe.js';

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  Accept: 'application/rss+xml, application/xml, text/xml, */*',
};

const CACHE_TTL = 15 * 60 * 1000;
const ASSET_MAX_AGE = 10 * 24 * 3600 * 1000;
const MARKET_MAX_AGE = 4 * 24 * 3600 * 1000;
const MAX_ASSET_ITEMS = 10;
const MAX_MARKET_ITEMS = 24;

// ---------- RSS parsing ----------
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
  if (e[0] === '#') {
    const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
  }
  return ENTITIES[e.toLowerCase()] ?? m;
});
const clean = (s) => decode(decode(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? clean(m[1]) : '';
}

function parseRss(xml, defaultSource) {
  const items = [];
  for (const m of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = m[1];
    let title = tag(block, 'title');
    const link = tag(block, 'link');
    const time = Date.parse(tag(block, 'pubDate'));
    if (!title || !/^https?:\/\//i.test(link) || !Number.isFinite(time)) continue;
    let source = tag(block, 'source') || defaultSource;
    if (!source) {
      try { source = new URL(link).hostname.replace(/^www\./, ''); } catch { source = ''; }
    }
    // Google News appends " - Publisher" to titles
    const suffix = ` - ${source}`;
    if (source && title.endsWith(suffix)) title = title.slice(0, -suffix.length);
    items.push({ title, link, time, source, text: title });
  }
  return items;
}

async function fetchFeed(url, defaultSource) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(9000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url).hostname}`);
  return parseRss(await res.text(), defaultSource);
}

const googleNews = (q, region) => {
  const [hl, gl, ceid] = region === 'IN' ? ['en-IN', 'IN', 'IN:en'] : ['en-US', 'US', 'US:en'];
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
};
const yahooTicker = (s) => `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(s)}&region=US&lang=en-US`;

// ---------- Impact scoring ----------
// [pattern, weight, label]; positive weights are bullish for the related asset, negative bearish.
const LEXICON = [
  [/\b(record|all-time|52-week|multi-year)\s+(high|highs)\b/, 3, 'record high'],
  [/\b(record)\s+(revenue|profit|sales|earnings|quarter|deliveries)\b/, 3, 'record results'],
  [/\bbeats?\s+(estimates|expectations|forecasts|street|consensus)\b|\btops?\s+(estimates|expectations|forecasts)\b/, 3, 'beats estimates'],
  [/\bupgrad(e|es|ed)\b/, 3, 'upgrade'],
  [/\b(raises?|lifts?|hikes?|boosts?)\s+(its\s+)?(guidance|forecast|outlook|price target|target)\b|\bprice target (raised|hiked|boosted)\b/, 3, 'raised outlook/target'],
  [/\b(wins?|bags?|secures?|lands?|clinch(es)?)\s+(a\s+)?(\S+\s+)?(contract|order|deal|approval)s?\b/, 3, 'order/contract win'],
  [/\b(surge[sd]?|soar(s|ed)?|skyrocket(s|ed)?|spik(e|es|ed)\s+(higher|up))\b/, 2, 'surge'],
  [/\b(rall(y|ies|ied)|jump(s|ed)?|leaps?|leaped|breakout|breaks out)\b/, 2, 'rally/breakout'],
  [/\b(outperform(s|ed)?|overweight|buy rating|strong buy)\b/, 2, 'bullish rating'],
  [/\b(strong|robust|solid|upbeat|stellar)\s+(earnings|results|demand|growth|sales|guidance|quarter)\b/, 2, 'strong results'],
  [/\b(profit|earnings|revenue|net income)\s+(jumps?|surges?|rises?|soars?|grows?|climbs?|doubles?)\b/, 2, 'profit growth'],
  [/\brate cuts?\b|\b(cuts?|lowers?)\s+(interest )?rates\b|\bstimulus\b|\bliquidity infusion\b/, 2, 'easing/stimulus'],
  [/\b(inflows?|etf approval|approved|approves|clears?\s+(the\s+)?way)\b/, 2, 'inflows/approval'],
  [/\b(buyback|share repurchase|dividend (hike|increase|boost)|special dividend)\b/, 2, 'buyback/dividend'],
  [/\bbullish\b|\bpositive outlook\b|\boptimism\b/, 2, 'bullish tone'],
  [/\b(gains?|climbs?|rises?|rose|advances?|higher|up\s+\d+(\.\d+)?%|recover(s|ed|y)?|rebounds?)\b/, 1, 'gains'],
  [/\b(partnership|collaboration|acquires?|acquisition|expansion|launch(es|ed)?|adoption|investment)\b/, 1, 'growth catalyst'],

  [/\b(plunge[sd]?|crash(es|ed)?|collapse[sd]?|tank(s|ed)?|nosedive[sd]?)\b/, -3, 'plunge'],
  [/\bdowngrad(e|es|ed)\b|\b(rating|rated)\s+(cut|lowered)\b|\bcuts?\s+to\s+["']?(sell|reduce|underweight)/, -3, 'downgrade'],
  [/\b(miss(es|ed)?|falls? short of|short of)\s+(estimates|expectations|forecasts|street|consensus)\b|\bmisses\b/, -3, 'misses estimates'],
  [/\b(cuts?|lowers?|slashes?|reduces?)\s+(its\s+)?(guidance|forecast|outlook|price target|target)\b|\bprice target (cut|lowered|slashed)\b/, -3, 'cut outlook/target'],
  [/\b(bankruptcy|insolvency|defaults?|delist(ed|ing)?|fraud|accounting irregularit\w+)\b/, -4, 'solvency/fraud risk'],
  [/\b(hack(ed|s)?|exploit(ed)?|data breach|cyber ?attack|rug pull)\b/, -3, 'security incident'],
  [/\b(short[- ]seller|short report)\b/, -3, 'short-seller attack'],
  [/\b(lawsuit|sues?|sued|probe|investigation|investigates|penalty|fined?|antitrust|raid(s|ed)?|subpoena|sebi order|ban(s|ned)?)\b/, -2, 'legal/regulatory risk'],
  [/\b(recession|stagflation|credit crunch|financial crisis)\b/, -3, 'recession risk'],
  [/\b(rate hikes?|hikes? (interest )?rates|inflation (rises|surges|jumps|spikes|heats)|tariffs?|sanctions?|trade war)\b/, -2, 'tightening/trade risk'],
  [/\b(sell-?off|slump(s|ed)?|sink(s)?|sank|tumble[sd]?|slide[sd]?|sliding|slumps)\b/, -2, 'sell-off'],
  [/\b(layoffs?|job cuts|lays off|recall(s|ed)?|halts?|suspends?|shutdown|outage|delays?)\b/, -2, 'operational setback'],
  [/\b(outflows?|redemptions?|underperform(s|ed)?|underweight|sell rating)\b/, -2, 'outflows/bearish rating'],
  [/\b(weak|soft|disappointing|poor|muted)\s+(earnings|results|demand|growth|sales|guidance|quarter)\b/, -2, 'weak results'],
  [/\b(warns?|warning|profit warning)\b/, -2, 'warning'],
  [/\bbearish\b|\bnegative outlook\b/, -2, 'bearish tone'],
  [/\b(war|conflict|attack|missile)\b/, -2, 'geopolitical risk'],
  [/\b(loss(es)?|net loss|widens loss)\b/, -2, 'losses'],
  [/\b(falls?|fell|drops?|dropped|dips?|declines?|slips?|slipped|lower|down\s+\d+(\.\d+)?%|weakens?|worr(y|ies)|fears?|concerns?)\b/, -1, 'declines/concerns'],
];

export function scoreText(text) {
  const t = text.toLowerCase();
  let score = 0;
  const hits = [];
  for (const [re, w, label] of LEXICON) {
    if (re.test(t)) { score += w; hits.push({ label, w }); }
  }
  score = Math.max(-6, Math.min(6, score));
  const impact = score >= 2 ? 'Bullish' : score <= -2 ? 'Bearish' : 'Neutral';
  hits.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
  const drivers = hits.filter((h) => (impact === 'Bullish' ? h.w > 0 : impact === 'Bearish' ? h.w < 0 : true)).slice(0, 3).map((h) => h.label);
  return { score, impact, drivers };
}

// ---------- Related-asset matching ----------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (alias, flags) => new RegExp(`(?<![A-Za-z0-9])${esc(alias)}(?![A-Za-z0-9])`, flags);
const baseTicker = (s) => s.replace(/\.NS$|-USD$|=F$/, '');
const cleanName = (n) => n.replace(/\([^)]*\)/g, '').replace(/\b(industries|limited|ltd\.?|corp|corporation|holdings|technologies|enterprises|inc\.?)\b/gi, '').replace(/\s+/g, ' ').trim();

const NAME_OVERRIDES = {
  ARM: ['Arm Holdings'], META: ['Meta Platforms', 'Facebook', 'Instagram'], GOOGL: ['Alphabet', 'Google'],
  'ETERNAL.NS': ['Eternal', 'Zomato', 'Blinkit'], 'ATOM-USD': ['Cosmos Hub'], 'XLM-USD': ['Stellar Lumens'],
  'NEAR-USD': ['NEAR Protocol'], 'XRP-USD': ['XRP', 'Ripple'], 'TRX-USD': ['TRON'], 'BNB-USD': ['BNB', 'Binance Coin'],
  'RELIANCE.NS': ['Reliance Industries', 'Reliance Jio', 'Jio Platforms', 'RIL'], 'HDFCBANK.NS': ['HDFC Bank'], 'TCS.NS': ['TCS', 'Tata Consultancy'],
  'BSE.NS': ['BSE Ltd', 'BSE Limited', 'Bombay Stock Exchange'],
  'TATAPOWER.NS': ['Tata Power'], 'SBIN.NS': ['SBI', 'State Bank of India'], 'LT.NS': ['Larsen & Toubro', 'L&T'],
  'ADANIENT.NS': ['Adani Enterprises'], 'HAL.NS': ['Hindustan Aeronautics'], 'BEL.NS': ['Bharat Electronics'],
  'MSFT': ['Microsoft'], 'AMZN': ['Amazon', 'AWS'], 'NVDA': ['Nvidia'], 'AAPL': ['Apple'], 'TSLA': ['Tesla'],
};
const NO_TICKER_ALIAS = new Set(['ARM', 'NEAR', 'ATOM', 'DOT', 'LINK', 'BEL', 'HAL', 'COIN', 'MU', 'CEG', 'LLY', 'ITA', 'TAN', 'URA', 'MON100', 'CPSEETF', 'BSE']);

const ASSET_BY_SYMBOL = new Map(UNIVERSE.map((a) => [a.symbol, a]));
const assetId = (a) => `${a.category}:${a.symbol}`;
export const ASSET_BY_ID = new Map(UNIVERSE.map((a) => [assetId(a), a]));

const DIRECT = UNIVERSE.map((a) => {
  const names = NAME_OVERRIDES[a.symbol] || (a.category === 'in-mf' ? [a.name] : [cleanName(a.name)]);
  const res = names.filter((n) => n.length >= 3).map((n) => wordRe(n, 'i'));
  const base = baseTicker(a.symbol);
  if (!a.mfCode && a.category !== 'commodity' && base.length >= 3 && /^[A-Z0-9]+$/.test(base) && !NO_TICKER_ALIAS.has(base) && !NO_TICKER_ALIAS.has(a.symbol)) {
    res.push(wordRe(base, ''));
  }
  return { asset: a, res };
}).filter((e) => e.res.length);

// Themes that move related assets even when no asset is named in the headline
const TOPICS = [
  [/\bbitcoin\b/i, ['BTC-USD', 'IBIT']],
  [/\bethereum\b/i, ['ETH-USD']],
  [/\bgold\b/i, ['GC=F', 'GOLDBEES.NS']],
  [/\bsilver\b/i, ['SI=F', 'SILVERBEES.NS']],
  [/\b(crude|oil prices?|brent|opec|wti)\b/i, ['CL=F', 'XLE']],
  [/\b(natural gas|lng)\b/i, ['NG=F']],
  [/\bcopper\b/i, ['HG=F']],
  [/\b(nifty|sensex|dalal street|indian (stocks?|markets?))\b/i, ['NIFTYBEES.NS']],
  [/\b(bank nifty|banking stocks|rbi|reserve bank)\b/i, ['BANKBEES.NS']],
  [/\bnasdaq\b(?!\s*:)/i, ['QQQ']],
  [/\b(s&p 500|dow jones|\bdow\b|federal reserve|\bfed\b)\b|\bwall street\b(?! (zen|analysts?|brokerages?|strategists?))/i, ['SPY']],
  [/\b(semiconductors?|chipmakers?|chip stocks?)\b/i, ['SMH']],
  [/\b(uranium|nuclear)\b/i, ['URA']],
  [/\bsolar\b/i, ['TAN']],
  [/\b(defen[cs]e stocks?|aerospace)\b/i, ['ITA']],
  [/\bbiotech\b/i, ['XBI']],
  [/\b(russell 2000|small[- ]caps?)\b/i, ['IWM']],
  [/\b(it stocks|it sector|it services)\b/i, ['ITBEES.NS']],
  [/\b(wheat)\b/i, ['ZW=F']],
  [/\b(corn)\b/i, ['ZC=F']],
  [/\bplatinum\b/i, ['PL=F']],
];

const DIRECT_BY_SYMBOL = new Map(DIRECT.map((e) => [e.asset.symbol, e.res]));
const mentions = (asset, text) => (DIRECT_BY_SYMBOL.get(asset.symbol) || []).some((re) => re.test(text));

function relatedAssets(text, first) {
  const out = [];
  const push = (a) => { if (a && !out.some((x) => x.symbol === a.symbol)) out.push(a); };
  push(first);
  for (const { asset, res } of DIRECT) if (res.some((re) => re.test(text))) push(asset);
  for (const [re, syms] of TOPICS) if (re.test(text)) syms.forEach((s) => push(ASSET_BY_SYMBOL.get(s)));
  return out.slice(0, 4);
}

const displaySymbol = (a) => (a.category === 'in-mf' ? `AMFI ${a.symbol}` : a.symbol.replace(/\.NS$/, ''));

function enrich(item, firstAsset) {
  const { score, impact, drivers } = scoreText(item.text);
  return {
    title: item.title,
    link: item.link,
    source: item.source,
    time: item.time,
    impact,
    score,
    drivers,
    related: relatedAssets(item.text, firstAsset).map((a) => ({ id: assetId(a), name: a.name, symbol: displaySymbol(a), impact, score })),
  };
}

// ---------- Aggregation ----------
const dedupeKey = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 70);

function mergeItems(lists, maxAge, limit) {
  const seen = new Set();
  const cutoff = Date.now() - maxAge;
  const merged = [];
  for (const it of lists.flat()) {
    const k = dedupeKey(it.title);
    if (!k || seen.has(k) || it.time < cutoff || it.time > Date.now() + 3600 * 1000) continue;
    seen.add(k);
    merged.push(it);
  }
  return merged.sort((a, b) => b.time - a.time).slice(0, limit);
}

function summarize(items) {
  let bullish = 0, bearish = 0, neutral = 0, net = 0;
  for (const it of items) {
    net += it.score;
    if (it.impact === 'Bullish') bullish++;
    else if (it.impact === 'Bearish') bearish++;
    else neutral++;
  }
  const label = net >= 3 ? 'Bullish' : net <= -3 ? 'Bearish' : bullish && bearish ? 'Mixed' : 'Neutral';
  const text = !items.length
    ? 'No recent headlines found.'
    : `${label === 'Mixed' ? 'Mixed' : `Net ${label.toLowerCase()}`} news flow: ${bullish} bullish, ${bearish} bearish, ${neutral} neutral of ${items.length} recent headlines.`;
  return { label, net, bullish, bearish, neutral, text };
}

async function settle(tasks) {
  const results = await Promise.allSettled(tasks);
  const lists = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const errors = results.filter((r) => r.status === 'rejected').map((r) => r.reason?.message || 'failed');
  if (errors.length) console.warn('[news]', errors.join('; '));
  return { lists, errors };
}

const QUERY_NAMES = {
  'ETERNAL.NS': '("Eternal" OR "Zomato")',
  'BSE.NS': '("BSE Ltd" OR "Bombay Stock Exchange")',
  'RELIANCE.NS': '("Reliance Industries" OR "Reliance Jio")',
};

function assetQueries(a) {
  const name = cleanName(a.name);
  const qn = QUERY_NAMES[a.symbol] || `"${name}"`;
  const region = a.category.startsWith('in-') ? 'IN' : 'US';
  const q = {
    'us-stock': `${qn} stock`,
    'in-stock': `${qn} share`,
    'us-etf': `"${a.name.replace(/\([^)]*\)/g, '').trim()}" OR ${a.symbol} ETF`,
    'in-etf': `${qn} ETF`,
    'in-mf': `"${a.name}" mutual fund`,
    crypto: `${name} crypto price`,
    commodity: `${name} price`,
  }[a.category];
  return { url: googleNews(`${q} when:7d`, region) };
}

// Quote/landing pages that Google News indexes alongside real stories
const QUOTE_PAGE = /\b(share|stock) price\b|\blive quotes?\b|price today\b|\bstock quote\b/i;

// Funds and ETFs rarely get headlines under their own name, so fall back to news on the market they track
const THEMES = {
  'NIFTYBEES.NS': ['Nifty 50', '(Nifty OR Sensex) market'],
  'BANKBEES.NS': ['Bank Nifty', '("Bank Nifty" OR "banking stocks" OR RBI)'],
  'JUNIORBEES.NS': ['Nifty Next 50 / midcaps', '("Nifty Next 50" OR midcap stocks)'],
  'ITBEES.NS': ['Indian IT sector', '("Nifty IT" OR "IT stocks" OR Infosys OR TCS)'],
  'GOLDBEES.NS': ['gold prices', 'gold price India'],
  'SILVERBEES.NS': ['silver prices', 'silver price India'],
  'MON100.NS': ['Nasdaq 100', '"Nasdaq 100" OR Nasdaq stocks'],
  'CPSEETF.NS': ['PSU stocks', '(PSU stocks OR CPSE)'],
  ITA: ['aerospace & defense', '(defense stocks OR aerospace)'],
};

function themeFor(a) {
  if (THEMES[a.symbol]) return THEMES[a.symbol];
  if (!a.mfCode) return null;
  if (/small ?cap/i.test(a.name)) return ['small-cap stocks', '(smallcap stocks OR "small cap" India)'];
  if (/mid ?cap/i.test(a.name)) return ['mid-cap stocks', '(midcap stocks OR "mid cap" India)'];
  return ['the Indian equity market', '(Nifty OR Sensex) market'];
}

async function buildAssetNews(a) {
  const tasks = [fetchFeed(assetQueries(a).url), ...(a.mfCode ? [] : [fetchFeed(yahooTicker(a.symbol))])]
    // Feeds often carry loosely related stories, so keep only headlines that actually name the asset
    .map((p) => p.then((list) => list.filter((it) => mentions(a, it.text) && !QUOTE_PAGE.test(it.title))));
  let { lists, errors } = await settle(tasks);
  let items = mergeItems(lists, ASSET_MAX_AGE, MAX_ASSET_ITEMS);
  let theme = null;
  let attempts = tasks.length;
  const t = themeFor(a);
  if (items.length < 3 && t) {
    attempts++;
    const region = a.category.startsWith('in-') ? 'IN' : 'US';
    const extra = await settle([fetchFeed(googleNews(`${t[1]} when:3d`, region)).then((l) => l.filter((it) => !QUOTE_PAGE.test(it.title)))]);
    errors = errors.concat(extra.errors);
    items = mergeItems([...lists, ...extra.lists], ASSET_MAX_AGE, MAX_ASSET_ITEMS);
    if (extra.lists.flat().length) theme = t[0];
  }
  items = items.map((it) => enrich(it, a));
  if (!items.length && errors.length >= attempts) throw new Error('All news sources failed');
  return { id: assetId(a), name: a.name, generatedAt: Date.now(), theme, summary: summarize(items), items };
}

async function buildMarketNews() {
  const tasks = [
    fetchFeed('https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms', 'Economic Times'),
    fetchFeed(yahooTicker('^GSPC,^NSEI,GC=F,CL=F,BTC-USD'), 'Yahoo Finance'),
    fetchFeed('https://www.cnbc.com/id/10000664/device/rss/rss.html', 'CNBC'),
    fetchFeed('https://www.coindesk.com/arc/outboundfeeds/rss', 'CoinDesk'),
    fetchFeed(googleNews('Wall Street OR Nasdaq OR "S&P 500" stocks when:2d', 'US')),
    fetchFeed(googleNews('Sensex OR Nifty OR "Indian stocks" when:2d', 'IN')),
    fetchFeed(googleNews('gold OR crude oil OR copper prices when:2d', 'US')),
  ];
  const { lists, errors } = await settle(tasks);
  const EXCHANGE_TAG = /\((NYSE|NASDAQ|NYSEARCA|NYSEMKT|BATS|TSE|LON)\s*:/;
  const all = mergeItems(lists, MARKET_MAX_AGE, 200).filter((it) => !EXCHANGE_TAG.test(it.title)).map((it) => enrich(it, null)).filter((it) => it.related.length);
  if (!all.length && errors.length === tasks.length) throw new Error('All news sources failed');
  const items = all.slice(0, MAX_MARKET_ITEMS);
  return { id: 'market', name: 'Market news', generatedAt: Date.now(), summary: summarize(items), items };
}

// ---------- Cache ----------
const cache = new Map();

export function getNews(id) {
  const key = id || 'market';
  let a = null;
  if (id) {
    a = ASSET_BY_ID.get(id);
    if (!a) return Promise.reject(Object.assign(new Error('Unknown asset'), { status: 404 }));
  }
  const hit = cache.get(key);
  if (hit?.data && Date.now() - hit.ts < CACHE_TTL) return Promise.resolve(hit.data);
  if (hit?.pending) return hit.pending;
  const pending = (a ? buildAssetNews(a) : buildMarketNews())
    .then((data) => { cache.set(key, { data, ts: Date.now() }); return data; })
    .catch((e) => {
      cache.delete(key);
      if (hit?.data) return hit.data;
      throw e;
    });
  cache.set(key, { data: hit?.data, ts: hit?.ts || 0, pending });
  return pending;
}
