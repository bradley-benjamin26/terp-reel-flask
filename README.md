# Terp Reel (Flask edition)

A TikTok-style vertical scroll interface for browsing images from the
University of Maryland Libraries' Digital Collections, with real
accessibility support (keyboard navigation, screen reader alt text
sourced from actual catalog metadata, and a focus-managed panel).

## What this app does

- Browse image collections from UMD's Digital Collections archive as
  a vertical, swipeable feed.
- Collections are chosen from a right-side tile panel (always visible
  on desktop; a slide-in drawer on mobile).
- Shows all 17 image-bearing collections from UMD's ListSets
  response, except "Prange Children's Books" (excluded on request).
- Infinite-scrolls within a collection using OAI-PMH resumption tokens.

## Accessibility review — what was fixed

### 1. Alt text now comes from real catalog metadata

Yes — this was the most impactful fix. `app.py`'s `build_alt_text()`
combines the item's cataloged **title + description + date** into one
alt attribute (e.g. "Andrew Whipple (#1), Maryland Terrapin attackman...
The Diamondback Photo Morgue consists of images taken for... (1985)"),
truncated cleanly at a word boundary if it runs long. Previously the
image had no meaningful alt text at all — a screen reader user got
nothing describing what the picture actually showed. The blurred
background image behind each slide is marked `alt="" role="presentation"`
since it's purely decorative and would otherwise be announced twice.

### 2. Tab order and keyboard navigation

- A **skip link** ("Skip to image feed") is the first focusable
  element, letting keyboard users bypass the top bar entirely.
- The feed container itself is focusable (`tabindex="-1"`, focused via
  the skip link) and now responds to **Arrow Down/Up, Page Down/Up,
  Home, and End** to move between slides — previously there was no
  way to advance through the feed without a mouse or touchscreen.
- The collection panel's tiles, action buttons (zoom/share/external
  link), and toggle are all native `<button>`/`<a>` elements, so they
  were already in the natural tab order — but focus rings on them were
  upgraded to a single, high-contrast amber outline (`--focus-ring`)
  that stays visible over both dark full-bleed photos and light UI
  chrome (the default browser outline was nearly invisible on black
  media backgrounds).
- On mobile, the collection panel is a real focus-trapped dialog: opening
  it moves focus inside, `Tab`/`Shift+Tab` cycle only within it, `Escape`
  and the scrim close it, and focus returns to the toggle button that
  opened it — none of that existed before.

### 3. Screen reader semantics and announcements

- A visually-hidden `aria-live="polite"` region announces "Now viewing
  image 3 of 24: [title]" whenever a new slide scrolls into view, so
  screen reader users get the same "you moved to a new item" signal
  that sighted users get visually.
- Each slide is marked `role="group" aria-roledescription="slide"
  aria-label="Image N of Total"`, so assistive tech announces position
  within the feed, similar to how a native carousel is exposed.
- The collection list uses `<nav><ul role="list"><li role="listitem">`
  semantics with `aria-pressed` on the active tile, and the mobile
  drawer toggle carries `aria-expanded`/`aria-controls` reflecting its
  real state.
- Decorative elements (gradient overlay, slide counter, progress rail,
  skeleton loaders) are all `aria-hidden="true"` so they don't clutter
  screen reader output with meaningless text.
- Empty and error states use `role="status"` / `role="alert"` so
  they're announced immediately without the user needing to find them.

### What to test yourself

- Tab through the whole page with a keyboard only, no mouse.
- Turn on VoiceOver (Mac: Cmd+F5) or NVDA and confirm the alt text
  read for each image actually describes the picture's content.
- Resize below 900px, open the collection panel with the grid icon,
  and confirm Tab stays trapped inside it until Escape or a tile click.

## Project structure

```
terp-reel-flask/
├── app.py                  # Flask app: routes, JSON API, alt-text builder
├── requirements.txt
├── umd_client/
│   ├── oai.py               # fetches + parses OAI-PMH/RDF records
│   ├── iiif.py               # resolves + caches IIIF image IDs (parallel)
│   └── search.py             # orchestrates oai.py + iiif.py (browse())
├── templates/
│   └── index.html           # semantic landmarks, skip link, live region
└── static/
    ├── css/style.css        # focus rings, sr-only, panel focus styles
    └── js/
        ├── theme.js
        └── feed.js           # keyboard nav, focus trap, live announcer
```

## Running it locally (macOS-friendly)

```bash
cd terp-reel-flask
python3 -m venv venv
source venv/bin/activate
python3 -m pip install -r requirements.txt
python3 -m flask --app app run --debug
```

Then open http://127.0.0.1:5000

## Ideas for extending this as a learning exercise

- Add a "reduced motion" respecting alternative to the smooth-scroll
  keyboard navigation (already respects `prefers-reduced-motion` via
  the global CSS media query, but double-check with it enabled).
- Consider exposing a text-only list view of the current collection as
  an alternate, non-visual way to browse — some screen reader users
  prefer scanning a list over a slide-at-a-time feed.
- If UMD's metadata ever includes structured "depicted subject" terms,
  fold those into `build_alt_text()` for even richer descriptions.
