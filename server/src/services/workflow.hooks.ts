/**
 * Workflow Module Hooks
 * Callbacks executed when workflows are approved/rejected for specific modules
 * Now delegates to approval.service.ts callback registry via dispatchApprovalCallback
 */

import { dispatchApprovalCallback } from './approval.service'

/**
 * Execute a hook for a module
 * Delegates to the approval service's central callback registry
 */
export async function executeModuleHook(
  module: string,
  hookType: 'onApproved' | 'onRejected',
  recordId: string
): Promise<void> {
  // Map workflow hook types to approval callback actions
  const actionMap: Record<string, 'onApprove' | 'onReverse'> = {
    'onApproved': 'onApprove',
    'onRejected': 'onReverse',
  }

  const action = actionMap[hookType]
  if (!action) return

  await dispatchApprovalCallback(module, action, recordId)
}

/**
 * Register a hook for a module (runtime registration)
 * Delegates to the approval service's registry
 */
export { registerApprovalHandler as registerModuleHook } from './approval.service'

/**
 * Check if a module has any hooks registered
 */
export function hasModuleHooks(module: string): boolean {
  // Since dispatchApprovalCallback silently no-ops for unregistered modules,
  // we can always return true — the dispatch will handle it
  return true
}
