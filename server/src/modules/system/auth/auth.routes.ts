import { Router } from 'express';
import { register, login, getMe, updateProfile, changePassword, logout } from './auth.controller';
import { authenticate } from '../../../middleware/auth.middleware';
import { validateRegister, validateLogin, validateChangePassword } from '../../../validators/auth.validator';

const router = Router();

router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.put('/profile', authenticate, updateProfile);
router.put('/password', authenticate, validateChangePassword, changePassword);

export default router;
