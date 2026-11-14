import { randomBytes } from 'node:crypto';
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './config.ts';
import { countUsers, createUser, findByUsername } from './models/User.ts';
import { countRooms, listRooms, createRoom } from './models/LabRoom.ts';
import { createInventory, listInventory } from './models/Inventory.ts';
import { createSchedule, listSchedule } from './models/Schedule.ts';
import { hashPassword } from './utils/security.ts';
import { logger } from './utils/logger.ts';

/** كلمة مرور قوية عشوائية (24 حرفاً) تُولَّد عند أول تشغيل إن لم تُضبط بالبيئة. */
function strongPassword(): string {
  return randomBytes(18).toString('base64url');
}

/**
 * تعبئة أولية: تُنفَّذ مرة واحدة فقط على قاعدة بيانات فارغة.
 * كلمات المرور تُؤخذ من ADMIN_PASSWORD / TEACHER_PASSWORD، وإلا تُولَّد عشوائياً
 * وتُكتب في data/first-run-credentials.txt بصلاحيات 600 فقط (لا تُطبع في السجل).
 */
export function seed(): void {
  if (countUsers() === 0) {
    const generated: Array<[string, string]> = [];

    const adminFromEnv = (process.env.ADMIN_PASSWORD ?? '').trim();
    const adminPassword = adminFromEnv || strongPassword();
    if (!adminFromEnv) generated.push(['admin', adminPassword]);

    const teacherFromEnv = (process.env.TEACHER_PASSWORD ?? '').trim();
    const teacherPassword = teacherFromEnv || strongPassword();
    if (!teacherFromEnv) generated.push(['teacher', teacherPassword]);

    createUser({
      username: 'admin',
      full_name: 'حجاج اول محمد الامين',
      role: 'admin',
      password_hash: hashPassword(adminPassword),
    });
    createUser({
      username: 'teacher',
      full_name: 'الأستاذ أمين',
      role: 'teacher',
      password_hash: hashPassword(teacherPassword),
    });

    if (generated.length > 0) {
      const file = join(DATA_DIR, 'first-run-credentials.txt');
      const lines = [
        '# بيانات الدخول الأولى — انقلها إلى مدير كلمات المرور ثم احذف هذا الملف.',
        ...generated.map(([username, password]) => `${username}\t${password}`),
      ];
      writeFileSync(file, `${lines.join('\n')}\n`, { mode: 0o600 });
      try {
        chmodSync(file, 0o600);
      } catch {
        /* على Windows قد لا تُدعم الصلاحيات — الملف يبقى داخل data المحمي */
      }
      logger.warn('تم توليد كلمات مرور قوية للحسابات الأولى', { file });
    }
    logger.info('تم إنشاء الحسابات الأولية (admin / teacher)');
  }

  if (countRooms() === 0) {
    createRoom({ name: 'مختبر الفيزياء', capacity: 24, location: 'الطابق الأول' });
    createRoom({ name: 'مختبر الكيمياء', capacity: 24, location: 'الطابق الأول' });
    createRoom({ name: 'مختبر علوم الحياة', capacity: 30, location: 'الطابق الثاني' });
    logger.info('تم إنشاء قاعات المختبر');
  }

  if (listInventory().length === 0) {
    const items = [
      ['APP-001', 'مجهر ضوئي', 'apparatus', 12, 'قطعة', 'خزانة A', 2],
      ['APP-002', 'ميزان إلكتروني', 'apparatus', 6, 'قطعة', 'خزانة A', 1],
      ['APP-003', 'محرار زئبقي', 'apparatus', 20, 'قطعة', 'درج B2', 4],
      ['APP-004', 'مغناطيس كهربائي', 'apparatus', 8, 'قطعة', 'خزانة C', 2],
      ['GLS-001', 'أنبوب اختبار', 'glassware', 120, 'أنبوب', 'خزانة الزجاجيات', 20],
      ['GLS-002', 'كأس بيشر 250ml', 'glassware', 40, 'كأس', 'خزانة الزجاجيات', 8],
      ['GLS-003', 'دورق مخروطي 500ml', 'glassware', 25, 'دورق', 'خزانة الزجاجيات', 5],
      ['GLS-004', 'ماصة مدرجة', 'glassware', 30, 'ماصة', 'درج D1', 6],
      ['CHM-001', 'حمض الهيدروكلوريك', 'chemical', 10, 'قارورة', 'خزانة المواد', 2],
      ['CHM-002', 'هيدروكسيد الصوديوم', 'chemical', 8, 'قارورة', 'خزانة المواد', 2],
      ['CHM-003', 'كبريتات النحاس', 'chemical', 5, 'علبة', 'خزانة المواد', 1],
      ['CHM-004', 'ماء مقطر', 'chemical', 15, 'لتر', 'رف E', 3],
      ['CHM-005', 'كاشف الفينولفتالين', 'chemical', 4, 'قارورة', 'خزانة المواد', 1],
    ] as const;

    for (const [code, name, category, quantity, unit, location, min_quantity] of items) {
      createInventory({ code, name, category, quantity, unit, location, min_quantity });
    }
    logger.info('تم إنشاء جرد تجريبي', { items: items.length });
  }

  if (listSchedule().length === 0) {
    const rooms = listRooms();
    const room = rooms[0]?.id ?? null;
    const teacher = findByUsername('teacher') ?? findByUsername('admin');
    if (!teacher) return;
    createSchedule({
      teacher_id: teacher.id,
      room_id: room,
      class_name: 'الجذع المشترك العلمي 1',
      subject: 'الفيزياء والكيمياء',
      day_of_week: 1,
      start_time: '08:00',
      end_time: '10:00',
    });
    createSchedule({
      teacher_id: teacher.id,
      room_id: rooms[1]?.id ?? null,
      class_name: 'السنة الأولى باك علوم',
      subject: 'علوم الحياة والأرض',
      day_of_week: 3,
      start_time: '10:00',
      end_time: '12:00',
    });
    logger.info('تم إنشاء استعمال الزمن التجريبي');
  }
}
