/**
 * Toolkit configuration contract.
 *
 * The generic Katana + Google Sheets toolkit does not know the consumer's
 * PropertiesService key names, default location IDs, or retry policy
 * preferences. Consumers construct a `ConfigProvider` at module load and
 * register it via `setConfigProvider`. The toolkit reads its configuration
 * exclusively through this seam.
 *
 * @module ConfigProvider
 */

/** Katana API configuration required by the toolkit at call time. */
export interface KatanaConfig {
  /** API key used for Bearer authentication. */
  apiKey: string;
  /** Base URL for the Katana API (no trailing slash). */
  baseUrl: string;
  /** Default warehouse/location ID used when filtering inventory by location. */
  defaultLocationId: number;
}

/**
 * Runtime configuration source for the toolkit.
 *
 * Implementations may read from Apps Script `PropertiesService`, from a
 * static literal (for tests), or from any other source. Methods are called
 * lazily — do not hold cached values that could become stale across the
 * lifetime of a long-running handler.
 *
 * Note: retry/URL-batching tuning is currently read from constants inside
 * the Katana client, not through the provider. When that wiring lands,
 * corresponding `getRetry()` / `getUrl()` methods will be added here.
 */
export interface ConfigProvider {
  getKatana(): KatanaConfig;
  /** Escape hatch for consumer-specific property reads (e.g. Shopify tokens). */
  getProperty(key: string): string | null;
}

export const DEFAULT_KATANA_BASE_URL = 'https://api.katanamrp.com';

export interface PropertiesServiceConfigProviderOptions {
  /** PropertiesService key holding the Katana API token. Default: `KATANA_API_KEY`. */
  apiKeyProperty?: string;
  /** PropertiesService key holding the default Katana location ID. Default: `KATANA_SPOT_HQ_LOCATION_ID`. */
  locationIdProperty?: string;
  /** Fallback when the PropertiesService key is unset. */
  defaultLocationId?: number;
  /** Override the default Katana base URL (e.g. for a proxy). */
  baseUrl?: string;
}

/**
 * Default provider that reads from Google Apps Script PropertiesService.
 */
export class PropertiesServiceConfigProvider implements ConfigProvider {
  constructor(private readonly options: PropertiesServiceConfigProviderOptions = {}) {}

  getKatana(): KatanaConfig {
    const apiKeyProperty = this.options.apiKeyProperty ?? 'KATANA_API_KEY';
    const apiKey = this.getProperty(apiKeyProperty);
    if (!apiKey) {
      throw new Error(`${apiKeyProperty} not configured. Please set it in Script Properties.`);
    }

    const locationIdProperty = this.options.locationIdProperty ?? 'KATANA_SPOT_HQ_LOCATION_ID';
    const locationIdStr = this.getProperty(locationIdProperty);
    const optionFallback = this.options.defaultLocationId;
    const parsed = locationIdStr != null && locationIdStr !== '' ? parseInt(locationIdStr, 10) : Number.NaN;
    let defaultLocationId: number;
    if (Number.isFinite(parsed) && parsed > 0) {
      defaultLocationId = parsed;
    } else if (optionFallback != null && Number.isFinite(optionFallback) && optionFallback > 0) {
      if (locationIdStr != null && locationIdStr !== '') {
        console.log(
          `⚠️  ${locationIdProperty}="${locationIdStr}" is not a positive integer; falling back to constructor default ${optionFallback}.`
        );
      }
      defaultLocationId = optionFallback;
    } else {
      throw new Error(
        `Katana defaultLocationId could not be resolved. PropertiesService "${locationIdProperty}" was ${
          locationIdStr == null || locationIdStr === '' ? 'unset' : `"${locationIdStr}"`
        } and no PropertiesServiceConfigProviderOptions.defaultLocationId was supplied. ` +
          'Provide a positive integer so inventory location filtering has a target.'
      );
    }

    return {
      apiKey,
      baseUrl: this.options.baseUrl ?? DEFAULT_KATANA_BASE_URL,
      defaultLocationId
    };
  }

  getProperty(key: string): string | null {
    try {
      return PropertiesService.getScriptProperties().getProperty(key);
    } catch (error) {
      console.log(`⚠️  Failed to get property ${key}:`, error);
      return null;
    }
  }
}

export interface StaticConfigProviderOptions {
  katana?: Partial<KatanaConfig>;
  properties?: Record<string, string>;
}

/**
 * Literal, in-memory provider for tests and non-Apps-Script environments.
 */
export class StaticConfigProvider implements ConfigProvider {
  constructor(private readonly options: StaticConfigProviderOptions = {}) {}

  getKatana(): KatanaConfig {
    const apiKey = this.options.katana?.apiKey;
    if (!apiKey) {
      throw new Error('KATANA_API_KEY not configured. Please set it in Script Properties.');
    }
    return {
      apiKey,
      baseUrl: this.options.katana?.baseUrl ?? DEFAULT_KATANA_BASE_URL,
      defaultLocationId: this.options.katana?.defaultLocationId ?? 0
    };
  }

  getProperty(key: string): string | null {
    return this.options.properties?.[key] ?? null;
  }
}

let _provider: ConfigProvider | null = null;

/** Register the active provider. Call from consumer module load before any toolkit use. */
export function setConfigProvider(provider: ConfigProvider): void {
  _provider = provider;
}

/** Retrieve the active provider. Throws if unset — call `setConfigProvider` first. */
export function getConfigProvider(): ConfigProvider {
  if (!_provider) {
    throw new Error('ConfigProvider not set. Call setConfigProvider() at consumer module load.');
  }
  return _provider;
}

/** Test helper: clear the registered provider. */
export function __resetConfigProviderForTests(): void {
  _provider = null;
}
