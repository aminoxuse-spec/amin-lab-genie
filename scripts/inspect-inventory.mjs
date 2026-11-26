import Database from 'better-sqlite3';
const db = new Database('../data/amin-lab-genie.sqlite');

console.log('--- categories counts (non-deleted) ---');
console.log(JSON.stringify(db.prepare("SELECT category, COUNT(*) c FROM inventory WHERE deleted_at IS NULL GROUP BY category").all()));

console.log('--- chemicals (first 6) ---');
db.prepare("SELECT code, name, quantity, unit, COALESCE(formula,'') formula, COALESCE(danger_level,'') danger, location FROM inventory WHERE category='chemical' AND deleted_at IS NULL ORDER BY quantity DESC LIMIT 6").all().forEach(i=>console.log(JSON.stringify(i)));

console.log('--- apparatus (first 4) ---');
db.prepare("SELECT code, name, quantity, unit, location FROM inventory WHERE category='apparatus' AND deleted_at IS NULL ORDER BY quantity DESC LIMIT 4").all().forEach(i=>console.log(JSON.stringify(i)));

console.log('--- glassware (first 4) ---');
db.prepare("SELECT code, name, quantity, unit, location FROM inventory WHERE category='glassware' AND deleted_at IS NULL ORDER BY quantity DESC LIMIT 4").all().forEach(i=>console.log(JSON.stringify(i)));

db.close();
