import { allRows, oneRow, run } from '../db.ts';

export type ExperimentStage = 'middle' | 'secondary';

export type Experiment = {
  id: number;
  stage: ExperimentStage;
  level: string;
  subject: string | null;
  title: string;
  objective: string | null;
  materials: string | null;
  duration_minutes: number | null;
  notes: string | null;
  created_at: string;
};

const STAGES: ExperimentStage[] = ['middle', 'secondary'];

export function listExperiments(filters: { stage?: ExperimentStage; q?: string } = {}): Experiment[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filters.stage && STAGES.includes(filters.stage)) {
    where.push('stage = ?');
    params.push(filters.stage);
  }
  if (filters.q && filters.q.trim()) {
    const term = `%${filters.q.trim()}%`;
    where.push('(level LIKE ? OR subject LIKE ? OR title LIKE ? OR objective LIKE ? OR materials LIKE ? OR notes LIKE ?)');
    params.push(term, term, term, term, term, term);
  }
  return allRows<Experiment>(
    `SELECT * FROM experiments
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY stage, level, title, id`,
    ...params,
  );
}

export function getExperiment(id: number): Experiment | undefined {
  return oneRow<Experiment>('SELECT * FROM experiments WHERE id = ?', id);
}

export function createExperiment(data: {
  stage: ExperimentStage;
  level: string;
  subject?: string | null;
  title: string;
  objective?: string | null;
  materials?: string | null;
  duration_minutes?: number | null;
  notes?: string | null;
}): number {
  const { lastInsertRowid } = run(
    `INSERT INTO experiments (stage, level, subject, title, objective, materials, duration_minutes, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    data.stage,
    data.level.trim(),
    data.subject?.trim() || null,
    data.title.trim(),
    data.objective?.trim() || null,
    data.materials?.trim() || null,
    data.duration_minutes ?? null,
    data.notes?.trim() || null,
  );
  return lastInsertRowid;
}

export function updateExperiment(
  id: number,
  data: {
    stage: ExperimentStage;
    level: string;
    subject?: string | null;
    title: string;
    objective?: string | null;
    materials?: string | null;
    duration_minutes?: number | null;
    notes?: string | null;
  },
): boolean {
  return (
    run(
      `UPDATE experiments
       SET stage = ?, level = ?, subject = ?, title = ?, objective = ?, materials = ?, duration_minutes = ?, notes = ?
       WHERE id = ?`,
      data.stage,
      data.level.trim(),
      data.subject?.trim() || null,
      data.title.trim(),
      data.objective?.trim() || null,
      data.materials?.trim() || null,
      data.duration_minutes ?? null,
      data.notes?.trim() || null,
      id,
    ).changes > 0
  );
}

export function deleteExperiment(id: number): boolean {
  return run('DELETE FROM experiments WHERE id = ?', id).changes > 0;
}