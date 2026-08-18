# Website form connection

Before deployment, copy `.env.example` to `.env` and fill in the production values you want to use for the website and Apps Script deployment.

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
7. Authorize the requested spreadsheet and email-sending access, then deploy. Confirmation emails are sent by the Google account that owns the deployment, using **Jackrabbit Punkin Publishing LLC** as the display name.
8. Copy the web-app URL ending in `/exec`.

The `/exec` URL is required for the final website activation and submission tests. Do not use the `/dev` test URL.

For the public website forms, deploy the web app with access that allows public submissions.

For the admin dashboard, create a separate deployment of the same Apps Script project and use an access setting that requires a Google account. Put that deployment URL into `GOOGLE_APPS_SCRIPT_ADMIN_URL`, or leave it blank to use `?action=admin` on the main endpoint if your deployment already requires sign-in.

## Variable mapping

Use the filled `.env` values as the source of truth when updating `google-apps-script/Code.gs` and the live website integration:

- `SITE_URL` maps to the `SITE_URL` constant.
- `GOOGLE_SPREADSHEET_ID` maps to the `GOOGLE_SPREADSHEET_ID` Script Property.
- `ADMIN_NOTIFICATION_EMAIL` maps to the `ADMIN_NOTIFICATION_EMAIL` Script Property.
- `GOOGLE_APPS_SENDER_NAME` maps to the `GOOGLE_APPS_SENDER_NAME` Script Property.
- `GOOGLE_APPS_SCRIPT_WEB_APP_URL` is the deployed `/exec` endpoint the website should submit to.
- `GOOGLE_APPS_SCRIPT_ADMIN_URL` is the admin dashboard URL linked from the footer.
- `ADMIN_ALLOWED_EMAILS` maps to the `ADMIN_ALLOWED_EMAILS` Script Property.
- `UNSUBSCRIBE_SECRET` should be stored in Apps Script Script Properties as `UNSUBSCRIBE_SECRET`.

Do not expose `UNSUBSCRIBE_SECRET` in frontend code or commit a filled `.env` file.

After updating `.env`, run `npm run prepare:config` or `npm run dev` so the public site picks up the current form and admin URLs.

## Confirmation emails

Every accepted submission is saved to its own spreadsheet tab and generates:

- A branded administrative notification to `Publisher@JackrabbitPunkinPublishing.com`, with the submitter set as the reply-to address.
- A branded, form-specific confirmation to the submitter.
- A plain-text fallback for email clients that do not render HTML.

The templates cover Contact, Newsletter, Speaking Requests, Book Club Requests, and Book Notifications. If Google temporarily rejects an email or the Apps Script mail quota is exhausted, the spreadsheet submission is still retained and the endpoint reports `emailSent: false`.

Newsletter confirmations also include a signed unsubscribe link. When used, it updates every matching row in the **Newsletter** tab by clearing Consent, setting Status to **Unsubscribed**, and recording the date in Notes. The link cannot be altered to unsubscribe a different address without the script’s private signing secret.

After changing `Code.gs` or `appsscript.json`, update the deployed web app by choosing **Deploy → Manage deployments → Edit → New version → Deploy**. Google may ask you to approve the new email permission the first time.

Submit one test from each website form after deployment and verify both the matching spreadsheet tab and the two expected emails. Check spam or promotions folders during the first tests.
