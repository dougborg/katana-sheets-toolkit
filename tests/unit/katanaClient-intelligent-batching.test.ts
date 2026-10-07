import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaticConfigProvider, setConfigProvider } from '../../src/ConfigProvider.js';

function useApiKey(apiKey: string): void {
  setConfigProvider(new StaticConfigProvider({ katana: { apiKey, defaultLocationId: 160411 } }));
}

describe('katanaClient - Intelligent Batch Processing', () => {
  let mockResponse: any;
  let mockUrlFetchApp: any;
  let mockPropertiesService: any;

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
      getProperty: vi.fn()
    };
    mockPropertiesService = {
      getScriptProperties: vi.fn().mockReturnValue(mockProps)
    };

    // Assign to global
    (globalThis as any).UrlFetchApp = mockUrlFetchApp;
    (globalThis as any).PropertiesService = mockPropertiesService;
  });

  describe('batchFetchInventoryByVariantIds - Intelligent URL Packing', () => {
    it('should split large variant ID arrays to avoid URL length limits', async () => {
      // Create a large array that would exceed URL length limits
      const largeVariantIdArray = Array.from({ length: 300 }, (_, i) => i + 1);
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);

      // Mock multiple responses for batched requests with correct location_id
      mockResponse.getContentText
        .mockReturnValueOnce(
          JSON.stringify({
            data: Array.from({ length: 50 }, (_, i) => ({
              id: `inv-${i + 1}`,
              variant_id: i + 1,
              location_id: 160411, // Spot HQ location (number, not string)
              in_stock: 10,
              average_cost: 25.5
            }))
          })
        )
        .mockReturnValueOnce(
          JSON.stringify({
            data: Array.from({ length: 50 }, (_, i) => ({
              id: `inv-${i + 51}`,
              variant_id: i + 51,
              location_id: 160411, // Spot HQ location (number, not string)
              in_stock: 5,
              average_cost: 30.0
            }))
          })
        )
        .mockReturnValueOnce(
          JSON.stringify({
            data: Array.from({ length: 1 }, (_, i) => ({
              id: `inv-${i + 101}`,
              variant_id: i + 101,
              location_id: 160411, // Spot HQ location (number, not string)
              in_stock: 2,
              average_cost: 35.0
            }))
          })
        );

      const { batchFetchInventoryByVariantIds } = await import('../../src/katanaClient.js');
      const result = batchFetchInventoryByVariantIds(largeVariantIdArray);

      // Should make multiple API calls due to URL length limits
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(3);

      // Should return combined results (101 total records with Spot HQ location)
      expect(result.length).toBe(101);

      // URLs should not be excessively long
      const calls = mockUrlFetchApp.fetch.mock.calls;
      calls.forEach((call: [string]) => {
        const url = call[0];
        expect(url.length).toBeLessThan(2048); // Should be under URLFetch limit
      });
    });

    it('should optimize batch sizes based on actual URL length', async () => {
      // Test with IDs that have different string lengths
      const mixedVariantIds = [1, 999, 123456, 7890, 12, 3456789012345]; // Different digit lengths
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify({ data: [] }));

      const { batchFetchInventoryByVariantIds } = await import('../../src/katanaClient.js');
      batchFetchInventoryByVariantIds(mixedVariantIds);

      // Should make at least one call
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(1);

      // URL should contain all the variant IDs since the batch is small
      const url = mockUrlFetchApp.fetch.mock.calls[0][0];
      mixedVariantIds.forEach((id) => {
        expect(url).toContain(`variant_id=${id}`);
      });
    });

    it('should handle single variant ID efficiently', async () => {
      const singleVariantId = [12345];
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: [
            {
              id: 'inv-12345',
              variant_id: 12345,
              location_id: 160411, // Spot HQ location (number, not string)
              in_stock: 15,
              average_cost: 45.99
            }
          ]
        })
      );

      const { batchFetchInventoryByVariantIds } = await import('../../src/katanaClient.js');
      const result = batchFetchInventoryByVariantIds(singleVariantId);

      // Should make exactly one call
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(1);

      // Should return the inventory data
      expect(result.length).toBe(1);
      expect(result[0]).toEqual({
        id: 'inv-12345',
        variant_id: 12345,
        location_id: 160411, // Fixed: expect number, not string
        in_stock: 15,
        average_cost: 45.99
      });
    });

    it('should handle empty variant ID array', async () => {
      const emptyArray: number[] = [];

      const { batchFetchInventoryByVariantIds } = await import('../../src/katanaClient.js');
      const result = batchFetchInventoryByVariantIds(emptyArray);

      // Should not make any API calls
      expect(mockUrlFetchApp.fetch).not.toHaveBeenCalled();

      // Should return empty array
      expect(result.length).toBe(0);
    });

    it('should maintain intelligent batching with safety margin', async () => {
      // Test that the batching algorithm leaves enough room for URL parameters
      const mediumSizeArray = Array.from({ length: 100 }, (_, i) => i + 1);
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify({ data: [] }));

      const { batchFetchInventoryByVariantIds } = await import('../../src/katanaClient.js');
      batchFetchInventoryByVariantIds(mediumSizeArray);

      // Should make calls with URLs well under the limit
      const calls = mockUrlFetchApp.fetch.mock.calls;
      calls.forEach((call: [string]) => {
        const url = call[0];
        // Should have good safety margin (2000 chars instead of 2048)
        expect(url.length).toBeLessThan(2000);
      });
    });
  });
});
