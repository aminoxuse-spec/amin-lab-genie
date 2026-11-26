import type { DatabaseSync } from 'node:sqlite';

/**
 * منطق واحد لمطابقة ما يُكتب في تقارير الإعارة («بطارية – مصباح – انابيب اختبار»)
 * بأصناف الجرد، عبر بنك المرادفات `item_aliases` ثم أسماء الجرد.
 * يستخدمه الخادم (استيراد التقرير الأسبوعي) وسكربتات الربط والتعبئة.
 */

export type AliasEntry = { token: string; inventoryId: number; name: string; category: string };

export type MatchedLine = { inventoryId: number; name: string; quantity: number; consumed: boolean; source: string };

export type MatchResult = { lines: MatchedLine[]; unresolved: string[] };

/** مرادفات افتراضية تُستخدم لتعبئة بنك المرادفات في قاعدة قائمة. */
export const DEFAULT_ALIASES: { tokens: string[]; match: string; fallback?: string }[] = [
  { tokens: ['بطارية'], match: 'بطارية' },
  { tokens: ['اسلاك توصيل', 'أسلاك توصيل', 'اسلاك التوصيل'], match: 'اسلاك توصيل' },
  { tokens: ['مصباح'], match: 'مجموعة تركيبة كهربائية (مصباح)' },
  { tokens: ['قاطعة بسيطة'], match: 'قاطعة بسيطة' },
  { tokens: ['خشب', 'حديد', 'بلاستيك', 'نحاس'], match: 'المواد الناقلة' },
  { tokens: ['ميزان'], match: 'ميزان (1)' },
  { tokens: ['وعاء التحليل الكهربائي'], match: 'جهاز تحليل كهربائي' },
  { tokens: ['علبة بيتري'], match: 'طبق بتري', fallback: 'بيتري' },
  { tokens: ['انابيب اختبار', 'أنابيب اختبار'], match: 'أنبوب اختبار' },
  { tokens: ['محلول فهلنق'], match: 'Fehling A' },
  { tokens: ['حمض الالزوت'], match: 'Acide nitrique' },
  { tokens: ['ماء اليود'], match: 'Eau iod' },
  { tokens: ['نترات الفضة'], match: 'Nitrate d' },
  { tokens: ['بيكربونات الصوديوم', 'بكربونات الصوديوم'], match: 'Bicarbonate de sodium' },
  { tokens: ['ماء نقي', 'ماء مقطر'], match: 'ماء مقطر', fallback: 'Eau distill' },
  { tokens: ['مصاصة'], match: 'ماصة' },
  { tokens: ['حوجلة'], match: 'دورق حجمي 50' },
  { tokens: ['ارلن ماير'], match: 'دورق مخروطي' },
  { tokens: ['HCL'], match: 'Acide chlorhydrique' },
  { tokens: ['CaCo3'], match: 'Carbonate de calcium' },
  { tokens: ['كرة أرضية', 'كرة ارضية'], match: 'كرة أرضية' },
  { tokens: ['جداريات'], match: 'جداريات 2042-2045' },
  { tokens: ['مجسم هظمي'], match: 'مجسم هظمي' },
  { tokens: ['مكبر الصورة'], match: 'مكبر الصورة' },
  { tokens: ['كاشف كهربائي'], match: 'كاشف كهربائي' },
  { tokens: ['نواس'], match: 'نواس' },
];

