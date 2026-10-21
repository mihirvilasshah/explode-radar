export function smaSeries(arr, n) {
  const out = new Array(arr.length).fill(null);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= n) sum -= arr[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

export function emaSeries(arr, n) {
  const out = new Array(arr.length).fill(null);
  if (arr.length < n) return out;
  const k = 2 / (n + 1);
  let prev = arr.slice(0, n).reduce((a, b) => a + b, 0) / n;
  out[n - 1] = prev;
  for (let i = n; i < arr.length; i++) {
    prev = arr[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsiSeries(close, n = 14) {
  const out = new Array(close.length).fill(null);
  if (close.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = close[i] - close[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = n + 1; i < close.length; i++) {
    const d = close[i] - close[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(close) {
  const e12 = emaSeries(close, 12);
  const e26 = emaSeries(close, 26);
  const line = close.map((_, i) => (e12[i] != null && e26[i] != null ? e12[i] - e26[i] : null));
  const start = line.findIndex((v) => v != null);
  const sig = new Array(close.length).fill(null);
  if (start >= 0) {
    const s = emaSeries(line.slice(start), 9);
    s.forEach((v, i) => (sig[start + i] = v));
  }
  const hist = line.map((v, i) => (v != null && sig[i] != null ? v - sig[i] : null));
  return { line, signal: sig, hist };
}

export function atr(high, low, close, n = 14) {
  if (close.length <= n) return null;
  const tr = [];
  for (let i = 1; i < close.length; i++) {
    tr.push(Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1])));
  }
  let a = tr.slice(0, n).reduce((x, y) => x + y, 0) / n;
  for (let i = n; i < tr.length; i++) a = (a * (n - 1) + tr[i]) / n;
  return a;
}

export function annualVol(close, lookback = 252, periodsPerYear = 252) {
  const c = close.slice(-lookback - 1);
  const rets = [];
  for (let i = 1; i < c.length; i++) rets.push(Math.log(c[i] / c[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(variance * periodsPerYear);
}

export function bandwidthSeries(close, n = 20) {
  const mid = smaSeries(close, n);
  return close.map((_, i) => {
    if (mid[i] == null) return null;
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) v += (close[j] - mid[i]) ** 2;
    return (4 * Math.sqrt(v / n)) / mid[i];
  });
}

export function pctReturn(close, bars) {
  if (close.length <= bars) return null;
  return close[close.length - 1] / close[close.length - 1 - bars] - 1;
}

export function percentileRank(values, v) {
  const vals = values.filter((x) => x != null);
  if (!vals.length) return null;
  return vals.filter((x) => x <= v).length / vals.length;
}
