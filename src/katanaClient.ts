/**
 * Katana MRP API Client
 *
 * Provides a comprehensive TypeScript client for the Katana MRP REST API.
 * This module handles all interactions with Katana including:
 * - Variant and product management
 * - Bill of Materials (BOM) operations
 * - Inventory tracking
 * - Batch operations for efficiency
 * - Automatic pagination and rate limiting
 *
 * Features:
 * - Smart fetch wrapper with auto-pagination detection
 * - Rate limit handling with exponential backoff
 * - Type-safe API using generated OpenAPI types
 * - Batch operations to minimize API calls
 * - Response normalization for consistent data handling
 *
 * The client uses the Katana OpenAPI specification for type safety
 * and automatically handles authentication, retries, and error handling.
 *
 * @module lib/katanaClient
 */

import { defaultValidatorRegistry, KatanaAPIError, SheetOrmErrorCode } from '@dougborg/gas-sheets-orm';
import { EnhancedLogger } from '@dougborg/gas-utils';
import { getConfigProvider } from './ConfigProvider.js';
import { API_CONSTANTS, PAGINATION_CONSTANTS, RETRY_CONSTANTS, UI_CONSTANTS } from './constants.js';
import type { components } from './katana.generated.js';

/**
 * Type aliases for commonly used Katana API types from generated schemas
 */

/** Variant with embedded product_or_material data (when using extend=product_or_material) */
export type KatanaVariant = components['schemas']['VariantResponse'];
/** Base variant type without embedded parent (used by bomSync, skuListRefresh) */
export type KatanaVariantBase = components['schemas']['Variant'];
/** Katana product (finished good) */
export type KatanaProduct = components['schemas']['Product'];
/** Katana material (raw material/ingredient) */
export type KatanaMaterial = components['schemas']['Material'];
/** Inventory level data */
export type KatanaInventory = components['schemas']['Inventory'];
/** Bill of Materials row */
export type KatanaBomRow = components['schemas']['BomRow'];
/** Request payload for creating a single BOM row */
export type CreateBomRowRequest = components['schemas']['CreateBomRowRequest'];
/** Request payload for batch creating BOM rows */
export type BatchCreateBomRowsRequest = components['schemas']['BatchCreateBomRowsRequest'];
/** Request payload for creating a product */
export type CreateProductRequest = components['schemas']['CreateProductRequest'];
/** Request payload for creating a material */
export type CreateMaterialRequest = components['schemas']['CreateMaterialRequest'];
/** Request payload for updating a variant */
export type UpdateVariantRequest = components['schemas']['UpdateVariantRequest'];

/**
 * Pagination metadata from X-Pagination header
 *
 * Note: API returns these as strings despite being numeric values
 */
interface KatanaPaginationMeta {
  total_records: string;
  total_pages: string;
  offset: string;
  page: string;
  first_page: string;
  last_page: string;
}

function katanaBaseUrl(): string {
  return getConfigProvider().getKatana().baseUrl;
}

/**
 * Options for the smart Katana API fetch wrapper
 */
interface KatanaFetchOptions {
  /** HTTP method (default: 'GET') */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Additional HTTP headers to include in the request */
  headers?: Record<string, string>;
  /** JSON payload for POST/PUT/PATCH requests */
  payload?: string;
  /** Maximum retry attempts for rate limiting (default: 5) */
  maxRetries?: number;
}

/**
 * Smart Katana API fetch wrapper with automatic pagination and retry logic
 *
 * Provides a unified interface for all Katana API requests with built-in:
 * - Rate limiting detection and Retry-After header handling
 * - Automatic pagination for GET requests (detected via X-Pagination header)
 * - Exponential backoff retry logic for server errors
 * - Authentication via Bearer token
 * - Response normalization for consistent data structures
 *
 * For GET requests that return paginated data, this function automatically
 * detects the X-Pagination header and fetches all pages, returning a
 * consolidated array. For single-page or non-GET requests, returns the
 * direct response data.
 *
 * @template T The expected response data type
 * @param path API endpoint path (e.g., '/v1/variants')
 * @param options Fetch options including method, headers, payload, and retry config
 * @returns For paginated GET requests: array of all items across pages.
 *          For single-page responses: the response data (may be single object or array).
 *          For DELETE requests with no content: null
 * @throws {Error} If API returns 4xx client error (non-retryable)
 * @throws {Error} If max retries exceeded for 429 or 5xx errors
 *
 * @example
 * // Fetch a single variant (returns single object)
 * const variant = katanaSmartFetch<KatanaVariant>('/v1/variants/12345');
 *
 * @example
 * // Fetch all variants (auto-paginated, returns array)
 * const variants = katanaSmartFetch<KatanaVariant>(`/v1/variants?limit=${API_CONSTANTS.KATANA_API_LIMIT}`);
 *
 * @example
 * // Create a BOM row (POST request)
 * const bomRow = katanaSmartFetch<KatanaBomRow>('/v1/bom_rows', {
 *   method: 'POST',
 *   payload: JSON.stringify(bomRowData)
 * });
 */
export function katanaSmartFetch<T>(path: string, options: KatanaFetchOptions = {}): T[] | T {
  const { method = 'GET', headers = {}, payload, maxRetries = RETRY_CONSTANTS.DEFAULT_MAX_RETRIES } = options;

  const apiKey = getKatanaApiKey();

  // Build base fetch options
  const baseOptions: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
    method: method.toLowerCase() as any,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...headers
    },
    muteHttpExceptions: true
  };

  if (payload) {
    baseOptions.payload = payload;
    if (baseOptions.headers) {
      baseOptions.headers['Content-Type'] = 'application/json';
    }
  }

  // For GET requests, check for auto-pagination
  if (method === 'GET') {
    return fetchWithAutoPagination<T>(path, baseOptions, maxRetries);
  }

  // For non-GET requests, handle as single request
  const response = fetchWithRetryLogic(`${katanaBaseUrl()}${path}`, baseOptions, maxRetries);

  const responseText = response.getContentText();
  if (!responseText) {
    return null as any; // No content (e.g., DELETE requests)
  }

  const data = JSON.parse(responseText);
  return normalizeKatanaResponse<T>(data) as T;
}

/**
 * Base fetch function with retry logic that returns the raw HTTPResponse.
 * All other fetch functions should use this as their foundation.
 */
