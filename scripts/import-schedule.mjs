import { DatabaseSync } from 'node:sqlite';
import { scryptSync, randomBytes } from 'node:crypto';
import fs from 'node:fs';

const DB_PATH = process.env.DB_PATH || 'C:/Program Files/Amin-Lab Genie/data/amin-lab-genie.sqlite';
const CSV_PATH = '.cloud-attachments/9914bf98d9ef38c25c576faa4c58f97cef1e28af0723dc386e5d35a49aada382.txt';

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function teacherSubject(name) {
  if (name.includes('الطبيعية')) return 'علوم الطبيعة والحياة';
  if (name.includes('الفزيائية') || name.includes('الفيزيائية')) return 'علوم فيزيائية وتكنولوجيا';
  return 'علوم فيزيائية وتكنولوجيا';
}

const db = new DatabaseSync(DB_PATH);

// Parse markdown table
const lines = fs.readFileSync(CSV_PATH, 'utf8').split(/\r?\n/);
const rows = [];
for (const line of lines) {
  if (!line.trim().startsWith('|')) continue;
  const cells = line.split('|').map((c) => c.trim());
  // cells[0] empty, cells[1..7] data, cells[8] empty
  if (cells.length < 8) continue;
  const date = cells[1];
  const slot = cells[2];
  const teacher = cells[3];
  const className = cells[4];
  const lab = cells[5];
  const subject = cells[6];
  const notes = cells[7];
  if (!date || date === 'التاريخ') continue;
  if (/^-+$/.test(date.replace(/\s/g, ''))) continue;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
  rows.push({ date, slot, teacher, className, lab, subject, notes });
}

console.log('parsed rows:', rows.length);

// Unique teachers
const teacherNames = [...new Set(rows.map((r) => r.teacher).filter(Boolean))];
console.log('teachers:', teacherNames.length, teacherNames.join(', '));

// Create teachers if missing
const teacherIdByName = new Map();
const creds = [];
for (let i = 0; i < teacherNames.length; i++) {
  const name = teacherNames[i];
  const existing = db.prepare('SELECT id FROM users WHERE full_name = ?').get(name);
  if (existing) {
    teacherIdByName.set(name, existing.id);
    continue;
  }
  const username = `teacher${String(i + 1).padStart(2, '0')}`;
  const password = `AminLab${randomBytes(4).toString('hex')}`;
  const hash = hashPassword(password);
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO users (username, full_name, role, phone, password_hash) VALUES (?, ?, ?, ?, ?)',
  ).run(username, name, 'teacher', null, hash);
  teacherIdByName.set(name, lastInsertRowid);
  creds.push(`${username}\t${password}\t${name}`);
}

// Write credentials
if (creds.length) {
  fs.writeFileSync('C:/Program Files/Amin-Lab Genie/data/imported-teachers.txt', creds.join('\n') + '\n', { mode: 0o600 });
}

// Clear existing schedules
db.exec('DELETE FROM schedules');

// Insert lessons
const insert = db.prepare(
  'INSERT INTO schedules (teacher_id, room_id, class_name, subject, day_of_week, start_time, end_time, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
);
let ok = 0, fail = 0;
const errors = [];
db.exec('BEGIN');
for (const r of rows) {
  const teacherId = teacherIdByName.get(r.teacher);
  if (!teacherId) { fail++; errors.push('no teacher: ' + r.teacher); continue; }
  const slotMatch = String(r.slot).match(/^(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})$/);
  if (!slotMatch) { fail++; errors.push('bad slot: ' + r.slot); continue; }
  const start = slotMatch[1].padStart(5, '0');
  const end = slotMatch[2].padStart(5, '0');
  const d = new Date(r.date + 'T00:00:00');
  if (Number.isNaN(d.getTime())) { fail++; errors.push('bad date: ' + r.date); continue; }
  const day = d.getDay();
  const className = r.className || 'Importé';
  const subject = (r.subject && r.subject.trim()) || teacherSubject(r.teacher);
  try {
    insert.run(teacherId, null, className, subject, day, start, end, 'scheduled');
    ok++;
  } catch (e) {
    fail++;
    if (errors.length < 10) errors.push(e.message);
  }
}
db.exec('COMMIT');

console.log('inserted:', ok, 'failed:', fail);
if (errors.length) console.log('errors:', errors.slice(0, 10));
console.log('total schedules:', db.prepare('SELECT COUNT(*) c FROM schedules').get().c);
db.close();
