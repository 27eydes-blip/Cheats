# Launch checklist: Gleyde Cybersecurity & Software

Work top to bottom. Items marked ⚖️ deserve a professional's input (attorney, CPA or insurance broker).

## 1. Business & legal
- [ ] Confirm Gleyde Technologies, LLC is **in good standing** with your state, and that the annual report and fees are current.
- [ ] Check that the **operating agreement** covers the officer roles (CEO, COO) and who can sign contracts. ⚖️
- [ ] If the division will use its own name, file a **DBA / assumed name**. ⚖️
- [ ] **EIN** from the IRS, if you don't already have one.
- [ ] **Business bank account**, separate from personal accounts.
- [ ] Check city and county **business license** requirements.
- [ ] Have an attorney review the **client authorization & scope agreement** template (`docs/`). ⚖️
- [ ] Prepare a **master services agreement or terms of service** covering payment, liability caps and confidentiality. ⚖️
- [ ] Check whether your state requires a **license for security testing or consulting work** (a few states regulate this). ⚖️
- [ ] Publish a **privacy policy** on the site. It's required once you collect contact form data. ⚖️

## 2. Insurance ⚖️
- [ ] **Professional liability / Errors & Omissions (E&O)**, ideally a tech E&O policy that names security testing.
- [ ] **Cyber liability**, first- and third-party.
- [ ] **General liability**.
- [ ] Ask whether clients will require you to carry minimum limits; real estate and lending clients often ask for proof.
- [ ] Get a **certificate of insurance (COI)** ready to send to clients.

## 3. Domain & email
- [ ] Register the **domain**. Turn on registrar lock and 2FA on the registrar account.
- [ ] Point the nameservers to **Cloudflare**.
- [ ] Set up a **business email** (Google Workspace or Microsoft 365) with 2FA for every user.
- [ ] Add **SPF, DKIM and DMARC** records.
- [ ] Create `security@` and `hello@` addresses and use them in `security.txt` and the contact page.

## 4. Cloudflare & website (details in `README.md`)
- [ ] Create the Cloudflare account with **2FA** (use a hardware key if possible).
- [ ] Create the Pages project, connect the repo, and add the custom domain.
- [ ] Add the Turnstile widget and its keys.
- [ ] Create the KV namespace for rate limiting.
- [ ] Set up the Resend account, verify the domain, and create an API key.
- [ ] Set all **environment variables / secrets** in Cloudflare.
- [ ] Set SSL to **Full (strict)**, turn on Always Use HTTPS, TLS 1.2 minimum, and DNSSEC.
- [ ] Add the **WAF rate-limit rule** for `/api/contact` and turn on **Bot Fight Mode**.
- [ ] Turn **off** Rocket Loader and Email Obfuscation, since they break the CSP.
- [ ] Replace every `TODO-EDIT`: prices, bios, story, domain, email.
- [ ] Add a privacy policy page.
- [ ] Test: submit the form from your phone and from a laptop.
- [ ] Check the security headers grade (A+), SSL Labs grade (A+) and Lighthouse scores (90+).
- [ ] Set up Google Business Profile and Search Console, and submit the sitemap.

## 5. Operations
- [ ] Set up an **invoicing / payments** tool (e.g. Stripe, QuickBooks).
- [ ] Set up a **secure file sharing** method for reports, such as encrypted links with expiry. Never use plain email attachments.
- [ ] Use a **password manager** for the team.
- [ ] Write a **data retention policy**, e.g. delete client findings 90 days after the engagement unless the contract says otherwise.
- [ ] Write a **report template** and a **free security check** summary template.
- [ ] Write an internal rule: **no testing without a signed authorization**, ever.