function fetchWithRetryLogic(
  url: string,
  options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions,
  maxRetries: number
): GoogleAppsScript.URL_Fetch.HTTPResponse {
  let attempt = 0;
  let delay: number = RETRY_CONSTANTS.BASE_DELAY_MS; // Start with base delay

  while (attempt < maxRetries) {
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();

    // Success codes
    if (code >= 200 && code < 300) {
      return response;
    }

    // Rate limiting
    if (code === 429) {
      const headers = response.getAllHeaders() as Record<string, string>;
      const retryAfter = headers['Retry-After'] || headers['retry-after'];
      const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;

      console.log(`⏰ Rate limited (attempt ${attempt + 1}/${maxRetries}), waiting ${waitMs}ms...`);
      Utilities.sleep(waitMs);

      if (!retryAfter) {
        delay *= 2; // Exponential backoff if no Retry-After header
      }

      attempt++;
      continue;
    }

    // Server errors (5xx) - retry with exponential backoff
    if (code >= 500 && code < 600) {
      console.log(`🔄 Server error ${code} (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`);
      Utilities.sleep(delay);
      delay *= 2;
      attempt++;
      continue;
    }

    // Client errors (4xx) - don't retry, throw immediately
    const errorCode =
      code === 401 || code === 403
        ? SheetOrmErrorCode.KATANA_API_AUTH_ERROR
        : code === 404
          ? SheetOrmErrorCode.KATANA_API_NOT_FOUND
          : code === 422
            ? SheetOrmErrorCode.KATANA_API_VALIDATION_ERROR
            : SheetOrmErrorCode.KATANA_API_ERROR;

    const responseBody = response.getContentText();
    throw new KatanaAPIError(
      `Katana API error ${code} for ${url}${responseBody ? `: ${responseBody}` : ''}`,
      errorCode,
      {
        statusCode: code,
        url,
        responseBody
      }
    );
  }

  throw new KatanaAPIError(`Katana API failed after ${maxRetries} attempts for ${url}`, SheetOrmErrorCode.API_TIMEOUT, {
    maxRetries,
    url
  });
}

/**
 * Handles GET requests with automatic pagination detection.
 * Makes first request to check for X-Pagination header, then continues pagination if needed.
 */
function fetchWithAutoPagination<T>(
  path: string,
  baseOptions: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions,
  maxRetries: number
): T[] | T {
  // Make first request using base fetch function
  const url = `${katanaBaseUrl()}${path}`;
  const response = fetchWithRetryLogic(url, baseOptions, maxRetries);

  const responseText = response.getContentText();
  if (!responseText) {
    return null as any; // No content
  }

  const data = JSON.parse(responseText);
  const firstResponse = normalizeKatanaResponse<T>(data);

  // Check for pagination header
  const headers = response.getAllHeaders() as Record<string, string>;
  const paginationHeader = headers ? headers['X-Pagination'] || headers['x-pagination'] : undefined;

  console.log(`🔍 Pagination header: ${paginationHeader || 'NOT FOUND'}`);

  // If no pagination header, return the single response
  if (!paginationHeader) {
    console.log(
      `ℹ️ No pagination header found, returning single page with ${Array.isArray(firstResponse) ? firstResponse.length : 1} items`
    );
    return firstResponse as T;
  }

  // Parse pagination metadata
  let paginationMeta: KatanaPaginationMeta;
  try {
    paginationMeta = JSON.parse(paginationHeader);
    console.log(`📄 Pagination metadata:`, paginationMeta);
  } catch (error) {
    EnhancedLogger.logError(
      error as Error,
      {
        function: 'fetchWithAutoPagination',
        module: 'katanaClient',
        contextData: { paginationHeaderSample: paginationHeader?.slice(0, 200) }
      },
      'warn'
    );
    // Return first page data only; caller gets partial results with a logged warning.
    return firstResponse as T;
  }

  // If only one page, return the first response
  if (paginationMeta.last_page === 'true' || parseInt(paginationMeta.total_pages, 10) <= 1) {
    console.log(
      `ℹ️ Only one page found (last_page: ${paginationMeta.last_page}, total_pages: ${paginationMeta.total_pages})`
    );
    return firstResponse as T;
  }

  // Multiple pages exist - use the full pagination logic starting from the next page
  // Pass the first response data and pagination metadata to avoid duplicate request
  const nextPage = parseInt(paginationMeta.page, 10) + 1;
  console.log(
    `📚 Multiple pages detected (${paginationMeta.total_pages} total), fetching remaining pages starting from page ${nextPage}`
  );
  return fetchAllPages<T>(
    path,
    baseOptions,
    maxRetries,
    firstResponse as T[],
    nextPage,
    parseInt(paginationMeta.total_pages, 10)
  );
}

/**
 * Result of pagination decision logic
 */
export interface PaginationDecision {
  hasMore: boolean;
  nextPage: number;
}

/**
 * Handles error-based delay calculation for retry logic
 * @internal Exported for testing purposes only
 */
export function calculateRetryDelay(error: Error, currentDelay: number, page: number): number {
  const errorMsg = error.toString();

  if (errorMsg.includes('Timeout') || errorMsg.includes('timeout')) {
    console.log(`⏱️ Timeout detected on page ${page}, will retry with exponential backoff`);
    const timeoutDelay = Math.min(
      currentDelay * RETRY_CONSTANTS.BACKOFF_MULTIPLIER,
      RETRY_CONSTANTS.MAX_TIMEOUT_DELAY_MS
    );
    console.log(`⏰ Waiting ${timeoutDelay}ms before retry...`);
    return timeoutDelay;
  }

  if (errorMsg.includes('rate') || errorMsg.includes('limit')) {
    console.log(`🚫 Rate limit error detected on page ${page}, using longer backoff`);
    const rateLimitDelay = Math.min(
      currentDelay * RETRY_CONSTANTS.RATE_LIMIT_BACKOFF_MULTIPLIER,
      RETRY_CONSTANTS.MAX_RATE_LIMIT_DELAY_MS
    );
    console.log(`⏰ Waiting ${rateLimitDelay}ms before retry...`);
    return rateLimitDelay;
  }

  console.log(`🔄 Generic error on page ${page}, using standard backoff`);
  return currentDelay * RETRY_CONSTANTS.BACKOFF_MULTIPLIER;
}

/**
 * Determines if pagination should continue based on response headers
 * @internal Exported for testing purposes only
 */
