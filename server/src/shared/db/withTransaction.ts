/**
 * withTransaction — Unified transaction management utility
 *
 * Wraps Sequelize's managed transaction pattern and adds optional
 * post-commit hook support. Replaces the verbose manual
 * try/catch/commit/rollback pattern used across services.
 *
 * Usage:
 *   // Simple transaction:
 *   await withTransaction(async (tx) => { ... });
 *
 *   // With post-commit side-effect (e.g., approval callback dispatch):
 *   await withTransaction(async (tx) => { ... }, {
 *     afterCommit: async () => { await dispatchCallback(...) }
 *   });
 */
import sequelize from '@/config/database';
import { Transaction } from 'sequelize';

export interface WithTransactionOptions {
  /** Callback executed after the transaction commits successfully. */
  afterCommit?: () => Promise<void>;
}

/**
 * Execute `work` inside a managed Sequelize transaction.
 * - Auto-commits when `work` resolves.
 * - Auto-rollbacks when `work` throws.
 * - If `afterCommit` is provided, it runs AFTER the transaction commits.
 *   afterCommit errors are logged but NOT re-thrown (data is already committed).
 */
export async function withTransaction<T>(
  work: (transaction: Transaction) => Promise<T>,
  options?: WithTransactionOptions
): Promise<T> {
  const result = await sequelize.transaction(async (transaction) => {
    return await work(transaction);
  });

  if (options?.afterCommit) {
    try {
      await options.afterCommit();
    } catch (err) {
      // Transaction already committed — log but don't throw
      console.error('[withTransaction] afterCommit error:', err);
    }
  }

  return result;
}
