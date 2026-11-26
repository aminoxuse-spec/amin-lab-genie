import type { Request, Response } from 'express';
import {
  countOpenSessions,
  coverageRows,
  lateSessions,
  listSessions,
  sessionsBetween,
} from '../models/BorrowingSession.ts';
import { itemsBySession, type BorrowingItemView } from '../models/BorrowingItem.ts';
import { expiringItems, inventorySummary, listInventory, lowStockItems } from '../models/Inventory.ts';
import { statusBreakdown } from '../models/QCCheck.ts';
import { APP_NAME, APP_VERSION } from '../config.ts';

/* ------------------------------------------------------------------ */
/* أدوات مساعدة                                                        */
/* ------------------------------------------------------------------ */

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  return addDays(today(), -days);
}

function range(req: Request): { from: string; to: string } {
  const from = typeof req.query.from === 'string' ? req.query.from : daysAgo(30);
  const to = typeof req.query.to === 'string' ? req.query.to : today();
  return { from, to };
}

function isConsumed(item: BorrowingItemView): boolean {
  return item.condition_out === 'consumed';
}

function outstandingOf(item: BorrowingItemView): number {
  return isConsumed(item) ? 0 : Math.max(0, item.quantity_out - item.quantity_returned);
}

function withItems(date: string) {
  return listSessions({ date }).map((session) => ({
    ...session,
    items: itemsBySession(session.id),
  }));
}

type SessionWithItems = ReturnType<typeof withItems>[number];

function computeTotals(sessions: SessionWithItems[]) {
  return sessions.reduce(
    (acc, session) => {
      acc.sessions += 1;
      acc.unitsOut += session.items.reduce((sum, item) => sum + item.quantity_out, 0);
      acc.unitsReturned += session.items.reduce((sum, item) => sum + item.quantity_returned, 0);
      acc.consumed += session.items.filter(isConsumed).reduce((sum, item) => sum + item.quantity_out, 0);
      acc.outstanding += session.items.reduce((sum, item) => sum + outstandingOf(item), 0);
      acc.damaged += session.items.filter((item) => item.damaged === 1).length;
      if (session.status !== 'returned') acc.openSessions += 1;
      return acc;
    },
    { sessions: 0, unitsOut: 0, unitsReturned: 0, consumed: 0, outstanding: 0, damaged: 0, openSessions: 0 },
  );
}

function collect(from: string, to: string) {
  const sessions = sessionsBetween(from, to);
  const items = sessions.flatMap((session) => itemsBySession(session.id));
  return { sessions, items };
}

/* ------------------------------------------------------------------ */
/* تقارير الجدول العامة: الأساتذة / العتاد / المواد / التأخر            */
/* ------------------------------------------------------------------ */

export type TableReportType = 'teachers' | 'equipment' | 'chemicals' | 'late';

export const TABLE_REPORTS: TableReportType[] = ['teachers', 'equipment', 'chemicals', 'late'];

type Column = { key: string; label: string; numeric?: boolean };
type Row = Record<string, string | number>;

export type TableReport = {
  app: string;
  version: string;
  type: TableReportType;
  title: string;
  from: string;
  to: string;
  columns: Column[];
  rows: Row[];
  summary: { label: string; value: string | number }[];
  note?: string;
  generatedAt: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  apparatus: 'أجهزة',
  glassware: 'زجاجيات',
  chemical: 'مواد كيميائية',
};

