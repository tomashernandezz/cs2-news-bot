const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const Parser = require('rss-parser');

const app = express();
const rssParser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'cs2-news-bot/1.0', Accept: 'application/rss+xml, */*' },
});

app.use(cors());
app.use(express.json());

// --- sources -----------------------------------------------------------

const RSS_FEEDS = [
  { url: 'https://store.steampowered.com/feeds/news/app/730/', source: 'Steam' },
];

// Reddit JSON API and Steam Web API (no key required, Node 18 fetch)
async function fetchReddit(subreddit) {
  const url = `https://www.reddit.com/r/${subreddit}/new.json?limit=25`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'cs2-news-bot/1.0 (news aggregator)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.data.children.map(({ data: d }) => ({
    id: d.id,
    title: d.title,
    link: `https://www.reddit.com${d.permalink}`,
    pubDate: new Date(d.created_utc * 1000).toISOString(),
    contentSnippet: d.selftext ? d.selftext.slice(0, 300) : '',
    source: `r/${subreddit}`,
  }));
}

async function fetchSteamAPI() {
  const url =
    'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=730&count=20&format=json';
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.appnews.newsitems.map((n) => ({
    id: String(n.gid),
    title: n.title,
    link: n.url,
    pubDate: new Date(n.date * 1000).toISOString(),
    contentSnippet: n.contents ? n.contents.replace(/\[.*?\]/g, '').slice(0, 300) : '',
    source: 'Steam API',
  }));
}

// --- keyword filter ----------------------------------------------------

const KEYWORDS = [
  'case', 'collection', 'operation', 'capsule', 'update', 'release',
  'sticker', 'souvenir', 'agent', 'patch', 'event', 'music kit',
  'graffiti', 'new',
];

function matchesKeyword(item) {
  const text = `${item.title || ''} ${item.contentSnippet || ''}`.toLowerCase();
  return KEYWORDS.some((kw) => text.includes(kw));
}

// --- cache -------------------------------------------------------------

const MAX_ITEMS = 100;
let cachedNews = [];
let lastFetch = null;

// --- scraper -----------------------------------------------------------

async function fetchRSSFeed(feed) {
  try {
    const result = await rssParser.parseURL(feed.url);
    return result.items.map((item) => ({
      id: item.guid || item.id || item.link,
      title: item.title,
      link: item.link,
      pubDate: item.pubDate || item.isoDate,
      contentSnippet: item.contentSnippet || '',
      source: feed.source,
    }));
  } catch (err) {
    console.error(`[feed error] ${feed.source}: ${err.message}`);
    return [];
  }
}

async function fetchCustomSource(name, fetcher) {
  try {
    return await fetcher();
  } catch (err) {
    console.error(`[feed error] ${name}: ${err.message}`);
    return [];
  }
}

async function scrapeAll() {
  console.log('[scraper] fetching all sources...');

  const [rssResults, steamItems, cs2Items, goItems] = await Promise.all([
    Promise.all(RSS_FEEDS.map(fetchRSSFeed)),
    fetchCustomSource('Steam API', fetchSteamAPI),
    fetchCustomSource('r/cs2', () => fetchReddit('cs2')),
    fetchCustomSource('r/GlobalOffensive', () => fetchReddit('GlobalOffensive')),
  ]);

  const fresh = [...rssResults.flat(), ...steamItems, ...cs2Items, ...goItems].filter(
    matchesKeyword,
  );

  const existingIds = new Set(cachedNews.map((n) => n.id));
  const newItems = fresh.filter((item) => item.id && !existingIds.has(item.id));

  cachedNews = [...newItems, ...cachedNews].slice(0, MAX_ITEMS);
  lastFetch = new Date().toISOString();

  console.log(`[scraper] done — ${newItems.length} new, ${cachedNews.length} cached`);
}

// --- routes ------------------------------------------------------------

// GET /news?limit=20&keyword=case
app.get('/news', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, MAX_ITEMS);
  const keyword = (req.query.keyword || '').toLowerCase();

  let items = cachedNews;
  if (keyword) {
    items = items.filter(
      (n) =>
        (n.title || '').toLowerCase().includes(keyword) ||
        (n.contentSnippet || '').toLowerCase().includes(keyword),
    );
  }

  res.json({ total: items.length, items: items.slice(0, limit) });
});

// GET /health
app.get('/health', (_req, res) => {
  res.json({ ok: true, lastFetch, cached: cachedNews.length });
});

// --- start -------------------------------------------------------------

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`[server] running on port ${PORT}`);
  await scrapeAll();
});

cron.schedule('*/30 * * * *', scrapeAll);
