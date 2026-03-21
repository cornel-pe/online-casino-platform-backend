# Email templates

HTML templates match the Bet366 site style:

- **Background:** `#030E14`
- **Card/alt background:** `#04141C`
- **Text:** `#ededed`
- **Primary (buttons, links):** `#FFE81A`

## Verification email (`verification-email.html`)

Used when a new user signs up or requests a new verification link.

### Using with EmailJS

1. In [EmailJS](https://www.emailjs.com/) go to **Email Templates** and create a new template (or edit the one whose ID you set in `EMAILJS_VERIFICATION_TEMPLATE_ID`).
2. Set **To Email** to: `{{to_email}}`
3. Set **Subject** to something like: `Verify your email – {{app_name}}`
4. For **Content**, choose **HTML** and paste the contents of `verification-email.html`.
5. Ensure these variables exist in the template (they are already in the HTML):
   - `{{app_name}}` – e.g. Bet366
   - `{{verification_link}}` – full URL with token (or use `{{confirmation_link}}` / `{{confirmation_url}}`, same value)
   - `{{current_year}}` – e.g. 2025

Backend sends: `to_email`, `app_name`, `verification_link`, `confirmation_url`, `confirmation_link`, `current_year`, `frontend_url` (used for Geogrotesque font URL).

**Font:** The template uses **Geogrotesque Wide** (same as the site), loaded from `{{frontend_url}}/assets/fonts/`. Clients that don’t support web fonts fall back to Arial.

---

## Troubleshooting: not receiving emails

1. **Backend startup**  
   When the server starts, check the console:
   - **`✅ EmailJS ready | verification template: ...`** – EmailJS is configured.
   - **`⚠️ EmailJS not configured...`** – Add to `.env`: `EMAILJS_SERVICE_ID`, `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY` (from [EmailJS Dashboard](https://dashboard.emailjs.com/) → Account → API Keys). Restart the server.

2. **On signup / resend**  
   When a user registers or clicks “Resend verification”:
   - **`✅ Verification email sent to xxx`** – Backend sent the request to EmailJS. If the user still doesn’t get the email, see steps 3–5.
   - **`❌ EmailJS not configured`** – Fix env vars (step 1).
   - **`❌ Verification email failed to xxx: <message>`** – Check the message: wrong template ID, invalid keys, or EmailJS API error. Fix the template ID in `.env` (`EMAILJS_VERIFICATION_TEMPLATE_ID`) or your EmailJS account.

3. **EmailJS template**  
   In Email Templates, open your verification template and ensure:
   - **To Email** is exactly `{{to_email}}` (so the recipient is taken from our params).
   - **Subject** uses e.g. `{{app_name}}` if you want.
   - **Content** is the HTML body (e.g. from `verification-email.html`).

4. **Email service (Gmail / Outlook / etc.)**  
   In EmailJS, **Email Services** must be connected (e.g. Gmail with App Password). Test the template with “Test it” in the dashboard to confirm the service can send.

5. **Spam / limits**  
   Check the recipient’s spam folder. On the free plan, EmailJS has sending limits; check the dashboard for errors or quotas.
