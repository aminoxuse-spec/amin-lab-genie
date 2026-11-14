import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validation.ts';
import * as controller from '../controllers/inventoryController.ts';

const router = Router();

const inventoryRules = {
  code: { type: 'string' as const, required: true, minLength: 2, maxLength: 40 },
  name: { type: 'string' as const, required: true, minLength: 2, maxLength: 120 },
  category: { type: 'enum' as const, required: true, enum: ['apparatus', 'glassware', 'chemical'] },
  quantity: { type: 'int' as const, required: true, min: 0, max: 1_000_000 },
  unit: { type: 'string' as const, maxLength: 20 },
  location: { type: 'string' as const, maxLength: 80 },
  min_quantity: { type: 'int' as const, min: 0, max: 1_000_000 },
  expiry_date: { type: 'date' as const },
};

router.get('/', requireAuth, controller.list);
router.get('/summary', requireAuth, controller.summary);
router.get('/deleted', requireAuth, controller.trash);
router.get('/lookup', requireAuth, controller.lookup);
router.get('/:id', requireAuth, controller.getOne);
router.post('/', requireAuth, requireAdmin, validateBody(inventoryRules), controller.create);
router.put('/:id', requireAuth, requireAdmin, validateBody(inventoryRules), controller.update);
router.post('/:id/restore', requireAuth, requireAdmin, controller.restore);
router.delete('/:id/permanent', requireAuth, requireAdmin, controller.purge);
router.delete('/:id', requireAuth, requireAdmin, controller.remove);

export default router;
