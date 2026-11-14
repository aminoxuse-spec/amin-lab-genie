import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validation.ts';
import * as controller from '../controllers/experimentController.ts';

const router = Router();

const experimentRules = {
  stage: { type: 'enum' as const, required: true, enum: ['middle', 'secondary'] },
  level: { type: 'string' as const, required: true, minLength: 1, maxLength: 80 },
  subject: { type: 'string' as const, maxLength: 80 },
  title: { type: 'string' as const, required: true, minLength: 2, maxLength: 200 },
  objective: { type: 'string' as const, maxLength: 1000 },
  materials: { type: 'string' as const, maxLength: 1000 },
  duration_minutes: { type: 'int' as const, min: 0, max: 1000 },
  notes: { type: 'string' as const, maxLength: 1000 },
};

router.get('/', requireAuth, controller.list);
router.get('/:id', requireAuth, controller.getOne);
router.post('/', requireAuth, validateBody(experimentRules), controller.create);
router.put('/:id', requireAuth, validateBody(experimentRules), controller.update);
router.delete('/:id', requireAuth, controller.remove);

export default router;