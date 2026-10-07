# @dougborg/katana-sheets-toolkit

Katana MRP API client and Google Sheets integration bindings for Google Apps Script projects.

Focused package — `katanaClient`, `ConfigProvider`, generated OpenAPI types, constants, and BOM diff utilities. Built on [`@dougborg/gas-utils`](https://www.npmjs.com/package/@dougborg/gas-utils) (logging / feedback) and [`@dougborg/gas-sheets-orm`](https://www.npmjs.com/package/@dougborg/gas-sheets-orm) (sheet ORM), which you'll typically install alongside.

## What can you build with it?

- **Custom reports and inventory lookups** — fetch products, variants, and inventory for SKU lists, then use those results in your own Sheets reports.
- **BOM maintenance workflows** — compare existing and proposed BOM rows for review, then use the BOM create, update, and delete helpers in your sync workflow.
- **Catalog automation** — create products and materials, or update variants from data you manage in Sheets.

This is a developer library for Apps Script/TypeScript projects. You write the sheet layout, menus, triggers, and workflow logic; the toolkit provides Katana API calls and BOM comparison helpers.

## Features

- **`katanaClient`** — dedicated helpers for products, materials, variants, inventory, and BOM rows, plus a generic `katanaSmartFetch` wrapper for other Katana MRP v1 REST endpoints. Intelligent URL-length batching, retry with exponential backoff, pagination helpers.
- **`ConfigProvider`** — seam between the toolkit and your project's property storage. Ships with `PropertiesServiceConfigProvider` (for GAS `PropertiesService`) and `StaticConfigProvider` (for tests).
- **`katana.generated.d.ts`** — TypeScript types generated from the official Katana OpenAPI spec (vendored at `spec/katana-openapi.yaml`).
- **`bomDiff`** — compute a row-by-row diff between existing and desired BOM rows for review before sync.

## Install

```bash
npm install @dougborg/katana-sheets-toolkit @dougborg/gas-utils @dougborg/gas-sheets-orm
```

Peer dependency: `@types/google-apps-script` (tested against `^1` and `^2`).

The package exports TypeScript source. Use a build setup that bundles npm dependencies and transpiles TypeScript for Google Apps Script before deployment. API calls use Apps Script globals such as `UrlFetchApp` and `Utilities`.

## Quick start

1. Register your config provider at module load:

```ts
// src/main/index.ts
import { PropertiesServiceConfigProvider, setConfigProvider } from '@dougborg/katana-sheets-toolkit/config';

setConfigProvider(
  new PropertiesServiceConfigProvider({
    locationIdProperty: 'KATANA_LOCATION_ID',
    defaultLocationId: 160411 // your Katana warehouse / location ID
  })
);
```

Store your Katana API key in Script Properties under `KATANA_API_KEY`.
Optionally set `KATANA_LOCATION_ID` there to override the constructor's default location. `batchFetchInventoryByVariantIds` filters results to the configured location.

2. Call the API:

```ts
import { batchFetchVariantsBySkus, fetchProductWithVariants } from '@dougborg/katana-sheets-toolkit/katana';

// Fetch variants for a list of SKUs — the client splits the request to
// stay under URLFetch's 2048-byte URL limit.
const variants = batchFetchVariantsBySkus(['SKU-001', 'SKU-002', 'SKU-003']);

// Fetch a product with all its variants.
const product = fetchProductWithVariants('12345');
```

3. Diff BOM rows before sync:

```ts
import { type BomRow, compareBomRows, printBomDiff } from '@dougborg/katana-sheets-toolkit/bomDiff';

// Example current and proposed rows; supply your own Katana/sheet data.
const existing: BomRow[] = [
  { product_item_id: 12345, product_variant_id: 23456, ingredient_variant_id: 34567, quantity: 2 }
];
const desired: BomRow[] = [{ ...existing[0], quantity: 3 }];
const ingredientBySku = { 'PART-001': { id: 34567 } };

const diff = compareBomRows(existing, desired, ingredientBySku);
printBomDiff(diff, 'SKU-001', ingredientBySku); // console table
```

Comparison is position-by-position, so put both lists in the intended row order first. These helpers report differences; they do not write changes to Katana.

## Subpath imports

```ts
// Root barrel
import { batchFetchVariantsBySkus, PropertiesServiceConfigProvider } from '@dougborg/katana-sheets-toolkit';

// Tree-shaken subpaths
import { fetchProductWithVariants } from '@dougborg/katana-sheets-toolkit/katana';
import { setConfigProvider } from '@dougborg/katana-sheets-toolkit/config';
import { compareBomRows } from '@dougborg/katana-sheets-toolkit/bomDiff';
import { RETRY_CONSTANTS } from '@dougborg/katana-sheets-toolkit/constants';
import type { components } from '@dougborg/katana-sheets-toolkit/katana.generated';
```

## Regenerating types

The OpenAPI spec is vendored at `spec/katana-openapi.yaml`, so the committed types always match a known spec version. To update:

```bash
npm run fetch:spec      # pull the latest spec from dougborg/katana-openapi-client (main)
npm run generate:types  # regenerate src/katana.generated.d.ts from the vendored spec
# or both at once:
npm run generate
```

Commit the updated `spec/katana-openapi.yaml` and `src/katana.generated.d.ts` together, and check `npm run typecheck`: type changes can surface as `katanaClient` compile errors.
The generated file is formatted with prettier rather than Biome, because `biome.json` excludes `*.generated.d.ts` from formatting and linting.

## Related packages

- [`@dougborg/gas-utils`](https://www.npmjs.com/package/@dougborg/gas-utils) — structured logging, ARRAYFORMULA auto-fix, visual feedback.
- [`@dougborg/gas-sheets-orm`](https://www.npmjs.com/package/@dougborg/gas-sheets-orm) — sheet-as-database ORM with schema registry and domain models.
- [`@dougborg/gas-test-utils`](https://www.npmjs.com/package/@dougborg/gas-test-utils) — vitest mock factories for GAS globals.
- [`@dougborg/gas-dev-server`](https://www.npmjs.com/package/@dougborg/gas-dev-server) — local dev server + Vite plugin for GAS projects.

## Release

Merges to `main` use Conventional Commit messages.
The [release-please](https://github.com/googleapis/release-please) workflow (`.github/workflows/release.yml`) keeps one release PR open that bumps the version for releasable commits (`feat`, `fix`, `perf`, `revert`, or a breaking change) and updates `CHANGELOG.md`.
Merging it tags the release (`v0.2.0`, and so on) and creates its GitHub Release.

The workflow opens that PR with an installation token from the `dougborg-release-please` GitHub App (ID 4392719), so the required checks run on it.
This repository needs the variable `RELEASE_PLEASE_APP_ID` set to `4392719` and the secret `RELEASE_PLEASE_APP_PRIVATE_KEY` holding the App's private key (the key is `github.release_please_app_private_key` in the SOPS secrets of `dougborg/dougborg-dot-net`); without them the release job fails instead of opening a release PR:

```bash
gh variable set RELEASE_PLEASE_APP_ID --repo dougborg/katana-sheets-toolkit --body 4392719
gh secret set RELEASE_PLEASE_APP_PRIVATE_KEY --repo dougborg/katana-sheets-toolkit < dougborg-release-please.private-key.pem
```

The publish job then runs in the `npm` GitHub environment (deployments from `main` only).
It checks out the release tag with the Node version in `.nvmrc`, installs without a cache, runs `npm run build` and `npm run quality`, and stages the version on npm with [trusted publishing](https://docs.npmjs.com/trusted-publishers) and provenance, so the repository stores no npm token.
The trusted publisher is `dougborg/katana-sheets-toolkit`, workflow `release.yml`, environment `npm`; renaming either breaks publishing.
The trusted publisher may only stage, so a maintainer approves each version with two-factor authentication before it goes live, using `npm stage list @dougborg/katana-sheets-toolkit` and `npm stage approve <stage-id>` or the Staged Packages tab on npmjs.com.
See [staged publishing](https://docs.npmjs.com/staged-publishing/).

Trusted publishing needs the package to exist on npm already, so the first version (`0.1.0`) is published once by hand, without provenance; every later version goes through the workflow.

## License

MIT © Doug Borg
