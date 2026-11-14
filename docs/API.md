# واجهات API — Amin-Lab -cem🔬 v1.3.0

- **Base URL:** `http://localhost:3000/api`
- **التنسيق:** JSON (UTF-8)
- **المصادقة:** `Authorization: Bearer <token>` (أو `x-session-token`)
- **الأخطاء:** `{ "error": "رسالة عربية", "details": ["..."] }` بحالة HTTP مناسبة.

> الرمز يُحصل عليه من `POST /auth/login` ويبقى صالحاً 8 ساعات (قابل للضبط عبر `SESSION_TTL`).

## الصلاحيات

| الدور | الصلاحيات |
|------|-----------|
| `admin` | كل العمليات، رؤية كل الإعارات والفحوصات، إدارة الجرد والحسابات والقاعات |
| `teacher` | قراءة الجرد، إنشاء إعارات له وإرجاعها، تسجيل فحوصات، رؤية إعاراته فقط |

---

## 1) المصادقة

### `POST /auth/login`
```json
{ "username": "admin", "password": "admin123" }
```
**200**
```json
{ "token": "eyJ...", "user": { "id": 1, "username": "admin", "full_name": "مدير المختبر", "role": "admin" } }
```
**401** بيانات خاطئة · **400** تحقق فاشل.

### `GET /auth/me` → `{ "user": {...} }`

### `GET /auth/users` (admin) → `{ "users": [...] }`

### `POST /auth/users` (admin)
```json
{ "username": "prof2", "full_name": "أستاذة سلمى", "role": "teacher", "password": "secret123" }
```
**201** · **409** اسم مستخدم مستعمل.

---

### تغيير كلمة المرور وإدارة الحسابات
```
PUT    /auth/password      { current_password, new_password }   (المستخدم الحالي)
PUT    /auth/users/:id     { full_name, role, password? }       (admin)
DELETE /auth/users/:id                                          (admin)
```
- تغيير كلمة المرور يتحقق من الكلمة الحالية (400 عند الخطأ).
- حذف المستخدم يُرفض (409) إن كان حسابك الحالي أو لديه إعارات/حصص مرتبطة.

## 2) الجرد

| الطريقة | المسار | الوصف |
|--------|--------|--------|
| GET | `/inventory?q=&category=&lowStock=true` | قائمة + ملخص |
| GET | `/inventory/summary` | ملخص + الأصناف المنخفضة + قاربة الصلاحية |
| GET | `/inventory/deleted` | **سلة المحذوفات** (الأصناف القابلة للاسترجاع) |
| GET | `/inventory/:id` | صنف واحد |
| POST | `/inventory` | إضافة (admin) |
| PUT | `/inventory/:id` | تعديل (admin) |
| DELETE | `/inventory/:id` | حذف ناعم → إلى سلة المحذوفات (admin — يُرفض إن كان معاراً) |
| POST | `/inventory/:id/restore` | **استرجاع** صنف من سلة المحذوفات (admin) |
| DELETE | `/inventory/:id/permanent` | حذف نهائي لا رجعة فيه (admin) |

### البحث السريع (ماسح QR)
`GET /inventory/lookup?code=APP-001` → `{ query, exact: true, items: [...] }`
- يقبل `AMIN:APP-001` و`INVENTORY:APP-001` ويجرّد البادئة.
- يعيد المطابقات التامة أولاً، وإلا المطابقات الجزئية (رمز أو اسم) حتى 30 نتيجة — لاختيار الوسيلة عند التشابه.

### الاسترجاع (سلة المحذوفات)

- `DELETE /inventory/:id` **لا يحذف** الصنف فعلياً: يضبط `deleted_at` ويخفيه من الجرد والملخصات
  والتقارير، ويعيد `{ "ok": true, "restorable": true }`.
- `GET /inventory/deleted` → `{ "items": [...], "count": 2 }` (الأحدث حذفاً أولاً، مع `deleted_at`).
- `POST /inventory/:id/restore` → `{ "item": {...}, "restored": true }` أو **404** إن لم يكن محذوفاً.
- `DELETE /inventory/:id/permanent` → **409** إن كان الصنف مرتبطاً بسجلات إعارة سابقة؛ استرجعه واحتفظ به.
- الصنف المحذوف لا يظهر في البحث ولا في `lowStock` ولا في التنبيهات، لكن تبقى سجلات الإعارة
  القديمة قادرة على الإرجاع (المخزون يُحدَّث بالمعرّف).

**جسم الإضافة/التعديل**
```json
{ "code": "APP-010", "name": "مجهر تشريحي", "category": "apparatus",
  "quantity": 6, "unit": "قطعة", "location": "خزانة B", "min_quantity": 2,
  "expiry_date": "2027-06-30" }
```
`category`: `apparatus | glassware | chemical`.

**استجابة القائمة**
```json
{ "items": [ { "id": 1, "code": "APP-001", "name": "مجهر ضوئي", "available_quantity": 12, "quantity": 12, ... } ],
  "summary": { "total": 13, "units": 303, "lowStock": 0, "expiring": 1 } }
```

---

## 3) الإعارة

