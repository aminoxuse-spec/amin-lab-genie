import type { RequestHandler } from 'express';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type RuleType = 'string' | 'int' | 'number' | 'date' | 'time' | 'enum' | 'array' | 'boolean';

export type Rule = {
  type: RuleType;
  required?: boolean;
  enum?: readonly string[];
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  /** يسمح بقيمة نصية فارغة (لمسح حقل اختياري). */
  allowEmpty?: boolean;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** تحقّق من جسم الطلب وأعد فقط الحقول المعرّفة (يمنع تمرير حقول غير متوقعة). */
export function validateBody(rules: Record<string, Rule>): RequestHandler {
  return (req, res, next) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const errors: string[] = [];
    const cleaned: Record<string, unknown> = {};

    for (const [field, rule] of Object.entries(rules)) {
      const raw = body[field];
      const missing = raw === undefined || raw === null || (raw === '' && !rule.allowEmpty);

      if (missing) {
        if (rule.required) errors.push(`${field}: حقل مطلوب`);
        continue;
      }

      switch (rule.type) {
        case 'string': {
          if (typeof raw !== 'string') {
            errors.push(`${field}: يجب أن يكون نصاً`);
            break;
          }
          const value = raw.trim();
          if (rule.minLength !== undefined && value.length < rule.minLength) {
            errors.push(`${field}: يجب ألا يقل عن ${rule.minLength} حرفاً`);
          } else if (rule.maxLength !== undefined && value.length > rule.maxLength) {
            errors.push(`${field}: يجب ألا يتجاوز ${rule.maxLength} حرفاً`);
          } else {
            cleaned[field] = value;
          }
          break;
        }
        case 'int':
        case 'number': {
          const value = Number(raw);
          if (!Number.isFinite(value)) {
            errors.push(`${field}: يجب أن يكون رقماً`);
          } else if (rule.type === 'int' && !Number.isInteger(value)) {
            errors.push(`${field}: يجب أن يكون عدداً صحيحاً`);
          } else if (rule.min !== undefined && value < rule.min) {
            errors.push(`${field}: يجب أن يكون ≥ ${rule.min}`);
          } else if (rule.max !== undefined && value > rule.max) {
            errors.push(`${field}: يجب أن يكون ≤ ${rule.max}`);
          } else {
            cleaned[field] = value;
          }
          break;
        }
        case 'date': {
          const value = String(raw);
          if (!DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
            errors.push(`${field}: تاريخ غير صالح (YYYY-MM-DD)`);
          } else {
            cleaned[field] = value;
          }
          break;
        }
        case 'time': {
          const value = String(raw);
          if (!TIME_RE.test(value)) errors.push(`${field}: وقت غير صالح (HH:MM)`);
          else cleaned[field] = value;
          break;
        }
        case 'enum': {
          const value = String(raw);
          if (!rule.enum?.includes(value)) {
            errors.push(`${field}: قيمة غير مسموحة (${rule.enum?.join(' | ')})`);
          } else {
            cleaned[field] = value;
          }
          break;
        }
        case 'boolean': {
          cleaned[field] = raw === true || raw === 'true' || raw === 1 || raw === '1';
          break;
        }
        case 'array': {
          if (!Array.isArray(raw)) errors.push(`${field}: يجب أن تكون لائحة`);
          else cleaned[field] = raw;
          break;
        }
      }
    }

    if (errors.length > 0) {
      res.status(400).json({ error: 'بيانات غير صالحة', details: errors });
      return;
    }
    req.body = cleaned;
    next();
  };
}

export function parseId(value: unknown): number {
  const id = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'معرّف غير صالح');
  return id;
}
