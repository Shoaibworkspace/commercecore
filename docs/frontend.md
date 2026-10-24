# Storefront design and assets

The current storefront extends the photo redesign described in `ui-redesign.md` with the [100-product mixed catalog](catalog-expansion.md). The original SVG presentation is retained as historical source artwork. Active imagery uses 113 local AI-generated WebP photographs: the original 25 assets plus one individual photograph for each of 88 new products.

## Working routes

| Route                          | Experience                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `/`                            | Editorial hero, seven category tiles, bounded featured/new/offer sections, explicit demo notice      |
| `/shop`                        | D1-backed products, URL-based server search/filter/sort including offers, twelve products per page   |
| `/categories/:category`        | Database categories and descriptions with combined filters                                           |
| `/products/:slug`              | Variant price/stock, selected-color gallery, details/care/demo-delivery accordions, related products |
| `/about`                       | Honest implementation status, provenance, and demo-only limits                                       |
| `/register`, `/login`          | Working validated account forms, password visibility and safe error messages                         |
| `/account`                     | Protected profile, saved Indian demo addresses, default/edit/remove and logout                       |
| `/engineering`                 | Retained Phase 1 API diagnostic                                                                      |
| Unknown route/product/category | Helpful not-found screen with working return links                                                   |

## Design system

Forest-green accents, clean white surfaces, clear sans-serif shopping typography, sticky navigation, prominent search, stronger prices and photographic product cards. System fonts require no remote font calls. Theme CSS variables support a persistent light/dark preference; respect the initial system preference. Accent focus rings, a skip link, labeled native form controls, native details/summary accordions, pressed-state variant/gallery buttons, and a keyboard-operable mobile menu support accessibility.

Desktop navigation becomes a menu below 760 px. Product grids move from three to two columns; the collection sidebar becomes a compact, collapsible filter area; detail pages stack gallery and information. Motion respects reduced-motion preferences. The storefront includes no dead account, cart, wishlist, or checkout buttons.

## Catalog behavior

`public/catalog.json` is reference/seed-generation data for 100 imaginary products and 220 variants across seven categories. Runtime pages call `/api/categories`, `/api/products`, and `/api/products/:slug`; they never load or silently fall back to the fixture. Shared Zod schemas validate the database response. Home sections request bounded featured/new/offer pages; product detail requests a single product and its related products. TanStack Query supports cancellation and explicit retry, with 15-second list, five-second detail and 60-second category freshness. API responses use `no-store`. Prices are integer paise; nullable comparison prices display sample discounts while cart/checkout use actual selling prices. Goods, sizing and specifications remain illustrative.

Search, price range, stock, sorting and pagination are encoded in URL query parameters; no hidden browser-storage catalog state is used. Filtering price and stock requires an actual matching variant. A price range between two variant prices must not match a product. Invalid URL values are bounded/ignored; out-of-range pages are clamped. Price forms reject inverted ranges with a visible native validation message. Category filter links preserve other active filters; pagination is reset when filters change.

The original products have two colour variants. Clothing, footwear and selected rings have sizes; sized cards link to the size selector below their price. Product pages retain Add to cart immediately below the selected price. Variant URLs survive reload and update photos, price and stock. Identical main/detail assets use a CSS detail zoom; additional database gallery positions 2–11 render their own assets. Related products are returned by the server. These reads do not reserve stock or authorize checkout.

## Assets and provenance

The active assets are in `public/images/photos/`. Prompts and file metadata are recorded in `docs/image-prompts.json`, `photos/provenance.json` and `photos/expanded-provenance.json`. They are local assets; no third-party photography, external image API, mandatory subscription, or expiring URL is used. The retained 50 SVG illustrations were authored in `scripts/create-sample-assets.mjs`; their CC0 notice applies specifically to that original SVG artwork. The locally authored favicon is `public/favicon.svg`.

Regenerate the current seed data using:

```sh
npm run db:generate:seed
```

Photo assets are encoded as WebP, and image width/height values reserve layout space. Hero images use high fetch priority; listing images load lazily. Route modules are code-split. CSS and local assets remain compatible with the same-origin static CSP.

## Failure and scope boundaries

Pending catalog loads show skeleton cards; failed requests or malformed/non-JSON catalog responses show a retry panel. Route imports are protected by an error boundary with a reload action. Empty results and missing products have working recovery paths. No artificial latency is added to simulate loading.

Phase 3's expanded D1 seed preserves legacy IDs and existing prices/stock rather than overwriting them from the fixture. Local initial cup stock may therefore differ from the old preview. Server queries bound all inputs and provide consistent page totals/clamping. Invalid API filters return 400; database failures show the retry panel. Phase 4 adds account forms, a protected profile/address screen and session-aware navigation. Public auth enablement requires real Free CPU evidence; admin mutations are implemented in the protected Phase 7 workspace. There are no fake review counts, real revenue or payment claims.

The cart increment adds a product-page quantity selector and Add to cart, explicit-finish quick add on collection cards, a shopping-bag navigation icon/count, and `/cart` with saved lines, quantity changes, removal, server-calculated subtotal and unavailable-item notices. Signed-out additions go to login and return to the selected product/finish using an allowlisted local destination. No item is silently added after login. Cart mutations show pending/success/error feedback; checkout is described as upcoming without a dead purchase button. Email verification is recorded as requested future work and is not presented as active.

Phase 5 puts product-page cart controls immediately below price, with color selection above price; collection quick add also follows the price block. Product/card heart controls save real account-owned favorites. `/wishlist` supports current prices, variant/quantity selection, atomic move to cart, removal and availability notices. It has signed-out/empty/loading/error/pending/success states. Desktop header and mobile-menu navigation expose the list. A move removes the favorite only after the cart write succeeds in the same transaction. Screenshots and manual responsive review are recorded in [Phase 5](phase-5.md).

## Checkout and administration

Lazy routes `/checkout`, `/orders` and `/orders/:id` support saved Indian demo addresses, server quotes, deliberate simulated success/failure, saved snapshots and paginated owned orders. Customer cancellation is available before shipping and shows the latest status. Quote errors and review headings receive focus.

Lazy `/admin` has Overview, Catalog, Categories, Inventory, Orders and Audit sections. Forms edit metadata, variants and bundled image choices; stock changes require a signed quantity and reason. Orders expose only legal next steps and an explicit cancellation confirmation. Empty/loading/error/retry states, pagination, mobile layouts and dark-theme tokens are included. Admin query keys include the account ID; server authorization remains authoritative. The admin link appears only for the admin role in My account.

## Phase 8 accessibility and request hygiene

The six admin sections wrap on small screens and announce a focused section heading. Opening product/order workspaces brings the editor heading into view with a sticky-header offset. Mobile navigation closes on Escape and returns focus to its toggle; the skip link targets the main landmark. Image selects have explicit names and admin errors receive focus. These behaviors were checked in the actual browser, alongside 320/390px layouts.

Admin mutations invalidate related catalog/availability/order queries without refetching session/profile/address data for every save. Authorization errors refresh the session; 409 conflicts refresh affected records. Login clears admin caches. The backend independently checks every request. Query freshness stays short and checkout still verifies prices, stock and versions inside its write transaction; public API responses are not shared-cache eligible.
