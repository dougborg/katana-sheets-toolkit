# @dougborg/katana-sheets-toolkit

Katana MRP API client and Google Sheets integration bindings for Google Apps Script projects.

Focused package — `katanaClient`, `ConfigProvider`, generated OpenAPI types, constants, and BOM diff utilities. Built on [`@dougborg/gas-utils`](https://www.npmjs.com/package/@dougborg/gas-utils) (logging / feedback) and [`@dougborg/gas-sheets-orm`](https://www.npmjs.com/package/@dougborg/gas-sheets-orm) (sheet ORM), which you'll typically install alongside.

## Features

- **`katanaClient`** — typed wrappers over the Katana MRP v1 REST API: products, variants, inventory, BOM rows, manufacturing orders, stock transfers, customers, sales orders. Intelligent URL-length batching, retry with exponential backoff, pagination helpers.
- **`ConfigProvider`** — seam between the toolkit and your project's property storage. Ships with `PropertiesServiceConfigProvider` (for GAS `PropertiesService`) and `StaticConfigProvider` (for tests).
- **`katana.generated.d.ts`** — TypeScript types generated from the official Katana OpenAPI spec.
- **`bomDiff`** — compute a row-by-row diff between existing and desired BOM rows for review before sync.

## Install

```bash
npm install @dougborg/katana-sheets-toolkit @dougborg/gas-utils @dougborg/gas-sheets-orm
```

Peer dependency: `@types/google-apps-script` (tested against `^1` and `^2`).

## Quick start

1. Register your config provider at module load:

```ts
// src/main/index.ts
import { PropertiesServiceConfigProvider, setConfigProvider } from '@dougborg/katana-sheets-toolkit/config';

setConfigProvider(
  new PropertiesServiceConfigProvider({
    defaultLocationId: 160411 // your Katana warehouse / location ID
  })
);
```

Store your Katana API key in Script Properties under `KATANA_API_KEY`.

2. Call the API:

```ts
import { batchFetchVariantsBySkus, fetchProductWithVariants } from '@dougborg/katana-sheets-toolkit/katana';

// Fetch variants for a list of SKUs — the client splits the request to
// stay under URLFetch's 2048-byte URL limit.
const variants = batchFetchVariantsBySkus(['SKU-001', 'SKU-002', 'SKU-003']);

// Fetch a product with all its variants.
const product = fetchProductWithVariants(12345);
```

3. Diff BOM rows before sync:

```ts
import { compareBomRows, printBomDiff } from '@dougborg/katana-sheets-toolkit/bomDiff';

const diff = compareBomRows(existing, desired);
printBomDiff(diff); // console table
```

## Subpath imports

```ts
// Root barrel
import { batchFetchVariantsBySkus, PropertiesServiceConfigProvider, setConfigProvider } from '@dougborg/katana-sheets-toolkit';

// Tree-shaken subpaths
import { fetchProductWithVariants } from '@dougborg/katana-sheets-toolkit/katana';
import { setConfigProvider } from '@dougborg/katana-sheets-toolkit/config';
import { compareBomRows } from '@dougborg/katana-sheets-toolkit/bomDiff';
import { RETRY_CONSTANTS } from '@dougborg/katana-sheets-toolkit/constants';
import type { components } from '@dougborg/katana-sheets-toolkit/katana.generated';
```

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
