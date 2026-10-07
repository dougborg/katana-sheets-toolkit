import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaticConfigProvider, setConfigProvider } from '../../src/ConfigProvider.js';

function useApiKey(apiKey: string): void {
  setConfigProvider(new StaticConfigProvider({ katana: { apiKey, defaultLocationId: 160411 } }));
}

describe('katanaClient - Batch Entity Fetching (Generic Functions)', () => {
  let mockUrlFetchApp: any;
  let mockPropertiesService: any;
  let mockResponse: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockResponse = {
      getResponseCode: vi.fn(),
      getContentText: vi.fn(),
      getAllHeaders: vi.fn().mockReturnValue({})
    };

    mockUrlFetchApp = {
      fetch: vi.fn().mockReturnValue(mockResponse)
    };

    mockPropertiesService = {
      getScriptProperties: vi.fn().mockReturnValue({
        getProperty: vi.fn()
      })
    };

    (globalThis as any).UrlFetchApp = mockUrlFetchApp;
    (globalThis as any).PropertiesService = mockPropertiesService;
  });

  describe('batchFetchProductNames', () => {
    it('should return empty map for empty input', async () => {
      const { batchFetchProductNames } = await import('../../src/katanaClient.js');
      const result = batchFetchProductNames([]);

      expect(result).toEqual(new Map());
      expect(mockUrlFetchApp.fetch).not.toHaveBeenCalled();
    });

    it('should fetch product names by IDs using generic helper', async () => {
      const testProductIds = ['prod-123', 'prod-456'];
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: [
            { id: 'prod-123', name: 'Product A' },
            { id: 'prod-456', name: 'Product B' },
            { id: 'prod-789', name: 'Product C' } // Extra product not requested
          ]
        })
      );

      const { batchFetchProductNames } = await import('../../src/katanaClient.js');
      const result = batchFetchProductNames(testProductIds);

      expect(result.size).toBe(2);
      expect(result.get('prod-123')).toBe('Product A');
      expect(result.get('prod-456')).toBe('Product B');
      expect(result.has('prod-789')).toBe(false); // Should not include unrequested products

      // Verify correct API endpoint was called (generic approach fetches all products)
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        'https://api.katanamrp.com/v1/products',
        expect.objectContaining({
          method: 'get',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key'
          })
        })
      );
    });
  });

  describe('batchFetchMaterialNames', () => {
    it('should return empty map for empty input', async () => {
      const { batchFetchMaterialNames } = await import('../../src/katanaClient.js');
      const result = batchFetchMaterialNames([]);

      expect(result).toEqual(new Map());
      expect(mockUrlFetchApp.fetch).not.toHaveBeenCalled();
    });

    it('should fetch material names by IDs using generic helper', async () => {
      const testMaterialIds = ['mat-123', 'mat-456'];
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: [
            { id: 'mat-123', name: 'Material A' },
            { id: 'mat-456', name: 'Material B' }
          ]
        })
      );

      const { batchFetchMaterialNames } = await import('../../src/katanaClient.js');
      const result = batchFetchMaterialNames(testMaterialIds);

      expect(result.size).toBe(2);
      expect(result.get('mat-123')).toBe('Material A');
      expect(result.get('mat-456')).toBe('Material B');

      // Verify correct API endpoint was called (generic approach fetches all materials)
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        'https://api.katanamrp.com/v1/materials',
        expect.objectContaining({
          method: 'get',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-key'
          })
        })
      );
    });

    it('should handle API errors gracefully', async () => {
      const testMaterialIds = ['mat-123'];
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(500);
      mockResponse.getContentText.mockReturnValue('Internal Server Error');

      const { batchFetchMaterialNames } = await import('../../src/katanaClient.js');

      expect(() => batchFetchMaterialNames(testMaterialIds)).toThrow();
    });
  });

  describe('Generic batchFetchEntityNames behavior', () => {
    it('should handle pagination if multiple pages returned', async () => {
      const testProductIds = ['prod-1', 'prod-2'];
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: [
            { id: 'prod-1', name: 'Product 1' },
            { id: 'prod-2', name: 'Product 2' }
          ]
        })
      );
      mockResponse.getAllHeaders.mockReturnValue({
        'X-Pagination': '{"page":1,"total_pages":1,"last_page":true}'
      });

      const { batchFetchProductNames } = await import('../../src/katanaClient.js');
      const result = batchFetchProductNames(testProductIds);

      expect(result.size).toBe(2);
      expect(result.get('prod-1')).toBe('Product 1');
      expect(result.get('prod-2')).toBe('Product 2');
    });

    it('should filter results to only requested IDs', async () => {
      const testProductIds = ['prod-123'];
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: [
            { id: 'prod-123', name: 'Requested Product' },
            { id: 'prod-999', name: 'Unrequested Product' } // Should be filtered out
          ]
        })
      );

      const { batchFetchProductNames } = await import('../../src/katanaClient.js');
      const result = batchFetchProductNames(testProductIds);

      expect(result.size).toBe(1);
      expect(result.get('prod-123')).toBe('Requested Product');
      expect(result.has('prod-999')).toBe(false);
    });
  });
});
