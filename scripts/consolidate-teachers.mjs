import { DatabaseSync } from 'node:sqlite';
const DB_PATH = process.env.DB_PATH || 'C:/Program Files/Amin-Lab Genie/data/amin-lab-genie.sqlite';
const db = new DatabaseSync(DB_PATH);

// Map: existing user id -> CSV spelling full_name
const rename = {
  4: 'عنان ليلى',
  5: 'علي ثاني أسماء',
  6: 'عمارة أسماء',
  9: 'إزيان سهام',
};

// Map: new duplicate user id -> existing user id
const merge = {
  10: 9,  // teacher02 إزيان سهام -> id9
  11: 6,  // teacher04 عمارة أسماء -> id6
  12: 4,  // teacher06 عنان ليلى -> id4
  13: 5,  // teacher07 علي ثاني أسماء -> id5
};

db.exec('BEGIN');
for (const [id, name] of Object.entries(rename)) {
  db.prepare('UPDATE users SET full_name = ? WHERE id = ?').run(name, Number(id));
}
for (const [dupId, keepId] of Object.entries(merge)) {
  db.prepare('UPDATE schedules SET teacher_id = ? WHERE teacher_id = ?').run(Number(keepId), Number(dupId));
  db.prepare('DELETE FROM users WHERE id = ?').run(Number(dupId));
}
db.exec('COMMIT');

console.log('users after:', db.prepare('SELECT id,username,full_name FROM users ORDER BY id').all().map(u=>u.id+':'+u.full_name).join(' | '));
console.log('schedules:', db.prepare('SELECT COUNT(*) c FROM schedules').get().c);
db.close();
