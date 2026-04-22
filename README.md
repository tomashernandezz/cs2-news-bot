# cs2-news-bot

REST API that scrapes CS2 news (cases, collections, operations, events) from RSS feeds every 30 minutes.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/news` | Returns cached news. Query params: `?limit=20` `?keyword=case` |
| GET | `/health` | Returns `{ ok, lastFetch, cached }` |

## Local development

```bash
npm install
npm start
# Server listens on http://localhost:3000
```

## Deploy on Render (Free tier)

1. Push this repo to GitHub.
2. Go to [render.com](https://render.com) → **New** → **Web Service**.
3. Connect your GitHub repository.
4. Fill in the fields:
   - **Name:** `cs2-news-bot` (or anything you like)
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
5. Click **Create Web Service**. Render will deploy automatically on every push to `main`.

### Prevent the free tier from sleeping (UptimeRobot)

Render's free tier spins down after 15 minutes of inactivity. To keep it alive:

1. Create a free account at [uptimerobot.com](https://uptimerobot.com).
2. Add a new **HTTP(s)** monitor pointing to `https://<your-render-url>/health`.
3. Set the check interval to **5 minutes**.

That's it — UptimeRobot will ping your service before Render shuts it down.

## RSS sources

| Source | URL |
|--------|-----|
| counter-strike.net | `https://www.counter-strike.net/news/rss` |
| SteamDB | `https://steamdb.info/app/730/patchnotes/rss/` |
| r/GlobalOffensive | `https://www.reddit.com/r/GlobalOffensive/new.rss` |
| r/cs2 | `https://www.reddit.com/r/cs2/new.rss` |
