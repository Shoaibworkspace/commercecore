# Feature modules

`catalog/model.ts` defines the Zod-validated storefront sample contract and pure filtering/sorting/pagination logic. `catalog/query.ts` loads the bundled catalog with abort support and TanStack Query caching. Phase 3 will replace the fixture transport with D1-backed catalog endpoints. No cart, account, payment, or inventory mutation is simulated by these modules.
