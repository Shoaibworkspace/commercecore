# Validators

`catalog.ts` bounds public query parameters. `catalog-management.ts` validates strict internal management inputs; those services have no public write route yet. Shared response schemas live in `shared/catalog.ts`. Customer checkout must never accept client prices, roles, stock or totals as authoritative.
