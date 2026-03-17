import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, exportCustomers, importCustomers } from '../controllers/customer.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getCustomers);
router.get('/export', authenticate, exportCustomers);
router.post('/import', authenticate, upload.single('file'), importCustomers);
router.post('/', authenticate, createCustomer);
router.put('/:customerId', authenticate, updateCustomer);
router.delete('/:customerId', authenticate, deleteCustomer);

export default router;
