# Archived Cloudflare Worker setup

This directory is an unused/archived option. Use the active Worker in `worker/` and follow [`worker/LIVE-STATUS-SETUP.md`](../../worker/LIVE-STATUS-SETUP.md) instead.

The static site reads the Worker URL configured in `index.html`. A Cloudflare
Worker checks Aparat's public live-status endpoint and caches the result for
30 seconds. The page refreshes the status every 60 seconds and reports an
unavailable status as unknown, never as offline. This uses Cloudflare's
`workers.dev` URL and does not require changing the site's DNS.

## Deploy the Worker

1. Install Node.js, open PowerShell in this folder, and run:

   ```powershell
   npx wrangler login
   npx wrangler deploy
   ```

2. Wrangler prints a URL in the form
   `https://uniquetaha-live-status.<your-account>.workers.dev`. Open that URL
   with `/live-status` appended and confirm it returns JSON with
   `"status":"live"` or `"status":"offline"`.
3. In `index.html`, replace `YOUR_ACCOUNT` in `LIVE_STATUS_ENDPOINT` with the
   exact account subdomain Wrangler printed. Publish the updated static site.
4. Reload `https://uniquetaha.ir/`. Its live indicator checks immediately,
   then refreshes every minute while the page is visible.

The Worker only returns the live state and check time; it does not expose the
stream title or other channel data. Aparat's status endpoint is public but
undocumented, so an Aparat API change may require updating the Worker.