export function decidePaginationContinuation(
  response: GoogleAppsScript.URL_Fetch.HTTPResponse,
  currentPage: number,
  totalPages: number | undefined,
  basePath: string
): PaginationDecision {
  const headers = response.getAllHeaders() as Record<string, string>;
  const paginationHeader = headers['X-Pagination'] || headers['x-pagination'];

  if (paginationHeader) {
    try {
      const paginationMeta: KatanaPaginationMeta = JSON.parse(paginationHeader);
      console.log(`📄 Page ${currentPage} pagination metadata:`, paginationMeta);

      if (paginationMeta.last_page === 'true') {
        console.log(
          `✅ Reached last page (last_page: ${paginationMeta.last_page}, page: ${paginationMeta.page}/${paginationMeta.total_pages})`
        );
        return { hasMore: false, nextPage: currentPage };
      }

      if (parseInt(paginationMeta.page, 10) < parseInt(paginationMeta.total_pages, 10)) {
        console.log(`➡️ More pages available, continuing to page ${currentPage + 1}`);
        return { hasMore: true, nextPage: currentPage + 1 };
      }

      console.log(`✅ Pagination complete (page: ${paginationMeta.page}/${paginationMeta.total_pages})`);
      return { hasMore: false, nextPage: currentPage };
    } catch (error) {
      EnhancedLogger.logError(
        error as Error,
        {
          function: 'decidePaginationContinuation',
          module: 'katanaClient',
          contextData: { paginationHeaderSample: paginationHeader?.slice(0, 200), page: currentPage, basePath }
        },
        'warn'
      );
      return { hasMore: false, nextPage: currentPage };
    }
  }

  if (totalPages && currentPage < totalPages) {
    return { hasMore: true, nextPage: currentPage + 1 };
  }

  return { hasMore: false, nextPage: currentPage };
}

/**
 * Logs debug information about the API response for the first page
 * @internal Exported for testing purposes only
 */
export function logResponseDebugInfo(data: any, page: number, basePath: string): void {
  if (page !== 1 || !basePath.includes('/v1/variants')) {
    return;
  }

  if (Array.isArray(data)) {
    console.log(`🔍 API response: direct array with ${data.length} items`);
    if (data.length > 0) {
      const firstItem = data[0] as any;
      console.log(`🔍 First item keys: ${Object.keys(firstItem).join(', ')}`);
      if (firstItem.sku) {
        console.log(`🔍 First SKU found: ${firstItem.sku}`);
      }
    }
  } else {
    console.log(`🔍 API response keys: ${Object.keys(data).join(', ')}`);
  }
}

/**
 * Attempts to fetch a single page with retry logic
 * Returns the HTTPResponse or null if all retries failed
 * @internal Exported for testing purposes only
 */
export function fetchPageWithRetry(
  url: string,
  baseOptions: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions,
  page: number,
  maxRetries: number
): GoogleAppsScript.URL_Fetch.HTTPResponse | null {
  let attempt = 0;
  let delay: number = RETRY_CONSTANTS.BASE_DELAY_MS;

  while (attempt < maxRetries) {
    try {
      console.log(`🔄 Attempting page ${page} fetch (attempt ${attempt + 1}/${maxRetries}): ${url}`);
      const response = UrlFetchApp.fetch(url, baseOptions);
      const code = response.getResponseCode();

      if (code >= 200 && code < 300) {
        console.log(`✅ Page ${page} fetch successful (${code})`);
        return response;
      }

      // Rate limiting
      if (code === 429) {
        const headers = response.getAllHeaders() as Record<string, string>;
        const retryAfter = headers['Retry-After'] || headers['retry-after'];
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : delay;

        console.log(`⏰ Rate limited on page ${page} (attempt ${attempt + 1}/${maxRetries}), waiting ${waitMs}ms...`);
        Utilities.sleep(waitMs);

        if (!retryAfter) {
          delay *= 2; // Exponential backoff if no Retry-After header
        }

        attempt++;
        continue;
      }

      // Server errors (5xx) - retry with exponential backoff
      if (code >= 500 && code < 600) {
        console.log(
          `🔧 Server error ${code} on page ${page} (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms...`
        );
        Utilities.sleep(delay);
        delay *= 2;
        attempt++;
        continue;
      }

      // Client errors (4xx) - don't retry, throw immediately
      const errorCode =
        code === 401 || code === 403
          ? SheetOrmErrorCode.KATANA_API_AUTH_ERROR
          : code === 404
            ? SheetOrmErrorCode.KATANA_API_NOT_FOUND
            : code === 422
              ? SheetOrmErrorCode.KATANA_API_VALIDATION_ERROR
              : SheetOrmErrorCode.KATANA_API_ERROR;

      const responseBody = response.getContentText();
      throw new KatanaAPIError(
        `Katana API error ${code} for page ${page}${responseBody ? `: ${responseBody}` : ''}`,
        errorCode,
        {
          statusCode: code,
          page,
          responseBody
        }
      );
    } catch (error) {
      const errorMsg = (error as Error).toString();
      console.log(`❌ Page ${page} fetch failed (attempt ${attempt + 1}/${maxRetries}): ${errorMsg}`);

      delay = calculateRetryDelay(error as Error, delay, page);
      Utilities.sleep(delay);
      attempt++;

      if (attempt >= maxRetries) {
        console.log(`💥 All ${maxRetries} attempts failed for page ${page}. Error: ${errorMsg}`);
        return null;
      }
    }
  }

  return null;
}

/**
 * Fetches all pages from a paginated endpoint
 */
function fetchAllPages<T>(
  basePath: string,
  baseOptions: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions,
  maxRetries: number,
  firstPageData?: T[],
  startPage?: number,
  totalPages?: number
): T[] {
  const allData: T[] = firstPageData ? [...firstPageData] : [];
  let page = startPage || (firstPageData ? 2 : 1); // Start from specified page or page 2 if we already have first page data
  let hasMore = true;

  console.log(
    `📚 Starting fetchAllPages: page ${page}, totalPages: ${totalPages}, firstPageData: ${firstPageData?.length || 0} items`
  );

  let finalPage = 1; // Track the highest page number we successfully fetched

  while (hasMore) {
    // Add page parameter to URL
    const separator = basePath.includes('?') ? '&' : '?';
    const pagedPath = `${basePath}${separator}page=${page}`;

    console.log(`📄 Fetching page ${page}: ${pagedPath}`);

    const url = `${katanaBaseUrl()}${pagedPath}`;
    const response = fetchPageWithRetry(url, baseOptions, page, maxRetries);

    if (!response) {
      const contextMsg = `Failed to fetch page ${page}/${totalPages || 'unknown'} of ${basePath} after ${maxRetries} attempts`;
      console.log(`💥 ${contextMsg}`);

      // Provide more context about pagination state
      if (allData.length > 0) {
        console.log(`📊 Partial data available: ${allData.length} items from ${page - 1} successful pages`);
        console.log(`⚠️ Returning partial results due to pagination failure`);
        // Return what we have so far rather than throwing - this is often more useful
        return allData;
      }

      throw new KatanaAPIError(
        `Katana API pagination failed: ${contextMsg}`,
        SheetOrmErrorCode.KATANA_API_PAGINATION_ERROR,
        {
          contextMsg
        }
      );
    }

    finalPage = page;

    const responseText = response.getContentText();
    if (!responseText) {
      hasMore = false;
      break;
    }

    const data = JSON.parse(responseText);
    logResponseDebugInfo(data, page, basePath);

    // Normalize the response to handle both direct arrays and wrapped responses
    const normalized = normalizeKatanaResponse<T>(data);

    // Handle array responses (main pagination case)
    if (Array.isArray(normalized)) {
      allData.push(...normalized);
      const progressMsg = totalPages
        ? `✅ Page ${page}/${totalPages}: Added ${normalized.length} items (${allData.length} total)`
        : `✅ Page ${page}: Added ${normalized.length} items (${allData.length} total)`;
      console.log(progressMsg);

      // Log progress milestones for large datasets
      if (allData.length > 0 && allData.length % PAGINATION_CONSTANTS.MILESTONE_INTERVAL === 0) {
        console.log(`📈 Pagination milestone: ${allData.length} items collected`);
      }

      // Determine if we should continue pagination
      const decision = decidePaginationContinuation(response, page, totalPages, basePath);
      hasMore = decision.hasMore;
      page = decision.nextPage;
    } else if (normalized) {
      // Single item response - add to array and stop pagination
      allData.push(normalized as T);
      hasMore = false;
    } else {
      // No data found, stop pagination
      hasMore = false;
    }
  }

  if (basePath.includes('/v1/variants')) {
    console.log(`✅ Batch fetch completed: ${allData.length} variants found with embedded parent names`);
  } else if (basePath.includes('/v1/bom_rows')) {
    console.log(`✅ BOM rows fetch completed: ${allData.length} rows found`);
  } else {
    console.log(`✅ API fetch completed: ${allData.length} items found`);
  }

  console.log(`📚 Pagination summary - Path: ${basePath}, Total items: ${allData.length}, Final page: ${finalPage}`);
  return allData;
}

