import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockBomRow, createMockBomRowRequest } from '../fixtures/bomRow.js';

describe('katanaClient - Updated API Functions', () => {
  let mockResponse: any;
  let mockUrlFetchApp: any;
  let mockPropertiesService: any;
  let mockUtilities: any;
  let mockConsole: any;

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

    // Setup mock console
    mockConsole = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {})
    };

    // Assign to global
    (globalThis as any).UrlFetchApp = mockUrlFetchApp;
    (globalThis as any).PropertiesService = mockPropertiesService;
    (globalThis as any).Utilities = mockUtilities;
  });

  describe('fetchVariantFromAPI', () => {
    it('should fetch variant with direct data array response', async () => {
      const testSku = 'TEST-SKU-123';
      const mockVariant = {
        id: '123',
        sku: testSku,
        name: 'Test Product',
        product_or_material: { id: 'prod-1', name: 'Parent Product' }
      };

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: [mockVariant]
        })
      );

      const { fetchVariantFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchVariantFromAPI(testSku);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        `https://api.katanamrp.com/v1/variants?sku=${testSku}&extend=product_or_material`,
        expect.objectContaining({
          method: 'get',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key'
          })
        })
      );
      expect(result).toEqual(mockVariant);
    });

    it('should handle array response format', async () => {
      const testSku = 'TEST-SKU-123';
      const mockVariant = { id: '123', sku: testSku };

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify([mockVariant]));

      const { fetchVariantFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchVariantFromAPI(testSku);

      expect(result).toEqual(mockVariant);
    });

    it('should return null when variant not found', async () => {
      const testSku = 'NON-EXISTENT-SKU';

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify({ data: [] }));

      const { fetchVariantFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchVariantFromAPI(testSku);

      expect(result).toBeNull();
    });

    it('should return null for empty array response', async () => {
      const testSku = 'NON-EXISTENT-SKU';

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify([]));

      const { fetchVariantFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchVariantFromAPI(testSku);

      expect(result).toBeNull();
    });
  });

  describe('fetchParentNameFromAPI', () => {
    it('should fetch product name by product ID', async () => {
      const productId = 123;
      const expectedName = 'Test Product Name';
      const mockProduct = { id: productId, name: expectedName };

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(mockProduct));

      const { fetchParentNameFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchParentNameFromAPI(productId, null);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        `https://api.katanamrp.com/v1/products/${productId}`,
        expect.any(Object)
      );
      expect(result).toBe(expectedName);
    });

    it('should fetch material name by material ID', async () => {
      const materialId = 456;
      const expectedName = 'Test Material Name';
      const mockMaterial = { id: materialId, name: expectedName };

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(mockMaterial));

      const { fetchParentNameFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchParentNameFromAPI(null, materialId);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        `https://api.katanamrp.com/v1/materials/${materialId}`,
        expect.any(Object)
      );
      expect(result).toBe(expectedName);
    });

    it('should handle response with data wrapper', async () => {
      const productId = 789;
      const expectedName = 'Test Product Name';
      const mockProduct = { id: productId, name: expectedName };

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: [mockProduct]
        })
      );

      const { fetchParentNameFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchParentNameFromAPI(productId, null);

      expect(result).toBe(expectedName);
    });

    it('should throw error when neither product nor material ID provided', async () => {
      const { fetchParentNameFromAPI } = await import('../../src/katanaClient.js');

      expect(() => fetchParentNameFromAPI(null, null)).toThrow('Variant has neither product_id nor material_id.');
    });

    it('should throw error when name field is missing', async () => {
      const productId = 999;
      const mockProduct = { id: productId }; // Missing name field

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(mockProduct));

      const { fetchParentNameFromAPI } = await import('../../src/katanaClient.js');

      expect(() => fetchParentNameFromAPI(productId, null)).toThrow(
        "Missing 'name' field in response for /v1/products/999"
      );
    });
  });

  describe('fetchPaginatedFromAPI', () => {
    it('should delegate to katanaSmartFetch with pagination enabled', async () => {
      const testPath = '/v1/variants?limit=100';
      const mockData = [
        { id: '1', sku: 'SKU1' },
        { id: '2', sku: 'SKU2' }
      ];

      // Mock the response for pagination
      const page1Response = {
        data: mockData,
        meta: {
          pagination: {
            current_page: 1,
            total_pages: 1,
            per_page: 100,
            total_count: 2
          }
        }
      };

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(page1Response));

      const { fetchPaginatedFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchPaginatedFromAPI(testPath);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        `https://api.katanamrp.com/v1/variants?limit=100`,
        expect.any(Object)
      );
      expect(result).toEqual(mockData);
    });
  });

  describe('fetchInventoryFromAPI', () => {
    it('should fetch inventory by variant ID', async () => {
      const variantId = 123;
      const mockInventory = {
        id: 'inv-456',
        variant_id: variantId,
        available_quantity: 10,
        allocated_quantity: 2
      };

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: [mockInventory]
        })
      );

      const { fetchInventoryFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchInventoryFromAPI(variantId);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        `https://api.katanamrp.com/v1/inventory?variant_id=${variantId}`,
        expect.any(Object)
      );
      expect(result).toEqual(mockInventory);
    });

    it('should return null when inventory not found', async () => {
      const variantId = 404;

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify({ data: [] }));

      const { fetchInventoryFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchInventoryFromAPI(variantId);

      expect(result).toBeNull();
    });

    it('should handle array response format', async () => {
      const variantId = 789;
      const mockInventory = { id: 'inv-456', variant_id: variantId };

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify([mockInventory]));

      const { fetchInventoryFromAPI } = await import('../../src/katanaClient.js');
      const result = fetchInventoryFromAPI(variantId);

      expect(result).toEqual(mockInventory);
    });
  });

  describe('createBomRow', () => {
    it('should create BOM row and handle response structure', async () => {
      const request = createMockBomRowRequest({
        productItemId: 123,
        productVariantId: 456,
        ingredientVariantId: 789,
        quantity: 2.5,
        notes: 'Test BOM row'
      });

      const mockCreatedRow = createMockBomRow({
        id: 'bom-row-123',
        productItemId: request.product_item_id,
        productVariantId: request.product_variant_id,
        ingredientVariantId: request.ingredient_variant_id,
        quantity: request.quantity,
        notes: request.notes
      });

      mockResponse.getResponseCode.mockReturnValue(201);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: [mockCreatedRow]
        })
      );

      const { createBomRow } = await import('../../src/katanaClient.js');
      const result = createBomRow(request);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        'https://api.katanamrp.com/v1/bom_rows',
        expect.objectContaining({
          method: 'post',
          payload: JSON.stringify(request)
        })
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        `🧩 Creating BOM row for product variant ${request.product_variant_id} with ingredient ${request.ingredient_variant_id}`
      );
      expect(mockConsole.log).toHaveBeenCalledWith(`✅ Created BOM row: ${mockCreatedRow.id}`);
      expect(result).toEqual(mockCreatedRow);
    });

    it('should handle direct object response', async () => {
      const request = createMockBomRowRequest({
        productItemId: 123,
        productVariantId: 456,
        ingredientVariantId: 789,
        quantity: 1
      });

      const mockCreatedRow = createMockBomRow({
        id: 'bom-row-456',
        productItemId: request.product_item_id,
        productVariantId: request.product_variant_id,
        ingredientVariantId: request.ingredient_variant_id,
        quantity: request.quantity
      });

      mockResponse.getResponseCode.mockReturnValue(201);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(mockCreatedRow));

      const { createBomRow } = await import('../../src/katanaClient.js');
      const result = createBomRow(request);

      expect(result).toEqual(mockCreatedRow);
    });

    it('should handle array response', async () => {
      const request = createMockBomRowRequest({
        productItemId: 123,
        productVariantId: 456,
        ingredientVariantId: 789,
        quantity: 1
      });

      const mockCreatedRow = createMockBomRow({
        id: 'bom-row-789',
        productItemId: request.product_item_id,
        productVariantId: request.product_variant_id,
        ingredientVariantId: request.ingredient_variant_id,
        quantity: request.quantity
      });

      mockResponse.getResponseCode.mockReturnValue(201);
      mockResponse.getContentText.mockReturnValue(JSON.stringify([mockCreatedRow]));

      const { createBomRow } = await import('../../src/katanaClient.js');
      const result = createBomRow(request);

      expect(result).toEqual(mockCreatedRow);
    });
  });

  describe('batchCreateBomRows', () => {
    it('should create multiple BOM rows and handle array response', async () => {
      const request = {
        data: [
          {
            product_item_id: 123,
            product_variant_id: 456,
            ingredient_variant_id: 789,
            quantity: 1
          },
          {
            product_item_id: 123,
            product_variant_id: 456,
            ingredient_variant_id: 790,
            quantity: 2
          }
        ]
      };

      const mockCreatedRows = [
        { id: 'bom-row-1', ...request.data[0] },
        { id: 'bom-row-2', ...request.data[1] }
      ];

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(mockCreatedRows));

      const { batchCreateBomRows } = await import('../../src/katanaClient.js');
      const result = batchCreateBomRows(request);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        'https://api.katanamrp.com/v1/bom_rows/batch/create',
        expect.objectContaining({
          method: 'post',
          payload: JSON.stringify(request)
        })
      );
      expect(mockConsole.log).toHaveBeenCalledWith(`🧩 Batch creating 2 BOM rows`);
      expect(mockConsole.log).toHaveBeenCalledWith(`✅ Batch created 2 BOM rows`);
      expect(result).toEqual(mockCreatedRows);
    });

    it('should handle data wrapper response', async () => {
      const request = {
        data: [
          {
            product_item_id: 123,
            product_variant_id: 456,
            ingredient_variant_id: 789,
            quantity: 1
          }
        ]
      };

      const mockCreatedRows = [{ id: 'bom-row-1', ...request.data[0] }];

      mockResponse.getResponseCode.mockReturnValue(200);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: mockCreatedRows
        })
      );

      const { batchCreateBomRows } = await import('../../src/katanaClient.js');
      const result = batchCreateBomRows(request);

      expect(mockConsole.log).toHaveBeenCalledWith(`✅ Batch created 1 BOM rows`);
      expect(result).toEqual(mockCreatedRows);
    });
  });

  describe('deleteBomRow', () => {
    it('should delete BOM row successfully', async () => {
      const bomRowId = 'bom-row-123';

      mockResponse.getResponseCode.mockReturnValue(204);
      mockResponse.getContentText.mockReturnValue('');

      const { deleteBomRow } = await import('../../src/katanaClient.js');
      deleteBomRow(bomRowId);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        `https://api.katanamrp.com/v1/bom_rows/${bomRowId}`,
        expect.objectContaining({
          method: 'delete'
        })
      );
      expect(mockConsole.log).toHaveBeenCalledWith(`🗑️ Deleting BOM row: ${bomRowId}`);
      expect(mockConsole.log).toHaveBeenCalledWith(`✅ Deleted BOM row: ${bomRowId}`);
    });
  });

  describe('createProduct', () => {
    it('should create product and handle response structure', async () => {
      const request = {
        name: 'Test Product',
        variants: [
          { sku: 'TEST-SKU-1', config_attributes: [{ config_name: 'Color', config_value: 'Red' }] },
          { sku: 'TEST-SKU-2', config_attributes: [{ config_name: 'Color', config_value: 'Blue' }] }
        ]
      };

      const mockCreatedProduct = {
        id: 'prod-123',
        name: request.name,
        variants: request.variants
      };

      mockResponse.getResponseCode.mockReturnValue(201);
      mockResponse.getContentText.mockReturnValue(
        JSON.stringify({
          data: [mockCreatedProduct]
        })
      );

      const { createProduct } = await import('../../src/katanaClient.js');
      const result = createProduct(request);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        'https://api.katanamrp.com/v1/products',
        expect.objectContaining({
          method: 'post',
          payload: JSON.stringify(request)
        })
      );
      expect(mockConsole.log).toHaveBeenCalledWith(`📦 Creating product: ${request.name} with 2 variants`);
      expect(mockConsole.log).toHaveBeenCalledWith(
        `✅ Product created: ${mockCreatedProduct.id} - ${mockCreatedProduct.name}`
      );
      expect(result).toEqual(mockCreatedProduct);
    });
  });

  describe('createMaterial', () => {
    it('should create material and handle response structure', async () => {
      const request = {
        name: 'Test Material',
        variants: [{ sku: 'MAT-SKU-1', config_attributes: [{ config_name: 'Size', config_value: 'Small' }] }]
      };

      const mockCreatedMaterial = {
        id: 'mat-123',
        name: request.name,
        variants: request.variants
      };

      mockResponse.getResponseCode.mockReturnValue(201);
      mockResponse.getContentText.mockReturnValue(JSON.stringify(mockCreatedMaterial));

      const { createMaterial } = await import('../../src/katanaClient.js');
      const result = createMaterial(request);

      expect(mockUrlFetchApp.fetch).toHaveBeenCalledWith(
        'https://api.katanamrp.com/v1/materials',
        expect.objectContaining({
          method: 'post',
          payload: JSON.stringify(request)
        })
      );
      expect(mockConsole.log).toHaveBeenCalledWith(`🔩 Creating material: ${request.name} with 1 variants`);
      expect(mockConsole.log).toHaveBeenCalledWith(
        `✅ Material created: ${mockCreatedMaterial.id} - ${mockCreatedMaterial.name}`
      );
      expect(result).toEqual(mockCreatedMaterial);
    });
  });
});
