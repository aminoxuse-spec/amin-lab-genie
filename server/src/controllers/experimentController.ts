import type { Request, Response } from 'express';
import {
  createExperiment,
  deleteExperiment,
  getExperiment,
  listExperiments,
  updateExperiment,
  type ExperimentStage,
} from '../models/Experiment.ts';
import { HttpError, parseId } from '../middleware/validation.ts';

const STAGES: ExperimentStage[] = ['middle', 'secondary'];

function stageFromQuery(value: unknown): ExperimentStage | undefined {
  return typeof value === 'string' && STAGES.includes(value as ExperimentStage)
    ? (value as ExperimentStage)
    : undefined;
}

export function list(req: Request, res: Response): void {
  res.json({
    experiments: listExperiments({
      stage: stageFromQuery(req.query.stage),
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
    }),
  });
}

export function getOne(req: Request, res: Response): void {
  const experiment = getExperiment(parseId(req.params.id));
  if (!experiment) {
    res.status(404).json({ error: 'التجربة غير موجودة' });
    return;
  }
  res.json({ experiment });
}

export function create(req: Request, res: Response): void {
  const body = req.body as {
    stage: ExperimentStage;
    level: string;
    subject?: string | null;
    title: string;
    objective?: string | null;
    materials?: string | null;
    duration_minutes?: number | null;
    notes?: string | null;
  };
  const id = createExperiment(body);
  res.status(201).json({ id, experiment: getExperiment(id) });
}

export function update(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  if (!getExperiment(id)) {
    res.status(404).json({ error: 'التجربة غير موجودة' });
    return;
  }
  const body = req.body as {
    stage: ExperimentStage;
    level: string;
    subject?: string | null;
    title: string;
    objective?: string | null;
    materials?: string | null;
    duration_minutes?: number | null;
    notes?: string | null;
  };
  updateExperiment(id, body);
  res.json({ experiment: getExperiment(id) });
}

export function remove(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  if (!deleteExperiment(id)) {
    res.status(404).json({ error: 'التجربة غير موجودة' });
    return;
  }
  res.json({ ok: true });
}