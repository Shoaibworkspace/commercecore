# Frontend, assets and catalog maintenance

## UI organization

- `frontend/src/pages/`: route screens for home, catalog, product, account, recovery, cart, wishlist, checkout, orders, admin and diagnostics.
- `frontend/src/components/`: shared header, product cards, price display, bag drawer, forms, error/loading states and icons.
- `frontend/src/features/`: account/catalog/cart/wishlist/checkout/admin query and mutation composition.
- `frontend/src/styles/`: shared theme primitives plus account, cart, checkout, wishlist, admin and editorial styles.
- `frontend/src/lib/`: API errors and related cache invalidation.
- `frontend/public/images/photos/`: optimized product and lifestyle WebP photographs.

The main route tree is `frontend/src/main.tsx`. Pages load lazily. Public routes are shareable URLs; filters and selected variants use URL state. There is no separate frontend package install.

## Visual direction

The storefront uses warm ivory, charcoal, restrained terracotta, serif editorial headings and product photography. Dark mode retains a user preference, and its moon/sun switch stays visible in the header on desktop/mobile. The smallest header puts account access in the menu to avoid crowding.

Homepage sections include the split lifestyle hero, numbered category links, featured products, a jewellery edit, category tiles, arrivals, offers and an editorial story. Product cards retain the actual selling/comparison price, stock-aware quick add and size-selection link.

Hero content enters in place without blocking navigation. Below-fold sections reveal with IntersectionObserver and CSS opacity/transforms. Reduced-motion preferences are respected. Native select options use an explicit readable foreground/background pair so OS popup colours do not inherit pale dark-mode text.

The bag is a native modal dialog with focus containment, Escape dismissal and focus restoration. Quantity/removal/subtotal data comes from the existing versioned cart service; checkout remains on the normal cart/checkout pages.

## Accessibility and responsive checks

Preserve visible keyboard focus, labels, landmarks, error/status announcements, touch-friendly controls and explicit image dimensions. Verify at narrow and wide widths, in both themes, after changing navigation or forms. An iframe width check is a layout review, not a physical-device performance test.

Only clean storefront screenshots are public in `docs/screenshots/`. Provider dashboards, real account details and private operator captures must stay out of Git.

## Catalog and prices

D1 is the runtime source of truth. The sample dataset has 100 products, seven categories and 220 variants. Selling/comparison prices, stock and versions are server-controlled. Sale labels are derived from real comparison prices; quotes and checkout charge the selling price, not a display-only discount.

`frontend/public/catalog.json` is seed-generation/reference data, never a runtime fallback if the database fails. Keep all three seed files: original catalog, storefront details and expanded catalog. They preserve original product IDs and do not create or reset accounts/orders.

For catalog maintenance use the audited admin UI or the explicit generation scripts. Never change inventory through a metadata edit. Keep image references inside the allowlist in `shared/catalog-assets.ts`.

## Photo provenance and generation

The bundled product/lifestyle photographs are original AI-generated sample images, not pictures of goods offered for real sale. Keep the visible disclosure and do not invent reviews, certifications, delivery guarantees or scarcity.

The initial prompt collection is in `docs/assets/image-prompts.json`; photo provenance/expanded prompts accompany the optimized assets in `frontend/public/images/photos/`. Generated masters and per-product generation records are local-only and not required to run the app.

Useful maintenance commands/scripts:

| Tool                                  | Purpose                                                                       |
| ------------------------------------- | ----------------------------------------------------------------------------- |
| `npm run db:generate:seed`            | Regenerate storefront/expanded seed SQL from the sample catalog               |
| `scripts/create-sample-assets.mjs`    | Recreate the original fixture illustrations/catalog and reapply photo mapping |
| `scripts/prepare-photo-assets.mjs`    | Optimize available local initial PNG masters with Sharp                       |
| `scripts/prepare-expanded-photos.mjs` | Optimize available local expanded masters and verify their references         |
| `scripts/build-expanded-catalog.mjs`  | Produce the additive expanded catalog/seed                                    |
| `scripts/catalog-snapshot.mjs`        | Optional local data-preservation snapshot before additive imports             |
| `npm run perf:assets`                 | Enforce built JS/CSS/photo budgets                                            |

Generation helpers need their original local masters where stated; cloning the repository already provides the optimized assets and needs no image generation. Supporting SVGs and their asset license are retained because fixture generation/tests still use them.
