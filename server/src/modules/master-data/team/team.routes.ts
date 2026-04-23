import { Router } from 'express';
import multer from 'multer';
import { validateCreateTeam, validateUpdateTeam } from '../../../validators/master-data.validator';
import { authenticate } from '../../../middleware/auth.middleware';
import { getTeams, createTeam, updateTeam, deleteTeam, exportTeams, importTeams, toggleTeamStatus, approveTeam, withdrawTeam } from './team.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', authenticate, getTeams);
router.get('/export', authenticate, exportTeams);
router.post('/import', authenticate, upload.single('file'), importTeams);
router.post('/', authenticate, validateCreateTeam, createTeam);
router.put('/:id', authenticate, validateUpdateTeam, updateTeam);
router.put('/:id/toggle-status', authenticate, toggleTeamStatus);
router.put('/:id/approve', authenticate, approveTeam);
router.put('/:id/withdraw', authenticate, withdrawTeam);
router.delete('/:id', authenticate, deleteTeam);

export default router;