/**
 * Retrieves Katana API key from configuration
 *
 * @returns Katana API key for Bearer token authentication
 * @throws {Error} If API key is not configured in PropertiesService
 */
export function getKatanaApiKey() {
  return getConfigProvider().getKatana().apiKey;
}

/**
 * Helper function to normalize Katana API responses that can be either:
 * - Direct arrays: T[]
 * - Wrapped responses: { data: T[] }
 * - Single entities: T
 * - Wrapped single entities: { data: T }
 */
function normalizeKatanaResponse<T>(response: any): T[] | T | null {
  if (!response) {
    return null;
  }

  // If it's already an array, return as-is (direct array response)
  if (Array.isArray(response)) {
    return response as T[];
  }

  // If it has a 'data' property, unwrap it
  if (response && typeof response === 'object' && 'data' in response) {
    const data = response.data;

    // Handle wrapped arrays
    if (Array.isArray(data)) {
      return data as T[];
    }

    // Handle wrapped single entities
    if (data) {
      return data as T;
    }

    // Empty data
    return null;
  }

  // Direct single entity response
  return response as T;
}

/**
 * Fetches a single variant by SKU from Katana API
 *
 * Queries the Katana API for a variant matching the provided SKU.
 * Automatically includes parent product/material data using the
 * extend=product_or_material query parameter.
 *
 * @param sku Product or material SKU to search for
 * @returns Variant entity with embedded parent data, or null if not found
 *
 * @example
 * const variant = fetchVariantFromAPI('BIKE-001');
 * if (variant && variant.product_or_material) {
 *   console.log(`Found: ${variant.product_or_material.name}`);
 * }
 */
export function fetchVariantFromAPI(sku: string): KatanaVariant | null {
  const path = `/v1/variants?sku=${encodeURIComponent(sku)}&extend=product_or_material`;
  const response = katanaSmartFetch<KatanaVariant>(path);

  const normalized = normalizeKatanaResponse<KatanaVariant>(response);

  // Handle array responses (take first item)
  if (Array.isArray(normalized)) {
    return normalized.length > 0 ? normalized[0] : null;
  }

  // Handle single entity responses
  return normalized || null;
}

/**
 * Fetches product or material name by ID from Katana API
 *
 * Given either a product ID or material ID, fetches the entity
 * and returns its name. Used when variant data doesn't include
 * the embedded parent information.
 *
 * @param productId Product ID (mutually exclusive with materialId)
 * @param materialId Material ID (mutually exclusive with productId)
 * @returns Parent entity name
 * @throws {Error} If neither productId nor materialId is provided
 * @throws {Error} If the fetched entity is missing a name field
 *
 * @example
 * const name = fetchParentNameFromAPI(123, null);
 * console.log(`Product name: ${name}`);
 */
export function fetchParentNameFromAPI(productId: number | null, materialId: number | null): string {
  let path;
  if (productId) {
    path = `/v1/products/${encodeURIComponent(productId)}`;
  } else if (materialId) {
    path = `/v1/materials/${encodeURIComponent(materialId)}`;
  } else {
    throw new Error('Variant has neither product_id nor material_id.');
  }

  const response = katanaSmartFetch<KatanaProduct | KatanaMaterial>(path);
  const normalized = normalizeKatanaResponse<KatanaProduct | KatanaMaterial>(response);

  let entity: KatanaProduct | KatanaMaterial;

  // Handle array responses (take first item)
  if (Array.isArray(normalized)) {
    entity = normalized[0];
  } else {
    entity = normalized as KatanaProduct | KatanaMaterial;
  }

  if (!entity?.name) {
    throw new Error(`Missing 'name' field in response for ${path}`);
  }
  return entity.name;
}

/**
 * Generic paginated fetch from Katana API
 *
 * Fetches all pages of data from a Katana API endpoint and returns
 * a consolidated array. Automatically handles pagination detection
 * and follows X-Pagination headers.
 *
 * @template T The expected entity type
 * @param path API endpoint path (e.g., `/v1/products?limit=${API_CONSTANTS.KATANA_API_LIMIT}`)
 * @returns Array of all entities across all pages
 *
 * @example
 * const allProducts = fetchPaginatedFromAPI<KatanaProduct>(`/v1/products?limit=${API_CONSTANTS.KATANA_API_LIMIT}`);
 * console.log(`Found ${allProducts.length} total products`);
 */
export function fetchPaginatedFromAPI<T>(path: string): T[] {
  // Use the smart fetch - it will automatically handle pagination for list endpoints
  const result = katanaSmartFetch<T>(path);

  // Ensure we always return an array, even for single responses
  return Array.isArray(result) ? result : [result];
}

/**
 * Fetches inventory data for a variant by ID
 *
 * Queries the Katana inventory endpoint for a specific variant's
 * inventory level information.
 *
 * @param variantId Katana variant ID
 * @returns Inventory entity with stock levels, or null if not found
 *
 * @example
 * const inventory = fetchInventoryFromAPI(12345);
 * if (inventory) {
 *   console.log(`Available: ${inventory.in_stock}`);
 * }
 */