function teachersReport(from: string, to: string): Omit<TableReport, 'app' | 'version' | 'type' | 'generatedAt' | 'from' | 'to'> {
  const { sessions, items } = collect(from, to);
  const byTeacher = new Map<
    number,
    { name: string; sessions: number; unitsOut: number; unitsReturned: number; consumed: number; outstanding: number; damaged: number }
  >();

  for (const session of sessions) {
    const entry =
      byTeacher.get(session.teacher_id) ??
      { name: session.teacher_name, sessions: 0, unitsOut: 0, unitsReturned: 0, consumed: 0, outstanding: 0, damaged: 0 };
    entry.sessions += 1;
    byTeacher.set(session.teacher_id, entry);
  }
  for (const item of items) {
    const session = sessions.find((row) => row.id === item.session_id);
    if (!session) continue;
    const entry = byTeacher.get(session.teacher_id);
    if (!entry) continue;
    entry.unitsOut += item.quantity_out;
    entry.unitsReturned += item.quantity_returned;
    if (isConsumed(item)) entry.consumed += item.quantity_out;
    entry.outstanding += outstandingOf(item);
    if (item.damaged === 1) entry.damaged += 1;
  }

  const rows = [...byTeacher.values()]
    .sort((a, b) => b.sessions - a.sessions)
    .map((entry) => ({
      teacher: entry.name,
      sessions: entry.sessions,
      units_out: entry.unitsOut,
      units_returned: entry.unitsReturned,
      consumed: entry.consumed,
      outstanding: entry.outstanding,
      damaged: entry.damaged,
    }));

  const total = rows.reduce(
    (acc, row) => ({
      sessions: acc.sessions + Number(row.sessions),
      units_out: acc.units_out + Number(row.units_out),
      units_returned: acc.units_returned + Number(row.units_returned),
      consumed: acc.consumed + Number(row.consumed),
      outstanding: acc.outstanding + Number(row.outstanding),
      damaged: acc.damaged + Number(row.damaged),
    }),
    { sessions: 0, units_out: 0, units_returned: 0, consumed: 0, outstanding: 0, damaged: 0 },
  );

  return {
    title: 'تقرير الأساتذة',
    columns: [
      { key: 'teacher', label: 'الأستاذ' },
      { key: 'sessions', label: 'عدد الإعارات', numeric: true },
      { key: 'units_out', label: 'وحدات معارة', numeric: true },
      { key: 'units_returned', label: 'وحدات مرجعة', numeric: true },
      { key: 'consumed', label: 'مستهلك', numeric: true },
      { key: 'outstanding', label: 'متبقٍّ', numeric: true },
      { key: 'damaged', label: 'تالف/مفقود', numeric: true },
    ],
    rows,
    summary: [
      { label: 'عدد الأساتذة', value: rows.length },
      { label: 'الإعارات', value: total.sessions },
      { label: 'وحدات معارة', value: total.units_out },
      { label: 'مستهلك', value: total.consumed },
      { label: 'متبقٍّ', value: total.outstanding },
    ],
    note: 'الأساتذة مرتبون حسب عدد الإعارات تنازلياً.',
  };
}

function equipmentReport(from: string, to: string): Omit<TableReport, 'app' | 'version' | 'type' | 'generatedAt' | 'from' | 'to'> {
  const inventory = listInventory().filter((item) => item.category !== 'chemical');
  const { items } = collect(from, to);

  const rows = inventory.map((item) => {
    const lines = items.filter((line) => line.inventory_id === item.id);
    return {
      code: item.code,
      name: item.name,
      category: CATEGORY_LABELS[item.category] ?? item.category,
      total: item.quantity,
      available: item.available_quantity,
      borrowed: Math.max(0, item.quantity - item.available_quantity),
      used: lines.reduce((sum, line) => sum + line.quantity_out, 0),
      damaged: lines.filter((line) => line.damaged === 1).length,
    };
  });

  const totalUnits = rows.reduce((sum, row) => sum + Number(row.total), 0);
  const borrowedUnits = rows.reduce((sum, row) => sum + Number(row.borrowed), 0);

  return {
    title: 'تقرير العتاد',
    columns: [
      { key: 'code', label: 'الرمز' },
      { key: 'name', label: 'العتاد' },
      { key: 'category', label: 'الفئة' },
      { key: 'total', label: 'الإجمالي', numeric: true },
      { key: 'available', label: 'المتوفر', numeric: true },
      { key: 'borrowed', label: 'المُعار حالياً', numeric: true },
      { key: 'used', label: 'مستعمل في الفترة', numeric: true },
      { key: 'damaged', label: 'تالف/مفقود', numeric: true },
    ],
    rows,
    summary: [
      { label: 'أصناف العتاد', value: rows.length },
      { label: 'إجمالي الوحدات', value: totalUnits },
      { label: 'مُعارة حالياً', value: borrowedUnits },
      { label: 'متوفرة', value: totalUnits - borrowedUnits },
    ],
    note: '«مستعمل في الفترة» = مجموع الكميات الخارجة في الفترة المحددة.',
  };
}

