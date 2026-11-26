import { allRows, db, oneRow, run, transaction } from '../db.ts';
import {
  fallbackAliases,
  levelOf,
  loadAliases,
  normalize,
  resolveEquipment,
  type AliasEntry,
  type MatchedLine,
} from './itemMatcher.ts';

/* ------------------------------------------------------------------ */
/* استيراد التقرير الأسبوعي للإعارة من نص جدولي (CSV/TSV أو لصق مباشر) */
/* ------------------------------------------------------------------ */

export type PlannedSession = {
  teacherId: number;
  teacherName: string;
  roomId: number | null;
  date: string;
  start: string;
  end: string;
  className: string;
  level: string | null;
  subject: string;
  equipment: string;
  lines: MatchedLine[];
  unresolved: string[];
  duplicate: boolean;
};

export type ImportPlan = {
  sessions: PlannedSession[];
  skipped: { date: string; teacher: string; reason: string }[];
  unresolvedItems: string[];
};

export type ImportResult = ImportPlan & { inserted: number; lines: number; skippedCount: number };

const SUBJECT_BY_SPECIALTY: Record<string, string> = {
  physics: 'علوم فيزيائية',
  natural: 'علوم طبيعية',
};

/** قراءة جدول نصي مع دعم علامات التنصيص. */
export function parseTable(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').filter((line) => line.trim().length > 0);
  if (!lines.length) return [];
  const delimiters = ['\t', ';', ','];
  const delimiter = delimiters.reduce((best, candidate) =>
    lines[0].split(candidate).length > lines[0].split(best).length ? candidate : best,
  );

  const rows: string[][] = [];
  for (const line of lines) {
    const cells: string[] = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === delimiter && !quoted) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    rows.push(cells);
  }
  return rows;
}

const COLUMNS: Record<string, string[]> = {
  date: ['التاريخ', 'تاريخ', 'date'],
  start: ['البدايه', 'البداية', 'من', 'بدايه', 'بداية', 'start', 'debut'],
  end: ['النهايه', 'النهاية', 'الي', 'إلى', 'نهايه', 'نهاية', 'end', 'fin'],
  teacher: ['الاستاذ', 'الأستاذ', 'استاذ', 'أستاذ', 'teacher', 'prof'],
  equipment: ['الوسائل', 'الوسيله', 'الوسيلة', 'العناصر', 'الادوات', 'الأدوات', 'العتاد', 'equipment', 'items'],
  className: ['القسم', 'class', 'classe'],
  subject: ['الماده', 'المادة', 'subject', 'matiere'],
  room: ['القاعه', 'القاعة', 'room', 'salle'],
};

function detectColumns(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((cell, index) => {
    const key = normalize(cell).replace(/[^ا-يa-z]/g, '');
    for (const [field, synonyms] of Object.entries(COLUMNS)) {
      if (map[field] !== undefined) continue;
      if (synonyms.some((synonym) => normalize(synonym).replace(/[^ا-يa-z]/g, '') === key)) {
        map[field] = index;
        break;
      }
    }
  });
  return map;
}

function toIsoDate(value: string): string | null {
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  const local = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (local) return `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`;
  return null;
}