export function fetchInventoryFromAPI(variantId: number): KatanaInventory | null {
  const path = `/v1/inventory?variant_id=${encodeURIComponent(variantId.toString())}`;
  const response = katanaSmartFetch<KatanaInventory>(path);

  const normalized = normalizeKatanaResponse<KatanaInventory>(response);

  // Handle array responses (take first item)
  if (Array.isArray(normalized)) {
    return normalized.length > 0 ? normalized[0] : null;
  }

  // Handle single entity responses
  return normalized || null;
}

/**
 * Calculate safe batch size for variant ID queries to avoid URLFetch length limit
 * Google Apps Script URLFetch has a 2KB URL length limit
 */
function calculateSafeBatchSize(baseUrl: string): number {
  // Estimate characters per variant_id parameter: "variant_id=12345&" ≈ 18 chars
  const CHARS_PER_VARIANT_ID = 18;

  const availableChars = API_CONSTANTS.URL_LENGTH_LIMIT - baseUrl.length - API_CONSTANTS.URL_SAFETY_MARGIN;
  const maxIds = Math.floor(availableChars / CHARS_PER_VARIANT_ID);

  // Cap at reasonable batch size to avoid overly large requests
  return Math.min(maxIds, API_CONSTANTS.MAX_BATCH_SIZE);
}

/**
 * Batch fetches inventory data for multiple variant IDs
 *
 * Efficiently retrieves inventory information for many variants in a single
 * operation by batching requests. Automatically splits large requests to
 * avoid Google Apps Script URLFetch length limits (2KB).
 *
 * Results are automatically filtered to:
 * - Only include requested variant IDs
 * - Only include "Spot HQ" location inventory
 *
 * @param variantIds Array of Katana variant IDs to fetch inventory for
 * @returns Array of inventory entities for the requested variants at Spot HQ location
 *
 * @example
 * const variantIds = [123, 456, 789];
 * const inventories = batchFetchInventoryByVariantIds(variantIds);
 * inventories.forEach(inv => {
 *   console.log(`Variant ${inv.variant_id}: ${inv.in_stock} in stock`);
 * });
 */
export function batchFetchInventoryByVariantIds(variantIds: number[]): KatanaInventory[] {
  if (variantIds.length === 0) return [];

  console.log(`🔄 Batch fetching inventory for ${variantIds.length} variant IDs...`);

  // Calculate optimal batch size to avoid URL length limit
  const baseUrl = katanaBaseUrl();
  const basePath = `/v1/inventory?limit=${API_CONSTANTS.KATANA_API_LIMIT}&`;
  const batchSize = calculateSafeBatchSize(`${baseUrl}${basePath}`);

  console.log(`📏 Using batch size of ${batchSize} IDs per request`);

  const SPOT_HQ_LOCATION_ID = getConfigProvider().getKatana().defaultLocationId;
  let allInventory: KatanaInventory[] = [];

  // Split variant IDs into dynamically sized batches
  let processedIds = 0;
  while (processedIds < variantIds.length) {
    const batchNumber = Math.floor(processedIds / batchSize) + 1;
    const totalBatches = Math.ceil(variantIds.length / batchSize);

    // Start with the calculated batch size
    const currentBatch = variantIds.slice(processedIds, processedIds + batchSize);

    // Try to add more IDs if there's room in the URL
    const remainingIds = variantIds.slice(processedIds + batchSize);

    while (remainingIds.length > 0) {
      // Build test URL with one more ID
      const testBatch = [...currentBatch, remainingIds[0]];
      const testIdParams = testBatch.map((id) => `variant_id=${encodeURIComponent(id.toString())}`).join('&');
      const testPath = `/v1/inventory?${testIdParams}&limit=${API_CONSTANTS.KATANA_API_LIMIT}`;
      const testUrl = `${baseUrl}${testPath}`;

      // If adding this ID would exceed the limit, stop
      if (testUrl.length > API_CONSTANTS.URL_LENGTH_THRESHOLD) {
        // Leave some safety margin
        break;
      }

      // Add the ID and continue
      currentBatch.push(remainingIds.shift()!);
    }

    console.log(
      `📦 Fetching batch ${batchNumber}/${totalBatches} (${currentBatch.length} IDs, optimized from ${batchSize})`
    );

    // Build query with repeated variant_id parameters for this batch
    const idParams = currentBatch.map((id) => `variant_id=${encodeURIComponent(id.toString())}`).join('&');
    const repeatedPath = `/v1/inventory?${idParams}&limit=${API_CONSTANTS.KATANA_API_LIMIT}`;

    // Debug URL length
    const fullUrl = `${baseUrl}${repeatedPath}`;
    console.log(`🔍 Batch ${batchNumber} URL length: ${fullUrl.length}/${API_CONSTANTS.URL_LENGTH_LIMIT} chars`);

    const batchInventory = fetchPaginatedFromAPI<KatanaInventory>(repeatedPath);
    allInventory = allInventory.concat(batchInventory);

    console.log(`✅ Batch ${batchNumber} completed: ${batchInventory.length} records`);

    processedIds += currentBatch.length;
  }

  // Filter to only include inventory for our requested variant IDs and "Spot HQ" location
  const variantIdSet = new Set(variantIds.map((id) => id.toString()));

  const filteredInventory = allInventory.filter((inv) => {
    // Must be one of our requested variants
    if (!inv.variant_id || !variantIdSet.has(inv.variant_id.toString())) {
      return false;
    }

    // Must be from "Spot HQ" location (ID: 160411)
    if (inv.location_id) {
      return inv.location_id === SPOT_HQ_LOCATION_ID;
    }

    // If no location_id, exclude it (we want only Spot HQ records)
    return false;
  });

  console.log(
    `✅ Batch inventory fetch completed: ${filteredInventory.length} "Spot HQ" records found (filtered from ${allInventory.length} total)`
  );
  return filteredInventory;
}

/**
 * Generic batch fetch function for entities with ID and name fields.
 * Returns map of entity ID to name.
 */
function batchFetchEntityNames<T extends { id: number; name: string }>(
  ids: string[],
  endpoint: string,
  entityType: string
): Map<string, string> {
  if (ids.length === 0) return new Map();

  console.log(`🔄 Batch fetching ${ids.length} ${entityType} names...`);

  const nameMap = new Map<string, string>();
  const allEntities = fetchPaginatedFromAPI<T>(endpoint);
  const idSet = new Set(ids.map((id) => String(id)));

  allEntities.forEach((entity) => {
    const entityIdStr = String(entity.id);
    if (idSet.has(entityIdStr) && entity.name) {
      nameMap.set(entityIdStr, entity.name);
    }
  });

  console.log(`✅ ${entityType} names batch fetch completed: ${nameMap.size}/${ids.length} found`);
  return nameMap;
}

