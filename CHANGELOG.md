# Changelog

All notable changes to `@dougborg/katana-sheets-toolkit` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0](https://github.com/dougborg/katana-sheets-toolkit/compare/v0.1.0...v0.2.0) (2026-10-01)


### ⚠ BREAKING CHANGES

* **katana:** generated schema types changed for consumers. Notably Variant/VariantResponse sku and barcodes are now nullable, variant `type` uses the named VariantType, Inventory.quantity_potential is nullable, UpdateVariantRequest drops product_id/material_id, CreateProductRequest drops lead_time/minimum_order_quantity, and CreateMaterialRequest.variants is CreateMaterialVariantRequest[].

### Features

* **katana:** regenerate types from the latest Katana OpenAPI spec ([781228f](https://github.com/dougborg/katana-sheets-toolkit/commit/781228f6390e25670edfbc52c196cc160138509b))

## [0.1.0] - 2026-04-23

Initial release. Scope narrowed to Katana-specific surface; generic helpers and
ORM moved to sibling packages (`@dougborg/gas-utils`, `@dougborg/gas-sheets-orm`).

### Added

- `katanaClient` — typed wrappers over the Katana MRP v1 REST API:
  - Products, variants, inventory, BOM rows.
  - Manufacturing orders and stock transfers.
  - Customers, sales orders.
  - Intelligent URL-length batching for `batchFetchVariantsBySkus` and
    `batchFetchInventoryByVariantIds` (auto-splits to stay under the 2048-byte
    URLFetch limit).
  - Retry with exponential backoff.
  - Pagination helpers.
- `ConfigProvider` seam (Katana-typed) with `PropertiesServiceConfigProvider`
  and `StaticConfigProvider` implementations. `setConfigProvider` /
  `getConfigProvider` for registration.
- `katana.generated.d.ts` — TypeScript types generated from the official
  Katana OpenAPI spec.
- `bomDiff` — `compareBomRows`, `generateDiffSummary`, `printBomDiff` for
  reviewing sync operations before execution.
- Shared constants: `API_CONSTANTS`, `RETRY_CONSTANTS`, `PAGINATION_CONSTANTS`,
  `UI_CONSTANTS`.
- Subpath exports: `/katana`, `/config`, `/bomDiff`, `/constants`,
  `/katana.generated`.

### Dependencies

- Runtime: `@dougborg/gas-utils`, `@dougborg/gas-sheets-orm` (both workspace).
- Peer: `@types/google-apps-script`.
