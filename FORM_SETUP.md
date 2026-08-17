# Website form connection

The destination spreadsheet is already prepared with these tabs:

- Contact
- Newsletter
- Speaking Requests
- Book Club Requests
- Book Notifications

## Deploy the endpoint

1. Open **JackRabbit Publishing Contacts** in Google Sheets.
2. Choose **Extensions → Apps Script**.
3. Replace the default `Code.gs` contents with `google-apps-script/Code.gs` from this repository.
4. In Apps Script project settings, enable the manifest file and replace it with `google-apps-script/appsscript.json`.
5. Choose **Deploy → New deployment → Web app**.
6. Set **Execute as** to **Me** and **Who has access** to **Anyone**.
7. Authorize the requested spreadsheet access and deploy.
8. Copy the web-app URL ending in `/exec`.

The `/exec` URL is required for the final website activation and submission tests. Do not use the `/dev` test URL.
