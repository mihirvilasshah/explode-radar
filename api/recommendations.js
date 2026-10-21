import { getReport } from '../src/report.js';

export default async function handler(req, res) {
  const refresh = new URL(req.url, 'http://localhost').searchParams.get('refresh') === '1';
  try {
    const data = await getReport(refresh);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Vercel's CDN caches the report so the free upstream APIs are hit at most once per window
    res.setHeader('Cache-Control', refresh ? 'public, s-maxage=120' : 'public, s-maxage=1800, stale-while-revalidate=3600');
    res.statusCode = 200;
    res.end(JSON.stringify(data));
  } catch (e) {
    console.error(e);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'Failed to fetch market data' }));
  }
}
