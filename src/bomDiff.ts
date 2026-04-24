/**
 * BOM Diff Utilities for comparing existing vs desired BOM rows
 *
 * Provides tools for comparing Bill of Materials (BOM) rows to identify changes
 * between existing and desired states. Supports detailed change tracking with
 * console-friendly formatting for reviewing sync operations before execution.
 *
 * Features:
 * - Row-by-row BOM comparison with change detection
 * - Statistical summary (unchanged, modified, added, removed)
 * - Console table formatting for visual review
 * - Compact diff summaries for logging
 * - Compatible with Google Apps Script environment
 *
 * @module lib/bomDiff
 */

/**
 * Represents a single BOM (Bill of Materials) row from Katana
 */
export interface BomRow {
  /** Katana BOM row ID (optional for new rows) */
  id?: string;
  /** Parent product item ID in Katana */
  product_item_id: number;
  /** Parent product variant ID in Katana */
  product_variant_id: number;
  /** Ingredient variant ID in Katana */
  ingredient_variant_id: number;
  /** Quantity of ingredient required */
  quantity: number;
  /** Optional notes about this BOM row */
  notes?: string;
  /** Display order rank (optional) */
  rank?: number;
}

/**
 * Represents a single row in a BOM diff comparison
 */
export interface BomDiffRow {
  /** Position in the BOM (0-indexed) */
  position: number;
  /** Change status of this row */
  status: 'unchanged' | 'modified' | 'added' | 'removed';
  /** Existing BOM row data (if present) */
  existing?: BomRow;
  /** Desired BOM row data (if present) */
  desired?: BomRow;
  /** List of specific field changes (only for 'modified' status) */
  changes?: string[];
}

/**
 * Summary of BOM differences with statistics
 */
export interface BomDiffSummary {
  /** Array of diff rows for each position */
  rows: BomDiffRow[];
  /** Statistical breakdown of changes */
  stats: {
    /** Number of rows with no changes */
    unchanged: number;
    /** Number of rows with field modifications */
    modified: number;
    /** Number of rows to be added */
    added: number;
    /** Number of rows to be removed */
    removed: number;
  };
}

/**
 * Compare existing BOM rows with desired BOM rows and generate a diff
 *
 * Performs position-by-position comparison of two BOM row arrays to identify
 * changes. Detects unchanged, modified, added, and removed rows with detailed
 * field-level change tracking for modified rows.
 *
 * @param existing - Current BOM rows from Katana
 * @param desired - Target BOM rows from sheet or configuration
 * @param _ingredientBySku - Lookup map for ingredient SKUs (reserved for future use)
 * @returns Diff summary with row-by-row comparison and statistics
 *
 * @example
 * const diff = compareBomRows(existingRows, desiredRows, {});
 * console.log(`Found ${diff.stats.modified} modified rows`);
 */
export function compareBomRows(
  existing: BomRow[],
  desired: BomRow[],
  _ingredientBySku: Record<string, any>
): BomDiffSummary {
  const maxLength = Math.max(existing.length, desired.length);
  const rows: BomDiffRow[] = [];
  const stats = { unchanged: 0, modified: 0, added: 0, removed: 0 };

  for (let i = 0; i < maxLength; i++) {
    const existingRow = existing[i];
    const desiredRow = desired[i];

    if (existingRow && desiredRow) {
      // Both exist - check for changes
      const changes = findRowChanges(existingRow, desiredRow);
      const status = changes.length > 0 ? 'modified' : 'unchanged';

      rows.push({
        position: i,
        status,
        existing: existingRow,
        desired: desiredRow,
        changes
      });

      stats[status]++;
    } else if (desiredRow && !existingRow) {
      // New row to be added
      rows.push({
        position: i,
        status: 'added',
        desired: desiredRow
      });
      stats.added++;
    } else if (existingRow && !desiredRow) {
      // Existing row to be removed
      rows.push({
        position: i,
        status: 'removed',
        existing: existingRow
      });
      stats.removed++;
    }
  }

  return { rows, stats };
}

/**
 * Find specific changes between two BOM rows
 *
 * Compares field values between existing and desired BOM rows to identify
 * specific modifications. Tracks changes to ingredient, quantity, notes, and rank.
 *
 * @param existing - Current BOM row
 * @param desired - Target BOM row
 * @returns Array of change descriptions in "field: oldValue → newValue" format
 */
function findRowChanges(existing: BomRow, desired: BomRow): string[] {
  const changes: string[] = [];

  if (parseInt(String(existing.ingredient_variant_id), 10) !== desired.ingredient_variant_id) {
    changes.push(`ingredient: ${existing.ingredient_variant_id} → ${desired.ingredient_variant_id}`);
  }

  if (existing.quantity !== desired.quantity) {
    changes.push(`quantity: ${existing.quantity} → ${desired.quantity}`);
  }

  const existingNotes = existing.notes || '';
  const desiredNotes = desired.notes || '';
  if (existingNotes !== desiredNotes) {
    changes.push(`notes: "${existingNotes}" → "${desiredNotes}"`);
  }

  // Only compare rank when both sides have defined values
  if (existing.rank !== undefined && desired.rank !== undefined && existing.rank !== desired.rank) {
    changes.push(`rank: ${existing.rank} → ${desired.rank}`);
  }

  return changes;
}

