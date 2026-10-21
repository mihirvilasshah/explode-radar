const $ = (s, el = document) => el.querySelector(s);

const state = { data: null, category: 'all', q: '', sort: 'score', risk: 'all', minScore: 0 };

const CAT_COLORS = {
  'us-stock': ['#3b82f6', '#8b5cf6'],
  'us-etf': ['#06b6d4', '#3b82f6'],
  'in-stock': ['#ff9933', '#e8590c'],
  'in-etf': ['#f59e0b', '#ef4444'],
  'in-mf': ['#10b981', '#059669'],
  crypto: ['#a855f7', '#ec4899'],
  commodity: ['#eab308', '#a16207'],
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtPrice(v, currency = 'USD') {
  if (v == null || !Number.isFinite(v)) return '—';
  const digits = v >= 1000 ? 0 : v >= 1 ? 2 : 4;
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', { style: 'currency', currency, maximumFractionDigits: digits, minimumFractionDigits: Math.min(2, digits) }).format(v);
  } catch {
    return v.toFixed(digits);
  }
}
const fmtPct = (v, d = 1, signed = true) => (v == null || !Number.isFinite(v) ? '—' : `${signed && v > 0 ? '+' : ''}${(v * 100).toFixed(d)}%`);
const cls = (v) => (v == null ? '' : v >= 0 ? 'up' : 'down');
const scoreColor = (s) => (s >= 75 ? '#ff5f3d' : s >= 62 ? 'var(--up)' : s >= 48 ? 'var(--warn)' : 'var(--down)');
const ratingClass = (r) => `r-${r.split(' ')[0]}`;
const riskClass = (r) => `risk-${r.replace(' ', '')}`;
const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' });