/**
 * Batch fetches product names by IDs
 *
 * Retrieves product names for multiple product IDs in a single operation.
 *
 * @param productIds Array of product ID strings
 * @returns Map of product ID to product name
 *
 * @example
 * const names = batchFetchProductNames(['123', '456']);
 * console.log(names.get('123')); // "Bike Frame - Red"
 */
export function batchFetchProductNames(productIds: string[]): Map<string, string> {
  return batchFetchEntityNames<KatanaProduct>(productIds, '/v1/products', 'product');
}

/**
 * Batch fetches material names by IDs
 *
 * Retrieves material names for multiple material IDs in a single operation.
 *
 * @param materialIds Array of material ID strings
 * @returns Map of material ID to material name
 *
 * @example
 * const names = batchFetchMaterialNames(['789', '012']);
 * console.log(names.get('789')); // "Aluminum Tubing"
 */
export function batchFetchMaterialNames(materialIds: string[]): Map<string, string> {
  return batchFetchEntityNames<KatanaMaterial>(materialIds, '/v1/materials', 'material');
}

/**
 * Batch fetches multiple variants by SKUs with embedded parent data
 *
 * Efficiently retrieves variant information for multiple SKUs in a single
 * API call. Automatically includes parent product/material information
 * using the extend=product_or_material query parameter.
 *
 * This is significantly more efficient than making individual fetchVariantFromAPI
 * calls when you need to look up multiple SKUs.
 *
 * @param skus Array of product or material SKUs to fetch
 * @returns Array of variant entities with embedded parent product/material data
 *
 * @example
 * const skus = ['BIKE-001', 'BIKE-002', 'FRAME-003'];
 * const variants = batchFetchVariantsBySkus(skus);
 * variants.forEach(v => {
 *   if (v.product_or_material) {
 *     console.log(`${v.sku}: ${v.product_or_material.name}`);
 *   }
 * });
 */
export function batchFetchVariantsBySkus(skus: string[]): KatanaVariant[] {
  if (skus.length === 0) return [];

  // Prefer the consumer-registered 'sku' validator (carries per-app rules
  // like max-length); fall back to an inline trim + control-char check if
  // nothing is registered. The inline check alone does NOT enforce a
  // length cap, so long SKUs can push the repeated-`sku=` URL over the
  // Apps Script 2KB limit. See TODO below.
  const hasRegisteredValidator = defaultValidatorRegistry.has('sku');
  const sanitizedSkus: string[] = [];
  for (const rawSku of skus) {
    try {
      if (hasRegisteredValidator) {
        sanitizedSkus.push(defaultValidatorRegistry.run('sku', rawSku) as string);
        continue;
      }
      const trimmed = typeof rawSku === 'string' ? rawSku.trim() : '';
      if (!trimmed || /[\u0000-\u001f]/.test(trimmed)) {
        throw new Error('invalid SKU');
      }
      sanitizedSkus.push(trimmed);
    } catch (error) {
      console.log(
        `❌ Skipping invalid SKU in batchFetchVariantsBySkus: "${rawSku}" - ${EnhancedLogger.getErrorMessage(error)}`
      );
    }
  }

  if (sanitizedSkus.length === 0) {
    console.log('⚠️ No valid SKUs provided to batchFetchVariantsBySkus; returning empty result.');
    return [];
  }

  const uniqueSkus = Array.from(new Set(sanitizedSkus));

  console.log(`🔄 Batch fetching ${uniqueSkus.length} SKUs with extended product_or_material data...`);

  if (uniqueSkus.length > 0) {
    const sampleSkus = uniqueSkus.slice(0, Math.min(UI_CONSTANTS.MAX_SAMPLE_SKUS, uniqueSkus.length));
    console.log(
      `🔍 Sample SKUs: ${sampleSkus.join(', ')}${uniqueSkus.length > UI_CONSTANTS.MAX_SAMPLE_SKUS ? '...' : ''}`
    );
  }

  // Build query with repeated sku parameters and extend product_or_material: ?sku=ABC&sku=DEF&extend=product_or_material
  const skuParams = uniqueSkus.map((sku) => `sku=${encodeURIComponent(sku)}`).join('&');
  const repeatedPath = `/v1/variants?${skuParams}&extend=product_or_material&limit=${API_CONSTANTS.KATANA_API_LIMIT}`;

  console.log(
    `🔍 API path: ${repeatedPath.substring(0, UI_CONSTANTS.LOG_TRUNCATE_LENGTH)}${repeatedPath.length > UI_CONSTANTS.LOG_TRUNCATE_LENGTH ? '...' : ''}`
  );

  const variants = fetchPaginatedFromAPI<KatanaVariant>(repeatedPath);
  console.log(`✅ Batch fetch completed: ${variants.length} variants found with embedded parent names`);
  return variants;
}

// ==========================================
// BOM Functions
// ==========================================

/**
 * Creates a single BOM row in Katana
 *
 * Creates a new Bill of Materials row linking an ingredient variant
 * to a product variant with a specified quantity. The BOM row defines
 * how much of an ingredient is needed to produce one unit of the product.
 *
 * @param request BOM row creation request with product_variant_id, ingredient_variant_id, and quantity
 * @returns The created BOM row entity
 * @throws {Error} If the API call fails or returns an error response
 *
 * @example
 * const bomRow = createBomRow({
 *   product_variant_id: 12345,
 *   ingredient_variant_id: 67890,
 *   quantity_per_unit: 2,
 *   notes: 'Optional build notes'
 * });
 * console.log(`Created BOM row ${bomRow.id}`);
 */
export function createBomRow(request: CreateBomRowRequest): KatanaBomRow {
  console.log(
    `🧩 Creating BOM row for product variant ${request.product_variant_id} with ingredient ${request.ingredient_variant_id}`
  );

  const performCreate = (): KatanaBomRow => {
    const response = katanaSmartFetch<KatanaBomRow>(`/v1/bom_rows`, {
      method: 'POST',
      payload: JSON.stringify(request)
    });

    const normalized = normalizeKatanaResponse<KatanaBomRow>(response);

    // Handle array responses (take first item)
    if (Array.isArray(normalized)) {
      return normalized[0];
    } else {
      return normalized as KatanaBomRow;
    }
  };

  // First attempt
  let result = performCreate();

  // Prepare expected values for validation
  const expectedChanges = {
    ingredient_variant_id: request.ingredient_variant_id,
    quantity: request.quantity ?? undefined,
    notes: request.notes
  };

  // Validate the response
  if (!validateBomRowResponse(result, expectedChanges, 'create')) {
    console.log(`⏳ Create validation failed, retrying after 500ms...`);
    Utilities.sleep(500);

    // Retry once
    result = performCreate();

    // Final validation
    if (!validateBomRowResponse(result, expectedChanges, 'create')) {
      console.log(`❌ Create validation failed after retry for product variant: ${request.product_variant_id}`);
      // Continue execution but log the issue - don't fail the entire operation
    } else {
      console.log(`✅ Create validation passed after retry for BOM row: ${result.id}`);
    }
  } else {
    console.log(`✅ Created BOM row: ${result.id}`);
  }

  return result;
}

