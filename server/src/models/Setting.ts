import { allRows, run, transaction } from '../db.ts';

/** مفاتيح إعدادات المؤسسة والعلامة البصرية. */
export const INSTITUTION_KEYS = {
  name: 'institution.name',
  nameFr: 'institution.name_fr',
  schoolYear: 'institution.school_year',
  logo: 'institution.logo',
  level: 'institution.level',
  logoInPrint: 'institution.logo_in_print',
  signatureLab: 'institution.signature.lab',
  signatureLabFr: 'institution.signature.lab_fr',
  signatureCounselor: 'institution.signature.counselor',
  signatureCounselorFr: 'institution.signature.counselor_fr',
  signatureDirector: 'institution.signature.director',
  signatureDirectorFr: 'institution.signature.director_fr',
} as const;

export type Institution = {
  name: string;
  name_fr: string;
  school_year: string;
  level: 'middle' | 'secondary';
  logo: string;
  logo_in_print: boolean;
  signature: {
    lab: string;
    lab_fr: string;
    counselor: string;
    counselor_fr: string;
    director: string;
    director_fr: string;
  };
};

export function allSettings(): Record<string, string> {
  const rows = allRows<{ key: string; value: string | null }>('SELECT key, value FROM app_settings');
  const map: Record<string, string> = {};
  for (const row of rows) map[row.key] = row.value ?? '';
  return map;
}

export function setSettings(entries: Record<string, string>): void {
  transaction(() => {
    for (const [key, value] of Object.entries(entries)) {
      run(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        key,
        value,
      );
    }
  });
}

export function getInstitution(): Institution {
  const settings = allSettings();
  const read = (key: string) => settings[key] ?? '';
  return {
    name: read(INSTITUTION_KEYS.name),
    name_fr: read(INSTITUTION_KEYS.nameFr),
    school_year: read(INSTITUTION_KEYS.schoolYear),
    level: (read(INSTITUTION_KEYS.level) === 'secondary' ? 'secondary' : 'middle'),
    logo: read(INSTITUTION_KEYS.logo) || '/assets/icons/logo.png',
    logo_in_print: settings[INSTITUTION_KEYS.logoInPrint] !== '0',
    signature: {
      lab: read(INSTITUTION_KEYS.signatureLab),
      lab_fr: read(INSTITUTION_KEYS.signatureLabFr),
      counselor: read(INSTITUTION_KEYS.signatureCounselor),
      counselor_fr: read(INSTITUTION_KEYS.signatureCounselorFr),
      director: read(INSTITUTION_KEYS.signatureDirector),
      director_fr: read(INSTITUTION_KEYS.signatureDirectorFr),
    },
  };
}

export function updateInstitution(input: {
  name?: string;
  name_fr?: string;
  school_year?: string;
  level?: 'middle' | 'secondary';
  logo?: string;
  logo_in_print?: boolean;
  signature?: Partial<Institution['signature']>;
}): Institution {
  const entries: Record<string, string> = {};
  if (input.name !== undefined) entries[INSTITUTION_KEYS.name] = input.name;
  if (input.name_fr !== undefined) entries[INSTITUTION_KEYS.nameFr] = input.name_fr;
  if (input.school_year !== undefined) entries[INSTITUTION_KEYS.schoolYear] = input.school_year;
  if (input.level !== undefined) entries[INSTITUTION_KEYS.level] = input.level;
  if (input.logo !== undefined) entries[INSTITUTION_KEYS.logo] = input.logo;
  if (input.logo_in_print !== undefined) {
    entries[INSTITUTION_KEYS.logoInPrint] = input.logo_in_print ? '1' : '0';
  }

  const signature = input.signature ?? {};
  if (signature.lab !== undefined) entries[INSTITUTION_KEYS.signatureLab] = signature.lab;
  if (signature.lab_fr !== undefined) entries[INSTITUTION_KEYS.signatureLabFr] = signature.lab_fr;
  if (signature.counselor !== undefined) entries[INSTITUTION_KEYS.signatureCounselor] = signature.counselor;
  if (signature.counselor_fr !== undefined) entries[INSTITUTION_KEYS.signatureCounselorFr] = signature.counselor_fr;
  if (signature.director !== undefined) entries[INSTITUTION_KEYS.signatureDirector] = signature.director;
  if (signature.director_fr !== undefined) entries[INSTITUTION_KEYS.signatureDirectorFr] = signature.director_fr;

  if (Object.keys(entries).length > 0) setSettings(entries);
  return getInstitution();
}
