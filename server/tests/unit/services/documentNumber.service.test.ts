import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock sequelize — factory must be self-contained (hoisted before variable init)
vi.mock('@/config/database', () => ({
  default: { query: vi.fn() },
}));

import {
  generateProductionNumber,
  generateOrderNumber,
  generateWRNumber,
  generateTaskNumber,
  generateInboundOrderNumber,
  generateShippingOrderNumber,
  generateForecastNumber,
  generatePrepNumber,
  generateLinesideTxnNumber,
  generateOutsourcingReqNumber,
  generateOutsourcingOrderNumber,
} from '@/services/documentNumber.service';
import sequelize from '@/config/database';

// Reference the mock function after module import
const queryFn = sequelize.query as ReturnType<typeof vi.fn>;

describe('documentNumber.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date('2026-04-21'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateProductionNumber', () => {
    it('should generate first number when no existing records', async () => {
      queryFn.mockResolvedValue([[{ max_num: null }]]);
      const result = await generateProductionNumber();
      expect(result).toBe('M20260421001');
    });

    it('should increment sequence from existing max', async () => {
      queryFn.mockResolvedValue([[{ max_num: 'M20260421003' }]]);
      const result = await generateProductionNumber();
      expect(result).toBe('M20260421004');
    });

    it('should pass transaction option when provided', async () => {
      const mockTx = { id: 'tx-1' };
      queryFn.mockResolvedValue([[{ max_num: null }]]);
      await generateProductionNumber(mockTx);
      // Verify the query was called with transaction in options
      expect(queryFn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ transaction: mockTx })
      );
    });
  });

  describe('generateOrderNumber', () => {
    it('should generate first number when no existing records', async () => {
      queryFn.mockResolvedValue([[{ max_num: null }]]);
      const result = await generateOrderNumber();
      expect(result).toBe('P20260421001');
    });

    it('should increment sequence from existing max', async () => {
      queryFn.mockResolvedValue([[{ max_num: 'P20260421012' }]]);
      const result = await generateOrderNumber();
      expect(result).toBe('P20260421013');
    });
  });

  describe('generateWRNumber', () => {
    it('should generate first number when no existing records', async () => {
      queryFn.mockResolvedValue([[{ max_num: null }]]);
      const result = await generateWRNumber();
      expect(result).toBe('WR-20260421-001');
    });

    it('should increment sequence from existing max', async () => {
      queryFn.mockResolvedValue([[{ max_num: 'WR-20260421-005' }]]);
      const result = await generateWRNumber();
      expect(result).toBe('WR-20260421-006');
    });
  });

  describe('generateTaskNumber', () => {
    it('should generate first number when no existing records', async () => {
      queryFn.mockResolvedValue([[{ max_num: null }]]);
      const result = await generateTaskNumber();
      expect(result).toBe('PT-20260421-001');
    });

    it('should increment sequence from existing max', async () => {
      queryFn.mockResolvedValue([[{ max_num: 'PT-20260421-008' }]]);
      const result = await generateTaskNumber();
      expect(result).toBe('PT-20260421-009');
    });
  });

  describe('generateInboundOrderNumber', () => {
    it('should generate first number when no existing records', async () => {
      queryFn.mockResolvedValue([[{ max_num: null }]]);
      const result = await generateInboundOrderNumber();
      expect(result).toBe('PI-20260421-001');
    });

    it('should increment sequence', async () => {
      queryFn.mockResolvedValue([[{ max_num: 'PI-20260421-002' }]]);
      const result = await generateInboundOrderNumber();
      expect(result).toBe('PI-20260421-003');
    });
  });

  describe('generateShippingOrderNumber', () => {
    it('should generate first number when no existing records', async () => {
      queryFn.mockResolvedValue([[{ max_num: null }]]);
      const result = await generateShippingOrderNumber();
      expect(result).toBe('SM-20260421-001');
    });
  });

  describe('generateForecastNumber', () => {
    it('should generate first number when no existing records', async () => {
      queryFn.mockResolvedValue([[{ max_num: null }]]);
      const result = await generateForecastNumber();
      expect(result).toBe('SF-20260421-001');
    });
  });

  describe('generatePrepNumber', () => {
    it('should generate first number when no existing records', async () => {
      queryFn.mockResolvedValue([[{ max_num: null }]]);
      const result = await generatePrepNumber();
      expect(result).toBe('MP-20260421-001');
    });
  });

  describe('generateLinesideTxnNumber', () => {
    it('should generate first number when no existing records', async () => {
      queryFn.mockResolvedValue([[{ max_num: null }]]);
      const result = await generateLinesideTxnNumber();
      expect(result).toBe('LS-20260421-001');
    });
  });

  describe('generateOutsourcingReqNumber', () => {
    it('should generate first number when no existing records', async () => {
      queryFn.mockResolvedValue([[]]);
      const result = await generateOutsourcingReqNumber();
      expect(result).toBe('OSR-20260421-001');
    });

    it('should increment from existing', async () => {
      queryFn.mockResolvedValue([[{ outsourcing_req_number: 'OSR-20260421-003' }]]);
      const result = await generateOutsourcingReqNumber();
      expect(result).toBe('OSR-20260421-004');
    });
  });

  describe('generateOutsourcingOrderNumber', () => {
    it('should generate first number when no existing records', async () => {
      queryFn.mockResolvedValue([[]]);
      const result = await generateOutsourcingOrderNumber();
      expect(result).toBe('OS-20260421-001');
    });

    it('should increment from existing', async () => {
      queryFn.mockResolvedValue([[{ outsourcing_order_number: 'OS-20260421-007' }]]);
      const result = await generateOutsourcingOrderNumber();
      expect(result).toBe('OS-20260421-008');
    });
  });
});