/** توحيد النص العربي للمقارنة: بلا تشكيل/تطويل، وبتوحيد الألف والياء والتاء المربوطة. */
export function normalize(text: unknown): string {
  return String(text ?? '')
    .replace(/[\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** تفكيك نص الوسائل إلى بنود منفردة (مع تجاهل بادئة المصدر مثل «[تقرير 05]»). */
export function splitEquipment(text: string): string[] {
  return String(text ?? '')
    .replace(/^\[[^\]]*\]\s*/, '')
    .split(/[–—]|(?<!\d)-(?!\d)|\|/)
    .map((part) => part.replace(/^[\s\-–—|]+|[\s\-–—|]+$/, '').trim())
    .filter((part) => part.length > 1);
}

/** «3م4» → «ثالثة متوسط» · «2ث1» → «ثانية ثانوي» */
export function levelOf(className: string | null | undefined): string | null {
  const match = String(className ?? '').match(/^(\d)\s*([متث])/);
  if (!match) return null;
  const ordinals = ['', 'أولى', 'ثانية', 'ثالثة', 'رابعة', 'خامسة'];
  const stages: Record<string, string> = { م: 'متوسط', ث: 'ثانوي', ت: 'ابتدائي' };
  const ordinal = ordinals[Number(match[1])];
  const stage = stages[match[2]];
  return ordinal && stage ? `${ordinal} ${stage}` : null;
}

type AliasRow = { alias: string; id: number; name: string; category: string };

/** مرادفات قاعدة البيانات مرتّبة من الأطول إلى الأقصر (الأخص أولاً). */
export function loadAliases(db: DatabaseSync): AliasEntry[] {
  const rows = db
    .prepare(
      `SELECT a.alias AS alias, i.id AS id, i.name AS name, i.category AS category
       FROM item_aliases a JOIN inventory i ON i.id = a.inventory_id
       WHERE i.deleted_at IS NULL AND a.alias <> ''`,
    )
    .all() as AliasRow[];
  return rows
    .map((row) => ({
      token: normalize(row.alias),
      inventoryId: row.id,
      name: row.name,
      category: row.category,
    }))
    .sort((a, b) => b.token.length - a.token.length);
}

/** مرادفات احتياطية مشتقّة من أسماء الجرد (لقاعدة لم تُعبّأ فيها المرادفات بعد). */
export function fallbackAliases(db: DatabaseSync): { aliases: AliasEntry[]; missing: string[] } {
  const lookup = db.prepare(
    `SELECT id, name, category FROM inventory
     WHERE deleted_at IS NULL AND name LIKE ?
     ORDER BY LENGTH(name) ASC LIMIT 1`,
  );
  const aliases: AliasEntry[] = [];
  const missing: string[] = [];
  for (const entry of DEFAULT_ALIASES) {
    let item: { id: number; name: string; category: string } | undefined;
    for (const candidate of [entry.match, entry.fallback].filter(Boolean) as string[]) {
      item = lookup.get(`%${candidate}%`) as { id: number; name: string; category: string } | undefined;
      if (item) break;
    }
    if (!item) {
      missing.push(...entry.tokens);
      continue;
    }
    for (const token of entry.tokens) {
      aliases.push({ token: normalize(token), inventoryId: item.id, name: item.name, category: item.category });
    }
  }
  aliases.sort((a, b) => b.token.length - a.token.length);
  return { aliases, missing };
}

/** الرقم في بداية البند («10غ بيكربونات الصوديوم») هو الكمية، وإلا فواحد. */
function quantityOf(token: string): number {
  const leading = token.match(/^0*(\d+)/);
  return Math.max(1, leading ? Number(leading[1]) : 1);
}

/**
 * حلّ بند واحد إلى صنف أو أكثر: بند واحد قد يذكر وسيلتين («مكبر الصورة كرة أرضية»).
 * تُرجّع المرادفات من الأخصّ إلى الأعم، ثم اسم الجرد بعد إزالة الرقم والوحدة.
 */
function matchTokens(token: string, aliases: AliasEntry[], db: DatabaseSync): AliasEntry[] {
  const text = normalize(token);
  const found: AliasEntry[] = [];
  const seen = new Set<number>();
  for (const entry of aliases) {
    if (!entry.token || !text.includes(entry.token) || seen.has(entry.inventoryId)) continue;
    seen.add(entry.inventoryId);
    found.push(entry);
  }
  if (found.length) return found;

  const cleaned = text.replace(/^0*\d+\s*(غ|ملل|مل|مليلتر|مجم|كغ|لتر)?\s*/, '');
  if (cleaned.length < 2) return [];
  const row = db
    .prepare(
      `SELECT id, name, category FROM inventory
       WHERE deleted_at IS NULL AND name LIKE ?
       ORDER BY LENGTH(name) ASC LIMIT 1`,
    )
    .get(`%${cleaned}%`) as { id: number; name: string; category: string } | undefined;
  return row ? [{ token: cleaned, inventoryId: row.id, name: row.name, category: row.category }] : [];
}

/** حلّ نص وسائل كامل إلى سطور أصناف (بلا تكرار للصنف الواحد). */
export function resolveEquipment(
  equipment: string,
  aliases: AliasEntry[],
  db: DatabaseSync,
): MatchResult {
  const lines = new Map<number, MatchedLine>();
  const unresolved: string[] = [];

  for (const token of splitEquipment(equipment)) {
    const matches = matchTokens(token, aliases, db);
    if (!matches.length) {
      unresolved.push(token);
      continue;
    }
    matches.forEach((matched, index) => {
      if (lines.has(matched.inventoryId)) return;
      lines.set(matched.inventoryId, {
        inventoryId: matched.inventoryId,
        name: matched.name,
        // الرقم في بداية البند يخصّ الوسيلة الأخصّ (الأولى في الترتيب)، والباقي وحدة واحدة.
        quantity: index === 0 ? quantityOf(token) : 1,
        consumed: matched.category === 'chemical',
        source: token,
      });
    });
  }

  return { lines: [...lines.values()], unresolved };
}