/**
 * Creates multiple BOM rows in a single batch operation
 *
 * Efficiently creates many BOM rows at once using Katana's batch API endpoint.
 * Significantly faster than calling createBomRow repeatedly.
 *
 * @param request Batch creation request containing array of BOM row data
 * @returns Array of created BOM row entities
 * @throws {Error} If the batch API call fails
 *
 * @example
 * const bomRows = batchCreateBomRows({
 *   data: [
 *     { product_variant_id: 123, ingredient_variant_id: 456, quantity_per_unit: 1 },
 *     { product_variant_id: 123, ingredient_variant_id: 789, quantity_per_unit: 2 }
 *   ]
 * });
 * console.log(`Created ${bomRows.length} BOM rows`);
 */
export function batchCreateBomRows(request: BatchCreateBomRowsRequest): KatanaBomRow[] {
  console.log(`🧩 Batch creating ${request.data.length} BOM rows`);

  const response = katanaSmartFetch<KatanaBomRow>(`/v1/bom_rows/batch/create`, {
    method: 'POST',
    payload: JSON.stringify(request)
  });

  const normalized = normalizeKatanaResponse<KatanaBomRow>(response);

  // Handle response structure
  if (Array.isArray(normalized)) {
    console.log(`✅ Batch created ${normalized.length} BOM rows`);
    return normalized;
  } else if (normalized) {
    console.log(`✅ Batch created 1 BOM row`);
    return [normalized as KatanaBomRow];
  } else {
    console.log(`✅ Batch created BOM rows (unknown count)`);
    return [];
  }
}

/**
 * Deletes a single BOM row by ID
 *
 * Permanently removes a BOM row from Katana. This operation cannot be undone.
 *
 * @param bomRowId Katana BOM row ID to delete
 * @throws {Error} If the delete operation fails
 *
 * @example
 * deleteBomRow('bom_row_12345');
 */
export function deleteBomRow(bomRowId: string): void {
  console.log(`🗑️ Deleting BOM row: ${bomRowId}`);

  katanaSmartFetch(`/v1/bom_rows/${bomRowId}`, {
    method: 'DELETE'
  });

  console.log(`✅ Deleted BOM row: ${bomRowId}`);
}

/**
 * Validates that a BOM row response matches the expected changes
 */
function validateBomRowResponse(
  response: KatanaBomRow,
  expectedChanges: { ingredient_variant_id?: number; quantity?: number; notes?: string | null },
  operation: 'create' | 'update'
): boolean {
  // Check that all expected changes are reflected in the response
  if (expectedChanges.ingredient_variant_id !== undefined) {
    if (response.ingredient_variant_id !== expectedChanges.ingredient_variant_id) {
      console.log(
        `❌ ${operation} validation failed: ingredient_variant_id mismatch. Expected: ${expectedChanges.ingredient_variant_id}, Got: ${response.ingredient_variant_id}`
      );
      return false;
    }
  }

  if (expectedChanges.quantity !== undefined) {
    if (response.quantity !== expectedChanges.quantity) {
      console.log(
        `❌ ${operation} validation failed: quantity mismatch. Expected: ${expectedChanges.quantity}, Got: ${response.quantity}`
      );
      return false;
    }
  }

  if (expectedChanges.notes !== undefined) {
    // Handle null/undefined equivalence for notes
    const responseNotes = response.notes || '';
    const expectedNotes = expectedChanges.notes || '';
    if (responseNotes !== expectedNotes) {
      console.log(
        `❌ ${operation} validation failed: notes mismatch. Expected: "${expectedNotes}", Got: "${responseNotes}"`
      );
      return false;
    }
  }

  return true;
}

/**
 * Updates an existing BOM row with new quantity, notes, and/or ingredient
 * Validates the response and retries once if validation fails
 */
export function updateBomRow(
  bomRowId: string,
  updates: { ingredient_variant_id?: number; quantity?: number; notes?: string | null }
): KatanaBomRow {
  console.log(`📝 Updating BOM row: ${bomRowId}`);

  const performUpdate = (): KatanaBomRow => {
    const response = katanaSmartFetch(`/v1/bom_rows/${bomRowId}`, {
      method: 'PATCH',
      payload: JSON.stringify(updates)
    });

    // Handle different response formats
    let bomRow: KatanaBomRow;
    if (Array.isArray(response)) {
      bomRow = response[0];
    } else if (response && typeof response === 'object' && 'data' in response) {
      bomRow = (response as any).data;
    } else {
      bomRow = response as KatanaBomRow;
    }

    return bomRow;
  };

  // First attempt
  let bomRow = performUpdate();

  // Validate the response
  if (!validateBomRowResponse(bomRow, updates, 'update')) {
    console.log(`⏳ Update validation failed, retrying after 500ms...`);
    Utilities.sleep(500);

    // Retry once
    bomRow = performUpdate();

    // Final validation
    if (!validateBomRowResponse(bomRow, updates, 'update')) {
      console.log(`❌ Update validation failed after retry for BOM row: ${bomRowId}`);
      // Continue execution but log the issue - don't fail the entire operation
    } else {
      console.log(`✅ Update validation passed after retry for BOM row: ${bomRowId}`);
    }
  } else {
    console.log(`✅ Updated BOM row: ${bomRowId}`);
  }

  return bomRow;
}

/**
 * Deletes all BOM rows for a specific product variant (atomic clear operation)
 */
export function clearProductBomRows(productVariantId: number): void {
  console.log(`🧹 Clearing all BOM rows for product variant: ${productVariantId}`);

  // Fetch existing BOM rows for this product
  const existingRows = fetchBomRows({ productVariantId });

  if (existingRows.length === 0) {
    console.log(`✅ No existing BOM rows to clear for product variant ${productVariantId}`);
    return;
  }

  console.log(`🗑️ Deleting ${existingRows.length} existing BOM rows...`);

  // Delete each BOM row
  let deletedCount = 0;
  let failedCount = 0;

  for (const row of existingRows) {
    try {
      deleteBomRow(row.id);
      deletedCount++;
    } catch (error) {
      console.error(`❌ Failed to delete BOM row ${row.id}:`, error);
      failedCount++;
    }
  }

  console.log(`✅ Cleared BOM rows: ${deletedCount} deleted, ${failedCount} failed`);

  if (failedCount > 0) {
    throw new Error(`Failed to delete ${failedCount} BOM rows for product variant ${productVariantId}`);
  }
}

