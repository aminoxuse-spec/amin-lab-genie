# دليل النشر — Amin-Lab -Pro🔬

## 1) المتطلبات

| العنصر | الحد الأدنى | الموصى به |
|--------|-------------|-----------|
| نظام التشغيل | Windows 10 / Ubuntu 20.04 | Windows 11 / Ubuntu 24.04 |
| Node.js | 22.18 (يحتاج `node:sqlite` و`process.loadEnvFile`) | 24 أو 26 |
| الذاكرة | 512 MB | 1 GB |
| التخزين الدائم | 1 GB | 5 GB (قاعدة + نسخ احتياطية) |
| Inno Setup 6 | لبناء مثبت Windows فقط | 6.3+ |

> **مهم:** التطبيق خادم Node.js + SQLite على قرص. لا يعمل على استضافات
> serverless أو Cloudflare Workers/Sites — يحتاج **قرصاً دائماً** وملف قاعدة بيانات.

---

## 2) تشغيل محلي

```bash
cp .env.example .env        # ثم اضبط APP_SECRET
npm install
npm start                   # http://localhost:3000
```

`server/src/config.ts` يحمّل `.env` تلقائياً عند بدء التشغيل (متغيرات البيئة الفعلية
تسبق قيم الملف). أول تشغيل يُنشئ `data/amin-lab-genie.sqlite` والبيانات الأولية.

---

## 3) الأسرار وكلمات المرور (قبل أي نشر)

| المتغيّر | إلزامي | الوصف |
|---------|:------:|-------|
| `APP_SECRET` | ✅ | توقيع الجلسات واشتقاق مفتاح الترخيص — 48 بايت عشوائية على الأقل |
| `ADMIN_PASSWORD` | مستحسن | كلمة مرور المدير عند أول تشغيل فقط |
| `TEACHER_PASSWORD` | مستحسن | كلمة مرور الأستاذ عند أول تشغيل فقط |
| `DATA_DIR` | ✅ على الاستضافة | مسار القرص الدائم، مثل `/var/data` |
| `PORT` | ✅ | عادةً يوفّره مزوّد الاستضافة |
| `TRIAL_DAYS` | اختياري | 30 افتراضياً |

توليد `APP_SECRET` (نفّذه مرة واحدة واحفظ الناتج في إعدادات المنصة فقط):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

**كلمات المرور:**

- لا توجد كلمات مرور افتراضية في الكود. إن لم تضبط `ADMIN_PASSWORD` و`TEACHER_PASSWORD`،
  يولّد الخادم كلمتين عشوائيتين (24 حرفاً) ويكتبهما في
  `data/first-run-credentials.txt` بصلاحيات `600`، ويُسجّل **مسار الملف فقط**.
- انقل بيانات الملف إلى مدير كلمات المرور ثم احذفه.
- لتغيير كلمة مرور لاحقاً (دون كتابتها في الطرفية أو السجل):

```bash
npm run set-password -- admin
npm run set-password -- teacher
# الكلمة الجديدة تُضاف إلى data/credentials.txt بصلاحيات 600
```

> لا تضع أي سرّ في Git أو داخل `client/`. ملفات `.env` و`data/` مستثناة في `.gitignore`.

---

## 4) استضافة Node مع قرص دائم

الشرط المشترك في كل المنصات: **قرص دائم مثبّت على مسار**، و`DATA_DIR` يشير إليه،
و`APP_SECRET` في متغيّرات البيئة، ثم `npm ci && npm run build && npm start`.

### Render

1. New → **Web Service** → اربط المستودع.
2. Build: `npm ci && npm run build` — Start: `npm start`.
3. Environment: `APP_SECRET` (قيمة عشوائية)، `ADMIN_PASSWORD`، `TEACHER_PASSWORD`،
   `DATA_DIR=/var/data`، `NODE_VERSION=22.18.0`.
4. **Disks** → Add Disk: Mount Path `/var/data`، الحجم 5 GB.
5. Health Check Path: `/api/health`.

### Railway

```bash
railway init
railway add --service amin-lab
railway variables set APP_SECRET=<القيمة> DATA_DIR=/data ADMIN_PASSWORD=<كلمة> TEACHER_PASSWORD=<كلمة>
railway volume add --mount-path /data
railway up
```

### Fly.io

```bash
fly launch --no-deploy
fly volumes create aminlab_data --size 5 --region cdg
fly secrets set APP_SECRET=<القيمة> ADMIN_PASSWORD=<كلمة> TEACHER_PASSWORD=<كلمة>
```

في `fly.toml` أضف:

```toml
[env]
  DATA_DIR = "/data"
  PORT = "3000"

[[mounts]]
  source = "aminlab_data"
  destination = "/data"

[http_service]
  internal_port = 3000
  force_https = true
```

ثم `fly deploy`.

### VPS (Ubuntu) + systemd

```bash
sudo useradd --system --home /opt/amin-lab --shell /usr/sbin/nologin aminlab
sudo mkdir -p /var/lib/amin-lab && sudo chown aminlab:aminlab /var/lib/amin-lab
```

`/etc/amin-lab.env` (صلاحيات `600` ومالكه `root`):

```ini
PORT=3000
DATA_DIR=/var/lib/amin-lab
APP_SECRET=<القيمة_العشوائية>
ADMIN_PASSWORD=<كلمة_قوية>
TEACHER_PASSWORD=<كلمة_قوية>
```

`/etc/systemd/system/amin-lab.service`:

```ini
[Unit]
Description=Amin-Lab -Pro🔬
After=network.target

[Service]
WorkingDirectory=/opt/amin-lab
ExecStart=/usr/bin/node server/dist/index.js
EnvironmentFile=/etc/amin-lab.env
Restart=always
User=aminlab

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now amin-lab
```

---

## 5) وكيل عكسي + HTTPS

```nginx
server {
  listen 443 ssl;
  server_name lab.example.edu;
  ssl_certificate     /etc/ssl/lab.crt;
  ssl_certificate_key /etc/ssl/lab.key;

  client_max_body_size 2m;
  add_header X-Content-Type-Options nosniff always;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

لا تنشر الخادم على الإنترنت بدون HTTPS: رمز الجلسة يُرسل في ترويسة `Authorization`.

---

## 6) بناء مثبت Windows

```cmd
installer\check-environment.cmd
installer\build-setup.cmd
installer\output\Amin-Lab-Genie-Setup-1.5.3.exe
```

المثبت ينسخ `server/dist` و`client/src` و`docs`، وينشئ `data` بصلاحيات كتابة،
ولا يحذف `data` عند إلغاء التثبيت.

---

## 7) الترقية

```bash
git pull            # أو فك حزمة جديدة فوق القديمة دون لمس data/
npm ci
npm run build
# أعد تشغيل الخدمة
```

المخطط يُنشأ بـ`CREATE TABLE IF NOT EXISTS`. أي تغيير مخطط لاحق يجب أن يُرفق
بـ`ALTER TABLE` داخل `server/src/db.ts` وبنسخة احتياطية قبل الترقية.

---

## 8) النسخ الاحتياطي والاستعادة

- تلقائي كل 24 ساعة في `$DATA_DIR/backups/` (يحتفظ بـ`BACKUP_RETENTION` نسخة، افتراضياً 14).
- يدوي: `npm run backup` — ينسخ القاعدة بأمان مع ملفات `-wal` و`-shm`.
- على استضافة: اجعل `/var/data` (أو حجم Fly/Railway) داخل نسخ المنصة الاحتياطية،
  أو انسخ `$DATA_DIR/backups/` دورياً إلى تخزين خارجي.
- استعادة: أوقف الخدمة، استبدل `amin-lab-genie.sqlite` بالنسخة، ثم شغّل.

---

## 9) التحقق بعد النشر

```bash
curl -s https://lab.example.edu/api/health
# {"ok":true,"app":"Amin-Lab -Pro🔬","version":"1.5.1","time":"..."}
```

سجّل الدخول بكلمة المرور التي ضبطتها في `ADMIN_PASSWORD` (أو من
`data/first-run-credentials.txt`)، ثم:

- أنشئ جلسة إعارة وأرجعها للتأكد من تحديث المخزون.
- تأكد أن `/api/inventory` يُرجع **403** بعد انتهاء التجربة (اختبار البوابة).
- افتح الإعدادات ← الترخيص وأدخل مفتاحاً للتأكد من التفعيل.

---

## 10) قائمة تحقق قبل النشر

- [ ] `APP_SECRET` عشوائي وطويل ومحفوظ في إعدادات المنصة فقط
- [ ] `ADMIN_PASSWORD` و`TEACHER_PASSWORD` قويتان، أو تم نقل الملف الأولي وحذفه
- [ ] `DATA_DIR` يشير إلى قرص دائم (لا نظام ملفات مؤقت)
- [ ] HTTPS مفعّل والمنفذ 3000 غير مكشوف مباشرة
- [ ] `data/backups` يعمل، والنسخ الاحتياطي خارجي
- [ ] صفحة الدخول لا تعرض أي بيانات اعتماد
- [ ] تجربة الطباعة A4 من متصفح حقيقي
- [ ] تفعيل الترخيص بعد انتهاء التجربة