function toTime(value: string | undefined, fallback: string): string {
  const match = String(value ?? '').match(/^(\d{1,2})[:.h]?(\d{2})?/);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (hours > 23 || minutes > 59) return fallback;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function addHours(time: string, hours: number): string {
  const [h, m] = time.split(':').map(Number);
  return `${String((h + hours) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function dayOfWeek(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/** تخطيط الاستيراد: قراءة فقط، يصلح للمعاينة قبل التطبيق. */
export function planWeeklyImport(text: string, reportNo: string): ImportPlan {
  const table = parseTable(text);
  const skipped: ImportPlan['skipped'] = [];
  if (!table.length) return { sessions: [], skipped: [{ date: '', teacher: '', reason: 'لا يوجد نص' }], unresolvedItems: [] };

  const firstRow = table[0].map((cell) => normalize(cell));
  const looksLikeHeader = firstRow.some((cell) => ['التاريخ', 'تاريخ', 'date', 'الاستاذ', 'الوسائل'].includes(cell));
  const columns = looksLikeHeader
    ? detectColumns(table[0])
    : { date: 0, start: 1, end: 2, teacher: 3, equipment: 4 };
  const body = looksLikeHeader ? table.slice(1) : table;

  const teachers = allRows<{ id: number; full_name: string; specialty: string | null }>(
    "SELECT id, full_name, specialty FROM users WHERE role = 'teacher'",
  );
  const rooms = allRows<{ id: number; name: string }>('SELECT id, name FROM lab_rooms');
  const storedAliases = loadAliases(db);
  const aliases: AliasEntry[] = storedAliases.length ? storedAliases : fallbackAliases(db).aliases;

  const sessions: PlannedSession[] = [];
  const unresolvedItems: string[] = [];

  for (const cells of body) {
    const cell = (field: string) => (columns[field] !== undefined ? (cells[columns[field]] ?? '').trim() : '');
    const rawDate = cell('date');
    const date = toIsoDate(rawDate);
    const teacherLabel = cell('teacher');
    const equipment = cell('equipment');

    const teacher = teachers.find((row) => {
      const name = normalize(row.full_name);
      const wanted = normalize(teacherLabel);
      return wanted.length > 1 && (name === wanted || name.startsWith(`${wanted} `) || name.includes(` ${wanted} `));
    });
    if (!date || !teacher) {
      skipped.push({ date: rawDate, teacher: teacherLabel, reason: !date ? 'تاريخ غير صالح' : 'أستاذ غير معروف' });
      continue;
    }

    const start = toTime(cell('start'), '08:00');
    const end = toTime(cell('end'), addHours(start, 2));

    // القسم والمستوى من استعمال الزمن إن لم يُذكرا في التقرير.
    let className = cell('className');
    let level = levelOf(className);
    if (!className) {
      const slot = oneRow<{ class_name: string }>(
        `SELECT class_name FROM schedules
         WHERE teacher_id = ? AND day_of_week = ? AND start_time = ?
         ORDER BY class_name LIMIT 1`,
        teacher.id,
        dayOfWeek(date),
        start,
      );
      className = slot?.class_name ?? 'حصة';
      level = levelOf(slot?.class_name ?? null);
    }

    const specialty = teacher.specialty ?? (normalize(teacher.full_name).match(/ايزيان|منصوري|عماره|مجاهدي/) ? 'physics' : 'natural');
    const subject = cell('subject') || SUBJECT_BY_SPECIALTY[specialty] || 'علوم طبيعية';

    let roomId: number | null = null;
    const roomLabel = cell('room');
    if (roomLabel) {
      roomId = rooms.find((room) => normalize(room.name).includes(normalize(roomLabel)))?.id ?? null;
    }
    if (!roomId) {
      const wanted = specialty === 'physics' ? /الفيزيائي|الفزيائي/ : /الطبيعي/;
      roomId = rooms.find((room) => wanted.test(room.name))?.id ?? rooms[0]?.id ?? null;
    }

    const { lines, unresolved } = resolveEquipment(equipment, aliases, db);
    unresolvedItems.push(...unresolved);

    const duplicate = Boolean(
      oneRow<{ id: number }>(
        'SELECT id FROM borrowing_sessions WHERE teacher_id = ? AND session_date = ? AND start_time = ? LIMIT 1',
        teacher.id,
        date,
        start,
      ),
    );

    sessions.push({
      teacherId: teacher.id,
      teacherName: teacher.full_name,
      roomId,
      date,
      start,
      end,
      className,
      level,
      subject,
      equipment,
      lines,
      unresolved,
      duplicate,
    });
  }

  return { sessions, skipped, unresolvedItems: [...new Set(unresolvedItems)] };
}

/** تطبيق الاستيراد: يضيف الجلسات غير المكرّرة وسطور أصنافها. */
export function applyWeeklyImport(plan: ImportPlan, reportNo: string): ImportResult {
  let inserted = 0;
  let lines = 0;

  transaction(() => {
    for (const session of plan.sessions) {
      if (session.duplicate) continue;
      const exists = oneRow<{ id: number }>(
        'SELECT id FROM borrowing_sessions WHERE teacher_id = ? AND session_date = ? AND start_time = ? LIMIT 1',
        session.teacherId,
        session.date,
        session.start,
      );
      if (exists) continue;

      const notes = `${reportNo ? `[تقرير ${reportNo}] ` : ''}${session.equipment}`.slice(0, 900);
      const { lastInsertRowid } = run(
        `INSERT INTO borrowing_sessions
           (teacher_id, room_id, level, class_name, subject, session_date, start_time, end_time, status, notes, report_no)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'returned', ?, ?)`,
        session.teacherId,
        session.roomId,
        session.level,
        session.className,
        session.subject,
        session.date,
        session.start,
        session.end,
        notes,
        reportNo || null,
      );
      for (const line of session.lines) {
        run(
          `INSERT INTO borrowing_items
             (session_id, inventory_id, quantity_out, quantity_returned, condition_out, condition_in, damaged, notes)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
          lastInsertRowid,
          line.inventoryId,
          line.quantity,
          line.consumed ? 0 : line.quantity,
          line.consumed ? 'consumed' : 'good',
          line.consumed ? null : 'good',
          null,
        );
        lines += 1;
      }
      inserted += 1;
    }
  });

  return { ...plan, inserted, lines, skippedCount: plan.skipped.length };
}
