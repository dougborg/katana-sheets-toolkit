/**
 * @dougborg/katana-sheets-toolkit — Katana MRP API client and Google
 * Sheets integration bindings for Google Apps Script projects.
 *
 * Builds on @dougborg/gas-utils (runtime helpers) and
 * @dougborg/gas-sheets-orm (sheet-as-database ORM); consumers typically
 * import from all three.
 *
 * Subpath imports available for finer-grained tree-shaking:
 * `@dougborg/katana-sheets-toolkit/katana`, `/config`, `/bomDiff`,
 * `/constants`, `/katana.generated`.
 */

// BOM diff helpers for reviewing sync operations
export * from './bomDiff.js';
// Config provider seam (Katana-typed)
export {
  __resetConfigProviderForTests,
  type ConfigProvider,
  DEFAULT_KATANA_BASE_URL,
  getConfigProvider,
  type KatanaConfig,
  PropertiesServiceConfigProvider,
  type PropertiesServiceConfigProviderOptions,
  StaticConfigProvider,
  type StaticConfigProviderOptions,
  setConfigProvider
} from './ConfigProvider.js';
// Shared constants (API limits, retry policy, pagination, UI timings)
export { API_CONSTANTS, PAGINATION_CONSTANTS, RETRY_CONSTANTS, UI_CONSTANTS } from './constants.js';
// Katana API client (full surface)
export * from './katanaClient.js';
