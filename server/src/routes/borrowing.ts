import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validation.ts';
import * as controller from '../controllers/borrowingController.ts';

const router = Router();

router.get('/', requireAuth, controller.list);

router.post(
  '/',
  requireAuth,
  validateBody({
    teacher_id: { type: 'int', min: 1 },
    room_id: { type: 'int', min: 1 },
    level: { type: 'string', maxLength: 60 },
    class_name: { type: 'string', required: true, minLength: 1, maxLength: 80 },
    subject: { type: 'string', required: true, minLength: 2, maxLength: 80 },
    session_date: { type: 'date', required: true },
    start_time: { type: 'time', required: true },
    end_time: { type: 'time' },
    due_date: { type: 'date' },
    notes: { type: 'string', maxLength: 500 },
    items: { type: 'array', required: true },
  }),
  controller.create,
);

router.put(
  '/:id',
  requireAuth,
  validateBody({
    teacher_id: { type: 'int', min: 1 },
    room_id: { type: 'int', min: 1 },
    level: { type: 'string', maxLength: 60 },
    class_name: { type: 'string', required: true, minLength: 1, maxLength: 80 },
    subject: { type: 'string', required: true, minLength: 2, maxLength: 80 },
    session_date: { type: 'date', required: true },
    start_time: { type: 'time', required: true },
    end_time: { type: 'time', required: true },
    due_date: { type: 'date' },
    notes: { type: 'string', maxLength: 500 },
  }),
  controller.update,
);

router.get('/:id/receipt', requireAuth, controller.receipt);
router.get('/:id', requireAuth, controller.getOne);
router.post('/:id/return', requireAuth, controller.returnItems);
router.delete('/:id', requireAuth, controller.remove);

export default router;
