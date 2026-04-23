import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerApprovalHandler,
  hasApprovalHandler,
  getRegisteredModules,
  dispatchApprovalCallback,
} from '@/services/approval.service';

describe('Approval Callback Registry', () => {
  beforeEach(() => {
    // Note: The registry is module-scoped (in-memory), so registered handlers
    // persist across tests. We test the behavior patterns, not isolation.
    // In a real app, modules register their handlers at import time.
  });

  describe('registerApprovalHandler', () => {
    it('should register a module with onApprove callback', () => {
      const onApprove = async (_recordId: string) => {};
      registerApprovalHandler('test_module_a', { onApprove });

      expect(hasApprovalHandler('test_module_a')).toBe(true);
    });

    it('should register a module with onReverse callback', () => {
      const onReverse = async (_recordId: string) => {};
      registerApprovalHandler('test_module_b', { onReverse });

      expect(hasApprovalHandler('test_module_b')).toBe(true);
    });

    it('should register a module with both callbacks', () => {
      const onApprove = async (_recordId: string) => {};
      const onReverse = async (_recordId: string) => {};
      registerApprovalHandler('test_module_c', { onApprove, onReverse });

      expect(hasApprovalHandler('test_module_c')).toBe(true);
      const modules = getRegisteredModules();
      expect(modules['test_module_c']).toContain('onApprove');
      expect(modules['test_module_c']).toContain('onReverse');
    });

    it('should merge handlers when registering twice for same module', () => {
      const onApprove = async (_recordId: string) => {};
      const onReverse = async (_recordId: string) => {};

      registerApprovalHandler('test_merge', { onApprove });
      registerApprovalHandler('test_merge', { onReverse });

      const modules = getRegisteredModules();
      expect(modules['test_merge']).toContain('onApprove');
      expect(modules['test_merge']).toContain('onReverse');
    });
  });

  describe('hasApprovalHandler', () => {
    it('should return false for unregistered module', () => {
      expect(hasApprovalHandler('nonexistent_module_xyz')).toBe(false);
    });

    it('should return true for registered module', () => {
      registerApprovalHandler('test_exists', { onApprove: async () => {} });
      expect(hasApprovalHandler('test_exists')).toBe(true);
    });
  });

  describe('getRegisteredModules', () => {
    it('should return all registered modules with handler keys', () => {
      registerApprovalHandler('test_list_a', { onApprove: async () => {} });
      registerApprovalHandler('test_list_b', { onReverse: async () => {} });

      const modules = getRegisteredModules();
      expect(modules['test_list_a']).toEqual(['onApprove']);
      expect(modules['test_list_b']).toEqual(['onReverse']);
    });
  });

  describe('dispatchApprovalCallback', () => {
    it('should call onApprove callback when action matches', async () => {
      const onApprove = async (recordId: string) => {
        // Side-effect simulation
      };
      const spy = { onApprove };
      const originalFn = spy.onApprove;

      registerApprovalHandler('test_dispatch', { onApprove: originalFn });

      // dispatchApprovalCallback should not throw for registered module
      await dispatchApprovalCallback('test_dispatch', 'onApprove', 'REC-001');
    });

    it('should not throw for unregistered module', async () => {
      // Unregistered module — should log but not throw
      await expect(
        dispatchApprovalCallback('unregistered_xyz', 'onApprove', 'REC-001')
      ).resolves.toBeUndefined();
    });

    it('should not throw when module has no handler for the action', async () => {
      registerApprovalHandler('test_no_reverse', { onApprove: async () => {} });

      // Module registered but no onReverse handler — should not throw
      await expect(
        dispatchApprovalCallback('test_no_reverse', 'onReverse', 'REC-001')
      ).resolves.toBeUndefined();
    });

    it('should execute the callback with the correct recordId', async () => {
      let capturedRecordId = '';
      const onApprove = async (recordId: string) => {
        capturedRecordId = recordId;
      };

      registerApprovalHandler('test_record_id', { onApprove });

      await dispatchApprovalCallback('test_record_id', 'onApprove', 'REC-999');

      expect(capturedRecordId).toBe('REC-999');
    });
  });
});