/**
 * Format SKU display with fallback to ID
 *
 * Attempts to display ingredient as "SKU {sku}" by looking up the variant ID
 * in the ingredient lookup map. Falls back to "ID:{variantId}" if not found.
 *
 * @param variantId - Katana ingredient variant ID
 * @param ingredientBySku - Lookup map of SKU to ingredient data
 * @returns Formatted display string (e.g., "SKU ABC123" or "ID:456")
 */
function formatIngredientDisplay(variantId: number, ingredientBySku: Record<string, any>): string {
  const skuEntry = Object.entries(ingredientBySku).find(([_, v]) => parseInt((v as any).id, 10) === variantId);
  return skuEntry ? `SKU ${skuEntry[0]}` : `ID:${variantId}`;
}

/**
 * Generate a console-friendly diff table
 *
 * Prints a formatted table to the console showing BOM differences for visual review.
 * Displays position, status, existing/desired values, and changes for each row.
 * Skips output if all rows are unchanged.
 *
 * @param diff - BOM diff summary to display
 * @param productSku - Product SKU being compared (for header)
 * @param ingredientBySku - Lookup map for ingredient display names
 *
 * @example
 * printBomDiff(diff, 'BIKE-001', ingredientMap);
 * // Outputs formatted table to console
 */
export function printBomDiff(diff: BomDiffSummary, productSku: string, ingredientBySku: Record<string, any>): void {
  console.log(`\n📊 BOM Diff for ${productSku}:`);
  console.log(
    `   ${diff.stats.unchanged} unchanged, ${diff.stats.modified} modified, ${diff.stats.added} added, ${diff.stats.removed} removed`
  );

  if (diff.stats.unchanged === diff.rows.length) {
    console.log(`✅ No changes detected - BOM is already in sync`);
    return;
  }

  console.log(
    `\n┌─────┬──────────┬─────────────────────────────┬─────────────────────────────┬──────────────────────────────────┐`
  );
  console.log(
    `│ Pos │ Status   │ Existing                    │ Desired                     │ Changes                          │`
  );
  console.log(
    `├─────┼──────────┼─────────────────────────────┼─────────────────────────────┼──────────────────────────────────┤`
  );

  diff.rows.forEach((row) => {
    const pos = row.position.toString().padStart(3);
    const status = formatStatus(row.status);
    const existing = formatRowSummary(row.existing, ingredientBySku);
    const desired = formatRowSummary(row.desired, ingredientBySku);
    const changes = row.changes ? row.changes.join(', ') : '';

    console.log(`│ ${pos} │ ${status} │ ${existing} │ ${desired} │ ${changes.substring(0, 32).padEnd(32)} │`);
  });

  console.log(
    `└─────┴──────────┴─────────────────────────────┴─────────────────────────────┴──────────────────────────────────┘\n`
  );
}

/**
 * Format status with emoji and color
 *
 * Converts status string to a fixed-width display format with emoji indicators
 * for console table alignment.
 *
 * @param status - Change status ('unchanged', 'modified', 'added', 'removed')
 * @returns Padded status string with emoji (e.g., "   ✓    " for unchanged)
 */
function formatStatus(status: string): string {
  const statusMap = {
    unchanged: '   ✓    ',
    modified: '   ↻    ',
    added: '   ➕    ',
    removed: '   ➖    '
  };
  return statusMap[status as keyof typeof statusMap] || status.padEnd(8);
}

/**
 * Format a BOM row for table display
 *
 * Creates a compact summary of a BOM row showing ingredient and quantity.
 * Returns empty padding for undefined rows (used in added/removed comparisons).
 *
 * @param row - BOM row to format (or undefined for missing rows)
 * @param ingredientBySku - Lookup map for ingredient display names
 * @returns Fixed-width formatted string (e.g., "SKU ABC123 qty:2        ")
 */
function formatRowSummary(row: BomRow | undefined, ingredientBySku: Record<string, any>): string {
  if (!row) {
    return ''.padEnd(27);
  }

  const ingredient = formatIngredientDisplay(row.ingredient_variant_id, ingredientBySku);
  const qty = `qty:${row.quantity}`;
  const summary = `${ingredient} ${qty}`;

  return summary.substring(0, 27).padEnd(27);
}

/**
 * Generate a compact one-line diff summary
 *
 * Creates a short summary string suitable for logging or user notifications.
 * Shows either "No changes" or a breakdown of change counts.
 *
 * @param diff - BOM diff summary to summarize
 * @returns One-line summary string (e.g., "🔄 Changes detected: 2 modified, 1 added")
 *
 * @example
 * const summary = generateDiffSummary(diff);
 * console.log(summary); // "✅ No changes (5 rows identical)"
 */
export function generateDiffSummary(diff: BomDiffSummary): string {
  if (diff.stats.unchanged === diff.rows.length) {
    return `✅ No changes (${diff.rows.length} rows identical)`;
  }

  const parts = [];
  if (diff.stats.modified > 0) parts.push(`${diff.stats.modified} modified`);
  if (diff.stats.added > 0) parts.push(`${diff.stats.added} added`);
  if (diff.stats.removed > 0) parts.push(`${diff.stats.removed} removed`);
  if (diff.stats.unchanged > 0) parts.push(`${diff.stats.unchanged} unchanged`);

  return `🔄 Changes detected: ${parts.join(', ')}`;
}
