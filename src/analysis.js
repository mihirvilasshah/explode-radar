import { CATEGORIES } from './universe.js';
import {
  smaSeries, rsiSeries, macd, annualVol, bandwidthSeries, pctReturn, percentileRank,
} from './indicators.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

export function fmtPrice(v, currency) {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  const digits = v >= 1000 ? 0 : v >= 1 ? 2 : 4;
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: digits }).format(v);
  } catch {
    return v.toFixed(digits);
  }
}

const HORIZONS = {
  'Volatility Squeeze': { days: 35, label: '4–8 weeks' },
  Breakout: { days: 30, label: '3–6 weeks' },
  'Golden Cross': { days: 90, label: '3–5 months' },
  'Pullback Buy': { days: 45, label: '1–3 months' },
  'Oversold Rebound': { days: 30, label: '2–6 weeks' },
  'Trend Continuation': { days: 80, label: '2–4 months' },
  'Base Building': { days: 120, label: '4–8 months' },
  Compounder: { days: 252, label: '12–24 months' },
  Accumulate: { days: 252, label: '12–24 months' },
};

const CATEGORY_CONTEXT = {
  crypto: 'Crypto trades 24/7 with high beta to global liquidity and risk sentiment — size positions conservatively.',
  commodity: 'Commodity moves are driven by supply/demand shocks, the US dollar and the macro cycle, so trends can be abrupt.',
  'in-mf': 'Best approached through SIPs or staggered lump sums rather than trying to time a single entry.',
  'us-etf': 'As a diversified basket it captures the theme with lower single-stock risk.',
  'in-etf': 'As a diversified, low-cost basket it captures the theme with lower single-stock risk.',
};

