# n8n-nodes-recentreborn

Community node for [RecentReborn](https://recentreborn.com), a chronological search engine for Instagram, TikTok, and YouTube. Search recent posts by hashtag, query, or location, or trigger a workflow the moment a new one appears.

This package includes two nodes:

- **RecentReborn** — an action node with four operations: Search Hashtag (Instagram), Search Query (TikTok/YouTube), Search Location (Instagram), and Look Up Locations (Instagram, to find a `location_id`).
- **RecentReborn Trigger** — a polling trigger that watches a hashtag, query, or location and emits each new post once, in the order it happened.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run locally with hot reload (this uses the built-in n8n instance from `@n8n/node-cli`, no global n8n install needed):
   ```bash
   npm run dev
   ```
3. In the n8n editor, add a **RecentReborn API** credential. Get your API key from **API Key** in the RecentReborn dashboard, and paste it in (it's sent as `Authorization: Bearer <key>`, so no need to type "Bearer" yourself).
4. Add the **RecentReborn** or **RecentReborn Trigger** node to a workflow and pick your credential.

## Notes on the API this wraps

- **Base URL**: `https://app.recentreborn.com/api/v1`
- **Auth**: bearer token, one live key per account, no separate sandbox key. Calls through this node count against your normal daily search quota, same as dashboard searches.
- **Rate limit**: 20 requests/minute per key, on top of your daily quota. If you're running the trigger on a tight interval across several watched hashtags, keep an eye on `X-RateLimit-Remaining` (returned on every response) so you don't get a `429`.
- **Pagination**: the action node's "Return All" option follows `next_pagination_token` until the API stops returning one. Leave it off and set a "Limit" if you only want the first page or two.
- **Location search is Instagram-only.** Use "Look Up Locations" first to turn a place name into a numeric `location_id`, then feed that into "Search Location" or the trigger.
- **`upload_date` only applies to YouTube** queries, and the API defaults it to `hour` if you don't set it, which is usually too narrow for a scheduled job. Both nodes default it to `today` instead.

## How the trigger avoids duplicates

RecentReborn returns posts newest-first. On each poll, the trigger node remembers the `posted_at` of the newest post it has already emitted (stored in the node's static workflow data) and only emits posts newer than that, oldest-first. On the very first poll it doesn't emit anything (there's no "last seen" yet, so everything would look new) except when you're manually testing the node in the editor, so you can see a real result shape immediately.

This means: don't run two separate workflows watching the *same* hashtag/query/location with the same credential unless you're fine with each one independently tracking its own "last seen" post.

## Ideas for what to build with this

- Poll a niche hashtag with the trigger, and drop each new post into a Google Sheet, Airtable base, or CRM as a lead/prospect list.
- Chain **Look Up Locations → Search Location** to monitor a city or neighborhood for real-time posts (events, local business mentions, etc.).
- Pair the trigger with an AI node (e.g. an LLM step) to auto-draft a comment or DM for each new post, then hold for manual approval before sending.
- Use the action node's `hashtags`, `caption`, and `author` fields as input to a scoring step, then only route "good fit" authors onward.

## Limitations to flag to users

- This node calls the public RecentReborn API as documented; it does not expose Discovered Profiles (fetch/export), since those aren't part of the public API today.
- All error handling assumes the standard RecentReborn error shape (`{ "error": { "code", "message" } }`) for `400`, `401`, `403`, `429`, `500`, and `503`.
# RecentReborn-n8n
