# راه‌اندازی Cloudflare Worker وضعیت لایو

این پروژه عمداً تخت است: `wrangler.toml`، `live-status-worker.js` و سایر فایل‌های سایت همگی در پوشهٔ اصلی قرار دارند. نیازی به ساخت پوشهٔ `worker` نیست.

## استقرار

1. Node.js را نصب کنید و PowerShell را در همین پوشه باز کنید.
2. اجرا کنید:

   ```powershell
   npx.cmd wrangler login
   npx.cmd wrangler deploy --config .\wrangler.toml
   ```

3. Wrangler نشانی Worker را چاپ می‌کند. مسیر `/live-status` را به آن اضافه کنید و پاسخ JSON را بررسی کنید. وضعیت معتبر `live` یا `offline` است؛ اگر Worker به آپارات نرسد، پاسخ `unknown` خواهد بود.
4. `index.html` در حال حاضر از این endpoint استفاده می‌کند:
   `https://uniquetaha-live-status.tahakazrwny.workers.dev/live-status`
   اگر نشانی چاپ‌شده با این نشانی تفاوت داشت، مقدار `LIVE_STATUS_API` را در `index.html` اصلاح و سایت را دوباره منتشر کنید.

## عیب‌یابی

- پاسخ 404 معمولاً به مسیر نادرست یا استقرار نشدن Worker اشاره دارد.
- اگر پاسخ `unknown` یا HTTP 502 بود، لاگ Worker و دسترسی آن به API آپارات را بررسی کنید.
- سایت از API مستقیم مرورگر و سپس `live-status.json` تازه نیز استفاده می‌کند. فایل JSON بیش از ۴۵ دقیقه قدیمی پذیرفته نمی‌شود.
- این Worker نیازی به توکن GitHub، پایگاه داده یا KV ندارد.