export function analyze(asset, d, ctx) {
  const { category } = asset;
  const isCrypto = category === 'crypto';
  const isMF = category === 'in-mf';
  const ppy = isCrypto ? 365 : 252;
  const bpm = Math.round(ppy / 12);

  const c = d.close;
  const n = c.length;
  const price = c[n - 1];
  const sma20 = smaSeries(c, 20);
  const sma50 = smaSeries(c, 50);
  const sma200 = smaSeries(c, 200);
  const rsi = rsiSeries(c);
  const { hist } = macd(c);
  const bw = bandwidthSeries(c);

  const year = c.slice(-ppy);
  const high52 = Math.max(...year);
  const low52 = Math.min(...year);
  const returns = {
    d1: pctReturn(c, 1),
    w1: pctReturn(c, Math.round(ppy / 52)),
    m1: pctReturn(c, bpm),
    m3: pctReturn(c, bpm * 3),
    m6: pctReturn(c, bpm * 6),
    y1: pctReturn(c, ppy),
    y3cagr: n > ppy * 3 ? (price / c[n - 1 - ppy * 3]) ** (1 / 3) - 1 : null,
  };
  const vol = annualVol(c, Math.min(ppy, n - 1), ppy);
  const r = rsi[n - 1];
  const s20 = sma20[n - 1];
  const s50 = sma50[n - 1];
  const s200 = sma200[n - 1];

  const signals = [];
  const keys = new Set();
  const add = (key, type, label, detail, points) => {
    signals.push({ key, type, label, detail, points });
    keys.add(key);
  };

  // Trend structure
  if (s200 != null) {
    const rising50 = sma50[n - 11] != null && s50 > sma50[n - 11];
    if (price > s50 && s50 > s200) {
      add('uptrend', 'bull', 'Strong uptrend', `Price is above a ${rising50 ? 'rising ' : ''}50-DMA (${fmtPrice(s50, d.currency)}) which is above the 200-DMA (${fmtPrice(s200, d.currency)}).`, rising50 ? 15 : 12);
    } else if (price > s200) {
      add('above200', 'bull', 'Above 200-day average', `Long-term trend intact; price is ${pct(price / s200 - 1)} above the 200-DMA.`, 6);
    } else if (price > s50) {
      add('recovering', 'neutral', 'Reclaiming 50-DMA', 'Price is back above its 50-DMA but still under the 200-DMA — early recovery.', 3);
    } else {
      add('below200', 'bear', 'Below 200-day average', `Price is ${pct(1 - price / s200)} below the 200-DMA — long-term trend is down.`, -10);
    }

    for (let i = n - 1; i > n - 26 && i > 0; i--) {
      if (sma50[i - 1] == null || sma200[i - 1] == null) break;
      if (sma50[i - 1] <= sma200[i - 1] && sma50[i] > sma200[i]) {
        add('goldenCross', 'bull', 'Golden cross', `50-DMA crossed above the 200-DMA ${n - 1 - i} sessions ago.`, 10);
        break;
      }
      if (sma50[i - 1] >= sma200[i - 1] && sma50[i] < sma200[i]) {
        add('deathCross', 'bear', 'Death cross', `50-DMA crossed below the 200-DMA ${n - 1 - i} sessions ago.`, -8);
        break;
      }
    }
  } else if (s50 != null) {
    if (price > s50) add('above50', 'bull', 'Above 50-day average', 'Short-term trend is up (limited history for 200-DMA).', 6);
    else add('below50', 'bear', 'Below 50-day average', 'Short-term trend is down.', -6);
  }

  // RSI momentum
  if (r != null) {
    const rs = r.toFixed(0);
    if (r >= 55 && r < 70) add('rsiBull', 'bull', 'Bullish momentum', `RSI(14) at ${rs} — strong but not overheated.`, 10);
    else if (r >= 70 && r < 78) add('rsiHot', 'neutral', 'Hot momentum', `RSI(14) at ${rs} — strong buying, slightly stretched.`, 3);
    else if (r >= 78) add('overbought', 'bear', 'Overbought', `RSI(14) at ${rs} — elevated risk of a near-term pullback.`, -8);
    else if (r < 30) add('oversold', 'bull', 'Oversold', `RSI(14) at ${rs} — conditions that often precede sharp rebounds.`, 4);
    else if (r < 45 && s200 != null && price > s200) add('pullback', 'bull', 'Healthy pullback', `RSI(14) cooled to ${rs} while the long-term trend holds.`, 6);
  }

  // MACD
  let crossed = false;
  for (let i = n - 1; i > n - 6; i--) {
    if (hist[i - 1] != null && hist[i - 1] <= 0 && hist[i] > 0) {
      add('macdCross', 'bull', 'Fresh MACD crossover', `MACD crossed above its signal line ${n - 1 - i === 0 ? 'today' : `${n - 1 - i} sessions ago`}.`, 10);
      crossed = true;
      break;
    }
  }
  if (!crossed && hist[n - 1] != null && hist[n - 2] != null) {
    if (hist[n - 1] > 0 && hist[n - 1] > hist[n - 2]) add('macdUp', 'bull', 'MACD expanding', 'MACD histogram is positive and rising — momentum accelerating.', 6);
    else if (hist[n - 1] < 0 && hist[n - 1] < hist[n - 2]) add('macdDown', 'bear', 'MACD weakening', 'MACD histogram is negative and falling — momentum fading.', -5);
  }

  // Volume
  if (d.hasVolume && n > 60) {
    const vol10 = avg(d.volume.slice(-10));
    const vol50 = avg(d.volume.slice(-50));
    const ratio = vol50 > 0 ? vol10 / vol50 : 1;
    if (ratio > 1.5) add('volSurge', 'bull', 'Volume surge', `10-day volume is ${ratio.toFixed(1)}× the 50-day average — big money is active.`, 10);
    else if (ratio > 1.2) add('volRising', 'bull', 'Rising participation', `10-day volume is ${ratio.toFixed(1)}× the 50-day average.`, 5);

    let up = 0;
    let down = 0;
    for (let i = n - 20; i < n; i++) {
      if (c[i] > c[i - 1]) up += d.volume[i];
      else down += d.volume[i];
    }
    const ad = down > 0 ? up / down : 2;
    if (ad > 1.4) add('accumulation', 'bull', 'Accumulation', `Up-day volume is ${ad.toFixed(1)}× down-day volume over 20 sessions.`, 5);
    else if (ad < 0.7) add('distribution', 'bear', 'Distribution', 'Down-day volume dominates — sellers are in control.', -4);
  }

  // Volatility squeeze
  let squeezePct = null;
  if (!isMF && bw[n - 1] != null) {
    squeezePct = percentileRank(bw.slice(-126), bw[n - 1]);
    const bias = s50 != null && price > s50;
    if (squeezePct <= 0.15) add('squeeze', 'bull', 'Volatility squeeze', `Bollinger bandwidth is in the bottom ${Math.max(1, Math.round(squeezePct * 100))}% of the last 6 months — a coiled spring.`, bias ? 12 : 4);
    else if (squeezePct <= 0.3) add('tightening', 'bull', 'Range tightening', 'Volatility is contracting, often a precursor to a large move.', bias ? 6 : 2);
  }

  // 52-week high proximity
  const distHigh = price / high52 - 1;
  if (c.slice(-5).some((v) => v >= high52 * 0.999)) {
    add('newHigh', 'bull', 'Fresh 52-week high', 'Trading at new highs — no overhead supply from trapped buyers.', 10);
  } else if (distHigh > -0.05) {
    add('nearHigh', 'bull', 'Breakout zone', `Within ${pct(-distHigh)} of the 52-week high (${fmtPrice(high52, d.currency)}).`, 8);
  } else if (distHigh < -0.4) {
    add('drawdown', 'bear', 'Deep drawdown', `${pct(-distHigh, 0)} below the 52-week high — heavy overhead supply.`, -4);
  }

  // Relative strength vs benchmark
  const catInfo = CATEGORIES[category];
  const bench = ctx.benchmarks[catInfo.benchmark];
  let rsDiff = null;
  if (bench && asset.symbol !== catInfo.benchmark && returns.m3 != null && bench.m3 != null) {
    rsDiff = returns.m3 - bench.m3;
    const pts = (rsDiff * 100).toFixed(1);
    if (rsDiff > 0.15) add('rsStrong', 'bull', 'Market leader', `Beat the ${catInfo.benchmarkName} by ${pts} pts over 3 months.`, 12);
    else if (rsDiff > 0.05) add('rsGood', 'bull', 'Outperforming', `Beat the ${catInfo.benchmarkName} by ${pts} pts over 3 months.`, 8);
    else if (rsDiff < -0.1) add('rsWeak', 'bear', 'Lagging the market', `Trailed the ${catInfo.benchmarkName} by ${Math.abs(pts)} pts over 3 months.`, -6);
  }

  // Multi-timeframe momentum
  if (returns.m1 > 0 && returns.m3 > 0) add('momentum', 'bull', 'Aligned momentum', `Up ${pct(returns.m1)} in 1M and ${pct(returns.m3)} in 3M.`, 5);
  if (returns.m6 > 0.25) add('strong6m', 'bull', 'Powerful 6-month run', `Up ${pct(returns.m6, 0)} over 6 months.`, 4);
  if (s20 != null && price > s20 * 1.15) add('extended', 'bear', 'Extended', `${pct(price / s20 - 1)} above the 20-DMA — chasing here is risky.`, -5);

  // Asset-class specific
  if (isMF && returns.y3cagr != null) {
    const cg = returns.y3cagr;
    if (cg > 0.2) add('cagrHigh', 'bull', 'Elite 3Y compounding', `3-year CAGR of ${pct(cg)}.`, 10);
    else if (cg > 0.14) add('cagrGood', 'bull', 'Solid 3Y compounding', `3-year CAGR of ${pct(cg)}.`, 6);
    else if (cg < 0.08) add('cagrLow', 'bear', 'Weak 3Y returns', `3-year CAGR of only ${pct(cg)}.`, -4);
  }
  const gecko = isCrypto && asset.geckoId ? ctx.gecko?.markets?.[asset.geckoId] : null;
  if (isCrypto && ctx.gecko?.trending?.has(asset.geckoId)) {
    add('trending', 'bull', 'Trending on CoinGecko', 'Among the most-searched coins right now — retail attention is building.', 6);
  }
  if (gecko?.athChangePct != null && gecko.athChangePct > -10) {
    add('nearAth', 'bull', 'Near all-time high', `Only ${Math.abs(gecko.athChangePct).toFixed(1)}% below ATH — price discovery territory.`, 5);
  }

  const raw = signals.reduce((s, x) => s + x.points, 0);
  // Logistic squash keeps top scores differentiated instead of saturating
  const score = Math.round(clamp(100 / (1 + Math.exp(-(raw - 30) / 15)), 1, 99));

  // Setup classification
  let setup;
  if (isMF) setup = (returns.y3cagr ?? returns.y1 ?? 0) > 0.12 ? 'Compounder' : 'Accumulate';
  else if (keys.has('squeeze') && s50 != null && price > s50) setup = 'Volatility Squeeze';
  else if ((keys.has('newHigh') || keys.has('nearHigh')) && (keys.has('volSurge') || keys.has('volRising') || keys.has('macdCross') || keys.has('rsStrong'))) setup = 'Breakout';
  else if (keys.has('goldenCross')) setup = 'Golden Cross';
  else if (keys.has('pullback')) setup = 'Pullback Buy';
  else if (keys.has('oversold')) setup = 'Oversold Rebound';
  else if (keys.has('uptrend')) setup = 'Trend Continuation';
  else setup = 'Base Building';

  // Projection: volatility-scaled move over the setup's horizon, weighted by conviction
  const horizon = HORIZONS[setup];
  const t = horizon.days / 252;
  const sigmaH = vol * Math.sqrt(t);
  const conv = clamp((score - 40) / 55, 0, 1);
  let basePct;
  let bullPct;
  if (isMF) {
    const drift = clamp(returns.y3cagr ?? returns.y1 ?? 0.1, 0.04, 0.3);
    basePct = drift * (0.7 + 0.3 * conv);
    bullPct = basePct + sigmaH * 0.8;
  } else {
    basePct = sigmaH * (0.2 + 0.8 * conv);
    bullPct = sigmaH * (0.8 + 1.1 * conv);
  }
  basePct = clamp(basePct, 0.01, 3);
  bullPct = clamp(bullPct, basePct, 4);
  const stopPct = clamp(sigmaH * (isMF ? 0.6 : 0.55), 0.03, 0.5);

  const risk = vol < 0.18 ? 'Low' : vol < 0.35 ? 'Medium' : vol < 0.6 ? 'High' : 'Very High';
  const rating = score >= 75 ? 'Explosive Setup' : score >= 62 ? 'Bullish' : score >= 48 ? 'Watchlist' : 'Avoid';

  const name = isMF ? `${asset.name} Fund` : asset.name;
  const thesis = buildThesis({
    name, setup, category, catInfo, r, squeezePct, returns, rsDiff, keys, signals, horizon,
    basePct, bullPct, stopPct, price, currency: d.currency,
  });

  // Downsample the last year for charts
  const start = Math.max(0, n - ppy);
  const step = Math.max(1, Math.ceil((n - start) / 160));
  const idx = [];
  for (let i = start; i < n; i += step) idx.push(i);
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);

  return {
    id: `${category}:${asset.symbol}`,
    symbol: isMF ? String(d.schemeCode) : asset.symbol,
    name,
    category,
    categoryLabel: catInfo.label,
    currency: d.currency,
    exchange: d.exchange,
    price,
    returns,
    rsi: r,
    vol,
    high52,
    low52,
    score,
    rating,
    setup,
    risk,
    horizon,
    target: {
      basePct, bullPct,
      basePrice: price * (1 + basePct),
      bullPrice: price * (1 + bullPct),
    },
    stop: { pct: stopPct, price: price * (1 - stopPct) },
    riskReward: basePct / stopPct,
    signals: signals.sort((a, b) => b.points - a.points),
    thesis,
    image: gecko?.image || null,
    marketCapRank: gecko?.rank || null,
    extra: isMF ? { schemeCategory: d.schemeCategory } : null,
    source: isMF ? 'mfapi.in (AMFI)' : isCrypto ? 'Yahoo Finance + CoinGecko' : 'Yahoo Finance',
    history: {
      dates: idx.map((i) => d.dates[i]),
      close: idx.map((i) => +c[i].toPrecision(6)),
      sma50: idx.map((i) => (sma50[i] != null ? +sma50[i].toPrecision(6) : null)),
    },
  };
}

