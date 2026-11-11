# Yarema Landscaping website

A one-page site in plain HTML, CSS and a little JavaScript. No build step: the files in
this folder are the website.

| File          | What it is                                        |
| ------------- | ------------------------------------------------- |
| `index.html`  | All the page text and sections                    |
| `styles.css`  | Colors, fonts and layout                          |
| `script.js`   | Photo placeholders and the quote form             |
| `favicon.svg` | The leaf logo shown in the browser tab            |
| `images/`     | Your photos (see `images/README.md` for the list) |

## Before you go live

1. **Fill in the placeholders.** In `index.html`, find-and-replace:
   - `[YOUR TOWNS]` — your service area, e.g. `Troy, Rochester Hills and Birmingham`
   - `[RESPONSE TIME]` — e.g. `one business day`
   - `[Insured — confirm]` — change to `Fully insured` once confirmed, or delete that line
   - `[LUKE'S BACKGROUND …]` — a few sentences about Luke
   - `[CUSTOMER REVIEW …]` — paste real reviews, or delete the Reviews section (and its
     header link) until you have some
2. **Add photos** to `images/` using the file names in `images/README.md`.
3. **Connect the quote form** (below).

## Connect the quote form (Web3Forms, free)

1. Go to <https://web3forms.com>, enter `yaremalandscaping@gmail.com` and request an access key.
2. Open the email they send and copy the access key.
3. In `index.html`, find `YOUR_WEB3FORMS_ACCESS_KEY` and replace it with your key
   (keep the quotes around it).
4. Publish the site, submit a test quote, and check the Gmail inbox (and spam folder the
   first time).

The key is meant to be public, so it is safe to have in the page. Until a key is added, the
form tells visitors to call or text instead of pretending to send.

## Adding more gallery photos

In `index.html`, find the `GALLERY` comment. Copy one whole `<figure>…</figure>` block,
paste it after the last one, and change the file name, the description (`alt`), the
`data-label` and the caption. The grid rearranges itself.

## Previewing on your computer

Double-click `index.html` to open it in a browser.
