import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaticConfigProvider, setConfigProvider } from '../../src/ConfigProvider.js';

function useApiKey(apiKey: string): void {
  setConfigProvider(new StaticConfigProvider({ katana: { apiKey, defaultLocationId: 160411 } }));
}

describe('katanaClient', () => {
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
      getProperty: vi.fn()
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

  describe('getKatanaApiKey', () => {
    it('should return API key when it exists', async () => {
      const expectedKey = 'test-api-key-123';
      useApiKey(expectedKey);

      const { getKatanaApiKey } = await import('../../src/katanaClient.js');
      const result = getKatanaApiKey();

      expect(result).toBe(expectedKey);
    });

    it('should throw error when API key is missing', async () => {
      setConfigProvider(new StaticConfigProvider({}));

      const { getKatanaApiKey } = await import('../../src/katanaClient.js');

      expect(() => getKatanaApiKey()).toThrow('KATANA_API_KEY not configured. Please set it in Script Properties.');
    });
  });

  describe('katanaSmartFetch', () => {
    it('should make successful API call', async () => {
      const testPath = '/v1/test';
      const testUrl = 'https://api.katanamrp.com/v1/test';
      const apiKey = 'test-key';
      const responseData = { success: true };

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(responseData));

      const { katanaSmartFetch } = await import('../../src/katanaClient.js');
      const result = katanaSmartFetch(testPath);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(testUrl, {
        method: 'get',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json'
        },
        muteHttpExceptions: true
      });
      expect(result).toEqual(responseData);
    });

    it('should handle rate limiting with retry-after header', async () => {
      const testPath = '/v1/test';
      const apiKey = 'test-key';
      const responseData = { success: true };

      useApiKey(apiKey);
      mockResponse.getResponseCode
        .mockReturnValueOnce(429) // First call rate limited
        .mockReturnValueOnce(200); // Second call succeeds
      mockResponse.getAllHeaders.mockReturnValue({ 'Retry-After': '2' });
      mockResponse.getContentText.mockReturnValue(JSON.stringify(responseData));

      const { katanaSmartFetch } = await import('../../src/katanaClient.js');
      const result = katanaSmartFetch(testPath);

      expect(mockUtilities.sleep).toHaveBeenCalledWith(2000); // 2 seconds * 1000ms
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(responseData);
    });

    it('should handle rate limiting with exponential backoff', async () => {
      const testPath = '/v1/test';
      const apiKey = 'test-key';
      const responseData = { success: true };

      useApiKey(apiKey);
      mockResponse.getResponseCode
        .mockReturnValueOnce(429) // First call rate limited
        .mockReturnValueOnce(200); // Second call succeeds
      mockResponse.getAllHeaders.mockReturnValue({}); // No retry-after header
      mockResponse.getContentText.mockReturnValue(JSON.stringify(responseData));

      const { katanaSmartFetch } = await import('../../src/katanaClient.js');
      const result = katanaSmartFetch(testPath);

      expect(mockUtilities.sleep).toHaveBeenCalledWith(1000); // 1 second initial delay
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(responseData);
    });

    it('should throw error after max retries', async () => {
      const testUrl = 'https://api.katanamrp.com/v1/test';
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(429); // Always rate limited
      mockResponse.getAllHeaders.mockReturnValue({});

      const { katanaSmartFetch } = await import('../../src/katanaClient.js');

      expect(() => katanaSmartFetch(testUrl)).toThrow('Katana API failed after 5 attempts for');
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(5);
    });
  });

  describe('fetchVariantFromAPI', () => {
    it('should fetch variant successfully', async () => {
      const testSku = 'TEST-SKU-123';
      const apiKey = 'test-key';
      const mockVariant = {
        id: '123',
        sku: testSku,
        name: 'Test Product'
      };

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: [mockVariant]
        })
      );

      const { fetchVariantFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchVariantFromAPI(testSku);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        `https://api.katanamrp.com/v1/variants?sku=${encodeURIComponent(testSku)}&extend=product_or_material`,
        expect.any(Object)
      );
      expect(result).toEqual(mockVariant);
    });

    it('should return null when variant not found', async () => {
      const testSku = 'NONEXISTENT-SKU';
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: []
        })
      );

      const { fetchVariantFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchVariantFromAPI(testSku);

      expect(result).toBeNull();
    });

    it('should throw error on API failure', async () => {
      const testSku = 'TEST-SKU-123';
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(404);
      mockResponse.getContentText.mockReturnValue('Not Found');

      const { fetchVariantFromAPI } = await import('../../src/katanaClient.js');

      expect(() => fetchVariantFromAPI(testSku)).toThrow(
        'Katana API error 404 for https://api.katanamrp.com/v1/variants?sku=TEST-SKU-123&extend=product_or_material: Not Found'
      );
    });
  });

  describe('fetchParentNameFromAPI', () => {
    it('should fetch product name successfully', async () => {
      const productId = 123;
      const apiKey = 'test-key';
      const mockProduct = { name: 'Test Product' };

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(mockProduct));

      const { fetchParentNameFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchParentNameFromAPI(productId, null);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        `https://api.katanamrp.com/v1/products/${encodeURIComponent(productId)}`,
        expect.any(Object)
      );
      expect(result).toBe('Test Product');
    });

    it('should fetch material name successfully', async () => {
      const materialId = 456;
      const apiKey = 'test-key';
      const mockMaterial = { name: 'Test Material' };

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(mockMaterial));

      const { fetchParentNameFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchParentNameFromAPI(null, materialId);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        `https://api.katanamrp.com/v1/materials/${encodeURIComponent(materialId)}`,
        expect.any(Object)
      );
      expect(result).toBe('Test Material');
    });

    it('should throw error when neither ID provided', async () => {
      const { fetchParentNameFromAPI } = await import('../../src/katanaClient.js');

      expect(() => fetchParentNameFromAPI(null, null)).toThrow('Variant has neither product_id nor material_id');
    });

    it('should throw error when name missing from response', async () => {
      const productId = 123;
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify({})); // No name field

      const { fetchParentNameFromAPI } = await import('../../src/katanaClient.js');

      expect(() => fetchParentNameFromAPI(productId, null)).toThrow("Missing 'name' field in response");
    });
  });

  describe('fetchPaginatedFromAPI', () => {
    it('should fetch single page successfully', async () => {
      const testPath = '/v1/variants?limit=250';
      const apiKey = 'test-key';
      const mockData = [
        { id: '1', sku: 'SKU1' },
        { id: '2', sku: 'SKU2' }
      ];

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify({ data: mockData }));
      mockResponse.getAllHeaders.mockReturnValue({}); // No pagination header

      const { fetchPaginatedFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchPaginatedFromAPI(testPath);

      expect(result).toEqual(mockData);
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(1);
    });

    it('should fetch multiple pages successfully', async () => {
      const testPath = '/v1/variants';
      const apiKey = 'test-key';
      const page1Data = [{ id: '1', sku: 'SKU1' }];
      const page2Data = [{ id: '2', sku: 'SKU2' }];

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText
        .mockReturnValueOnce(
          JSON.stringify({
            data: page1Data,
            meta: { pagination: { current_page: 1, total_pages: 2 } }
          })
        )
        .mockReturnValueOnce(
          JSON.stringify({
            data: page2Data,
            meta: { pagination: { current_page: 2, total_pages: 2 } }
          })
        );

      // Mock pagination headers to trigger auto-pagination
      mockResponse.getAllHeaders
        .mockReturnValueOnce({
          'X-Pagination': JSON.stringify({
            page: 1,
            total_pages: 2,
            last_page: false
          })
        })
        .mockReturnValueOnce({
          'X-Pagination': JSON.stringify({
            page: 2,
            total_pages: 2,
            last_page: true
          })
        });

      const { fetchPaginatedFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchPaginatedFromAPI(testPath);

      expect(result).toEqual([...page1Data, ...page2Data]);
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle API errors', async () => {
      const testPath = '/v1/variants';
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(500);

      const { fetchPaginatedFromAPI } = await import('../../src/katanaClient.js');

      expect(() => fetchPaginatedFromAPI(testPath)).toThrow(
        'Katana API failed after 5 attempts for https://api.katanamrp.com/v1/variants'
      );
    });
  });

  describe('fetchInventoryFromAPI', () => {
    it('should fetch inventory successfully', async () => {
      const variantId = 123;
      const apiKey = 'test-key';
      const mockInventory = {
        variant_id: variantId,
        in_stock: 10,
        allocated: 2
      };

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: [mockInventory]
        })
      );

      const { fetchInventoryFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchInventoryFromAPI(variantId);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        `https://api.katanamrp.com/v1/inventory?variant_id=${encodeURIComponent(variantId)}`,
        expect.any(Object)
      );
      expect(result).toEqual(mockInventory);
    });

    it('should return null when inventory not found', async () => {
      const variantId = 999;
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: []
        })
      );

      const { fetchInventoryFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchInventoryFromAPI(variantId);

      expect(result).toBeNull();
    });
  });

  describe('batchFetchVariantsBySkus', () => {
    it('should return empty array for empty input', async () => {
      const { batchFetchVariantsBySkus } = await import('../../src/katanaClient.js');
      const result = batchFetchVariantsBySkus([]);

      expect(result).toEqual([]);
    });

    it('should fetch variants using repeated parameter format', async () => {
      const testSkus = ['SKU1', 'SKU2', 'SKU3'];
      const apiKey = 'test-key';
      const mockVariants = [
        { id: '1', sku: 'SKU1' },
        { id: '2', sku: 'SKU2' },
        { id: '3', sku: 'SKU3' }
      ];

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: mockVariants
        })
      );
      mockResponse.getAllHeaders.mockReturnValue({});

      const { batchFetchVariantsBySkus } = await import('../../src/katanaClient.js');
      const result = batchFetchVariantsBySkus(testSkus);

      // Verify the repeated parameter format is used with extend parameter
      const expectedUrl =
        'https://api.katanamrp.com/v1/variants?sku=SKU1&sku=SKU2&sku=SKU3&extend=product_or_material&limit=250';
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
      expect(result).toEqual(mockVariants);
    });

    it('should handle encoding of special characters in SKUs', async () => {
      const testSkus = ['*AC20OPMB', 'SKU-with-dash', 'SKU with space'];
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify({ data: [] }));
      mockResponse.getAllHeaders.mockReturnValue({});

      const { batchFetchVariantsBySkus } = await import('../../src/katanaClient.js');
      batchFetchVariantsBySkus(testSkus);

      // Verify URL encoding is applied correctly with extend parameter
      const expectedUrl =
        'https://api.katanamrp.com/v1/variants?sku=*AC20OPMB&sku=SKU-with-dash&sku=SKU%20with%20space&extend=product_or_material&limit=250';
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));
    });
  });

  describe('batchFetchInventoryByVariantIds', () => {
    it('should return empty array for empty input', async () => {
      const { batchFetchInventoryByVariantIds } = await import('../../src/katanaClient.js');
      const result = batchFetchInventoryByVariantIds([]);

      expect(result).toEqual([]);
      expect(mockUrlFetchApp.fetch).not.toHaveBeenCalled();
    });

    it('should fetch inventory data for multiple variant IDs', async () => {
      const testVariantIds = [123, 456];
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: [
            { id: 'inv-1', variant_id: 123, location_id: 160411, in_stock: 5 },
            { id: 'inv-2', variant_id: 456, location_id: 160411, in_stock: 3 },
            { id: 'inv-3', variant_id: 789, location_id: 999999, in_stock: 1 } // Different location, should be filtered out
          ]
        })
      );
      mockResponse.getAllHeaders.mockReturnValue({});

      const { batchFetchInventoryByVariantIds } = await import('../../src/katanaClient.js');
      const result = batchFetchInventoryByVariantIds(testVariantIds);

      expect(result).toHaveLength(2); // Should only return "Spot HQ" location records
      expect(result[0]).toMatchObject({ variant_id: 123, location_id: 160411 });
      expect(result[1]).toMatchObject({ variant_id: 456, location_id: 160411 });
    });

    it('should filter out non-Spot HQ inventory records', async () => {
      const testVariantIds = [123];
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: [
            { id: 'inv-1', variant_id: 123, location_id: 160411, in_stock: 5 }, // Spot HQ
            { id: 'inv-2', variant_id: 123, location_id: 999, in_stock: 3 }, // Other location
            { id: 'inv-3', variant_id: 123, location_id: null, in_stock: 1 } // No location
          ]
        })
      );
      mockResponse.getAllHeaders.mockReturnValue({});

      const { batchFetchInventoryByVariantIds } = await import('../../src/katanaClient.js');
      const result = batchFetchInventoryByVariantIds(testVariantIds);

      expect(result).toHaveLength(1); // Only Spot HQ record
      expect(result[0]).toMatchObject({ variant_id: 123, location_id: 160411 });
    });
  });

  describe('batchFetchProductNames', () => {
    it('should return empty map for empty input', async () => {
      const { batchFetchProductNames } = await import('../../src/katanaClient.js');
      const result = batchFetchProductNames([]);

      expect(result).toEqual(new Map());
      expect(mockUrlFetchApp.fetch).not.toHaveBeenCalled();
    });

    it('should fetch product names by IDs', async () => {
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
      mockResponse.getAllHeaders.mockReturnValue({});

      const { batchFetchProductNames } = await import('../../src/katanaClient.js');
      const result = batchFetchProductNames(testProductIds);

      expect(result.size).toBe(2);
      expect(result.get('prod-123')).toBe('Product A');
      expect(result.get('prod-456')).toBe('Product B');
      expect(result.has('prod-789')).toBe(false); // Should not include unrequested products
    });
  });

  describe('batchFetchMaterialNames', () => {
    it('should return empty map for empty input', async () => {
      const { batchFetchMaterialNames } = await import('../../src/katanaClient.js');
      const result = batchFetchMaterialNames([]);

      expect(result).toEqual(new Map());
      expect(mockUrlFetchApp.fetch).not.toHaveBeenCalled();
    });

    it('should fetch material names by IDs', async () => {
      const testMaterialIds = ['mat-123', 'mat-456'];
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: [
            { id: 'mat-123', name: 'Material A' },
            { id: 'mat-456', name: 'Material B' },
            { id: 'mat-789', name: 'Material C' } // Extra material not requested
          ]
        })
      );
      mockResponse.getAllHeaders.mockReturnValue({});

      const { batchFetchMaterialNames } = await import('../../src/katanaClient.js');
      const result = batchFetchMaterialNames(testMaterialIds);

      expect(result.size).toBe(2);
      expect(result.get('mat-123')).toBe('Material A');
      expect(result.get('mat-456')).toBe('Material B');
      expect(result.has('mat-789')).toBe(false); // Should not include unrequested materials
    });
  });

  describe('fetchInventoryFromAPI', () => {
    it('should fetch inventory for single variant ID', async () => {
      const testVariantId = 123;
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: [{ id: 'inv-123', variant_id: 123, in_stock: 5 }]
        })
      );

      const { fetchInventoryFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchInventoryFromAPI(testVariantId);

      expect(result).toMatchObject({ id: 'inv-123', variant_id: 123, in_stock: 5 });
      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        'https://api.katanamrp.com/v1/inventory?variant_id=123',
        expect.any(Object)
      );
    });

    it('should return null when no inventory found', async () => {
      const testVariantId = 999;
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify({ data: [] }));

      const { fetchInventoryFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchInventoryFromAPI(testVariantId);

      expect(result).toBeNull();
    });

    it('should throw error on API failure', async () => {
      const testVariantId = 123;
      const apiKey = 'test-key';

      useApiKey(apiKey);
      mockResponse.getResponseCode.mockReturnValue(404);
      mockResponse.getContentText.mockReturnValue('Not Found');

      const { fetchInventoryFromAPI } = await import('../../src/katanaClient.js');

      expect(() => fetchInventoryFromAPI(testVariantId)).toThrow(
        'Katana API error 404 for https://api.katanamrp.com/v1/inventory?variant_id=123: Not Found'
      );
    });
  });
});