function buildThesis(o) {
  const { name, setup, category, catInfo, r, squeezePct, returns, rsDiff, signals, horizon, basePct, bullPct, stopPct, price, currency } = o;
  const openers = {
    'Volatility Squeeze': `${name} is coiling in an unusually tight range — Bollinger bandwidth sits in the bottom ${Math.max(1, Math.round((squeezePct ?? 0.1) * 100))}% of the last six months. Compressed volatility is typically followed by sharp expansion, and with price holding above its 50-day average the path of least resistance points higher.`,
    Breakout: `${name} is pressing into its 52-week high zone with confirming momentum. Breakouts to new highs clear overhead supply (few trapped sellers), which often fuels fast, outsized moves.`,
    'Golden Cross': `${name} has just printed a golden cross — the 50-DMA crossing above the 200-DMA — a classic sign that the long-term trend is turning up and institutional capital is rotating in.`,
    'Pullback Buy': `${name} is pulling back inside a larger uptrend: RSI has cooled to ${r?.toFixed(0)} while price holds above the 200-day average, offering a lower-risk entry into an established trend.`,
    'Oversold Rebound': `${name} is deeply oversold (RSI ${r?.toFixed(0)}). Such extremes often precede sharp mean-reversion rallies, although the broader trend still needs confirmation.`,
    'Trend Continuation': `${name} is in a well-defined uptrend with price stacked above its 50- and 200-day averages. Trend persistence favours staying with strength until the structure breaks.`,
    'Base Building': `${name} is still building a base. The setup is early — a breakout above recent highs or a momentum trigger is needed before it can accelerate.`,
    Compounder: `${name} has compounded at ~${((returns.y3cagr ?? returns.y1 ?? 0) * 100).toFixed(1)}% a year${returns.y3cagr != null ? ' over the last 3 years' : ''}, showing consistent execution by the fund manager across market cycles.`,
    Accumulate: `${name} has delivered modest returns recently; it may suit steady accumulation but lacks strong momentum right now.`,
  };
  const parts = [openers[setup]];

  if (rsDiff != null) {
    parts.push(`Over the last 3 months it has ${rsDiff >= 0 ? 'outperformed' : 'underperformed'} the ${catInfo.benchmarkName} by ${Math.abs(rsDiff * 100).toFixed(1)} percentage points.`);
  }
  const lower = (s) => s.label.toLowerCase().replace('macd', 'MACD');
  const catalysts = signals.filter((s) => s.type === 'bull' && s.points >= 8).map(lower);
  if (catalysts.length > 1) parts.push(`Supporting signals: ${catalysts.slice(0, 4).join(', ')}.`);
  if (CATEGORY_CONTEXT[category]) parts.push(CATEGORY_CONTEXT[category]);

  parts.push(`The model's base case is +${(basePct * 100).toFixed(0)}% (bull case +${(bullPct * 100).toFixed(0)}%) over ${horizon.label}; the thesis is invalidated on a close below ~${fmtPrice(price * (1 - stopPct), currency)} (−${(stopPct * 100).toFixed(0)}%).`);

  const bears = signals.filter((s) => s.type === 'bear').map(lower);
  if (bears.length) parts.push(`Watch-outs: ${bears.join(', ')}.`);
  return parts.join(' ');
}
