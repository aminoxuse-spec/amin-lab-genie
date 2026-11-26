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
  formula: { type: 'string' as const, maxLength: 60 },
  name_ar: { type: 'string' as const, maxLength: 120, allowEmpty: true },
  danger_level: { type: 'enum' as const, enum: ['low', 'medium', 'high'] },
  supplier: { type: 'string' as const, maxLength: 120, allowEmpty: true },
  invoice_no: { type: 'string' as const, maxLength: 60, allowEmpty: true },
  owner_no: { type: 'string' as const, maxLength: 60, allowEmpty: true },
  purchase_date: { type: 'date' as const },
  cost: { type: 'number' as const, min: 0, max: 100_000_000 },
};

router.get('/', requireAuth, controller.list);
router.get('/summary', requireAuth, controller.summary);
router.get('/deleted', requireAuth, controller.trash);
router.get('/lookup', requireAuth, controller.lookup);
router.get('/movements', requireAuth, controller.movements);
router.post(
  '/movements',
  requireAuth,
  requireAdmin,
  validateBody({
    item_id: { type: 'int' as const, required: true, min: 1 },
    type: { type: 'enum' as const, required: true, enum: ['in', 'consume', 'damage', 'adjust'] },
    quantity: { type: 'int' as const, required: true, min: 0, max: 1_000_000 },
    reason: { type: 'string' as const, maxLength: 200, allowEmpty: true },
    movement_date: { type: 'date' as const },
  }),
  controller.createMovement,
);
router.get('/:id/aliases', requireAuth, controller.aliases);
router.put('/:id/aliases', requireAuth, requireAdmin, controller.replaceAliases);
router.get('/:id', requireAuth, controller.getOne);
router.post('/', requireAuth, requireAdmin, validateBody(inventoryRules), controller.create);
router.put('/:id', requireAuth, requireAdmin, validateBody(inventoryRules), controller.update);
router.post('/:id/restore', requireAuth, requireAdmin, controller.restore);
router.delete('/:id/permanent', requireAuth, requireAdmin, controller.purge);
router.delete('/:id', requireAuth, requireAdmin, controller.remove);

export default router;
