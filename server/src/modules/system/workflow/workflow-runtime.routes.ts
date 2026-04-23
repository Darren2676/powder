/**
 * Workflow Runtime Routes
 * Handles workflow execution endpoints
 */

import { Router } from 'express'
import { authenticate } from '../../../middleware/auth.middleware'
import * as controller from './workflow-runtime.controller'

const router = Router()

// All routes require authentication
router.use(authenticate)

// Check if module has active workflow
router.get('/check/:module', controller.checkModuleWorkflow)

// Start a workflow
router.post('/start', controller.startWorkflowForRecord)

// Process a task (approve/reject)
router.post('/tasks/:taskId/process', controller.processWorkflowTask)

// Withdraw a workflow instance
router.post('/instances/:instanceId/withdraw', controller.withdrawWorkflowInstance)

// Get my pending/completed tasks
router.get('/my-tasks', controller.getMyTasks)

// Get my initiated workflows
router.get('/my-initiated', controller.getMyInitiated)

// Get task detail
router.get('/tasks/:taskId', controller.getTaskDetail)

// Get workflow instance by module and record
router.get('/instances/:module/:recordId', controller.getInstanceByRecord)

// Get workflow statistics
router.get('/stats', controller.getWorkflowStats)

// Get business detail data for approval review
router.get('/business-detail/:module/:recordId', controller.getBusinessDetail)

export default router