function chemicalsReport(from: string, to: string): Omit<TableReport, 'app' | 'version' | 'type' | 'generatedAt' | 'from' | 'to'> {
  const chemicals = listInventory().filter((item) => item.category === 'chemical');
  const { items } = collect(from, to);

  const rows = chemicals.map((item) => {
    const lines = items.filter((line) => line.inventory_id === item.id);
    const consumed = lines
      .filter((line) => isConsumed(line) || line.condition_in === 'missing')
      .reduce((sum, line) => sum + line.quantity_out, 0);
    const used = lines.reduce((sum, line) => sum + line.quantity_out, 0);
    return {
      code: item.code,
      name: item.name,
      unit: item.unit,
      total: item.quantity,
      remaining: item.available_quantity,
      consumed,
      used,
      rate: item.quantity === 0 ? 0 : Math.round((used / item.quantity) * 100),
      expiry: item.expiry_date ?? '—',
    };
  });

  return {
    title: 'تقرير المواد الكيميائية',
    columns: [
      { key: 'code', label: 'الرمز' },
      { key: 'name', label: 'المادة' },
      { key: 'unit', label: 'الوحدة' },
      { key: 'total', label: 'الإجمالي', numeric: true },
      { key: 'remaining', label: 'المتبقي', numeric: true },
      { key: 'consumed', label: 'المستهلك', numeric: true },
      { key: 'used', label: 'إجمالي المستعمل', numeric: true },
      { key: 'rate', label: 'نسبة الاستعمال %', numeric: true },
      { key: 'expiry', label: 'الصلاحية' },
    ],
    rows,
    summary: [
      { label: 'عدد المواد', value: rows.length },
      { label: 'إجمالي المخزون', value: rows.reduce((sum, row) => sum + Number(row.total), 0) },
      { label: 'المستهلك', value: rows.reduce((sum, row) => sum + Number(row.consumed), 0) },
      { label: 'المتبقي', value: rows.reduce((sum, row) => sum + Number(row.remaining), 0) },
    ],
    note: '«المستهلك» = سطور مسجّلة كمستهلكة + الكميات المفقودة عند الإرجاع.',
  };
}

function lateReport(_from: string, _to: string): Omit<TableReport, 'app' | 'version' | 'type' | 'generatedAt' | 'from' | 'to'> {
  const sessions = lateSessions();
  const now = Date.now();
  const rows = sessions.map((session) => {
    const items = itemsBySession(session.id);
    const remaining = items.reduce((sum, item) => sum + outstandingOf(item), 0);
    const owners = [
      ...new Set(
        items
          .filter((item) => outstandingOf(item) > 0 && item.owner_no)
          .map((item) => String(item.owner_no)),
      ),
    ];
    const owner_no = owners.length ? owners.join('، ') : '—';
    const dueDate = session.due_date ?? session.session_date;
    const due = new Date(`${dueDate}T${session.end_time}:00`);
    const hours = Math.max(0, Math.round((now - due.getTime()) / 3_600_000));
    return {
      id: session.id,
      date: session.session_date,
      teacher: session.teacher_name,
      level: session.level ?? '—',
      class_name: session.class_name,
      subject: session.subject,
      owner_no,
      remaining,
      due: `${dueDate} ${session.end_time}`,
      delay: hours >= 24 ? `${Math.floor(hours / 24)} يوم` : `${hours} ساعة`,
      status: session.status === 'partial' ? 'إرجاع جزئي' : 'لم يُرجع',
    };
  });

  return {
    title: 'تقرير التأخر في الإرجاع',
    columns: [
      { key: 'id', label: '#', numeric: true },
      { key: 'date', label: 'تاريخ الإعارة' },
      { key: 'teacher', label: 'الأستاذ' },
      { key: 'level', label: 'المستوى' },
      { key: 'class_name', label: 'القسم' },
      { key: 'subject', label: 'المادة' },
      { key: 'owner_no', label: 'جرد خاص' },
      { key: 'remaining', label: 'وحدات غير مُرجعة', numeric: true },
      { key: 'due', label: 'أجل الإرجاع' },
      { key: 'delay', label: 'مدة التأخر' },
      { key: 'status', label: 'الحالة' },
    ],
    rows,
    summary: [
      { label: 'إعارات متأخرة', value: rows.length },
      { label: 'وحدات غير مرجعة', value: rows.reduce((sum, row) => sum + Number(row.remaining), 0) },
    ],
    note: 'يُحتسب التأخر انطلاقاً من تاريخ الحصة وساعة نهايتها (أو تاريخ الأجل إن حُدِّد).',
  };
}

