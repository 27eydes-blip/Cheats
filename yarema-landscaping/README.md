# Yarema Landscaping website

A one-page site in plain HTML, CSS and JavaScript. There is no build step: the files in
this folder are the website.

| File          | What it is                                            |
| ------------- | ----------------------------------------------------- |
| `index.html`  | All the page text and sections                        |
| `styles.css`  | Colors, fonts and layout                              |
| `script.js`   | Menu, before/after slider, photo viewer, quote form   |
| `favicon.svg` | The logo mark shown in the browser tab                |
| `images/`     | Your photos, plus the share image and phone app icon  |

To preview on your computer, double-click `index.html`.

## 1. Placeholder checklist

Everything in `[SQUARE BRACKETS]` is waiting on you. Open `index.html` and use
find-and-replace.

**Text**

- [ ] `[YOUR TOWNS]` — your service area, e.g. `Troy, Rochester Hills and Birmingham`.
      Appears in the page title, description, hero, FAQ, quote section, footer and the
      business schema near the top. Replace all of them.
- [ ] `[RESPONSE TIME]` — e.g. `one business day`. Appears twice (quote section and the
      message shown after the form is sent).
- [ ] `[Fully insured — confirm]` — change to `Fully insured` once confirmed, or delete
      that line.
- [ ] `[Luke's story — …]` — a few sentences in the About section.
- [ ] `[ANSWER]` — the "Do I need to be home?" answer in the FAQ.
- [ ] `[PAYMENT METHODS]` — the "How do I pay?" answer in the FAQ.
- [ ] `[TOWN]` — on each of the six gallery captions.
- [ ] Before/after tab names — `Project 01`, `Project 02`, `Project 03`. Rename if you like.

**Reviews** (never publish the placeholders)

- [ ] `[REAL CUSTOMER REVIEW]` and `[First name] [Last initial]. · [Town]` — three slots.
      Paste real reviews, with the customer's permission. If you have none yet, delete the
      whole Reviews section and the `Reviews` links in the header and footer.
- [ ] `[GOOGLE REVIEW LINK]` — on the "Leave a review" button, replace `href="#reviews"`
      with your Google review link (section 5 below explains where to get it).

**Links and accounts**

- [ ] `[INSTAGRAM]` and `[FACEBOOK]` — your usernames in the footer links. Delete an icon
      you don't use.
- [ ] `YOUR_WEB3FORMS_ACCESS_KEY` — the quote form key (section 3).
- [ ] `yaremalandscaping.com` — appears in the share-image and schema lines near the top
      of `index.html`. Change it if your domain ends up different.

**Services**

- [ ] To add or remove a service, copy or delete one `<article class="service">` block
      and the matching `<option>` in the quote form. The two names must match exactly.

**Photos** — see the next section.

## 2. Photos

Save photos in `images/` with these exact names. Until a file exists the site shows a
dark striped stand-in labeled with the file name it is waiting for.

| File name                          | Where it shows             | What to use                          |
| ---------------------------------- | -------------------------- | ------------------------------------ |
| `hero.webp`                        | Top of the page            | Best finished property, wide shot    |
| `before-1.webp`, `after-1.webp`    | Before/after, Project 01   | Same spot, same angle                |
| `before-2.webp`, `after-2.webp`    | Before/after, Project 02   | Same spot, same angle                |
| `before-3.webp`, `after-3.webp`    | Before/after, Project 03   | Same spot, same angle                |
| `work-1.webp` … `work-6.webp`      | Recent work gallery        | Finished jobs                        |
| `luke.webp`                        | About (shown black & white)| Luke on the job, portrait or square  |

`share.png` (the preview shown when the link is texted or posted) and `app-icon.png` are
already made. Replace `share.png` with a real photo later if you like; keep it 1200×630.

**Getting photos into WebP.** Phones save JPG or HEIC. Open <https://squoosh.app> (free,
runs in the browser), drop the photo in, choose **WebP**, resize to about 1600px wide
(2000px for the hero), and download. Rename it to match the table. Names are
case-sensitive: `hero.webp`, not `Hero.WEBP`.

**Shooting tips**

- Shoot in the hour after sunrise or before sunset. Low light shows mowing stripes and
  makes greens look rich. Midday sun flattens everything.
- Shoot right after the cut, while the stripes are fresh, and blow off the hard surfaces
  first.
