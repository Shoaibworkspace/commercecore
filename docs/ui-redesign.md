# CommerceCore photo storefront redesign

The Phase 2 UI was redesigned in response to the request for a realistic e-commerce experience and something branded when the site opens.

## Changes

- Photo-led hero, two collection promotion panels, photographic category tiles, four-column product sections, a workspace spotlight and a new-arrivals section.
- Prominent working header search, sticky navigation, clear category links, stronger type hierarchy, bordered product cards, legible prices and working product links.
- All 24 product finishes now have realistic AI-generated studio photos. Switching a color retains the product identity. The gallery detail view zooms its selected photograph rather than presenting a different product.
- Compact demo notice remains visible. No fake discounts, ratings, shipping guarantees, account/cart actions or actual payment claims were added.
- A branded welcome overlay appears once per tab session, dismisses automatically after 1.6 seconds, and supports Enter Store and Escape. Background page loading continues. Underlying content is inert while it is visible; focus returns to main content on dismissal. Reduced-motion preference skips the welcome screen.

## Image assets and prompts

Generated using the **built-in imagegen tool**, with no API-key-based fallback. Exact generation/edit prompts are in `docs/image-prompts.json`. Output paths, dimensions and encoded file sizes are in `public/images/photos/provenance.json`.

Final project assets:

- `public/images/photos/hero-lifestyle.webp`
- `public/images/photos/{lamp,notebook,speaker,clock,tote,bottle,pouch,umbrella,cup,vase,tray,throw}-{main,alt}.webp`

This is 25 locally hosted WebP files, **1.63 MiB total** at generation time. Product assets are up to 960 px wide and the hero is up to 1600 px wide. Original PNG masters were copied into `output/imagegen/`, which is ignored by Git. Deployed pages require only the checked-in optimized assets, not image generation, remote image services, or the original machine's generated-images directory.

All images depict imaginary sample goods. They are AI-generated product photography, not evidence of physical inventory. The retained SVG artwork/license from the first design is separate and is no longer referenced by the storefront catalog.

`node scripts/prepare-photo-assets.mjs` re-encodes available local PNG masters using development-only Sharp. `node scripts/create-sample-assets.mjs` regenerates fixture data and then reapplies the photo mapping when the photo manifest exists, avoiding an accidental return to SVG products.

## Verification

`npm run check` passed: frontend and Worker type checks, lint with zero warnings, all 22 tests, Vite production build and Worker deployment dry run. Catalog pricing, filtering, pagination and database foundations retain their original tests.

Local browser QA verified the desktop storefront, mobile layout at 390 px and 320 px without horizontal overflow, keyboard-operated mobile category navigation, filter collapse, price sorting, search, and the selected product finish's image path. The welcome overlay dismissed automatically, through Enter store and through Escape; reloading the same tab did not show it again. Browser warning/error logs were empty after these checks.

Saved previews:

- `docs/storefront-photo-desktop.png`
- `docs/storefront-photo-mobile.png`
- `docs/storefront-welcome.png`

The preview runs locally at `http://127.0.0.1:8787/`. This is a frontend redesign; D1 catalog integration and the remaining commerce phases are still pending. No public deployment was made.