/**
 * Fetches BOM rows with optional filtering
 *
 * @param options - Filter options for BOM rows
 * @returns Array of BOM row entities
 */
export function fetchBomRows(
  options: {
    productVariantId?: number;
    ingredientVariantId?: number;
    product_item_id?: number;
    limit?: number;
    offset?: number;
  } = {}
): KatanaBomRow[] {
  console.log(
    `🔍 Fetching BOM rows${options.productVariantId ? ` for product variant ${options.productVariantId}` : ''}${options.product_item_id ? ` for product item ${options.product_item_id}` : ''}...`
  );

  // Build query string manually for Google Apps Script compatibility
  const queryParts: string[] = [];
  if (options.productVariantId) queryParts.push(`product_variant_id=${options.productVariantId}`);
  if (options.ingredientVariantId) queryParts.push(`ingredient_variant_id=${options.ingredientVariantId}`);
  if (options.product_item_id) queryParts.push(`product_item_id=${options.product_item_id}`);
  // Default to maximum limit for better pagination performance
  const limit = options.limit || API_CONSTANTS.KATANA_API_LIMIT;
  queryParts.push(`limit=${limit}`);
  if (options.offset) queryParts.push(`offset=${options.offset}`);

  const path = `/v1/bom_rows${queryParts.length > 0 ? `?${queryParts.join('&')}` : ''}`;
  console.log(`🔍 Fetching BOM rows with path: ${path}`);
  const bomRows = fetchPaginatedFromAPI<KatanaBomRow>(path);

  console.log(`✅ Fetched ${bomRows.length} BOM rows`);
  return bomRows;
}

/**
 * Fetches a product with its variants from Katana API.
 * More efficient than fetching variants separately when you need both.
 */
export function fetchProductWithVariants(productId: string): KatanaProduct & { variants?: KatanaVariant[] } {
  console.log(`🔍 Fetching product ${productId} with variants...`);

  const response = katanaSmartFetch<KatanaProduct & { variants?: KatanaVariant[] }>(
    `/v1/products/${encodeURIComponent(productId)}`
  );
  const normalized = normalizeKatanaResponse<KatanaProduct & { variants?: KatanaVariant[] }>(response);

  if (!normalized) {
    throw new Error(`Failed to fetch product ${productId}`);
  }

  // Handle both single response and array response (though single product should be single)
  const product = Array.isArray(normalized) ? normalized[0] : normalized;
  if (!product) {
    throw new Error(`No product data returned for ${productId}`);
  }

  console.log(`✅ Fetched product ${productId} with ${product.variants?.length || 0} variants`);
  return product;
}

/**
 * Fetches all products from Katana API with optional filtering.
 * Useful for finding products by name or other criteria.
 */
export function fetchAllProducts(): KatanaProduct[] {
  console.log(`🔍 Fetching all products from Katana...`);

  const response = katanaSmartFetch<KatanaProduct>('/v1/products?limit=1000');
  const normalized = normalizeKatanaResponse<KatanaProduct>(response);

  if (!normalized) {
    console.log(`⚠️ No products returned from Katana`);
    return [];
  }

  // Handle both single response and array response
  const products = Array.isArray(normalized) ? normalized : [normalized];

  console.log(`✅ Fetched ${products.length} products from Katana`);
  return products;
}

/**
 * Finds a product ID by exact name match.
 * Returns the product ID string or null if not found.
 */
export function findProductIdByName(productName: string): string | null {
  console.log(`🔍 Searching for product: "${productName}"`);

  const products = fetchAllProducts();

  const matchingProduct = products.find(
    (product) => product.name && product.name.trim().toLowerCase() === productName.trim().toLowerCase()
  );

  if (matchingProduct) {
    console.log(`✅ Found product "${productName}" with ID: ${matchingProduct.id}`);
    return matchingProduct.id.toString();
  } else {
    console.log(`❌ Product "${productName}" not found in Katana`);
    return null;
  }
}

/**
 * Creates a new product in Katana with variants.
 * Products are finished goods that can be produced (have BOMs).
 */
export function createProduct(request: CreateProductRequest): KatanaProduct {
  console.log(`📦 Creating product: ${request.name} with ${request.variants.length} variants`);

  const response = katanaSmartFetch<KatanaProduct>(`/v1/products`, {
    method: 'POST',
    payload: JSON.stringify(request)
  });

  const normalized = normalizeKatanaResponse<KatanaProduct>(response);

  let result: KatanaProduct;

  // Handle array responses (take first item)
  if (Array.isArray(normalized)) {
    result = normalized[0];
  } else {
    result = normalized as KatanaProduct;
  }

  console.log(`✅ Product created: ${result.id} - ${result.name}`);
  return result;
}

/**
 * Creates a new material in Katana with variants.
 * Materials are raw materials/components used in BOMs.
 */
export function createMaterial(request: CreateMaterialRequest): KatanaMaterial {
  console.log(`🔩 Creating material: ${request.name} with ${request.variants.length} variants`);

  const response = katanaSmartFetch<KatanaMaterial>(`/v1/materials`, {
    method: 'POST',
    payload: JSON.stringify(request)
  });

  const normalized = normalizeKatanaResponse<KatanaMaterial>(response);

  let result: KatanaMaterial;

  // Handle array responses (take first item)
  if (Array.isArray(normalized)) {
    result = normalized[0];
  } else {
    result = normalized as KatanaMaterial;
  }

  console.log(`✅ Material created: ${result.id} - ${result.name}`);
  return result;
}

/**
 * Updates a variant in Katana.
 * Can update custom fields, prices, SKU, etc.
 *
 * @param variantId - The ID of the variant to update
 * @param updates - Partial update data (only fields to change)
 * @returns Updated variant data
 *
 * @example
 * // Update custom fields
 * updateVariant(12345, {
 *   custom_fields: [
 *     { field_name: 'component_data', field_value: '{"type":"Frame","description":"..."}' }
 *   ]
 * });
 */
export function updateVariant(variantId: number, updates: UpdateVariantRequest): KatanaVariant {
  console.log(`🔧 Updating variant ID ${variantId}...`);

  const response = katanaSmartFetch<KatanaVariant>(`/v1/variants/${variantId}`, {
    method: 'PATCH',
    payload: JSON.stringify(updates)
  });

  const normalized = normalizeKatanaResponse<KatanaVariant>(response);

  let result: KatanaVariant;

  // Handle array responses (take first item)
  if (Array.isArray(normalized)) {
    result = normalized[0];
  } else {
    result = normalized as KatanaVariant;
  }

  console.log(`✅ Variant updated: ${result.id} - ${result.sku}`);
  return result;
}
