import { allRows, oneRow, run } from '../db.ts';
import type { UserRole } from '../utils/security.ts';

export type User = {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  created_at: string;
};

export type UserWithSecret = User & { password_hash: string };

const PUBLIC_COLUMNS = 'id, username, full_name, role, created_at';

export function findByUsername(username: string): UserWithSecret | undefined {
  return oneRow<UserWithSecret>(
    `SELECT ${PUBLIC_COLUMNS}, password_hash FROM users WHERE username = ?`,
    username.trim(),
  );
}

export function findById(id: number): User | undefined {
  return oneRow<User>(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, id);
}

export function listUsers(): User[] {
  return allRows<User>(`SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY role DESC, full_name`);
}

export function countUsers(): number {
  const row = oneRow<{ total: number }>('SELECT COUNT(*) AS total FROM users');
  return row?.total ?? 0;
}

export function createUser(data: {
  username: string;
  full_name: string;
  role: UserRole;
  password_hash: string;
}): User {
  const { lastInsertRowid } = run(
    'INSERT INTO users (username, full_name, role, password_hash) VALUES (?, ?, ?, ?)',
    data.username.trim(),
    data.full_name.trim(),
    data.role,
    data.password_hash,
  );
  return findById(lastInsertRowid) as User;
}

export function updateUser(id: number, data: { full_name: string; role: UserRole }): User | undefined {
  run('UPDATE users SET full_name = ?, role = ? WHERE id = ?', data.full_name.trim(), data.role, id);
  return findById(id);
}

export function updatePassword(id: number, password_hash: string): boolean {
  return run('UPDATE users SET password_hash = ? WHERE id = ?', password_hash, id).changes > 0;
}

export function deleteUser(id: number): boolean {
  return run('DELETE FROM users WHERE id = ?', id).changes > 0;
}
