import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.ts';
import { validateBody } from '../middleware/validation.ts';
import * as controller from '../controllers/authController.ts';

const router = Router();

router.post(
  '/login',
  validateBody({
    username: { type: 'string', required: true, minLength: 3, maxLength: 40 },
    password: { type: 'string', required: true, minLength: 6, maxLength: 120 },
  }),
  controller.login,
);

router.get('/me', requireAuth, controller.me);

router.get('/users', requireAuth, requireAdmin, controller.index);

router.put(
  '/password',
  requireAuth,
  validateBody({
    current_password: { type: 'string', required: true, minLength: 6, maxLength: 120 },
    new_password: { type: 'string', required: true, minLength: 6, maxLength: 120 },
  }),
  controller.changePassword,
);

router.put(
  '/users/:id',
  requireAuth,
  requireAdmin,
  validateBody({
    full_name: { type: 'string', required: true, minLength: 3, maxLength: 80 },
    role: { type: 'enum', required: true, enum: ['admin', 'teacher'] },
    password: { type: 'string', minLength: 6, maxLength: 120 },
  }),
  controller.update,
);

router.delete('/users/:id', requireAuth, requireAdmin, controller.remove);

router.post(
  '/users',
  requireAuth,
  requireAdmin,
  validateBody({
    username: { type: 'string', required: true, minLength: 3, maxLength: 40 },
    full_name: { type: 'string', required: true, minLength: 3, maxLength: 80 },
    role: { type: 'enum', required: true, enum: ['admin', 'teacher'] },
    password: { type: 'string', required: true, minLength: 6, maxLength: 120 },
  }),
  controller.create,
);

export default router;