- For before/after pairs, stand in the same spot at the same height both times. Pick a
  fixed landmark (mailbox, corner of the driveway) to line up against. Take the "before"
  on every job, even if you're not sure you'll use it.
- Hold the phone sideways (landscape) for everything except the photo of Luke.
- Keep trucks, bins, hoses and house numbers out of frame. Ask the homeowner before
  posting their property.
- Wipe the lens. Don't use filters; the site already darkens photos so text reads.

**Adding more.** Gallery: copy one `<button class="shot">` block in `index.html` and
change the file name, description and caption. Before/after: copy one tab `<button>`,
bump `data-n` to `4`, and add `before-4.webp` and `after-4.webp`.

## 3. The quote form (Web3Forms, free)

1. Go to <https://web3forms.com>, enter `yaremalandscaping@gmail.com` and request an
   access key.
2. Copy the key from the email they send.
3. In `index.html`, replace `YOUR_WEB3FORMS_ACCESS_KEY` with it (keep the quotes).
4. Once the site is live, send a test request and check Gmail (and spam, the first time).
   Mark it "not spam" so future requests land in the inbox.

The key is meant to be public, so it is safe in the page. Until a key is added, the form
tells visitors to call or text instead of pretending to send. A hidden honeypot field
filters most bots. If the visitor gives an email, replying in Gmail goes straight to them.

**Yard photo upload.** The upload field is built but switched off. Emailing attachments
has been a paid feature on Web3Forms and Formspree; check their current pricing before
relying on it. With it off, the form shows "Have photos? Text them to (248) 251-7642",
which costs nothing and works on every phone. To switch the field on after upgrading,
delete the word `hidden` from `<div class="field" id="photo-field" hidden>`.

## 4. Putting it live for free

Cloudflare Pages is the simplest host for connecting a domain. Menu names may differ
slightly from what is written here.

1. **Give the site its own repository.** On GitHub, create a new repository (for example
   `yarema-landscaping`) and upload the contents of this folder so `index.html` sits at
   the top level.
2. **Create the Pages project.** Sign up at <https://cloudflare.com>, go to
   Workers & Pages → Create → Pages → Connect to Git, and pick the repository.
3. **Deploy.** Leave the build command blank, set the output directory to `/`, and
   deploy. You get a free address like `yarema-landscaping.pages.dev`.
4. **Updates are automatic.** Every change pushed to GitHub redeploys in about a minute.

No GitHub? Netlify lets you drag this folder onto <https://app.netlify.com/drop> and
hosts it straight away.

**Connecting yaremalandscaping.com**

1. Buy the domain. Cloudflare Registrar sells at cost; Namecheap and others also work.
2. In the Pages project, open Custom domains → Set up a custom domain. Add
   `yaremalandscaping.com`, then repeat for `www.yaremalandscaping.com`.
3. If you bought it through Cloudflare, the DNS records are added for you. If you bought
   it elsewhere, either switch the domain's nameservers to the two Cloudflare gives you,
   or add the CNAME record it shows at your registrar.
4. HTTPS is issued automatically, usually within minutes and occasionally up to a day.
5. Paste the live address into <https://www.opengraph.xyz> to confirm the share preview.

## 5. Google Business Profile

This is what puts the business in Google Maps and the local results. It is free and does
more for local search than anything on the website itself.

1. Go to <https://business.google.com> and sign in with the business Gmail.
2. Add the business name exactly as it appears everywhere else: `Yarema Landscaping`.
3. Category: choose `Landscaper` as the primary. Add `Lawn care service` as a secondary.
4. When asked about a location customers can visit, say no. That makes it a
   service-area business and keeps your home address off the listing.
5. Add the service area: the same towns as `[YOUR TOWNS]`.
6. Add the phone number (248) 251-7642 and the website address.
7. Verify. Google decides the method (often a short video, sometimes a phone call or a
   mailed postcard). The listing isn't public until this is done.
8. Fill in everything: hours, each service with a short description, a description of
   the business, and at least ten real photos. Add new job photos regularly.
9. Get the review link: in the profile, choose "Ask for reviews" and copy the link. Put
   it on the "Leave a review" button (section 1) and text it to customers after a job.
10. Reply to every review, good or bad, in a sentence or two.

Things that help ranking: the name, phone and towns matching exactly across the site,
the profile, Facebook and any directories; a steady flow of real reviews; fresh photos.
Never buy reviews or write your own. Google removes them and can suspend the listing.
