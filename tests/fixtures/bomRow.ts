/**
 * Mock factory functions for Katana BomRow types
 *
 * Provides type-safe factory functions for creating test mocks of Katana API BOM rows.
 * All factories return fully-typed objects with sensible defaults for required fields.
 */

import type { components } from '../../src/katana.generated.js';

export type KatanaBomRow = components['schemas']['BomRow'];
export type CreateBomRowRequest = components['schemas']['CreateBomRowRequest'];

/**
 * Options for customizing mock BOM row creation
 */
export interface MockBomRowOptions {
  id?: string;
  productVariantId?: number;
  productItemId?: number;
  ingredientVariantId?: number;
  quantity?: number | null;
  notes?: string | null;
  rank?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Creates a mock BomRow
 *
 * @param options - Optional overrides for BOM row fields
 * @returns Fully-typed KatanaBomRow object
 *
 * @example
 * ```typescript
 * const bomRow = createMockBomRow({
 *   productVariantId: 5000,
 *   ingredientVariantId: 100,
 *   quantity: 2
 * });
 * ```
 */
export function createMockBomRow(options: MockBomRowOptions = {}): KatanaBomRow {
  const productVariantId = options.productVariantId ?? 5000;
  const productItemId = options.productItemId ?? 900;
  const ingredientVariantId = options.ingredientVariantId ?? 100;

  return {
    id: options.id ?? 'bom-row-uuid-1',
    product_variant_id: productVariantId,
    product_item_id: productItemId,
    ingredient_variant_id: ingredientVariantId,
    quantity: options.quantity ?? 1,
    notes: options.notes ?? null,
    created_at: options.createdAt ?? '2025-01-01T00:00:00Z',
    updated_at: options.updatedAt ?? '2025-01-01T00:00:00Z'
  };
}

/**
 * Options for customizing mock BOM row creation request
 */
export interface MockCreateBomRowRequestOptions {
  productItemId?: number;
  productVariantId?: number;
  ingredientVariantId?: number;
  quantity?: number | null;
  notes?: string | null;
}

/**
 * Creates a mock CreateBomRowRequest payload
 *
 * Used for testing BOM row creation API calls.
 *
 * @param options - Optional overrides for request fields
 * @returns Fully-typed CreateBomRowRequest object
 *
 * @example
 * ```typescript
 * const request = createMockBomRowRequest({
 *   productVariantId: 5000,
 *   ingredientVariantId: 100,
 *   quantity: 2
 * });
 * ```
 */
export function createMockBomRowRequest(options: MockCreateBomRowRequestOptions = {}): CreateBomRowRequest {
  return {
    product_item_id: options.productItemId ?? 900,
    product_variant_id: options.productVariantId ?? 5000,
    ingredient_variant_id: options.ingredientVariantId ?? 100,
    quantity: options.quantity ?? 1,
    notes: options.notes ?? null
  };
}

/**
 * Helper to create multiple mock BOM rows at once
 *
 * @param count - Number of BOM rows to create
 * @param optionsFn - Function that generates options for each row based on index
 * @returns Array of mock BOM rows
 *
 * @example
 * ```typescript
 * const bomRows = createMockBomRows(3, (i) => ({
 *   id: `bom-row-${i + 1}`,
 *   ingredientVariantId: 100 + i,
 *   quantity: i + 1
 * }));
 * ```
 */
export function createMockBomRows(count: number, optionsFn?: (index: number) => MockBomRowOptions): KatanaBomRow[] {
  return Array.from({ length: count }, (_, i) => {
    const options = optionsFn
      ? optionsFn(i)
      : {
          id: `bom-row-${i + 1}`,
          ingredientVariantId: 100 + i
        };
    return createMockBomRow(options);
  });
}
