import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.ts';
import * as controller from '../controllers/requestController.ts';

const router = Router();

router.get('/', requireAuth, controller.list);
router.get('/pending-count', requireAuth, controller.pending);
router.post('/', requireAuth, controller.create);
router.get('/:id', requireAuth, controller.getOne);
router.post('/:id/approve', requireAuth, requireAdmin, controller.approve);
router.post('/:id/reject', requireAuth, requireAdmin, controller.reject);
router.post('/:id/cancel', requireAuth, controller.cancel);

export default router;
