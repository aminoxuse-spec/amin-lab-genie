import { DatabaseSync } from 'node:sqlite';
const DB_PATH = process.env.DB_PATH || 'C:/Program Files/Amin-Lab Genie/data/amin-lab-genie.sqlite';

// teacher full_name -> room_id (lab)
const teacherLab = {
  // مخابر العلوم الطبيعية (3,4)
  'عراب نزيهة': 3,
  'سلاف فاطمة': 3,
  'عنان ليلى': 4,
  'علي ثاني أسماء': 4,
  // مخابر العلوم الفيزيائية (1,2)
  'عمارة أسماء': 1,
  'مجاهدي فضيلة': 1,
  'منصوري فتيحة': 2,
  'إزيان سهام': 2,
};

const db = new DatabaseSync(DB_PATH);
db.exec('BEGIN');
for (const [name, rid] of Object.entries(teacherLab)) {
  db.prepare(
    'UPDATE schedules SET room_id = ? WHERE teacher_id IN (SELECT id FROM users WHERE full_name = ?)',
  ).run(rid, name);
}
db.exec('COMMIT');

const stats = db.prepare('SELECT COALESCE(r.name,\'(null)\') AS name, COUNT(*) c FROM schedules sc LEFT JOIN lab_rooms r ON r.id=sc.room_id GROUP BY sc.room_id').all();
console.log(DB_PATH);
console.log(stats.map(s => s.name + ': ' + s.c).join(' | '));
db.close();
