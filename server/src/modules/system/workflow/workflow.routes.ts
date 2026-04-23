/**
 * Workflow Definition Management Routes
 */

import { Router } from 'express'
import { authenticate } from '../../../middleware/auth.middleware'
import { requireRole } from '../../../middleware/role.middleware'
import { validateCreateWorkflow, validateUpdateWorkflow } from '../../../validators/system.validator'
import * as controller from './workflow.controller'

const router = Router()

// All routes require authentication
router.use(authenticate)

const adminOnly = requireRole('admin')

// ==================== Definition Routes ====================

// Get available modules (admin only)
router.get('/modules', adminOnly, controller.getModules)

// List definitions with filtering
router.get('/', adminOnly, controller.getDefinitions)

// Get definition by ID with full details
router.get('/:id', adminOnly, controller.getDefinitionById)

// Create definition (admin only)
router.post('/', adminOnly, validateCreateWorkflow, controller.createDefinition)

// Update definition (admin only)
router.put('/:id', adminOnly, validateUpdateWorkflow, controller.updateDefinition)

// Delete definition (admin only)
router.delete('/:id', adminOnly, controller.deleteDefinition)

// Publish definition (admin only)
router.post('/:id/publish', adminOnly, controller.publishDefinition)

// Copy definition to create new version (admin only)
router.post('/:id/copy', adminOnly, controller.copyDefinition)

// ==================== Node Routes ====================

// Create node
router.post('/:definitionId/nodes', adminOnly, controller.createNode)

// Update node
router.put('/nodes/:nodeId', adminOnly, controller.updateNode)

// Delete node
router.delete('/nodes/:nodeId', adminOnly, controller.deleteNode)

// Set node handlers
router.put('/nodes/:nodeId/handlers', adminOnly, controller.setNodeHandlers)

// ==================== Edge Routes ====================

// Create edge
router.post('/:definitionId/edges', adminOnly, controller.createEdge)

// Update edge
router.put('/edges/:edgeId', adminOnly, controller.updateEdge)

// Delete edge
router.delete('/edges/:edgeId', adminOnly, controller.deleteEdge)

export default router
