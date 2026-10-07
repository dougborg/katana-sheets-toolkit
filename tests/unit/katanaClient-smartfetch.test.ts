import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('katanaClient - Smart Fetch', () => {
  let mockResponse: any;
  let mockUrlFetchApp: any;
  let mockPropertiesService: any;
  let mockUtilities: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock response
    mockResponse = {
      getResponseCode: vi.fn(),
      getContentText: vi.fn(),
      getAllHeaders: vi.fn()
    };

    // Setup mock UrlFetchApp
    mockUrlFetchApp = {
      fetch: vi.fn().mockReturnValue(mockResponse)
    };

    // Setup mock PropertiesService
    const mockProps = {
      getProperty: vi.fn().mockReturnValue('test-api-key')
    };
    mockPropertiesService = {
      getScriptProperties: vi.fn().mockReturnValue(mockProps)
    };

    // Setup mock Utilities
    mockUtilities = {
      sleep: vi.fn()
    };

    // Assign to global
    (globalThis as any).UrlFetchApp = mockUrlFetchApp;
    (globalThis as any).PropertiesService = mockPropertiesService;
    (globalThis as any).Utilities = mockUtilities;
  });

  describe('katanaSmartFetch - Basic Functionality', () => {
    it('should make successful GET request with default options', async () => {
      const testPath = '/v1/test';
      const expectedUrl = 'https://api.katanamrp.com/v1/test';
      const mockData = { id: '123', name: 'Test Item' };

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(mockData));

      const { katanaSmartFetch } = await import('../../src/katanaClient.js');
      const result = katanaSmartFetch(testPath);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(expectedUrl, {
        method: 'get',
        headers: {
          Authorization: 'Bearer test-api-key',
          Accept: 'application/json'
        },
        muteHttpExceptions: true
      });
      expect(result).toEqual(mockData);
    });

    it('should handle POST request with payload', async () => {
      const testPath = '/v1/test';
      const payload = { name: 'New Item', value: 123 };
      const expectedUrl = 'https://api.katanamrp.com/v1/test';
      const mockResponseData = { id: '456', ...payload };

      mockResponse.getResponseCode.mockReturnValue(201);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(mockResponseData));

      const { katanaSmartFetch } = await import('../../src/katanaClient.js');
      const result = katanaSmartFetch(testPath, {
        method: 'POST',
        payload: JSON.stringify(payload)
      });

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(expectedUrl, {
        method: 'post',
        headers: {
          Authorization: 'Bearer test-api-key',
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      expect(result).toEqual(mockResponseData);
    });

    it('should handle DELETE request returning no content', async () => {
      const testPath = '/v1/test/123';
      const expectedUrl = 'https://api.katanamrp.com/v1/test/123';

      mockResponse.getResponseCode.mockReturnValue(204);
      mockResponse.getContentText.mockReturnValue('');

      const { katanaSmartFetch } = await import('../../src/katanaClient.js');
      const result = katanaSmartFetch(testPath, { method: 'DELETE' });

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(expectedUrl, {
        method: 'delete',
        headers: {
          Authorization: 'Bearer test-api-key',
          Accept: 'application/json'
        },
        muteHttpExceptions: true
      });
      expect(result).toBeNull();
    });
  });

  describe('katanaSmartFetch - Rate Limiting', () => {
    it('should handle rate limiting with Retry-After header', async () => {
      const testPath = '/v1/test';
      const mockData = { id: '123' };

      mockResponse.getResponseCode
        .mockReturnValueOnce(429) // First call rate limited
        .mockReturnValueOnce(200); // Second call succeeds
      mockResponse.getAllHeaders.mockReturnValue({ 'Retry-After': '3' });
      mockResponse.getContentText.mockReturnValue(JSON.stringify(mockData));

      const { katanaSmartFetch } = await import('../../src/katanaClient.js');
      const result = katanaSmartFetch(testPath);

      expect(mockUtilities.sleep).toHaveBeenCalledWith(3000); // 3 seconds * 1000ms
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockData);
    });

    it('should handle rate limiting with exponential backoff', async () => {
      const testPath = '/v1/test';
      const mockData = { id: '123' };

      mockResponse.getResponseCode
        .mockReturnValueOnce(429) // First call rate limited
        .mockReturnValueOnce(429) // Second call rate limited
        .mockReturnValueOnce(200); // Third call succeeds
      mockResponse.getAllHeaders.mockReturnValue({}); // No retry-after header
      mockResponse.getContentText.mockReturnValue(JSON.stringify(mockData));

      const { katanaSmartFetch } = await import('../../src/katanaClient.js');
      const result = katanaSmartFetch(testPath);

      expect(mockUtilities.sleep).toHaveBeenCalledWith(1000); // First delay: 1 second
      expect(mockUtilities.sleep).toHaveBeenCalledWith(2000); // Second delay: 2 seconds (exponential)
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual(mockData);
    });

    it('should handle server errors with retry', async () => {
      const testPath = '/v1/test';
      const mockData = { id: '123' };

      mockResponse.getResponseCode
        .mockReturnValueOnce(502) // First call server error
        .mockReturnValueOnce(200); // Second call succeeds
      mockResponse.getContentText.mockReturnValue(JSON.stringify(mockData));

      const { katanaSmartFetch } = await import('../../src/katanaClient.js');
      const result = katanaSmartFetch(testPath);

      expect(mockUtilities.sleep).toHaveBeenCalledWith(1000);
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockData);
    });

    it('should throw immediately on client errors (4xx)', async () => {
      const testPath = '/v1/test';

      mockResponse.getResponseCode.mockReturnValue(404);
      mockResponse.getContentText.mockReturnValue('Not Found');

      const { katanaSmartFetch } = await import('../../src/katanaClient.js');

      expect(() => katanaSmartFetch(testPath)).toThrow(
        'Katana API error 404 for https://api.katanamrp.com/v1/test: Not Found'
      );
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries for rate limiting', async () => {
      const testPath = '/v1/test';

      mockResponse.getResponseCode.mockReturnValue(429); // Always rate limited
      mockResponse.getAllHeaders.mockReturnValue({});

      const { katanaSmartFetch } = await import('../../src/katanaClient.js');

      expect(() => katanaSmartFetch(testPath, { maxRetries: 3 })).toThrow(
        'Katana API failed after 3 attempts for https://api.katanamrp.com/v1/test'
      );
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('katanaSmartFetch - Auto-Pagination', () => {
    it('should handle single page response without pagination header', async () => {
      const testPath = '/v1/variants';
      const mockData = {
        data: [
          { id: '1', sku: 'SKU1' },
          { id: '2', sku: 'SKU2' }
        ],
        meta: {
          pagination: {
            current_page: 1,
            total_pages: 3,
            per_page: 2,
            total_count: 5
          }
        }
      };

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(mockData));
      mockResponse.getAllHeaders.mockReturnValue({}); // No X-Pagination header

      const { katanaSmartFetch } = await import('../../src/katanaClient.js');
      const result = katanaSmartFetch(testPath);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(1);
      expect(result).toEqual([
        { id: '1', sku: 'SKU1' },
        { id: '2', sku: 'SKU2' }
      ]);
    });

    it('should fetch all pages when X-Pagination header indicates multiple pages', async () => {
      const testPath = '/v1/variants';

      // Mock responses for 3 pages - first for detection, then 3 for pagination
      const page1Data = {
        data: [
          { id: '1', sku: 'SKU1' },
          { id: '2', sku: 'SKU2' }
        ],
        meta: {
          pagination: {
            current_page: 1,
            total_pages: 3,
            per_page: 2,
            total_count: 5
          }
        }
      };

      const page2Data = {
        data: [
          { id: '3', sku: 'SKU3' },
          { id: '4', sku: 'SKU4' }
        ],
        meta: {
          pagination: {
            current_page: 2,
            total_pages: 3,
            per_page: 2,
            total_count: 5
          }
        }
      };

      const page3Data = {
        data: [{ id: '5', sku: 'SKU5' }],
        meta: {
          pagination: {
            current_page: 3,
            total_pages: 3,
            per_page: 2,
            total_count: 5
          }
        }
      };

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText
        .mockReturnValueOnce(JSON.stringify(page1Data)) // Detection call - returns page 1 data
        .mockReturnValueOnce(JSON.stringify(page2Data)) // Page 2 in fetchAllPages
        .mockReturnValueOnce(JSON.stringify(page3Data)); // Page 3 in fetchAllPages

      // Mock pagination headers
      mockResponse.getAllHeaders
        .mockReturnValueOnce({
          'X-Pagination': JSON.stringify({
            page: 1,
            total_pages: 3,
            last_page: false
          })
        })
        .mockReturnValueOnce({
          'X-Pagination': JSON.stringify({
            page: 2,
            total_pages: 3,
            last_page: false
          })
        })
        .mockReturnValueOnce({
          'X-Pagination': JSON.stringify({
            page: 3,
            total_pages: 3,
            last_page: true
          })
        });

      const { katanaSmartFetch } = await import('../../src/katanaClient.js');
      const result = katanaSmartFetch(testPath);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(3);
      expect(mockUrlFetchApp.fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.katanamrp.com/v1/variants',
        expect.any(Object)
      );
      expect(mockUrlFetchApp.fetch).toHaveBeenNthCalledWith(
        2,
        'https://api.katanamrp.com/v1/variants?page=2',
        expect.any(Object)
      );
      expect(mockUrlFetchApp.fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.katanamrp.com/v1/variants?page=3',
        expect.any(Object)
      );

      // Should return combined data from all pages
      expect(result).toEqual([
        { id: '1', sku: 'SKU1' },
        { id: '2', sku: 'SKU2' },
        { id: '3', sku: 'SKU3' },
        { id: '4', sku: 'SKU4' },
        { id: '5', sku: 'SKU5' }
      ]);
    });

    it('should handle direct array response when using auto-pagination', async () => {
      const testPath = '/v1/variants';
      const mockData = [
        { id: '1', sku: 'SKU1' },
        { id: '2', sku: 'SKU2' }
      ];

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(mockData));
      mockResponse.getAllHeaders.mockReturnValue({}); // No pagination header

      const { katanaSmartFetch } = await import('../../src/katanaClient.js');
      const result = katanaSmartFetch(testPath);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockData);
    });

    it('should handle pagination with existing query parameters', async () => {
      const testPath = '/v1/variants?sku=TEST&extend=product_or_material';
      const mockData = {
        data: [{ id: '1', sku: 'TEST' }],
        meta: {
          pagination: {
            current_page: 1,
            total_pages: 1,
            per_page: 10,
            total_count: 1
          }
        }
      };

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(mockData));
      mockResponse.getAllHeaders.mockReturnValue({
        'X-Pagination': JSON.stringify({
          page: 1,
          total_pages: 1,
          last_page: true
        })
      });

      const { katanaSmartFetch } = await import('../../src/katanaClient.js');
      const result = katanaSmartFetch(testPath);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        'https://api.katanamrp.com/v1/variants?sku=TEST&extend=product_or_material',
        expect.any(Object)
      );
      expect(result).toEqual([{ id: '1', sku: 'TEST' }]);
    });
  });

  describe('katanaSmartFetch - Custom Headers and Options', () => {
    it('should merge custom headers with default headers', async () => {
      const testPath = '/v1/test';
      const customHeaders = {
        'X-Custom-Header': 'custom-value',
        'Content-Type': 'application/xml' // Should override default
      };

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue('{}');

      const { katanaSmartFetch } = await import('../../src/katanaClient.js');
      katanaSmartFetch(testPath, {
        method: 'POST',
        headers: customHeaders,
        payload: '<xml></xml>'
      });

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith('https://api.katanamrp.com/v1/test', {
        method: 'post',
        headers: {
          Authorization: 'Bearer test-api-key',
          Accept: 'application/json',
          'X-Custom-Header': 'custom-value',
          'Content-Type': 'application/json'
        },
        payload: '<xml></xml>',
        muteHttpExceptions: true
      });
    });

    it('should respect custom maxRetries setting', async () => {
      const testPath = '/v1/test';

      mockResponse.getResponseCode.mockReturnValue(429);
      mockResponse.getAllHeaders.mockReturnValue({});

      const { katanaSmartFetch } = await import('../../src/katanaClient.js');

      expect(() => katanaSmartFetch(testPath, { maxRetries: 2 })).toThrow('Katana API failed after 2 attempts');
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