### `GET /borrowing?status=&date=`
`status`: `open | partial | returned`. الأستاذ يرى إعاراته فقط.

### `POST /borrowing` — إعارة متعددة العناصر
```json
{ "teacher_id": 2, "room_id": 1, "level": "الجذع المشترك العلمي", "class_name": "1",
  "subject": "الفيزياء والكيمياء", "session_date": "2026-11-13",
  "start_time": "09:00", "notes": "تجربة التحليل الكهربائي",
  "items": [ { "inventory_id": 1, "quantity": 1, "condition_out": "good" },
             { "inventory_id": 6, "quantity": 5, "condition_out": "good", "notes": "كؤوس 250ml" },
             { "inventory_id": 9, "quantity": 1, "condition_out": "consumed", "notes": "حمض مخفف" } ] }
```
- `condition_out`: `good` (صالح) أو `consumed` (مستهلك — **للمواد الكيميائية فقط**) أو `damaged`.
- `end_time` و`teacher_id` و`level` و`due_date` اختيارية؛ عند ترك `end_time` فارغاً تُحسب ساعة واحدة بعد البداية.
- **201** جلسة جديدة + العناصر · **409** كمية غير متوفرة أو عنصر محذوف من الجرد · **400** بيانات غير صالحة
  (مثل «مستهلك» على عتاد غير كيميائي).
- تُخصم الكميات من `available_quantity` داخل معاملة واحدة (كل الجلسة أو لا شيء).
- السطور المستهلكة لا تُنتظر إعادتها، وتُستثنى من حساب «المتبقي» وحالة الجلسة.

### `GET /borrowing/:id` → تفاصيل + أصناف
### `GET /borrowing/:id/receipt` → وصل مطبوع
```json
{ "session": { "...": "...", "items": [...] },
  "totals": { "lines": 3, "units": 7, "returned": 0, "consumed": 1, "outstanding": 6 } }
```
### `PUT /borrowing/:id` — تعديل بيانات الإعارة
```json
{ "level": "الأولى باك", "class_name": "1", "subject": "الكيمياء",
  "session_date": "2026-11-13", "start_time": "11:00", "end_time": "13:00", "notes": "..." }
```
المالك أو المدير فقط؛ الكميات تُعدّل عبر الإرجاع أو إعارة جديدة.

### `POST /borrowing/:id/return`
```json
{ "items": [ { "item_id": 12, "quantity": 2, "condition_in": "good" },
             { "item_id": 13, "quantity": 1, "condition_in": "damaged" } ] }
```
- الكمية تُحسب **إضافية** إلى ما أُرجع سابقاً.
- `good` يعيد الكمية إلى المخزون؛ `damaged`/`missing` لا يعيدها (تُسجَّل تلفاً).
- الحالة تُحدَّث تلقائياً إلى `returned` أو `partial`.
- **400** كمية تتجاوز المتبقي.

### `DELETE /borrowing/:id`
يحذف الجلسة ويعيد الكميات المعلّقة إلى المخزون.

---

## 4) استعمال الزمن والقاعات

`PUT /schedule/:id` بنفس جسم `POST /schedule` — يعدّل الحصة ويتحقق من التعارض (409 عند التداخل).


| الطريقة | المسار | الوصف |
|--------|--------|--------|
| GET | `/schedule?day=1&room_id=2` | الحصص |
| POST | `/schedule` | إضافة حصة (كشف تعارض → 409) |
| DELETE | `/schedule/:id` | حذف |
| GET | `/rooms` | القاعات |
| POST | `/rooms` | إضافة قاعة (admin) |

```json
{ "room_id": 1, "class_name": "الأولى باك", "subject": "علوم الحياة والأرض",
  "day_of_week": 3, "start_time": "10:00", "end_time": "12:00" }
```
`day_of_week`: 0=الأحد … 6=السبت.

---

## 5) الجودة (QC)

`PUT /qc/:id` → `{ status, quantity_found, check_date?, notes? }` لتعديل سجل فحص قائم (admin/أستاذ).

| الطريقة | المسار | الوصف |
|--------|--------|--------|
| GET | `/qc?inventory_id=&from=&to=` | سجل الفحوصات |
| POST | `/qc` | تسجيل فحص |
| GET | `/qc/analysis` | مؤشر الجودة، التوزيع، اتجاه 14 يوماً، المنخفض، قارب الصلاحية |

```json
{ "inventory_id": 9, "status": "low", "quantity_found": 2,
  "check_date": "2026-11-13", "notes": "قارورة شبه فارغة" }
```
`status`: `ok | low | expired | damaged`. نتيجة الفحص تُزامن الكمية المتاحة في الجرد.

---

## 6) التقارير

