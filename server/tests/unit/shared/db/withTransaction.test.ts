import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module before importing withTransaction
vi.mock('@/config/database', () => {
  const transactionFn = vi.fn();
  return {
    default: {
      transaction: transactionFn,
    },
  };
});

// Must import after mock setup
import { withTransaction } from '@/shared/db/withTransaction';
import sequelize from '@/config/database';

describe('withTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call sequelize.transaction with the work callback', async () => {
    const mockResult = { id: 1, name: 'test' };
    const transactionFn = sequelize.transaction as ReturnType<typeof vi.fn>;
    transactionFn.mockImplementation(async (callback: any) => {
      const mockTx = { id: 'tx-1' };
      return await callback(mockTx);
    });

    const work = vi.fn().mockResolvedValue(mockResult);
    const result = await withTransaction(work);

    expect(transactionFn).toHaveBeenCalledTimes(1);
    expect(work).toHaveBeenCalledTimes(1);
    // Work callback receives the transaction from sequelize.transaction
    expect(work.mock.calls[0][0]).toEqual({ id: 'tx-1' });
    expect(result).toEqual(mockResult);
  });

  it('should auto-commit on success (Sequelize managed pattern)', async () => {
    const transactionFn = sequelize.transaction as ReturnType<typeof vi.fn>;
    transactionFn.mockImplementation(async (callback: any) => {
      return await callback({});
    });

    const result = await withTransaction(async (tx) => {
      return 'success';
    });

    expect(result).toBe('success');
    // In managed transaction, commit is automatic — we just verify
    // sequelize.transaction was called and the callback resolved.
    expect(transactionFn).toHaveBeenCalledTimes(1);
  });

  it('should auto-rollback on work throwing an error', async () => {
    const transactionFn = sequelize.transaction as ReturnType<typeof vi.fn>;
    transactionFn.mockImplementation(async (callback: any) => {
      // Sequelize managed transaction: if callback throws, transaction is rolled back
      // and the error is re-thrown
      try {
        return await callback({});
      } catch (err) {
        throw err;
      }
    });

    const work = vi.fn().mockRejectedValue(new Error('DB error'));

    await expect(withTransaction(work)).rejects.toThrow('DB error');
  });

  it('should call afterCommit after successful transaction', async () => {
    const transactionFn = sequelize.transaction as ReturnType<typeof vi.fn>;
    transactionFn.mockImplementation(async (callback: any) => {
      return await callback({});
    });

    const afterCommit = vi.fn().mockResolvedValue(undefined);
    await withTransaction(async (tx) => 'ok', { afterCommit });

    expect(afterCommit).toHaveBeenCalledTimes(1);
  });

  it('should NOT call afterCommit when transaction fails', async () => {
    const transactionFn = sequelize.transaction as ReturnType<typeof vi.fn>;
    transactionFn.mockImplementation(async (callback: any) => {
      throw await callback({}).catch((e: any) => e);
    });

    const afterCommit = vi.fn().mockResolvedValue(undefined);

    await expect(
      withTransaction(async () => { throw new Error('fail'); }, { afterCommit })
    ).rejects.toThrow('fail');

    expect(afterCommit).not.toHaveBeenCalled();
  });

  it('should log afterCommit error but not re-throw', async () => {
    const transactionFn = sequelize.transaction as ReturnType<typeof vi.fn>;
    transactionFn.mockImplementation(async (callback: any) => {
      return await callback({});
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const afterCommit = vi.fn().mockRejectedValue(new Error('callback failed'));

    // Should NOT throw — afterCommit errors are swallowed
    const result = await withTransaction(async (tx) => 'committed', { afterCommit });

    expect(result).toBe('committed');
    expect(afterCommit).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[withTransaction] afterCommit error:',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  it('should work without afterCommit option', async () => {
    const transactionFn = sequelize.transaction as ReturnType<typeof vi.fn>;
    transactionFn.mockImplementation(async (callback: any) => {
      return await callback({});
    });

    const result = await withTransaction(async (tx) => 42);
    expect(result).toBe(42);
  });

  it('should pass the transaction object to the work callback', async () => {
    const mockTx = { id: 'tx-123', commit: vi.fn(), rollback: vi.fn() };
    const transactionFn = sequelize.transaction as ReturnType<typeof vi.fn>;
    transactionFn.mockImplementation(async (callback: any) => {
      return await callback(mockTx);
    });

    const work = vi.fn().mockResolvedValue('done');
    await withTransaction(work);

    expect(work).toHaveBeenCalledWith(mockTx);
  });
});
