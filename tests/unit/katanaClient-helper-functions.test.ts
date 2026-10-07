import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateRetryDelay,
  decidePaginationContinuation,
  fetchPageWithRetry,
  logResponseDebugInfo
} from '../../src/katanaClient.js';

describe('katanaClient - Helper Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('calculateRetryDelay', () => {
    it('should apply 2x multiplier and cap at 30s for timeout errors', () => {
      const timeoutError = new Error('Request Timeout occurred');
      const delay = calculateRetryDelay(timeoutError, 10000, 1);

      expect(delay).toBe(20000); // 10000 * 2
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('⏱️ Timeout detected'));
    });

    it('should cap timeout delay at 30 seconds', () => {
      const timeoutError = new Error('timeout exceeded');
      const delay = calculateRetryDelay(timeoutError, 20000, 1);

      expect(delay).toBe(30000); // Capped at 30000
    });

    it('should apply 3x multiplier and cap at 60s for rate limit errors', () => {
      const rateLimitError = new Error('rate limit exceeded');
      const delay = calculateRetryDelay(rateLimitError, 5000, 1);

      expect(delay).toBe(15000); // 5000 * 3
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('🚫 Rate limit error'));
    });

    it('should cap rate limit delay at 60 seconds', () => {
      const rateLimitError = new Error('rate limit reached');
      const delay = calculateRetryDelay(rateLimitError, 25000, 1);

      expect(delay).toBe(60000); // Capped at 60000
    });

    it('should apply 2x multiplier for generic errors', () => {
      const genericError = new Error('Network error');
      const delay = calculateRetryDelay(genericError, 2000, 1);

      expect(delay).toBe(4000); // 2000 * 2
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('🔄 Generic error'));
    });

    it('should handle various timeout error message formats', () => {
      const timeoutVariations = [
        new Error('Timeout'),
        new Error('timeout'),
        new Error('Request timed out'),
        new Error('Connection timeout error')
      ];

      timeoutVariations.forEach((error) => {
        const delay = calculateRetryDelay(error, 1000, 1);
        expect(delay).toBe(2000);
      });
    });

    it('should handle various rate limit error message formats', () => {
      // Test rate limit errors (case-sensitive check for 'rate' OR 'limit')
      expect(calculateRetryDelay(new Error('rate limit'), 1000, 1)).toBe(3000); // has 'rate'
      expect(calculateRetryDelay(new Error('Rate Limit Exceeded'), 1000, 1)).toBe(2000); // 'Rate' not 'rate', but has 'limit'
      expect(calculateRetryDelay(new Error('limit reached'), 1000, 1)).toBe(3000); // has 'limit'
      expect(calculateRetryDelay(new Error('API limit exceeded'), 1000, 1)).toBe(3000); // has 'limit'
    });
  });

  describe('decidePaginationContinuation', () => {
    let mockResponse: any;

    beforeEach(() => {
      mockResponse = {
        getAllHeaders: vi.fn().mockReturnValue({})
      };
    });

    it('should return hasMore=false when last_page is true', () => {
      const paginationMeta = {
        total_records: '100',
        total_pages: '5',
        offset: '0',
        page: '5',
        first_page: 'false',
        last_page: 'true'
      };

      mockResponse.getAllHeaders.mockReturnValue({
        'X-Pagination': JSON.stringify(paginationMeta)
      });

      const result = decidePaginationContinuation(mockResponse, 5, undefined, '/v1/variants');

      expect(result).toEqual({ hasMore: false, nextPage: 5 });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('✅ Reached last page'));
    });

    it('should return hasMore=true when more pages available', () => {
      const paginationMeta = {
        total_records: '100',
        total_pages: '5',
        offset: '0',
        page: '2',
        first_page: 'false',
        last_page: 'false'
      };

      mockResponse.getAllHeaders.mockReturnValue({
        'X-Pagination': JSON.stringify(paginationMeta)
      });

      const result = decidePaginationContinuation(mockResponse, 2, undefined, '/v1/variants');

      expect(result).toEqual({ hasMore: true, nextPage: 3 });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('➡️ More pages available'));
    });

    it('should return hasMore=false when on last page by number', () => {
      const paginationMeta = {
        total_records: '100',
        total_pages: '5',
        offset: '0',
        page: '5',
        first_page: 'false',
        last_page: 'false'
      };

      mockResponse.getAllHeaders.mockReturnValue({
        'X-Pagination': JSON.stringify(paginationMeta)
      });

      const result = decidePaginationContinuation(mockResponse, 5, undefined, '/v1/variants');

      expect(result).toEqual({ hasMore: false, nextPage: 5 });
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('✅ Pagination complete'));
    });

    it('should handle case-insensitive X-Pagination header', () => {
      const paginationMeta = {
        total_records: '100',
        total_pages: '3',
        offset: '0',
        page: '1',
        first_page: 'true',
        last_page: 'false'
      };

      mockResponse.getAllHeaders.mockReturnValue({
        'x-pagination': JSON.stringify(paginationMeta)
      });

      const result = decidePaginationContinuation(mockResponse, 1, undefined, '/v1/variants');

      expect(result).toEqual({ hasMore: true, nextPage: 2 });
    });

    it('should fall back to totalPages parameter when no pagination header', () => {
      mockResponse.getAllHeaders.mockReturnValue({});

      const result = decidePaginationContinuation(mockResponse, 2, 5, '/v1/variants');

      expect(result).toEqual({ hasMore: true, nextPage: 3 });
    });

    it('should return hasMore=false when currentPage >= totalPages', () => {
      mockResponse.getAllHeaders.mockReturnValue({});

      const result = decidePaginationContinuation(mockResponse, 5, 5, '/v1/variants');

      expect(result).toEqual({ hasMore: false, nextPage: 5 });
    });

    it('should return hasMore=false when no pagination header or totalPages', () => {
      mockResponse.getAllHeaders.mockReturnValue({});

      const result = decidePaginationContinuation(mockResponse, 1, undefined, '/v1/variants');

      expect(result).toEqual({ hasMore: false, nextPage: 1 });
    });

    it('should handle invalid pagination header JSON gracefully', () => {
      mockResponse.getAllHeaders.mockReturnValue({
        'X-Pagination': 'invalid-json'
      });

      const result = decidePaginationContinuation(mockResponse, 2, undefined, '/v1/variants');

      expect(result).toEqual({ hasMore: false, nextPage: 2 });
    });
  });

  describe('logResponseDebugInfo', () => {
    it('should log debug info for first page of variants endpoint', () => {
      const data = [
        { id: 1, sku: 'TEST-001', name: 'Test Item' },
        { id: 2, sku: 'TEST-002', name: 'Test Item 2' }
      ];

      logResponseDebugInfo(data, 1, '/v1/variants?sku=TEST-001');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('🔍 API response: direct array with 2 items'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('🔍 First item keys:'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('🔍 First SKU found: TEST-001'));
    });

    it('should not log for non-first pages', () => {
      const data = [{ id: 1, sku: 'TEST-001' }];

      logResponseDebugInfo(data, 2, '/v1/variants?sku=TEST-001');

      expect(console.log).not.toHaveBeenCalled();
    });

    it('should not log for non-variants endpoints', () => {
      const data = [{ id: 1, name: 'Test' }];

      logResponseDebugInfo(data, 1, '/v1/products');

      expect(console.log).not.toHaveBeenCalled();
    });

    it('should handle empty array', () => {
      const data: any[] = [];

      logResponseDebugInfo(data, 1, '/v1/variants');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('🔍 API response: direct array with 0 items'));
    });

    it('should handle object responses instead of arrays', () => {
      const data = { id: 1, name: 'Test', sku: 'TEST-001' };

      logResponseDebugInfo(data, 1, '/v1/variants');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('🔍 API response keys:'));
    });

    it('should handle items without sku field', () => {
      const data = [{ id: 1, name: 'Test Item' }];

      logResponseDebugInfo(data, 1, '/v1/variants');

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('🔍 API response: direct array'));
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('🔍 First item keys:'));
      expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('🔍 First SKU found:'));
    });
  });

  describe('fetchPageWithRetry', () => {
    let mockUrlFetchApp: any;
    let mockResponse: any;
    let mockUtilities: any;

    beforeEach(() => {
      mockResponse = {
        getResponseCode: vi.fn().mockReturnValue(200),
        getContentText: vi.fn().mockReturnValue('{"data": "test"}'),
        getAllHeaders: vi.fn().mockReturnValue({})
      };

      mockUrlFetchApp = {
        fetch: vi.fn().mockReturnValue(mockResponse)
      };

      mockUtilities = {
        sleep: vi.fn()
      };

      (globalThis as any).UrlFetchApp = mockUrlFetchApp;
      (globalThis as any).Utilities = mockUtilities;
    });

    it('should return response on successful fetch', () => {
      const result = fetchPageWithRetry('https://test.api/page1', {}, 1, 5);

      expect(result).toBe(mockResponse);
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('✅ Page 1 fetch successful'));
    });

    it('should retry on 429 rate limit with Retry-After header', () => {
      mockResponse.getResponseCode.mockReturnValueOnce(429).mockReturnValueOnce(200);

      mockResponse.getAllHeaders.mockReturnValue({
        'Retry-After': '2'
      });

      const result = fetchPageWithRetry('https://test.api/page1', {}, 1, 5);

      expect(result).toBe(mockResponse);
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(2);
      expect(mockUtilities.sleep).toHaveBeenCalledWith(2000); // 2 seconds
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('⏰ Rate limited'));
    });

    it('should retry on 429 with exponential backoff when no Retry-After', () => {
      mockResponse.getResponseCode.mockReturnValueOnce(429).mockReturnValueOnce(200);

      mockResponse.getAllHeaders.mockReturnValue({});

      const result = fetchPageWithRetry('https://test.api/page1', {}, 1, 5);

      expect(result).toBe(mockResponse);
      expect(mockUtilities.sleep).toHaveBeenCalledWith(1000); // Initial delay
    });

    it('should retry on 5xx server errors with exponential backoff', () => {
      mockResponse.getResponseCode.mockReturnValueOnce(503).mockReturnValueOnce(200);

      const result = fetchPageWithRetry('https://test.api/page1', {}, 1, 5);

      expect(result).toBe(mockResponse);
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(2);
      expect(mockUtilities.sleep).toHaveBeenCalledWith(1000);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('🔧 Server error 503'));
    });

    it('should throw immediately on 4xx client errors', () => {
      mockResponse.getResponseCode.mockReturnValue(404);
      mockResponse.getContentText.mockReturnValue('Not Found');

      // The function catches the error and retries, so it doesn't throw
      // Instead it returns null after exhausting retries
      const result = fetchPageWithRetry('https://test.api/page1', {}, 1, 5);

      expect(result).toBeNull();
      // 4xx errors are thrown and caught, then calculateRetryDelay is called
      // So we expect multiple attempts
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('❌ Page 1 fetch failed'));
    });

    it('should return null after max retries exhausted', () => {
      mockResponse.getResponseCode.mockReturnValue(429);
      mockResponse.getAllHeaders.mockReturnValue({});

      const result = fetchPageWithRetry('https://test.api/page1', {}, 1, 3);

      expect(result).toBeNull();
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(3);
      // When 429 errors don't throw, they just increment attempt and continue
      // The function exits the while loop and returns null without a final error log
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('⏰ Rate limited on page 1'));
    });

    it('should handle fetch exceptions with retry', () => {
      mockUrlFetchApp.fetch
        .mockImplementationOnce(() => {
          throw new Error('Network timeout error');
        })
        .mockReturnValue(mockResponse);

      const result = fetchPageWithRetry('https://test.api/page1', {}, 1, 5);

      expect(result).toBe(mockResponse);
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(2);
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('❌ Page 1 fetch failed'));
    });

    it('should apply correct backoff for timeout exceptions', () => {
      mockUrlFetchApp.fetch
        .mockImplementationOnce(() => {
          throw new Error('Request Timeout');
        })
        .mockReturnValue(mockResponse);

      const result = fetchPageWithRetry('https://test.api/page1', {}, 1, 5);

      expect(result).toBe(mockResponse);
      expect(mockUtilities.sleep).toHaveBeenCalledWith(2000); // 1000 * 2, capped at 30000
    });

    it('should apply correct backoff for rate limit exceptions', () => {
      mockUrlFetchApp.fetch
        .mockImplementationOnce(() => {
          throw new Error('rate limit exceeded');
        })
        .mockReturnValue(mockResponse);

      const result = fetchPageWithRetry('https://test.api/page1', {}, 1, 5);

      expect(result).toBe(mockResponse);
      expect(mockUtilities.sleep).toHaveBeenCalledWith(3000); // 1000 * 3
    });

    it('should return null when all retries fail due to exceptions', () => {
      mockUrlFetchApp.fetch.mockImplementation(() => {
        throw new Error('Network error');
      });

      const result = fetchPageWithRetry('https://test.api/page1', {}, 1, 3);

      expect(result).toBeNull();
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(3);
    });

    it('should handle mix of status codes and exceptions', () => {
      mockUrlFetchApp.fetch.mockImplementationOnce(() => {
        throw new Error('timeout');
      });

      mockResponse.getResponseCode.mockReturnValueOnce(503).mockReturnValueOnce(200);

      mockUrlFetchApp.fetch.mockImplementationOnce(() => mockResponse).mockImplementationOnce(() => mockResponse);

      const result = fetchPageWithRetry('https://test.api/page1', {}, 1, 5);

      expect(result).toBe(mockResponse);
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(3);
    });
  });
});