export function buildTableReport(type: TableReportType, from: string, to: string): TableReport {
  const builders = {
    teachers: teachersReport,
    equipment: equipmentReport,
    chemicals: chemicalsReport,
    late: lateReport,
  };
  const build = builders[type];
  return {
    app: APP_NAME,
    version: APP_VERSION,
    type,
    from,
    to,
    generatedAt: new Date().toISOString(),
    ...build(from, to),
  };
}

/* ------------------------------------------------------------------ */
/* تصدير Excel (SpreadsheetML) وCSV                                     */
/* ------------------------------------------------------------------ */

function xmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function toXls(title: string, headers: string[], rows: (string | number)[][]): string {
  const header = headers
    .map((label) => `<Cell ss:StyleID="head"><Data ss:Type="String">${xmlEscape(label)}</Data></Cell>`)
    .join('');
  const body = rows
    .map(
      (row) =>
        `<Row>${row
          .map((cell) =>
            typeof cell === 'number'
              ? `<Cell><Data ss:Type="Number">${cell}</Data></Cell>`
              : `<Cell ss:StyleID="body"><Data ss:Type="String">${xmlEscape(cell)}</Data></Cell>`,
          )
          .join('')}</Row>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="head"><Font ss:Bold="1"/><Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/></Style>
    <Style ss:ID="body"><Alignment ss:Vertical="Center"/></Style>
    <Style ss:ID="title"><Font ss:Bold="1" ss:Size="14"/></Style>
  </Styles>
  <Worksheet ss:Name="${xmlEscape(title).slice(0, 28)}">
    <Table>
      <Row><Cell ss:StyleID="title"><Data ss:Type="String">${xmlEscape(title)}</Data></Cell></Row>
      <Row><Cell><Data ss:Type="String">Amin-Lab -Pro🔬 — ${xmlEscape(new Date().toLocaleString('ar-MA'))}</Data></Cell></Row>
      <Row></Row>
      <Row>${header}</Row>
${body}
    </Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions>
  </Worksheet>
</Workbook>`;
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: unknown[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function sendXls(res: Response, filename: string, content: string): void {
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xls"`);
  res.type('application/vnd.ms-excel; charset=utf-8').send(content);
}

function sendCsv(res: Response, filename: string, rows: unknown[][]): void {
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.type('text/csv; charset=utf-8').send(toCsv(rows));
}

function reportRows(report: TableReport): (string | number)[][] {
  return report.rows.map((row) => report.columns.map((column) => row[column.key] ?? ''));
}

/* ------------------------------------------------------------------ */
/* نقاط النهاية                                                        */
/* ------------------------------------------------------------------ */

export function tableReport(type: TableReportType) {
  return (req: Request, res: Response): void => {
    const { from, to } = range(req);
    res.json(buildTableReport(type, from, to));
  };
}

export function tableReportCsv(type: TableReportType) {
  return (req: Request, res: Response): void => {
    const { from, to } = range(req);
    const report = buildTableReport(type, from, to);
    sendCsv(res, `amin-lab-${type}-${from}_${to}`, [
      report.columns.map((column) => column.label),
      ...reportRows(report),
    ]);
  };
}

export function tableReportXls(type: TableReportType) {
  return (req: Request, res: Response): void => {
    const { from, to } = range(req);
    const report = buildTableReport(type, from, to);
    sendXls(
      res,
      `amin-lab-${type}-${from}_${to}`,
      toXls(`${report.title} (${from} → ${to})`, report.columns.map((column) => column.label), reportRows(report)),
    );
  };
}

/* ------------------------------------------------------------------ */
/* تغطية التقارير الأسبوعية                                             */
/* ------------------------------------------------------------------ */

export function coverage(req: Request, res: Response): void {
  const requested = Number(req.query.weeks ?? 8);
  const weekCount = Math.min(52, Math.max(4, Number.isFinite(requested) ? requested : 8));
  const todayIso = today();
  const currentStart = addDays(todayIso, -new Date(`${todayIso}T00:00:00Z`).getUTCDay());
  const firstStart = addDays(currentStart, -7 * (weekCount - 1));
  const lastEnd = addDays(currentStart, 6);

  const buckets = new Map<
    string,
    { start: string; end: string; sessions: number; teachers: Set<number>; units: number; consumed: number; reports: Set<string> }
  >();
  for (let index = 0; index < weekCount; index += 1) {
    const start = addDays(firstStart, index * 7);
    buckets.set(start, { start, end: addDays(start, 6), sessions: 0, teachers: new Set(), units: 0, consumed: 0, reports: new Set() });
  }

  const rows = coverageRows(firstStart, lastEnd);
  const teacherWeeks = new Map<number, { name: string; weeks: Set<string> }>();

  for (const row of rows) {
    const start = addDays(row.session_date, -new Date(`${row.session_date}T00:00:00Z`).getUTCDay());
    const bucket = buckets.get(start);
    if (!bucket) continue;
    bucket.sessions += 1;
    bucket.teachers.add(row.teacher_id);
    bucket.units += row.units_out;
    bucket.consumed += row.consumed;
    if (row.report_no) bucket.reports.add(row.report_no);

    const entry = teacherWeeks.get(row.teacher_id) ?? { name: row.teacher_name, weeks: new Set<string>() };
    entry.weeks.add(start);
    teacherWeeks.set(row.teacher_id, entry);
  }

  const weeks = [...buckets.values()].map((bucket) => ({
    start: bucket.start,
    end: bucket.end,
    sessions: bucket.sessions,
    teachers: bucket.teachers.size,
    units: bucket.units,
    consumed: bucket.consumed,
    report_no: [...bucket.reports].sort().join(' · ') || null,
  }));
  const covered = weeks.filter((week) => week.sessions > 0).length;

  res.json({
    app: APP_NAME,
    version: APP_VERSION,
    from: firstStart,
    to: lastEnd,
    weeks,
    missing: weeks.filter((week) => week.sessions === 0),
    teachers: [...teacherWeeks.values()]
      .map((entry) => ({ name: entry.name, weeks: entry.weeks.size }))
      .sort((a, b) => b.weeks - a.weeks || a.name.localeCompare(b.name, 'ar')),
    summary: {
      weeks: weeks.length,
      covered,
      missing: weeks.length - covered,
      coverage: Math.round((covered / weeks.length) * 100),
      sessions: rows.length,
    },
    generatedAt: new Date().toISOString(),
  });
}

export function daily(req: Request, res: Response): void {
  const date = typeof req.query.date === 'string' ? req.query.date : today();
  const sessions = withItems(date);
  const totals = computeTotals(sessions);
  res.json({
    app: APP_NAME,
    version: APP_VERSION,
    date,
    sessions,
    totals: {
      ...totals,
      items: sessions.reduce((sum, session) => sum + session.items.length, 0),
      openSessionsAll: countOpenSessions(),
    },
    inventory: inventorySummary(),
    qc: statusBreakdown(),
    alerts: { lowStock: lowStockItems(), expiring: expiringItems(60) },
    generatedAt: new Date().toISOString(),
  });
}

export function weekly(req: Request, res: Response): void {
  const start = typeof req.query.start === 'string' ? req.query.start : daysAgo(6);
  const end = addDays(start, 6);
  const sessions = sessionsBetween(start, end).map((session) => ({
    ...session,
    items: itemsBySession(session.id),
  }));

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    const daySessions = sessions.filter((session) => session.session_date === date);
    return {
      date,
      sessions: daySessions.length,
      unitsOut: daySessions.reduce((sum, session) => sum + session.units_out, 0),
      unitsReturned: daySessions.reduce((sum, session) => sum + session.units_returned, 0),
    };
  });

  const topMap = new Map<string, { name: string; quantity: number }>();
  for (const session of sessions) {
    for (const item of session.items) {
      const entry = topMap.get(item.code) ?? { name: item.name, quantity: 0 };
      entry.quantity += item.quantity_out;
      topMap.set(item.code, entry);
    }
  }

  res.json({
    app: APP_NAME,
    version: APP_VERSION,
    start,
    end,
    days,
    sessions,
    topItems: [...topMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    totals: computeTotals(sessions),
    inventory: inventorySummary(),
    generatedAt: new Date().toISOString(),
  });
}

function dailyRows(date: string): unknown[][] {
  const rows: unknown[][] = [
    ['التاريخ', 'المستوى', 'القسم', 'المادة', 'الأستاذ', 'القاعة', 'من', 'إلى', 'العنصر', 'الرمز', 'الكمية', 'المُرجع', 'الحالة', 'ملاحظات'],
  ];

  for (const session of withItems(date)) {
    if (session.items.length === 0) {
      rows.push([date, session.level ?? '-', session.class_name, session.subject, session.teacher_name, session.room_name ?? '-', session.start_time, session.end_time, '-', '-', 0, 0, session.status, '']);
      continue;
    }
    for (const item of session.items) {
      rows.push([
        date,
        session.level ?? '-',
        session.class_name,
        session.subject,
        session.teacher_name,
        session.room_name ?? '-',
        session.start_time,
        session.end_time,
        item.name,
        item.code,
        item.quantity_out,
        item.quantity_returned,
        isConsumed(item) ? 'مستهلك' : item.damaged === 1 ? 'تالف/مفقود' : session.status,
        item.notes ?? '',
      ]);
    }
  }
  return rows;
}

function weeklyRows(start: string): unknown[][] {
  const rows: unknown[][] = [['التاريخ', 'عدد الإعارات', 'الكميات المعارة', 'الكميات المرجعة']];
  for (let index = 0; index < 7; index += 1) {
    const date = addDays(start, index);
    const sessions = sessionsBetween(date, date);
    rows.push([
      date,
      sessions.length,
      sessions.reduce((sum, session) => sum + session.units_out, 0),
      sessions.reduce((sum, session) => sum + session.units_returned, 0),
    ]);
  }
  return rows;
}

export function dailyCsv(req: Request, res: Response): void {
  const date = typeof req.query.date === 'string' ? req.query.date : today();
  sendCsv(res, `amin-lab-daily-${date}`, dailyRows(date));
}

export function dailyXls(req: Request, res: Response): void {
  const date = typeof req.query.date === 'string' ? req.query.date : today();
  const rows = dailyRows(date);
  sendXls(
    res,
    `amin-lab-daily-${date}`,
    toXls(`التقرير اليومي ${date}`, rows[0].map(String), rows.slice(1) as (string | number)[][]),
  );
}

export function weeklyCsv(req: Request, res: Response): void {
  const start = typeof req.query.start === 'string' ? req.query.start : daysAgo(6);
  sendCsv(res, `amin-lab-weekly-${start}`, weeklyRows(start));
}

export function weeklyXls(req: Request, res: Response): void {
  const start = typeof req.query.start === 'string' ? req.query.start : daysAgo(6);
  const rows = weeklyRows(start);
  sendXls(
    res,
    `amin-lab-weekly-${start}`,
    toXls(`التقرير الأسبوعي ${start} → ${addDays(start, 6)}`, rows[0].map(String), rows.slice(1) as (string | number)[][]),
  );
}
