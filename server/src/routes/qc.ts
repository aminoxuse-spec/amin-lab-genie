import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validation.ts';
import * as controller from '../controllers/qcController.ts';

const router = Router();

router.get('/', requireAuth, controller.list);
router.get('/analysis', requireAuth, controller.analysis);
router.post(
  '/',
  requireAuth,
  validateBody({
    inventory_id: { type: 'int', required: true, min: 1 },
    check_date: { type: 'date' },
    status: { type: 'enum', required: true, enum: ['ok', 'low', 'expired', 'damaged'] },
    quantity_found: { type: 'int', required: true, min: 0, max: 1_000_000 },
    notes: { type: 'string', maxLength: 500 },
  }),
  controller.create,
);

router.put(
  '/:id',
  requireAuth,
  validateBody({
    status: { type: 'enum', required: true, enum: ['ok', 'low', 'expired', 'damaged'] },
    quantity_found: { type: 'int', required: true, min: 0, max: 1_000_000 },
    check_date: { type: 'date' },
    notes: { type: 'string', maxLength: 500 },
  }),
  controller.update,
);

export default router;
