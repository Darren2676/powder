/**
 * Reusable Sequelize mock factory for unit tests.
 *
 * Usage:
 *   import { createMockSequelize } from '../helpers/mockSequelize';
 *   const { sequelize, queryFn } = createMockSequelize();
 *
 * By default, `sequelize.query()` resolves to `[[]]` (empty rows).
 * Override per-test via `queryFn.mockResolvedValue([[...rows...]])`.
 */
import { vi } from 'vitest';

export interface MockSequelize {
  /** The mock sequelize instance (has .query and .transaction) */
  sequelize: {
    query: ReturnType<typeof vi.fn>;
    transaction: ReturnType<typeof vi.fn>;
  };
  /** Shortcut to the query mock for setting return values */
  queryFn: ReturnType<typeof vi.fn>;
  /** Shortcut to the transaction mock */
  transactionFn: ReturnType<typeof vi.fn>;
}

export function createMockSequelize(
  queryResult: any[][] = [[]]
): MockSequelize {
  const queryFn = vi.fn().mockResolvedValue(queryResult);

  // Managed transaction: sequelize.transaction(async (tx) => { ... })
  // Calls the callback with a mock transaction object, then resolves
  const transactionFn = vi.fn(async (callback: (tx: any) => Promise<any>) => {
    const mockTx = {};
    return await callback(mockTx);
  });

  const sequelize = {
    query: queryFn,
    transaction: transactionFn,
  };

  return { sequelize, queryFn, transactionFn };
}