function initials(name) {
  return name.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

function avatar(a) {
  const [c1, c2] = CAT_COLORS[a.category] || ['#666', '#333'];
  const inner = a.image ? `<img src="${esc(a.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : esc(initials(a.name));
  return `<div class="avatar" style="background:linear-gradient(135deg,${c1},${c2})">${inner}</div>`;
}

function ring(score, large = false) {
  return `<div class="ring${large ? ' lg' : ''}" style="--p:${score};--c:${scoreColor(score)}" title="Explosion score"><span>${score}</span></div>`;
}

function displaySymbol(a) {
  return a.category === 'in-mf' ? `AMFI ${a.symbol}` : a.symbol.replace(/\.NS$/, '');
}

// ---------- Charts ----------
function pathFrom(points) {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
}

function sparkline(a, idx) {
  const c = a.history.close;
  const W = 300, H = 54;
  const min = Math.min(...c), max = Math.max(...c);
  const pts = c.map((v, i) => [(i / (c.length - 1)) * W, H - 4 - ((v - min) / (max - min || 1)) * (H - 8)]);
  const up = c[c.length - 1] >= c[0];
  const col = up ? 'var(--up)' : 'var(--down)';
  const id = `sg${idx}`;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${up ? '#16c784' : '#f0445a'}" stop-opacity=".28"/><stop offset="1" stop-color="${up ? '#16c784' : '#f0445a'}" stop-opacity="0"/></linearGradient></defs>
    <path d="${pathFrom(pts)}L${W},${H}L0,${H}Z" fill="url(#${id})"/>
    <path d="${pathFrom(pts)}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
  </svg>`;
}

function bigChart(a) {
  const { close, sma50, dates } = a.history;
  const W = 900, H = 320, padL = 8, padR = 128, padT = 16, padB = 26;
  const plotW = (W - padL - padR) * 0.84;
  const projX = W - padR;
  const vals = [...close, ...sma50.filter((v) => v != null), a.target.bullPrice, a.stop.price];
  let min = Math.min(...vals), max = Math.max(...vals);
  const pad = (max - min) * 0.06;
  min -= pad; max += pad;
  const x = (i) => padL + (i / (close.length - 1)) * plotW;
  const y = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  const pricePts = close.map((v, i) => [x(i), y(v)]);
  const smaPts = sma50.map((v, i) => (v == null ? null : [x(i), y(v)])).filter(Boolean);
  const up = close[close.length - 1] >= close[0];
  const col = up ? '#16c784' : '#f0445a';
  const lx = x(close.length - 1), ly = y(a.price);

  const grid = [0.25, 0.5, 0.75].map((f) => {
    const gy = padT + f * (H - padT - padB);
    return `<line x1="${padL}" x2="${projX}" y1="${gy}" y2="${gy}" stroke="var(--grid-line)"/>`;
  }).join('');
  const dateLabels = [0, Math.floor(close.length / 2), close.length - 1].map((i, k) =>
    `<text x="${x(i)}" y="${H - 6}" font-size="11" fill="var(--muted)" text-anchor="${['start', 'middle', 'end'][k]}">${esc(fmtDate(dates[i]))}</text>`).join('');

  const label = (yy, text, color) => `<g><rect x="${projX + 6}" y="${yy - 10}" width="${padR - 10}" height="20" rx="6" fill="${color}" opacity=".14"/><text x="${projX + 12}" y="${yy + 4}" font-size="10.5" font-weight="600" fill="${color}" font-family="var(--mono)">${esc(text)}</text></g>`;
  const yb = y(a.target.basePrice), yu = y(a.target.bullPrice), ys = y(a.stop.price);

  return `<svg class="chart" id="bigChart" viewBox="0 0 ${W} ${H}" data-min="${min}" data-max="${max}" role="img" aria-label="Price chart with projections">
    <defs>
      <linearGradient id="bgArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".25"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient>
      <linearGradient id="cone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff5f3d" stop-opacity=".05"/><stop offset="1" stop-color="#ff5f3d" stop-opacity=".22"/></linearGradient>
    </defs>
    ${grid}
    <rect x="${lx}" y="${padT}" width="${projX - lx}" height="${H - padT - padB}" fill="var(--grid-line)" opacity=".6"/>
    <text x="${(lx + projX) / 2}" y="${padT + 12}" font-size="10" fill="var(--muted)" text-anchor="middle" letter-spacing=".1em">${esc(a.horizon.label.toUpperCase())}</text>
    <path d="${pathFrom(pricePts)}L${lx},${H - padB}L${padL},${H - padB}Z" fill="url(#bgArea)"/>
    <path d="${pathFrom(smaPts)}" fill="none" stroke="#8b5cf6" stroke-width="1.5" stroke-dasharray="4 4" opacity=".85"/>
    <path d="${pathFrom(pricePts)}" fill="none" stroke="${col}" stroke-width="2.2" stroke-linejoin="round"/>
    <polygon points="${lx},${ly} ${projX},${yu} ${projX},${ys}" fill="url(#cone)"/>
    <line x1="${lx}" y1="${ly}" x2="${projX}" y2="${yu}" stroke="#ff2d7a" stroke-width="1.5" stroke-dasharray="5 4"/>
    <line x1="${lx}" y1="${ly}" x2="${projX}" y2="${yb}" stroke="#ff8a3d" stroke-width="2" stroke-dasharray="5 4"/>
    <line x1="${lx}" y1="${ly}" x2="${projX}" y2="${ys}" stroke="#f0445a" stroke-width="1.2" stroke-dasharray="2 4"/>
    <circle cx="${lx}" cy="${ly}" r="4.5" fill="${col}" stroke="var(--bg-2)" stroke-width="2"/>
    ${label(yu, `Bull ${fmtPrice(a.target.bullPrice, a.currency)}`, '#ff2d7a')}
    ${Math.abs(yb - yu) > 18 ? label(yb, `Base ${fmtPrice(a.target.basePrice, a.currency)}`, '#ff8a3d') : ''}
    ${label(ys, `Stop ${fmtPrice(a.stop.price, a.currency)}`, '#f0445a')}
    ${dateLabels}
    <line id="hoverLine" x1="0" x2="0" y1="${padT}" y2="${H - padB}" stroke="var(--muted)" stroke-dasharray="3 3" visibility="hidden"/>
    <circle id="hoverDot" r="4" fill="${col}" stroke="var(--bg-2)" stroke-width="2" visibility="hidden"/>
    <rect id="hoverZone" x="${padL}" y="${padT}" width="${plotW}" height="${H - padT - padB}" fill="transparent"/>
  </svg>`;
}

function wireChartHover(a) {
  const svg = $('#bigChart');
  const zone = $('#hoverZone', svg), line = $('#hoverLine', svg), dot = $('#hoverDot', svg), tip = $('#chartTip');
  const { close, dates } = a.history;
  const hide = () => { line.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  zone.addEventListener('mousemove', (e) => {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const zx = +zone.getAttribute('x'), zw = +zone.getAttribute('width');
    const zy = +zone.getAttribute('y'), zh = +zone.getAttribute('height');
    const i = Math.round(((p.x - zx) / zw) * (close.length - 1));
    if (i < 0 || i >= close.length) return hide();
    const cx = zx + (i / (close.length - 1)) * zw;
    const min = +svg.dataset.min, max = +svg.dataset.max;
    const cy = zy + (1 - (close[i] - min) / (max - min)) * zh;
    line.setAttribute('x1', cx); line.setAttribute('x2', cx); line.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('visibility', 'visible');
    tip.hidden = false;
    tip.textContent = `${fmtDate(dates[i])} · ${fmtPrice(close[i], a.currency)}`;
    tip.style.left = `${e.clientX + 14}px`;
    tip.style.top = `${e.clientY - 34}px`;
  });
  zone.addEventListener('mouseleave', hide);
}

// ---------- Rendering ----------
function renderPulse() {
  const { pulse, fearGreed } = state.data;
  const chips = pulse.map((p) => `
    <div class="pulse-chip"><span class="lbl">${esc(p.label)}</span><span class="val">${fmtPrice(p.price, p.currency)}</span>
    <span class="chg ${cls(p.d1)}">${fmtPct(p.d1, 2)}</span></div>`);
  if (fearGreed) {
    const v = fearGreed.value;
    const col = v >= 75 ? '#16c784' : v >= 55 ? '#8bd346' : v >= 45 ? '#f5a524' : v >= 25 ? '#ff7a3d' : '#f0445a';
    chips.unshift(`<div class="pulse-chip"><span class="fg-dot" style="background:${col};box-shadow:0 0 10px ${col}"></span>
      <span class="lbl">Crypto Fear &amp; Greed</span><span class="val">${v}</span><span class="lbl">${esc(fearGreed.label)}</span></div>`);
  }
  $('#pulse').innerHTML = chips.join('');
}

function renderPicks() {
  const seen = new Set();
  const picks = [];
  for (const a of state.data.assets) {
    if (seen.has(a.category)) continue;
    seen.add(a.category);
    picks.push(a);
    if (picks.length === 4) break;
  }
  $('#picks').innerHTML = picks.map((a, i) => `
    <button class="pick" data-id="${esc(a.id)}">
      <div class="card-head">
        <div class="ident">${avatar(a)}<div>
          <span class="pick-rank">#${i + 1} · ${esc(a.categoryLabel)}</span>
          <h3>${esc(a.name)}</h3>
          <span class="rating ${ratingClass(a.rating)}">${esc(a.rating)}</span>
        </div></div>
        ${ring(a.score)}
      </div>
      <div class="big up">${fmtPct(a.target.basePct, 0)}<small>base · ${esc(a.horizon.label)}</small></div>
      <div class="tags" style="margin-top:10px"><span class="tag setup">${esc(a.setup)}</span><span class="tag ${riskClass(a.risk)}">${esc(a.risk)} risk</span></div>
    </button>`).join('');
}

function renderTabs() {
  const { categories, assets } = state.data;
  const counts = assets.reduce((m, a) => ((m[a.category] = (m[a.category] || 0) + 1), m), {});
  const tabs = [['all', 'All', assets.length], ...Object.entries(categories).map(([k, v]) => [k, v, counts[k] || 0])];
  $('#tabs').innerHTML = tabs.map(([k, label, n]) =>
    `<button class="tab" role="tab" data-cat="${k}" aria-selected="${state.category === k}">${esc(label)}<span class="count">${n}</span></button>`).join('');
}

function filtered() {
  const q = state.q.trim().toLowerCase();
  const list = state.data.assets.filter((a) =>
    (state.category === 'all' || a.category === state.category) &&
    (state.risk === 'all' || a.risk === state.risk) &&
    a.score >= state.minScore &&
    (!q || a.name.toLowerCase().includes(q) || a.symbol.toLowerCase().includes(q)));
  const sorters = {
    score: (a, b) => b.score - a.score,
    upside: (a, b) => b.target.basePct - a.target.basePct,
    rr: (a, b) => b.riskReward - a.riskReward,
    m1: (a, b) => (b.returns.m1 ?? -9) - (a.returns.m1 ?? -9),
    risk: (a, b) => a.vol - b.vol,
  };
  return list.sort(sorters[state.sort]);
}

function card(a, i) {
  const top = a.signals.slice(0, 3);
  return `<article class="card" tabindex="0" data-id="${esc(a.id)}" style="animation-delay:${Math.min(i, 20) * 25}ms">
    <div class="card-head">
      <div class="ident">${avatar(a)}<div>
        <h3>${esc(a.name)}</h3>
        <span class="sym">${esc(displaySymbol(a))} · <span class="rating ${ratingClass(a.rating)}">${esc(a.rating)}</span></span>
      </div></div>
      ${ring(a.score)}
    </div>
    <div class="card-price"><span class="price">${fmtPrice(a.price, a.currency)}</span><span class="chg ${cls(a.returns.d1)}">${fmtPct(a.returns.d1, 2)}</span>
      <span class="chg ${cls(a.returns.m1)}" style="margin-left:auto" title="1-month return">1M ${fmtPct(a.returns.m1)}</span></div>
    ${sparkline(a, i)}
    <div class="tags"><span class="tag setup">${esc(a.setup)}</span><span class="tag ${riskClass(a.risk)}">${esc(a.risk)} risk</span><span class="tag">${esc(a.categoryLabel)}</span></div>
    <div class="targets">
      <div><label>Base</label><b class="up">${fmtPct(a.target.basePct, 0)}</b></div>
      <div><label>Bull</label><b class="up">${fmtPct(a.target.bullPct, 0)}</b></div>
      <div><label>Horizon</label><b>${esc(a.horizon.label)}</b></div>
    </div>
    <ul class="sig-mini">${top.map((s) => `<li class="${s.type}">${esc(s.label)}</li>`).join('')}</ul>
  </article>`;
}

function renderGrid() {
  const list = filtered();
  $('#resultCount').textContent = `${list.length} asset${list.length === 1 ? '' : 's'} · ranked by ${$('#sort').selectedOptions[0].text.replace('Sort: ', '').toLowerCase()}`;
  $('#grid').innerHTML = list.length
    ? list.map(card).join('')
    : `<div class="empty">No assets match these filters. Try lowering the minimum score.</div>`;
}

function renderUpdated() {
  if (!state.data) return;
  const mins = Math.round((Date.now() - state.data.generatedAt) / 60000);
  $('#updated').textContent = `Updated ${mins < 1 ? 'just now' : `${mins} min ago`}`;
}

function renderAll() {
  renderPulse();
  renderPicks();
  renderTabs();
  renderGrid();
  renderUpdated();
}

function renderSkeleton() {
  const sk = Array.from({ length: 9 }, () => `
    <div class="card skeleton">
      <div class="card-head"><div class="ident"><div class="avatar sk"></div><div style="width:140px"><div class="sk" style="height:14px;margin-bottom:8px"></div><div class="sk" style="height:10px;width:70%"></div></div></div><div class="sk" style="width:52px;height:52px;border-radius:50%"></div></div>
      <div class="sk" style="height:22px;width:50%"></div><div class="sk" style="height:54px"></div><div class="sk" style="height:44px"></div>
    </div>`).join('');
  $('#grid').innerHTML = `<div class="loading-msg"><div class="big">Scanning 100+ assets across 7 markets…</div>The first scan pulls fresh data from free public APIs and can take up to a minute.</div>${sk}`;
  $('#picks').innerHTML = Array.from({ length: 4 }, () => '<div class="pick sk" style="height:170px"></div>').join('');
}

// ---------- Modal ----------
function openModal(id) {
  const a = state.data.assets.find((x) => x.id === id);
  if (!a) return;
  const r = a.returns;
  const stats = [
    ['1 week', fmtPct(r.w1), cls(r.w1)], ['1 month', fmtPct(r.m1), cls(r.m1)], ['3 months', fmtPct(r.m3), cls(r.m3)],
    ['6 months', fmtPct(r.m6), cls(r.m6)], ['1 year', fmtPct(r.y1), cls(r.y1)],
    ...(r.y3cagr != null ? [['3Y CAGR', fmtPct(r.y3cagr), cls(r.y3cagr)]] : []),
    ['RSI (14)', a.rsi != null ? a.rsi.toFixed(1) : '—', ''], ['Volatility (ann.)', fmtPct(a.vol, 0, false), ''],
    ['52W high', fmtPrice(a.high52, a.currency), ''], ['52W low', fmtPrice(a.low52, a.currency), ''],
    ['Reward / risk', `${a.riskReward.toFixed(2)}×`, a.riskReward >= 1.5 ? 'up' : ''],
    ...(a.marketCapRank ? [['Market-cap rank', `#${a.marketCapRank}`, '']] : []),
    ...(a.extra?.schemeCategory ? [['Fund category', a.extra.schemeCategory, '']] : []),
  ];

  $('#modalBody').innerHTML = `
    <div class="m-head">
      <div class="m-title">${avatar(a)}<div>
        <h2>${esc(a.name)}</h2>
        <span class="sym">${esc(displaySymbol(a))} · ${esc(a.exchange || '')} · ${esc(a.categoryLabel)}</span>
      </div></div>
      <div class="m-head-right">
        <div style="text-align:right"><div class="rating ${ratingClass(a.rating)}" style="font-size:.85rem">${esc(a.rating)}</div><div class="sym">Explosion score</div></div>
        ${ring(a.score, true)}
        <button class="icon-btn close-btn" id="closeModal" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
    </div>
    <div class="m-price"><span class="price">${fmtPrice(a.price, a.currency)}</span><span class="chg ${cls(r.d1)}">${fmtPct(r.d1, 2)} today</span>
      <span class="tags"><span class="tag setup">${esc(a.setup)}</span><span class="tag ${riskClass(a.risk)}">${esc(a.risk)} risk</span></span></div>
    <div class="chart-wrap">${bigChart(a)}
      <div class="chart-legend"><span><i style="background:${r.y1 >= 0 ? '#16c784' : '#f0445a'}"></i>Price (1Y)</span><span><i style="background:#8b5cf6"></i>50-day MA</span><span><i style="background:#ff8a3d"></i>Base target</span><span><i style="background:#ff2d7a"></i>Bull target</span><span><i style="background:#f0445a"></i>Stop / invalidation</span></div>
    </div>

    <div class="m-section"><h4>Projection</h4>
      <div class="proj">
        <div class="hl"><label>Base target</label><b class="up">${fmtPrice(a.target.basePrice, a.currency)}</b><small>${fmtPct(a.target.basePct)}</small></div>
        <div><label>Bull target</label><b class="up">${fmtPrice(a.target.bullPrice, a.currency)}</b><small>${fmtPct(a.target.bullPct)}</small></div>
        <div><label>Stop / invalidation</label><b class="down">${fmtPrice(a.stop.price, a.currency)}</b><small>${fmtPct(-a.stop.pct)}</small></div>
        <div><label>Time horizon</label><b>${esc(a.horizon.label)}</b><small>${esc(a.setup)} setup</small></div>
      </div>
    </div>

    <div class="m-section"><h4>Investment thesis</h4><p class="thesis">${esc(a.thesis)}</p></div>

    <div class="m-section"><h4>Signals (${a.signals.length})</h4>
      <ul class="signals">${a.signals.map((s) => `<li class="${s.type}"><span class="pts">${s.points > 0 ? '+' : ''}${s.points}</span><div><b>${esc(s.label)}</b><span>${esc(s.detail)}</span></div></li>`).join('')}</ul>
    </div>

    <div class="m-section"><h4>Key stats</h4>
      <div class="stats">${stats.map(([l, v, c]) => `<div><label>${esc(l)}</label><b class="${c}">${esc(v)}</b></div>`).join('')}</div>
    </div>

    <p class="m-foot">Source: ${esc(a.source)}. Targets are volatility-scaled projections weighted by signal conviction — not price guarantees. Not financial advice.</p>`;

  const modal = $('#modal');
  modal.showModal();
  $('#modalBody').scrollTop = 0;
  $('#closeModal').addEventListener('click', () => modal.close());
  wireChartHover(a);
}

// ---------- Data ----------
async function load(refresh = false) {
  const btn = $('#refreshBtn');
  btn.classList.add('spinning');
  btn.disabled = true;
  if (!state.data) renderSkeleton();
  try {
    const res = await fetch(`/api/recommendations${refresh ? '?refresh=1' : ''}`);
    if (!res.ok) throw new Error(`Server responded ${res.status}`);
    state.data = await res.json();
    renderAll();
  } catch (e) {
    if (!state.data) {
      $('#grid').innerHTML = `<div class="empty">Couldn't load market data (${esc(e.message)}).<br><button class="btn" id="retryBtn">Try again</button></div>`;
      $('#picks').innerHTML = '';
      $('#retryBtn').addEventListener('click', () => load());
    }
  } finally {
    btn.classList.remove('spinning');
    btn.disabled = false;
  }
}

// ---------- Events ----------
$('#themeBtn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch { /* storage disabled */ }
});
$('#refreshBtn').addEventListener('click', () => load(true));
$('#tabs').addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (!t) return;
  state.category = t.dataset.cat;
  renderTabs();
  renderGrid();
});
$('#search').addEventListener('input', (e) => { state.q = e.target.value; renderGrid(); });
$('#sort').addEventListener('change', (e) => { state.sort = e.target.value; renderGrid(); });
$('#risk').addEventListener('change', (e) => { state.risk = e.target.value; renderGrid(); });
$('#minScore').addEventListener('input', (e) => {
  state.minScore = Number(e.target.value);
  $('#minScoreVal').textContent = state.minScore;
  renderGrid();
});
for (const sel of ['#grid', '#picks']) {
  $(sel).addEventListener('click', (e) => {
    const el = e.target.closest('[data-id]');
    if (el) openModal(el.dataset.id);
  });
}
$('#grid').addEventListener('keydown', (e) => {
  const el = e.target.closest('.card[data-id]');
  if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openModal(el.dataset.id); }
});
$('#modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });
$('#modal').addEventListener('close', () => { $('#chartTip').hidden = true; });

setInterval(renderUpdated, 60000);
load();
