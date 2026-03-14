# Gov Assist Browser Extension

This extension autofills official government form pages using context sent from the Gov Assist web app.

## 1) Load Extension (Chrome)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `browser-extension` folder
5. After any extension code change, click **Reload** for this extension

## 2) Use Flow

1. Preferred flow: in Gov Assist web app (`localhost:5173`), click **Apply Scheme**
2. App sends profile + extracted document data to extension context
3. Official scheme portal opens in new tab
4. Extension injects **Auto Fill Scheme Form** (bottom-right)
5. Click the button (or popup **Fill Current Page**) to crawl fields, map values, fill inputs, and upload matching docs
6. If Apply was not clicked, popup **Fill Current Page** can auto-bootstrap using saved app login token + backend data
7. If needed, click **Sync Context From App** to refresh context manually

## Troubleshooting

- If popup shows `Unknown message type`, reload extension from `chrome://extensions` and try again.
- Keep Gov Assist app tab open while clicking **Sync Context From App**.
- If Apply was not clicked, keep Gov Assist logged in so extension can bootstrap from backend.

## 3) Safety

- Captcha solving is not bypassed
- Authentication bypass is not attempted
- Final submit stays user controlled

## 4) What It Produces

- Structured field schema from current page
- Action list (`fill_input`, `select_dropdown`, `upload_file`, `click_next`)
- Missing required fields/documents list
- Review-before-submit marker
## 5) Notes

- Extension currently matches:
  - `*.gov.in`, `*.nic.in`, `*.gov`, `*.ac.in`
  - `maandhan.in` and `*.maandhan.in`
  - local app hosts (`localhost:5173`, `127.0.0.1:5173`)
