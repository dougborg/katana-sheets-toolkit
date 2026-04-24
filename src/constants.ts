/**
 * Application-wide constants
 *
 * This module centralizes magic numbers and configuration values used throughout
 * the application to improve maintainability and reduce duplication.
 *
 * @module constants
 */

/**
 * API and URL configuration constants
 */
export const API_CONSTANTS = {
  /**
   * Maximum URL length for Google Apps Script URLFetch requests (bytes)
   * @see https://developers.google.com/apps-script/reference/url-fetch/url-fetch-app
   */
  URL_LENGTH_LIMIT: 2048,

  /**
   * Safety margin to leave room for URL encoding and variations
   * Applied when calculating safe batch sizes for API requests
   */
  URL_SAFETY_MARGIN: 100,

  /**
   * Threshold for URL length checks (slightly below limit for safety)
   */
  URL_LENGTH_THRESHOLD: 2000,

  /**
   * Default limit parameter for Katana API pagination requests
   */
  KATANA_API_LIMIT: 250,

  /**
   * Maximum batch size cap for API requests
   * Prevents overly large requests even if URL length allows more
   */
  MAX_BATCH_SIZE: 100
} as const;

/**
 * Retry and delay configuration constants
 */
export const RETRY_CONSTANTS = {
  /**
   * Default maximum number of retry attempts for API calls
   */
  DEFAULT_MAX_RETRIES: 5,

  /**
   * Base delay for exponential backoff (milliseconds)
   * Initial delay before first retry
   */
  BASE_DELAY_MS: 1000,

  /**
   * Maximum delay for timeout errors (milliseconds)
   * Caps exponential backoff for timeout scenarios
   */
  MAX_TIMEOUT_DELAY_MS: 30000,

  /**
   * Maximum delay for rate limit errors (milliseconds)
   * Caps exponential backoff for rate limit scenarios
   */
  MAX_RATE_LIMIT_DELAY_MS: 60000,

  /**
   * Exponential backoff multiplier for standard errors
   * Delay doubles with each retry: 1s → 2s → 4s → 8s → 16s
   */
  BACKOFF_MULTIPLIER: 2,

  /**
   * Exponential backoff multiplier for rate limit errors
   * Delay triples for rate limits: 1s → 3s → 9s → 27s → 81s (capped at max)
   */
  RATE_LIMIT_BACKOFF_MULTIPLIER: 3,

  /**
   * Base delay for table operations (milliseconds)
   * Used for Sheets API table creation retries
   */
  TABLE_OPERATION_BASE_DELAY_MS: 100,

  /**
   * Maximum retries for table operations
   * Used for Sheets API table creation
   */
  TABLE_OPERATION_MAX_RETRIES: 6
} as const;

/**
 * UI and display configuration constants
 */
export const UI_CONSTANTS = {
  /**
   * Default toast notification duration (seconds)
   * Used for success messages and general notifications
   */
  TOAST_DURATION_DEFAULT: 5,

  /**
   * Error toast notification duration (seconds)
   * Longer duration for error messages to ensure visibility
   */
  TOAST_DURATION_ERROR: 10,

  /**
   * Short toast notification duration (seconds)
   * Used for quick status updates
   */
  TOAST_DURATION_SHORT: 1,

  /**
   * Indefinite toast notification duration
   * Toast remains visible until dismissed
   */
  TOAST_DURATION_INDEFINITE: -1,

  /**
   * Buffer rows to add when finding next free row
   * Prevents overlap when inserting new data
   */
  ROW_BUFFER: 10,

  /**
   * Maximum number of sheets to show in preview dialogs
   * Additional sheets are summarized with "... and N more sheets"
   */
  MAX_SHEETS_IN_PREVIEW: 10,

  /**
   * Maximum number of sample SKUs to display in logs
   * Additional SKUs are truncated with "..."
   */
  MAX_SAMPLE_SKUS: 5,

  /**
   * Maximum length for truncated log messages
   * Longer messages are truncated with "..."
   */
  LOG_TRUNCATE_LENGTH: 100,

  /**
   * Number of sample rows to show in debug logs
   */
  SAMPLE_ROWS_COUNT: 3
} as const;

/**
 * Pagination and batch processing constants
 */
export const PAGINATION_CONSTANTS = {
  /**
   * Milestone interval for pagination progress logging
   * Logs progress every N items collected
   */
  MILESTONE_INTERVAL: 1000
} as const;
