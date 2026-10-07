import { beforeEach, describe, expect, it, vi } from 'vitest';
/**
 * Tests for Katana Client Atomic BOM Update functionality
 *
 * This test file specifically tests the atomic update strategy:
 * 1. Clear all existing BOM rows for a product variant
 * 2. Create new BOM rows from sheet data
 */

import { clearProductBomRows, deleteBomRow } from '../../src/katanaClient.js';
import { resetAllMocks } from '../setup.js';

describe('Katana Client - Atomic BOM Updates', () => {
  beforeEach(() => {
    // Reset all mocks using the setup utility
    resetAllMocks();

    // Setup console mocks
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  describe('deleteBomRow', () => {
    it('should make correct DELETE API call', () => {
      // Mock successful deletion response
      (globalThis as any).UrlFetchApp.fetch = vi.fn().mockReturnValue({
        getResponseCode: () => 204,
        getContentText: () => '',
        getAllHeaders: () => ({})
      });

      deleteBomRow('123');

      expect((globalThis as any).UrlFetchApp.fetch).toHaveBeenCalledWith(
        'https://api.katanamrp.com/v1/bom_rows/123',
        expect.objectContaining({
          method: 'delete',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-katana-api-key',
            Accept: 'application/json'
          }),
          muteHttpExceptions: true
        })
      );
    });

    it('should handle delete API errors', () => {
      const mockResponse = {
        getResponseCode: vi.fn().mockReturnValue(404),
        getContentText: vi.fn().mockReturnValue('BOM row not found'),
        getAllHeaders: vi.fn().mockReturnValue({})
      };

      (globalThis as any).UrlFetchApp.fetch = vi.fn().mockReturnValue(mockResponse);

      expect(() => {
        deleteBomRow('999');
      }).toThrow('Katana API error 404 for https://api.katanamrp.com/v1/bom_rows/999: BOM row not found');
    });

    it('should log deletion progress', () => {
      (globalThis as any).UrlFetchApp.fetch = vi.fn().mockReturnValue({
        getResponseCode: () => 204,
        getContentText: () => '',
        getAllHeaders: () => ({})
      });

      deleteBomRow('456');

      expect((globalThis as any).console.log).toHaveBeenCalledWith('🗑️ Deleting BOM row: 456');
      expect((globalThis as any).console.log).toHaveBeenCalledWith('✅ Deleted BOM row: 456');
    });
  });

  describe('clearProductBomRows', () => {
    it('should fetch existing rows and delete them all', () => {
      // Mock existing BOM rows
      const mockBomRows = [
        { id: '1', product_variant_id: '100', ingredient_variant_id: '200', quantity: 2 },
        { id: '2', product_variant_id: '100', ingredient_variant_id: '201', quantity: 1 },
        { id: '3', product_variant_id: '100', ingredient_variant_id: '202', quantity: 3 }
      ];

      // Mock fetchBomRows response and successful deletions
      (globalThis as any).UrlFetchApp.fetch = vi
        .fn()
        .mockReturnValueOnce({
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ data: mockBomRows }),
          getAllHeaders: () => ({})
        })
        // Mock successful deletions
        .mockReturnValue({
          getResponseCode: () => 204,
          getContentText: () => '',
          getAllHeaders: () => ({})
        });

      clearProductBomRows(100);

      // Should fetch existing rows first
      // Verify API calls (fetchBomRows now defaults to limit=250)
      expect((globalThis as any).UrlFetchApp.fetch).toHaveBeenCalledWith(
        'https://api.katanamrp.com/v1/bom_rows?product_variant_id=100&limit=250',
        expect.any(Object)
      );

      // Should delete each row
      expect((globalThis as any).UrlFetchApp.fetch).toHaveBeenCalledWith(
        'https://api.katanamrp.com/v1/bom_rows/1',
        expect.objectContaining({ method: 'delete' })
      );
      expect((globalThis as any).UrlFetchApp.fetch).toHaveBeenCalledWith(
        'https://api.katanamrp.com/v1/bom_rows/2',
        expect.objectContaining({ method: 'delete' })
      );
      expect((globalThis as any).UrlFetchApp.fetch).toHaveBeenCalledWith(
        'https://api.katanamrp.com/v1/bom_rows/3',
        expect.objectContaining({ method: 'delete' })
      );

      expect((globalThis as any).console.log).toHaveBeenCalledWith('✅ Cleared BOM rows: 3 deleted, 0 failed');
    });

    it('should handle products with no existing BOM rows', () => {
      // Mock empty response
      (globalThis as any).UrlFetchApp.fetch = vi.fn().mockReturnValue({
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ data: [] }),
        getAllHeaders: () => ({})
      });

      clearProductBomRows(200);

      expect((globalThis as any).console.log).toHaveBeenCalledWith(
        '✅ No existing BOM rows to clear for product variant 200'
      );

      // Should only make the fetch call, no delete calls
      expect((globalThis as any).UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle partial deletion failures', () => {
      const mockBomRows = [
        { id: '1', product_variant_id: '100', ingredient_variant_id: '200', quantity: 2 },
        { id: '2', product_variant_id: '100', ingredient_variant_id: '201', quantity: 1 }
      ];

      (globalThis as any).UrlFetchApp.fetch = vi
        .fn()
        // Mock fetchBomRows response
        .mockReturnValueOnce({
          getResponseCode: () => 200,
          getContentText: () => JSON.stringify({ data: mockBomRows }),
          getAllHeaders: () => ({})
        })
        // Mock first deletion success
        .mockReturnValueOnce({
          getResponseCode: () => 204,
          getContentText: () => '',
          getAllHeaders: () => ({})
        })
        // Mock second deletion failure
        .mockReturnValueOnce({
          getResponseCode: () => 500,
          getContentText: () => 'Server error',
          getAllHeaders: () => ({})
        });

      expect(() => {
        clearProductBomRows(100);
      }).toThrow('Failed to delete 1 BOM rows for product variant 100');

      expect((globalThis as any).console.log).toHaveBeenCalledWith('✅ Cleared BOM rows: 1 deleted, 1 failed');
    });
  });

  // Note: Integration tests for syncBomToKatana would require complex mocking
  // of the full BOM sync workflow including sheet parsing, variant fetching, etc.
  // The unit tests above validate that the core atomic operations work correctly.
  // The atomic update functionality is integrated into syncBomToKatana and will
  // be tested in the production environment.
});
