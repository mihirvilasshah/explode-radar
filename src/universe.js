// Assets scanned by the radar. Symbols are Yahoo Finance tickers unless noted.

export const CATEGORIES = {
  'us-stock': { label: 'US Stocks', benchmark: 'SPY', benchmarkName: 'S&P 500' },
  'us-etf': { label: 'US ETFs', benchmark: 'SPY', benchmarkName: 'S&P 500' },
  'in-stock': { label: 'Indian Stocks', benchmark: '^NSEI', benchmarkName: 'Nifty 50' },
  'in-etf': { label: 'Indian ETFs', benchmark: '^NSEI', benchmarkName: 'Nifty 50' },
  'in-mf': { label: 'Mutual Funds', benchmark: '^NSEI', benchmarkName: 'Nifty 50' },
  crypto: { label: 'Crypto', benchmark: 'BTC-USD', benchmarkName: 'Bitcoin' },
  commodity: { label: 'Commodities', benchmark: 'SPY', benchmarkName: 'S&P 500' },
};

export const UNIVERSE = [
  // US stocks
  ...[
    ['NVDA', 'NVIDIA'], ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['AMZN', 'Amazon'],
    ['GOOGL', 'Alphabet'], ['META', 'Meta Platforms'], ['TSLA', 'Tesla'], ['AMD', 'AMD'],
    ['AVGO', 'Broadcom'], ['PLTR', 'Palantir'], ['CRWD', 'CrowdStrike'], ['NFLX', 'Netflix'],
    ['COIN', 'Coinbase'], ['MU', 'Micron'], ['UBER', 'Uber'], ['SHOP', 'Shopify'],
    ['ARM', 'Arm Holdings'], ['LLY', 'Eli Lilly'], ['JPM', 'JPMorgan Chase'], ['HOOD', 'Robinhood'],
    ['SOFI', 'SoFi Technologies'], ['RKLB', 'Rocket Lab'], ['ANET', 'Arista Networks'], ['CEG', 'Constellation Energy'],
  ].map(([symbol, name]) => ({ symbol, name, category: 'us-stock' })),

  // US ETFs
  ...[
    ['QQQ', 'Invesco QQQ (Nasdaq 100)'], ['SPY', 'SPDR S&P 500'], ['SMH', 'VanEck Semiconductor'],
    ['ARKK', 'ARK Innovation'], ['IWM', 'iShares Russell 2000'], ['XLE', 'Energy Select SPDR'],
    ['XLF', 'Financial Select SPDR'], ['TAN', 'Invesco Solar'], ['URA', 'Global X Uranium'],
    ['IBIT', 'iShares Bitcoin Trust'], ['XBI', 'SPDR S&P Biotech'], ['ITA', 'iShares Aerospace & Defense'],
  ].map(([symbol, name]) => ({ symbol, name, category: 'us-etf' })),

  // Indian stocks (NSE)
  ...[
    ['RELIANCE.NS', 'Reliance Industries'], ['TCS.NS', 'Tata Consultancy Services'], ['HDFCBANK.NS', 'HDFC Bank'],
    ['INFY.NS', 'Infosys'], ['ICICIBANK.NS', 'ICICI Bank'], ['BHARTIARTL.NS', 'Bharti Airtel'],
    ['SBIN.NS', 'State Bank of India'], ['LT.NS', 'Larsen & Toubro'], ['BAJFINANCE.NS', 'Bajaj Finance'],
    ['HAL.NS', 'Hindustan Aeronautics'], ['BEL.NS', 'Bharat Electronics'], ['ETERNAL.NS', 'Eternal (Zomato)'],
    ['TRENT.NS', 'Trent'], ['DIXON.NS', 'Dixon Technologies'], ['POLYCAB.NS', 'Polycab India'],
    ['IRFC.NS', 'Indian Railway Finance Corp'], ['SUZLON.NS', 'Suzlon Energy'], ['TATAPOWER.NS', 'Tata Power'],
    ['MARUTI.NS', 'Maruti Suzuki'], ['SUNPHARMA.NS', 'Sun Pharma'], ['ADANIENT.NS', 'Adani Enterprises'],
    ['PERSISTENT.NS', 'Persistent Systems'], ['MAZDOCK.NS', 'Mazagon Dock Shipbuilders'], ['BSE.NS', 'BSE Ltd'],
  ].map(([symbol, name]) => ({ symbol, name, category: 'in-stock' })),

  // Indian ETFs (NSE)
  ...[
    ['NIFTYBEES.NS', 'Nippon India Nifty 50 BeES'], ['BANKBEES.NS', 'Nippon India Bank BeES'],
    ['JUNIORBEES.NS', 'Nippon India Nifty Next 50 BeES'], ['ITBEES.NS', 'Nippon India IT BeES'],
    ['GOLDBEES.NS', 'Nippon India Gold BeES'], ['SILVERBEES.NS', 'Nippon India Silver BeES'],
    ['MON100.NS', 'Motilal Oswal Nasdaq 100 ETF'], ['CPSEETF.NS', 'CPSE ETF'],
  ].map(([symbol, name]) => ({ symbol, name, category: 'in-etf' })),

  // Indian mutual funds (AMFI scheme codes via mfapi.in; Direct Growth plans)
  ...[
    [122639, 'Parag Parikh Flexi Cap'], [118778, 'Nippon India Small Cap'], [125497, 'SBI Small Cap'],
    [120828, 'Quant Small Cap'], [118989, 'HDFC Mid Cap'], [127042, 'Motilal Oswal Midcap'],
    [120586, 'ICICI Prudential Large Cap'], [120503, 'Axis ELSS Tax Saver'], [120716, 'UTI Nifty 50 Index'],
    [119775, 'Kotak Mid Cap'], [118955, 'HDFC Flexi Cap'], [119835, 'SBI Contra'],
    [120505, 'Axis Midcap'], [125354, 'Axis Small Cap'],
  ].map(([mfCode, name]) => ({ symbol: String(mfCode), name, category: 'in-mf', mfCode })),

  // Crypto (Yahoo price history + CoinGecko metadata)
  ...[
    ['BTC-USD', 'Bitcoin', 'bitcoin'], ['ETH-USD', 'Ethereum', 'ethereum'], ['SOL-USD', 'Solana', 'solana'],
    ['BNB-USD', 'BNB', 'binancecoin'], ['XRP-USD', 'XRP', 'ripple'], ['ADA-USD', 'Cardano', 'cardano'],
    ['AVAX-USD', 'Avalanche', 'avalanche-2'], ['DOGE-USD', 'Dogecoin', 'dogecoin'], ['LINK-USD', 'Chainlink', 'chainlink'],
    ['DOT-USD', 'Polkadot', 'polkadot'], ['LTC-USD', 'Litecoin', 'litecoin'], ['TRX-USD', 'TRON', 'tron'],
    ['NEAR-USD', 'NEAR Protocol', 'near'], ['ATOM-USD', 'Cosmos', 'cosmos'], ['XLM-USD', 'Stellar', 'stellar'],
    ['HBAR-USD', 'Hedera', 'hedera-hashgraph'],
  ].map(([symbol, name, geckoId]) => ({ symbol, name, category: 'crypto', geckoId })),

  // Commodities (futures)
  ...[
    ['GC=F', 'Gold'], ['SI=F', 'Silver'], ['CL=F', 'Crude Oil (WTI)'], ['NG=F', 'Natural Gas'],
    ['HG=F', 'Copper'], ['PL=F', 'Platinum'], ['ZC=F', 'Corn'], ['ZW=F', 'Wheat'],
  ].map(([symbol, name]) => ({ symbol, name, category: 'commodity' })),
];

export const PULSE = [
  { symbol: 'SPY', label: 'S&P 500' },
  { symbol: '^NSEI', label: 'Nifty 50' },
  { symbol: 'BTC-USD', label: 'Bitcoin' },
  { symbol: 'GC=F', label: 'Gold' },
];
