import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

// Pagination meta type for testing
interface KatanaPaginationMeta {
  total_records: string;
  total_pages: string;
  offset: string;
  page: string;
  first_page: string;
  last_page: string;
}

describe('katanaClient - Pagination Tests', () => {
  let mockUrlFetchApp: any;
  let mockResponse: any;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Mock console for assertions - use vi.spyOn instead of manual mocking
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});

    // Create a reusable mock response that can be reconfigured in tests
    mockResponse = {
      getResponseCode: vi.fn().mockReturnValue(200),
      getContentText: vi.fn().mockReturnValue('{}'),
      getHeaders: vi.fn().mockReturnValue({}),
      getAllHeaders: vi.fn().mockReturnValue({})
    };

    // Mock UrlFetchApp to return our mock response
    mockUrlFetchApp = {
      fetch: vi.fn().mockReturnValue(mockResponse)
    };
    (globalThis as any).UrlFetchApp = mockUrlFetchApp;

    // Mock PropertiesService
    (globalThis as any).PropertiesService = {
      getScriptProperties: vi.fn().mockReturnValue({
        getProperty: vi.fn().mockReturnValue('test-api-key')
      })
    };

    // Mock Utilities for sleep calls
    (globalThis as any).Utilities = {
      sleep: vi.fn() // Mock sleep to be a no-op in tests
    };
  });

  describe('fetchWithAutoPagination', () => {
    it('should return single response when no X-Pagination header is present', async () => {
      const { katanaSmartFetch } = await import('../../src/katanaClient.js');

      const singleItem = { id: '1', name: 'Test Item' };
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(singleItem));
      mockResponse.getAllHeaders.mockReturnValue({});

      const result = katanaSmartFetch('/v1/test');

      expect(result).toEqual(singleItem);
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(1);
    });

    it('should return single response when X-Pagination indicates only one page', async () => {
      const { katanaSmartFetch } = await import('../../src/katanaClient.js');

      const items = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' }
      ];
      const paginationMeta: KatanaPaginationMeta = {
        page: '1',
        total_pages: '1',
        total_records: '2',
        offset: '0',
        first_page: 'true',
        last_page: 'true'
      };

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(items));
      mockResponse.getAllHeaders.mockReturnValue({
        'X-Pagination': JSON.stringify(paginationMeta)
      });

      const result = katanaSmartFetch('/v1/test');

      expect(result).toEqual(items);
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(1);
    });

    it('should fetch multiple pages when pagination indicates more data', async () => {
      const { katanaSmartFetch } = await import('../../src/katanaClient.js');

      // Mock first page
      const page1Items = [
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' }
      ];
      const page1Meta: KatanaPaginationMeta = {
        page: '1',
        total_pages: '3',
        total_records: '5',
        offset: '0',
        first_page: 'true',
        last_page: 'false'
      };

      // Mock second page
      const page2Items = [
        { id: '3', name: 'Item 3' },
        { id: '4', name: 'Item 4' }
      ];
      const page2Meta: KatanaPaginationMeta = {
        page: '2',
        total_pages: '3',
        total_records: '5',
        offset: '2',
        first_page: 'false',
        last_page: 'false'
      };

      // Mock third page
      const page3Items = [{ id: '5', name: 'Item 5' }];
      const page3Meta: KatanaPaginationMeta = {
        page: '3',
        total_pages: '3',
        total_records: '5',
        offset: '4',
        first_page: 'false',
        last_page: 'true'
      };

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText
        .mockReturnValueOnce(JSON.stringify(page1Items))
        .mockReturnValueOnce(JSON.stringify(page2Items))
        .mockReturnValueOnce(JSON.stringify(page3Items));

      mockResponse.getAllHeaders
        .mockReturnValueOnce({ 'X-Pagination': JSON.stringify(page1Meta) })
        .mockReturnValueOnce({ 'X-Pagination': JSON.stringify(page2Meta) })
        .mockReturnValueOnce({ 'X-Pagination': JSON.stringify(page3Meta) });

      const result = katanaSmartFetch('/v1/test');

      expect(result).toEqual([
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
        { id: '3', name: 'Item 3' },
        { id: '4', name: 'Item 4' },
        { id: '5', name: 'Item 5' }
      ]);

      // Should fetch all 3 pages
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(3);

      // Verify URLs were constructed correctly
      expect(mockUrlFetchApp.fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.katanamrp.com/v1/test',
        expect.objectContaining({
          method: 'get',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key'
          })
        })
      );
      expect(mockUrlFetchApp.fetch).toHaveBeenNthCalledWith(
        2,
        'https://api.katanamrp.com/v1/test?page=2',
        expect.objectContaining({
          method: 'get',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key'
          })
        })
      );
      expect(mockUrlFetchApp.fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.katanamrp.com/v1/test?page=3',
        expect.objectContaining({
          method: 'get',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key'
          })
        })
      );

      // Verify logging
      expect(console.log).toHaveBeenCalledWith(
        '📚 Multiple pages detected (3 total), fetching remaining pages starting from page 2'
      );
      expect(console.log).toHaveBeenCalledWith('📚 Pagination summary - Path: /v1/test, Total items: 5, Final page: 3');
    });

    it('should preserve query parameters when adding page numbers', async () => {
      const { katanaSmartFetch } = await import('../../src/katanaClient.js');

      const page1Items = [{ id: '1' }];
      const page1Meta: KatanaPaginationMeta = {
        page: '1',
        total_pages: '2',
        total_records: '2',
        offset: '0',
        first_page: 'true',
        last_page: 'false'
      };

      const page2Items = [{ id: '2' }];
      const page2Meta: KatanaPaginationMeta = {
        page: '2',
        total_pages: '2',
        total_records: '2',
        offset: '1',
        first_page: 'false',
        last_page: 'true'
      };

      (mockResponse.getContentText as Mock)
        .mockReturnValueOnce(JSON.stringify(page1Items))
        .mockReturnValueOnce(JSON.stringify(page2Items));

      (mockResponse.getAllHeaders as Mock)
        .mockReturnValueOnce({ 'X-Pagination': JSON.stringify(page1Meta) })
        .mockReturnValueOnce({ 'X-Pagination': JSON.stringify(page2Meta) });

      const result = katanaSmartFetch('/v1/test?limit=250&product_id=123');

      // Verify URLs preserve existing query parameters
      expect(mockUrlFetchApp.fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.katanamrp.com/v1/test?limit=250&product_id=123',
        expect.objectContaining({
          method: 'get',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key'
          })
        })
      );
      expect(mockUrlFetchApp.fetch).toHaveBeenNthCalledWith(
        2,
        'https://api.katanamrp.com/v1/test?limit=250&product_id=123&page=2',
        expect.objectContaining({
          method: 'get',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key'
          })
        })
      );
      expect(result).toEqual([{ id: '1' }, { id: '2' }]);
    });

    it('should handle malformed X-Pagination header gracefully', async () => {
      const { katanaSmartFetch } = await import('../../src/katanaClient.js');

      const items = [{ id: '1', name: 'Item 1' }];
      (mockResponse.getContentText as Mock).mockReturnValue(JSON.stringify(items));
      (mockResponse.getAllHeaders as Mock).mockReturnValue({
        'X-Pagination': 'invalid-json'
      });

      const result = katanaSmartFetch('/v1/test');

      // Should return first page data despite pagination error
      expect(result).toEqual(items);
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle wrapped API responses correctly', async () => {
      const { katanaSmartFetch } = await import('../../src/katanaClient.js');

      const items = [{ id: '1', name: 'Item 1' }];
      const wrappedResponse = { data: items };

      (mockResponse.getContentText as Mock).mockReturnValue(JSON.stringify(wrappedResponse));
      (mockResponse.getAllHeaders as Mock).mockReturnValue({});

      const result = katanaSmartFetch('/v1/test');

      expect(result).toEqual(items);
    });

    it('should handle empty responses correctly', async () => {
      const { katanaSmartFetch } = await import('../../src/katanaClient.js');

      (mockResponse.getContentText as Mock).mockReturnValue('');

      const result = katanaSmartFetch('/v1/test');

      expect(result).toBeNull();
    });
  });

  describe('fetchPaginatedFromAPI', () => {
    it('should return array even for single item responses', async () => {
      const { fetchPaginatedFromAPI } = await import('../../src/katanaClient.js');

      const singleItem = { id: '1', name: 'Test Item' };
      (mockResponse.getContentText as Mock).mockReturnValue(JSON.stringify(singleItem));
      (mockResponse.getAllHeaders as Mock).mockReturnValue({});

      const result = fetchPaginatedFromAPI('/v1/test');

      // Should force array type even for single responses
      expect(Array.isArray(result)).toBe(true);
      expect(result).toEqual([singleItem]);
    });

    it('should aggregate data from multiple pages', async () => {
      const { fetchPaginatedFromAPI } = await import('../../src/katanaClient.js');

      const page1Items = [{ id: '1' }, { id: '2' }];
      const page2Items = [{ id: '3' }, { id: '4' }];

      const page1Meta: KatanaPaginationMeta = {
        page: '1',
        total_pages: '2',
        total_records: '4',
        offset: '0',
        first_page: 'true',
        last_page: 'false'
      };

      const page2Meta: KatanaPaginationMeta = {
        page: '2',
        total_pages: '2',
        total_records: '4',
        offset: '2',
        first_page: 'false',
        last_page: 'true'
      };

      (mockResponse.getContentText as Mock)
        .mockReturnValueOnce(JSON.stringify(page1Items))
        .mockReturnValueOnce(JSON.stringify(page2Items));

      (mockResponse.getAllHeaders as Mock)
        .mockReturnValueOnce({ 'X-Pagination': JSON.stringify(page1Meta) })
        .mockReturnValueOnce({ 'X-Pagination': JSON.stringify(page2Meta) });

      const result = fetchPaginatedFromAPI('/v1/test');

      expect(result).toEqual([{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }]);
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('BOM Row Pagination', () => {
    it('should use limit=250 by default for fetchBomRows', async () => {
      const { fetchBomRows } = await import('../../src/katanaClient.js');

      const bomRows = [
        { id: '1', product_variant_id: 123, ingredient_variant_id: 456 },
        { id: '2', product_variant_id: 123, ingredient_variant_id: 789 }
      ];

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(bomRows));
      mockResponse.getAllHeaders.mockReturnValue({});

      const result = fetchBomRows({ productVariantId: 123 });

      // Verify limit=250 was included in the URL
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        'https://api.katanamrp.com/v1/bom_rows?product_variant_id=123&limit=250',
        expect.objectContaining({
          method: 'get',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key'
          })
        })
      );

      expect(result).toEqual(bomRows);
    });

    it('should respect custom limit parameter', async () => {
      const { fetchBomRows } = await import('../../src/katanaClient.js');

      const bomRows = [{ id: '1', product_variant_id: 123 }];

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(bomRows));
      mockResponse.getAllHeaders.mockReturnValue({});

      const result = fetchBomRows({ productVariantId: 123, limit: 50 });

      // Verify custom limit was used
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        'https://api.katanamrp.com/v1/bom_rows?product_variant_id=123&limit=50',
        expect.objectContaining({
          method: 'get',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key'
          })
        })
      );

      expect(result).toEqual(bomRows);
    });

    it('should handle pagination for large BOM datasets', async () => {
      const { fetchBomRows } = await import('../../src/katanaClient.js');

      // Simulate fetching BOM rows for a product with many variants
      const page1Rows = Array.from({ length: 250 }, (_, i) => ({
        id: `${i + 1}`,
        product_variant_id: 123,
        ingredient_variant_id: 1000 + i
      }));

      const page2Rows = Array.from({ length: 100 }, (_, i) => ({
        id: `${251 + i}`,
        product_variant_id: 123,
        ingredient_variant_id: 1250 + i
      }));

      const page1Meta: KatanaPaginationMeta = {
        page: '1',
        total_pages: '2',
        total_records: '350',
        offset: '0',
        first_page: 'true',
        last_page: 'false'
      };

      const page2Meta: KatanaPaginationMeta = {
        page: '2',
        total_pages: '2',
        total_records: '350',
        offset: '250',
        first_page: 'false',
        last_page: 'true'
      };

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText
        .mockReturnValueOnce(JSON.stringify(page1Rows))
        .mockReturnValueOnce(JSON.stringify(page2Rows));

      mockResponse.getAllHeaders
        .mockReturnValueOnce({ 'X-Pagination': JSON.stringify(page1Meta) })
        .mockReturnValueOnce({ 'X-Pagination': JSON.stringify(page2Meta) });

      const result = fetchBomRows({ productVariantId: 123 });

      expect(result).toHaveLength(350);
      expect(result[0]).toEqual({ id: '1', product_variant_id: 123, ingredient_variant_id: 1000 });
      expect(result[349]).toEqual({ id: '350', product_variant_id: 123, ingredient_variant_id: 1349 });

      // Should fetch both pages
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(2);

      // Verify pagination preserved limit parameter
      expect(mockUrlFetchApp.fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.katanamrp.com/v1/bom_rows?product_variant_id=123&limit=250',
        expect.objectContaining({
          method: 'get',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key'
          })
        })
      );
      expect(mockUrlFetchApp.fetch).toHaveBeenNthCalledWith(
        2,
        'https://api.katanamrp.com/v1/bom_rows?product_variant_id=123&limit=250&page=2',
        expect.objectContaining({
          method: 'get',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key'
          })
        })
      );
    });

    it('should aggregate {data: T[]} format across multiple pages', async () => {
      const { katanaSmartFetch } = await import('../../src/katanaClient.js');

      // Mock first page with {data: T[]} format
      const page1Items = {
        data: [
          { id: '1', name: 'Item 1' },
          { id: '2', name: 'Item 2' }
        ]
      };
      const page1Meta: KatanaPaginationMeta = {
        page: '1',
        total_pages: '2',
        total_records: '4',
        offset: '0',
        first_page: 'true',
        last_page: 'false'
      };

      // Mock second page with {data: T[]} format
      const page2Items = {
        data: [
          { id: '3', name: 'Item 3' },
          { id: '4', name: 'Item 4' }
        ]
      };
      const page2Meta: KatanaPaginationMeta = {
        page: '2',
        total_pages: '2',
        total_records: '4',
        offset: '2',
        first_page: 'false',
        last_page: 'true'
      };

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText
        .mockReturnValueOnce(JSON.stringify(page1Items))
        .mockReturnValueOnce(JSON.stringify(page2Items));

      mockResponse.getAllHeaders
        .mockReturnValueOnce({ 'X-Pagination': JSON.stringify(page1Meta) })
        .mockReturnValueOnce({ 'X-Pagination': JSON.stringify(page2Meta) });

      const result = katanaSmartFetch('/v1/test');

      // Should aggregate data arrays from both pages
      expect(result).toEqual([
        { id: '1', name: 'Item 1' },
        { id: '2', name: 'Item 2' },
        { id: '3', name: 'Item 3' },
        { id: '4', name: 'Item 4' }
      ]);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
