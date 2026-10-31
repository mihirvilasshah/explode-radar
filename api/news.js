import { getNews } from '../src/news.js';

export default async function handler(req, res) {
  const id = new URL(req.url, 'http://localhost').searchParams.get('id') || '';
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const data = await getNews(id);
    // Vercel's CDN caches news so the free feeds are hit at most once per window
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=1800');
    res.statusCode = 200;
    res.end(JSON.stringify(data));
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = e.status === 404 ? 404 : 502;
    res.end(JSON.stringify({ error: e.status === 404 ? 'Unknown asset' : 'Failed to fetch news' }));
  }
}
