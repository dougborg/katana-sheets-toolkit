import { afterEach, beforeEach, describe, expect, type MockInstance, test, vi } from 'vitest';
// Import from TypeScript source for unit testing
import {
  type BomDiffSummary,
  type BomRow,
  compareBomRows,
  generateDiffSummary,
  printBomDiff
} from '../../src/bomDiff.js';
import { resetAllMocks } from '../setup.js';

describe('BomDiff', () => {
  let consoleSpy: MockInstance<typeof console.log>;

  beforeEach(() => {
    resetAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('compareBomRows', () => {
    const mockIngredientBySku = {
      'ING-001': { id: '101' },
      'ING-002': { id: '102' },
      'ING-003': { id: '103' }
    };

    test('should detect no changes when rows are identical', () => {
      const existing: BomRow[] = [
        {
          id: '1',
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 101,
          quantity: 2,
          notes: 'test note',
          rank: 1
        }
      ];

      const desired: BomRow[] = [
        {
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 101,
          quantity: 2,
          notes: 'test note',
          rank: 1
        }
      ];

      const result = compareBomRows(existing, desired, mockIngredientBySku);

      expect(result.stats).toEqual({
        unchanged: 1,
        modified: 0,
        added: 0,
        removed: 0
      });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('unchanged');
      expect(result.rows[0].changes).toEqual([]);
    });

    test('should detect quantity changes', () => {
      const existing: BomRow[] = [
        {
          id: '1',
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 101,
          quantity: 2,
          notes: 'test note',
          rank: 1
        }
      ];

      const desired: BomRow[] = [
        {
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 101,
          quantity: 5,
          notes: 'test note',
          rank: 1
        }
      ];

      const result = compareBomRows(existing, desired, mockIngredientBySku);

      expect(result.stats).toEqual({
        unchanged: 0,
        modified: 1,
        added: 0,
        removed: 0
      });

      expect(result.rows[0].status).toBe('modified');
      expect(result.rows[0].changes).toEqual(['quantity: 2 → 5']);
    });

    test('should detect ingredient variant changes', () => {
      const existing: BomRow[] = [
        {
          id: '1',
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 101,
          quantity: 2,
          notes: 'test note',
          rank: 1
        }
      ];

      const desired: BomRow[] = [
        {
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 102,
          quantity: 2,
          notes: 'test note',
          rank: 1
        }
      ];

      const result = compareBomRows(existing, desired, mockIngredientBySku);

      expect(result.stats).toEqual({
        unchanged: 0,
        modified: 1,
        added: 0,
        removed: 0
      });

      expect(result.rows[0].status).toBe('modified');
      expect(result.rows[0].changes).toEqual(['ingredient: 101 → 102']);
    });

    test('should detect notes changes', () => {
      const existing: BomRow[] = [
        {
          id: '1',
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 101,
          quantity: 2,
          notes: 'old note',
          rank: 1
        }
      ];

      const desired: BomRow[] = [
        {
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 101,
          quantity: 2,
          notes: 'new note',
          rank: 1
        }
      ];

      const result = compareBomRows(existing, desired, mockIngredientBySku);

      expect(result.stats).toEqual({
        unchanged: 0,
        modified: 1,
        added: 0,
        removed: 0
      });

      expect(result.rows[0].status).toBe('modified');
      expect(result.rows[0].changes).toEqual(['notes: "old note" → "new note"']);
    });

    test('should detect rank changes', () => {
      const existing: BomRow[] = [
        {
          id: '1',
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 101,
          quantity: 2,
          notes: 'test note',
          rank: 1
        }
      ];

      const desired: BomRow[] = [
        {
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 101,
          quantity: 2,
          notes: 'test note',
          rank: 2
        }
      ];

      const result = compareBomRows(existing, desired, mockIngredientBySku);

      expect(result.stats).toEqual({
        unchanged: 0,
        modified: 1,
        added: 0,
        removed: 0
      });

      expect(result.rows[0].status).toBe('modified');
      expect(result.rows[0].changes).toEqual(['rank: 1 → 2']);
    });

    test('should detect multiple changes in same row', () => {
      const existing: BomRow[] = [
        {
          id: '1',
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 101,
          quantity: 2,
          notes: 'old note',
          rank: 1
        }
      ];

      const desired: BomRow[] = [
        {
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 102,
          quantity: 5,
          notes: 'new note',
          rank: 2
        }
      ];

      const result = compareBomRows(existing, desired, mockIngredientBySku);

      expect(result.stats).toEqual({
        unchanged: 0,
        modified: 1,
        added: 0,
        removed: 0
      });

      expect(result.rows[0].status).toBe('modified');
      expect(result.rows[0].changes).toEqual([
        'ingredient: 101 → 102',
        'quantity: 2 → 5',
        'notes: "old note" → "new note"',
        'rank: 1 → 2'
      ]);
    });

    test('should detect added rows', () => {
      const existing: BomRow[] = [
        {
          id: '1',
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 101,
          quantity: 2,
          notes: 'test note',
          rank: 1
        }
      ];

      const desired: BomRow[] = [
        {
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 101,
          quantity: 2,
          notes: 'test note',
          rank: 1
        },
        {
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 102,
          quantity: 3,
          notes: 'new ingredient',
          rank: 2
        }
      ];

      const result = compareBomRows(existing, desired, mockIngredientBySku);

      expect(result.stats).toEqual({
        unchanged: 1,
        modified: 0,
        added: 1,
        removed: 0
      });

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].status).toBe('unchanged');
      expect(result.rows[1].status).toBe('added');
      expect(result.rows[1].desired).toEqual(desired[1]);
      expect(result.rows[1].existing).toBeUndefined();
    });

    test('should detect removed rows', () => {
      const existing: BomRow[] = [
        {
          id: '1',
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 101,
          quantity: 2,
          notes: 'test note',
          rank: 1
        },
        {
          id: '2',
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 102,
          quantity: 3,
          notes: 'to be removed',
          rank: 2
        }
      ];

      const desired: BomRow[] = [
        {
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 101,
          quantity: 2,
          notes: 'test note',
          rank: 1
        }
      ];

      const result = compareBomRows(existing, desired, mockIngredientBySku);

      expect(result.stats).toEqual({
        unchanged: 1,
        modified: 0,
        added: 0,
        removed: 1
      });

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].status).toBe('unchanged');
      expect(result.rows[1].status).toBe('removed');
      expect(result.rows[1].existing).toEqual(existing[1]);
      expect(result.rows[1].desired).toBeUndefined();
    });

    test('should handle empty existing array', () => {
      const existing: BomRow[] = [];
      const desired: BomRow[] = [
        {
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 101,
          quantity: 2,
          notes: 'new ingredient',
          rank: 1
        }
      ];

      const result = compareBomRows(existing, desired, mockIngredientBySku);

      expect(result.stats).toEqual({
        unchanged: 0,
        modified: 0,
        added: 1,
        removed: 0
      });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('added');
    });

    test('should handle empty desired array', () => {
      const existing: BomRow[] = [
        {
          id: '1',
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 101,
          quantity: 2,
          notes: 'to be removed',
          rank: 1
        }
      ];
      const desired: BomRow[] = [];

      const result = compareBomRows(existing, desired, mockIngredientBySku);

      expect(result.stats).toEqual({
        unchanged: 0,
        modified: 0,
        added: 0,
        removed: 1
      });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].status).toBe('removed');
    });

    test('should handle both arrays empty', () => {
      const existing: BomRow[] = [];
      const desired: BomRow[] = [];

      const result = compareBomRows(existing, desired, mockIngredientBySku);

      expect(result.stats).toEqual({
        unchanged: 0,
        modified: 0,
        added: 0,
        removed: 0
      });

      expect(result.rows).toHaveLength(0);
    });

    test('should handle missing notes gracefully', () => {
      const existing: BomRow[] = [
        {
          id: '1',
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 101,
          quantity: 2,
          rank: 1
          // notes: undefined
        }
      ];

      const desired: BomRow[] = [
        {
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 101,
          quantity: 2,
          rank: 1,
          notes: 'new note'
        }
      ];

      const result = compareBomRows(existing, desired, mockIngredientBySku);

      expect(result.stats).toEqual({
        unchanged: 0,
        modified: 1,
        added: 0,
        removed: 0
      });

      expect(result.rows[0].changes).toEqual(['notes: "" → "new note"']);
    });

    test('should handle ingredient variant ID as string (from existing data)', () => {
      const existing: BomRow[] = [
        {
          id: '1',
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: '101' as any, // String from sheet data
          quantity: 2,
          rank: 1
        }
      ];

      const desired: BomRow[] = [
        {
          product_item_id: 1,
          product_variant_id: 10,
          ingredient_variant_id: 102, // Number from spec
          quantity: 2,
          rank: 1
        }
      ];

      const result = compareBomRows(existing, desired, mockIngredientBySku);

      expect(result.stats).toEqual({
        unchanged: 0,
        modified: 1,
        added: 0,
        removed: 0
      });

      expect(result.rows[0].changes).toEqual(['ingredient: 101 → 102']);
    });
  });

  describe('generateDiffSummary', () => {
    test('should generate summary for no changes', () => {
      const diff: BomDiffSummary = {
        rows: [{ position: 0, status: 'unchanged', existing: {} as BomRow, desired: {} as BomRow }],
        stats: { unchanged: 1, modified: 0, added: 0, removed: 0 }
      };

      const summary = generateDiffSummary(diff);
      expect(summary).toBe('✅ No changes (1 rows identical)');
    });

    test('should generate summary for mixed changes', () => {
      const diff: BomDiffSummary = {
        rows: [
          { position: 0, status: 'unchanged', existing: {} as BomRow, desired: {} as BomRow },
          { position: 1, status: 'unchanged', existing: {} as BomRow, desired: {} as BomRow },
          { position: 2, status: 'modified', existing: {} as BomRow, desired: {} as BomRow },
          { position: 3, status: 'added', desired: {} as BomRow },
          { position: 4, status: 'removed', existing: {} as BomRow }
        ],
        stats: { unchanged: 2, modified: 1, added: 1, removed: 1 }
      };

      const summary = generateDiffSummary(diff);
      expect(summary).toBe('🔄 Changes detected: 1 modified, 1 added, 1 removed, 2 unchanged');
    });

    test('should generate summary for only additions', () => {
      const diff: BomDiffSummary = {
        rows: [
          { position: 0, status: 'added', desired: {} as BomRow },
          { position: 1, status: 'added', desired: {} as BomRow }
        ],
        stats: { unchanged: 0, modified: 0, added: 2, removed: 0 }
      };

      const summary = generateDiffSummary(diff);
      expect(summary).toBe('🔄 Changes detected: 2 added');
    });

    test('should generate summary for only modifications', () => {
      const diff: BomDiffSummary = {
        rows: [],
        stats: { unchanged: 1, modified: 2, added: 0, removed: 0 }
      };

      const summary = generateDiffSummary(diff);
      expect(summary).toBe('🔄 Changes detected: 2 modified, 1 unchanged');
    });
  });

  describe('printBomDiff', () => {
    const mockIngredientBySku = {
      'ING-001': { id: '101' },
      'ING-002': { id: '102' }
    };

    test('should print no changes message when everything is identical', () => {
      const diff: BomDiffSummary = {
        rows: [{ position: 0, status: 'unchanged', existing: {} as BomRow, desired: {} as BomRow }],
        stats: { unchanged: 1, modified: 0, added: 0, removed: 0 }
      };

      printBomDiff(diff, 'TEST-SKU', mockIngredientBySku);

      expect(consoleSpy).toHaveBeenCalledWith('\n📊 BOM Diff for TEST-SKU:');
      expect(consoleSpy).toHaveBeenCalledWith('   1 unchanged, 0 modified, 0 added, 0 removed');
      expect(consoleSpy).toHaveBeenCalledWith('✅ No changes detected - BOM is already in sync');
    });

    test('should print table when changes are detected', () => {
      const existingRow: BomRow = {
        id: '1',
        product_item_id: 1,
        product_variant_id: 10,
        ingredient_variant_id: 101,
        quantity: 2,
        notes: 'old note',
        rank: 1
      };

      const desiredRow: BomRow = {
        product_item_id: 1,
        product_variant_id: 10,
        ingredient_variant_id: 101,
        quantity: 5,
        notes: 'new note',
        rank: 1
      };

      const diff: BomDiffSummary = {
        rows: [
          {
            position: 0,
            status: 'modified',
            existing: existingRow,
            desired: desiredRow,
            changes: ['quantity: 2 → 5', 'notes: "old note" → "new note"']
          }
        ],
        stats: { unchanged: 0, modified: 1, added: 0, removed: 0 }
      };

      printBomDiff(diff, 'TEST-SKU', mockIngredientBySku);

      expect(consoleSpy).toHaveBeenCalledWith('\n📊 BOM Diff for TEST-SKU:');
      expect(consoleSpy).toHaveBeenCalledWith('   0 unchanged, 1 modified, 0 added, 0 removed');

      // Check that table header was printed
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('│ Pos │ Status   │ Existing'));

      // Check that data row was printed with correct formatting
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('↻'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('SKU ING-001 qty:2'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('SKU ING-001 qty:5'));
    });

    test('should format ingredient display with SKU when available', () => {
      const diff: BomDiffSummary = {
        rows: [
          {
            position: 0,
            status: 'added',
            desired: {
              product_item_id: 1,
              product_variant_id: 10,
              ingredient_variant_id: 101,
              quantity: 3,
              rank: 1
            }
          }
        ],
        stats: { unchanged: 0, modified: 0, added: 1, removed: 0 }
      };

      printBomDiff(diff, 'TEST-SKU', mockIngredientBySku);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('SKU ING-001 qty:3'));
    });

    test('should format ingredient display with ID when SKU not available', () => {
      const diff: BomDiffSummary = {
        rows: [
          {
            position: 0,
            status: 'added',
            desired: {
              product_item_id: 1,
              product_variant_id: 10,
              ingredient_variant_id: 999, // Not in mockIngredientBySku
              quantity: 3,
              rank: 1
            }
          }
        ],
        stats: { unchanged: 0, modified: 0, added: 1, removed: 0 }
      };

      printBomDiff(diff, 'TEST-SKU', mockIngredientBySku);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('ID:999 qty:3'));
    });

    test('should handle different status types correctly', () => {
      const diff: BomDiffSummary = {
        rows: [
          {
            position: 0,
            status: 'unchanged',
            existing: {
              id: '1',
              product_item_id: 1,
              product_variant_id: 10,
              ingredient_variant_id: 101,
              quantity: 2,
              rank: 1
            },
            desired: {
              product_item_id: 1,
              product_variant_id: 10,
              ingredient_variant_id: 101,
              quantity: 2,
              rank: 1
            }
          },
          {
            position: 1,
            status: 'added',
            desired: {
              product_item_id: 1,
              product_variant_id: 10,
              ingredient_variant_id: 102,
              quantity: 3,
              rank: 2
            }
          },
          {
            position: 2,
            status: 'removed',
            existing: {
              id: '3',
              product_item_id: 1,
              product_variant_id: 10,
              ingredient_variant_id: 103,
              quantity: 1,
              rank: 3
            }
          }
        ],
        stats: { unchanged: 1, modified: 0, added: 1, removed: 1 }
      };

      printBomDiff(diff, 'TEST-SKU', mockIngredientBySku);

      // Check that different status symbols are used
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✓')); // unchanged
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('➕')); // added
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('➖')); // removed
    });
  });
});