| الطريقة | المسار | الوصف |
|--------|--------|--------|
| GET | `/reports/daily?date=YYYY-MM-DD` | تقرير يومي (حصص + أصناف + تنبيهات) |
| GET | `/reports/weekly?start=YYYY-MM-DD` | 7 أيام + أكثر الأصناف + الحركة اليومية |
| GET | `/reports/daily.csv` `/reports/daily.xls` | تصدير اليومي (CSV / Excel) |
| GET | `/reports/weekly.csv` `/reports/weekly.xls` | تصدير الأسبوعي |
| GET | `/reports/teachers?from=&to=` | إعارات كل أستاذ |
| GET | `/reports/equipment?from=&to=` | العتاد المستعار والمتبقي |
| GET | `/reports/chemicals?from=&to=` | المواد الكيميائية: مستهلك ومتبقٍّ |
| GET | `/reports/late` | الإعارات المتأخرة عن موعد الإرجاع |
| GET | `/reports/{teachers,equipment,chemicals,late}.csv` | CSV |
| GET | `/reports/{teachers,equipment,chemicals,late}.xls` | Excel (SpreadsheetML) |

**شكل التقارير الجدولية**
```json
{ "type": "teachers", "title": "تقرير الأساتذة", "from": "2026-10-14", "to": "2026-11-13",
  "columns": [ { "key": "teacher", "label": "الأستاذ" },
               { "key": "sessions", "label": "عدد الإعارات", "numeric": true } ],
  "rows": [ { "teacher": "الأستاذ أمين", "sessions": 3 } ],
  "summary": [ { "label": "الإعارات", "value": 3 } ],
  "note": "..." }
```
النطاق الافتراضي: آخر 30 يوماً. `late` يتجاهل الفترة ويعرض كل ما لم يُرجع.
طباعة PDF تتم من المتصفح (احفظ كـ PDF من مربع الطباعة) على كل صفحات التقارير.

---

## 7) الصحة

`GET /health` → `{ "ok": true, "app": "Amin-Lab -cem🔬", "version": "1.0.0", "time": "..." }`

---

## 8) الإعدادات

### معلومات المؤسسة والشعار والإمضاءات
```
GET /api/institution                  (بدون مصادقة — لصفحة الدخول)
GET /api/settings/institution
PUT /api/settings/institution         (admin)
```
```json
{ "institution": {
    "name": "ثانوية ابن سينا", "name_fr": "Lycée Ibn Sina",
    "logo": "data:image/png;base64,…", "logo_in_print": true,
    "signature": {
      "lab": "محمد العلمي", "lab_fr": "Mohamed Alami",
      "counselor": "سعاد بناني", "counselor_fr": "Souad Bennani",
      "director": "أحمد الإدريسي", "director_fr": "Ahmed Idrissi" } } }
```
- جسم `PUT`: `name`, `name_fr`, `logo` (نص `data:image/…` أو `""` للمسح), `logo_in_print` (boolean),
  و`signature_lab`, `signature_lab_fr`, `signature_counselor`, `signature_counselor_fr`,
  `signature_director`, `signature_director_fr` — كلها اختيارية، والتعديل جزئي.
- **400** إذا كان `logo` نصاً لا يبدأ بـ `data:image/`.
- الصورة تُصغَّر في الواجهة (حد 512px، ثم 320/200) قبل الإرسال؛ الحد الأقصى للنص 400k حرف.
`GET /settings` → `{ app, version, port, database, counts: {...}, users, rooms, qc, institution }`
- `users` و`rooms` و`database` للمدير فقط؛ غير المدير يحصل على مصفوفات فارغة و`—`.

## 9) الترخيص
```
GET    /settings/license          → { active, trial, key, activatedAt, expiresAt, expired,
                                      trialStartedAt, trialEndsAt, trialDaysLeft, locked }
PUT    /settings/license          { key, duration_days? }  (admin)
DELETE /settings/license          (admin) — إلغاء التفعيل
GET    /settings/licenses         (admin) — سجل المفاتيح المولّدة
POST   /settings/licenses         { type, duration_days? }  (admin) — توليد مفتاح
POST   /settings/licenses/revoke  { key }  (admin)
```
- **الفترة التجريبية:** 30 يوماً (`TRIAL_DAYS`) تبدأ من أول تشغيل وتُحفظ في `license.trial_started_at`.
- **البوابة:** عند انتهاء التجربة والترخيص معاً تُرجع واجهات العمل
  (`/inventory`, `/borrowing`, `/schedule`, `/rooms`, `/qc`, `/experiments`, `/reports`)
  **403** بالشكل `{ error, code: "TRIAL_EXPIRED" | "LICENSE_EXPIRED" }`، وتبقى `/auth` و`/settings` مفتوحة.
- المفتاح الدائم يُولّد بـ `npm run license` (HMAC-SHA256 → `XXXX-XXXX-XXXX-XXXX`) ويُقبل فقط إذا ضُبط `APP_SECRET`.
- عند التفعيل تختفي عبارة «نسخة تجريبية» من ملصقات QR.

## أكواد الحالة المستعملة

| الكود | المعنى |
|------|--------|
| 200 / 201 | نجاح / إنشاء |
| 400 | تحقق فاشل أو كمية غير صالحة |
| 401 | جلسة غير صالحة أو منتهية |
| 403 | صلاحية غير كافية أو انتهاء الترخيص/التجربة (`code`) |
| 404 | العنصر غير موجود |
| 409 | تعارض (كمية، رمز مكرر، تعارض قاعة) |
| 500 | خطأ داخلي (يُسجَّل في سجل الخادم) |
