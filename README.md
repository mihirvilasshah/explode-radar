# Explode Radar

Multi-asset breakout scanner covering Indian & US stocks/ETFs, Indian mutual funds, crypto and commodities. For each asset it gives a score, the setup type, an investment thesis, base and bull targets, a stop level and a time horizon.

## Run

Requires Node.js 18+. No dependencies to install.

```bash
node server.js
# open http://localhost:3000
```

Set `PORT` to change the port. Data is cached for 30 minutes; the refresh button forces a rescan (throttled to once every 2 minutes).

## Free data sources

| Source | Used for |
| --- | --- |
| Yahoo Finance chart API | US/Indian stocks & ETFs, crypto, commodity futures (2Y daily OHLCV) |
| mfapi.in (AMFI) | Indian mutual fund NAV history |
| CoinGecko | Crypto logos, market-cap rank, all-time-high distance, trending coins |
| Alternative.me | Crypto Fear & Greed index |
| Google News RSS, Yahoo Finance RSS, Economic Times RSS, CNBC RSS, CoinDesk RSS | Headlines for the news section (no API keys) |

## News & impact

The home page shows a market-news strip, and every asset modal has a "News & impact" section. Headlines are scored with a transparent keyword lexicon (earnings beats, upgrades, record highs, downgrades, probes, rate hikes, hacks, etc.) in [src/news.js](src/news.js) and tagged Bullish, Bearish or Neutral. Each headline lists the assets it affects, found by name, ticker and theme (e.g. "crude" → WTI and the Energy ETF); click a chip to open that asset. Funds and ETFs with few direct headlines also show news on the market they track. News is cached for 15 minutes and served from `/api/news` (`?id=<asset id>` for a single asset). The impact label is a heuristic, not a prediction.

## How scoring works

Each asset gets points from a set of technical signals: trend structure (50/200-DMA), golden and death crosses, RSI, MACD crossovers, volume surges and accumulation, Bollinger squeezes, how close it is to its 52-week high, 3-month performance against a benchmark (S&P 500, Nifty 50 or BTC), and 3-year CAGR for mutual funds. The points are passed through a logistic curve to give a score from 1 to 99.

Targets scale with volatility: `σ × √(horizon)`, weighted by conviction. Mutual fund targets use the fund's trailing CAGR instead.

Edit [src/universe.js](src/universe.js) to add or remove assets.

> Not financial advice. Outputs are algorithmic estimates from historical data.
