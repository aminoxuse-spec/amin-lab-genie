import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validation.ts';
import * as controller from '../controllers/scheduleController.ts';

const router = Router();

router.get('/', requireAuth, controller.list);
router.post(
  '/',
  requireAuth,
  validateBody({
    teacher_id: { type: 'int', min: 1 },
    room_id: { type: 'int', min: 1 },
    class_name: { type: 'string', required: true, minLength: 2, maxLength: 80 },
    subject: { type: 'string', required: true, minLength: 2, maxLength: 80 },
    day_of_week: { type: 'int', required: true, min: 0, max: 6 },
    start_time: { type: 'time', required: true },
    end_time: { type: 'time', required: true },
  }),
  controller.create,
);
router.put(
  '/:id',
  requireAuth,
  validateBody({
    teacher_id: { type: 'int', min: 1 },
    room_id: { type: 'int', min: 1 },
    class_name: { type: 'string', required: true, minLength: 2, maxLength: 80 },
    subject: { type: 'string', required: true, minLength: 2, maxLength: 80 },
    day_of_week: { type: 'int', required: true, min: 0, max: 6 },
    start_time: { type: 'time', required: true },
    end_time: { type: 'time', required: true },
  }),
  controller.update,
);
router.delete('/:id', requireAuth, controller.remove);
router.post('/clear', requireAuth, requireAdmin, controller.clearAll);

export const roomsRouter = Router();
roomsRouter.get('/', requireAuth, controller.rooms);
roomsRouter.post(
  '/',
  requireAuth,
  requireAdmin,
  validateBody({
    name: { type: 'string', required: true, minLength: 2, maxLength: 80 },
    capacity: { type: 'int', min: 1, max: 500 },
    location: { type: 'string', maxLength: 80 },
  }),
  controller.addRoom,
);
roomsRouter.put(
  '/:id',
  requireAuth,
  requireAdmin,
  validateBody({
    name: { type: 'string', required: true, minLength: 2, maxLength: 80 },
    capacity: { type: 'int', min: 1, max: 500 },
    location: { type: 'string', maxLength: 80 },
  }),
  controller.editRoom,
);
roomsRouter.delete('/:id', requireAuth, requireAdmin, controller.removeRoom);

export default router;
