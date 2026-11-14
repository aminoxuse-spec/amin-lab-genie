# دليل النشر — Amin-Lab -cem🔬

## 1) المتطلبات

| العنصر | الحد الأدنى | الموصى به |
|--------|-------------|-----------|
| نظام التشغيل | Windows 10 / Ubuntu 20.04 | Windows 11 / Ubuntu 24.04 |
| Node.js | 22.18 (يحتاج `node:sqlite`) | 24 أو 26 |
| الذاكرة | 512 MB | 1 GB |
| التخزين | 200 MB | 1 GB (مع النسخ الاحتياطية) |
| Inno Setup 6 | لبناء مثبت Windows فقط | 6.3+ |

## 2) تشغيل محلي

```bash
npm install
npm start          # http://localhost:3000
```

الخادم يخدم الواجهة من `client/src` وواجهة API من `/api`. أول تشغيل يُنشئ
`data/amin-lab-genie.sqlite` مع الحسابات والبيانات الأولية.

## 3) النشر كخدمة

### Windows (NSSM أو Task Scheduler)
```cmd
nssm install AminLabGenie "C:\Program Files\nodejs\node.exe" "C:\Amin-Lab\server\dist\index.js"
nssm set AminLabGenie AppDirectory "C:\Amin-Lab"
nssm set AminLabGenie AppEnvironmentExtra PORT=3000 APP_SECRET=CHANGE_ME
nssm start AminLabGenie
```

### Linux (systemd)
```ini
# /etc/systemd/system/amin-lab-genie.service
[Unit]
Description=Amin-lab genie
After=network.target

[Service]
WorkingDirectory=/opt/amin-lab
ExecStart=/usr/bin/node server/dist/index.js
Environment=PORT=3000
Environment=APP_SECRET=CHANGE_ME
Restart=always
User=aminlab

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now amin-lab-genie
```

## 4) وكيل عكسي + HTTPS

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

## 5) بناء مثبت Windows

```cmd
installer\check-environment.cmd     :: فحص Node/npm/Inno/المنفذ
installer\build-setup.cmd           :: npm install + build + ISCC
installer\output\Amin-Lab-Genie-Setup-1.0.0.exe
```

المثبت ينسخ `server/dist` و`client/src` و`docs` إلى `C:\Program Files\Amin-Lab Genie`،
ينشئ مجلد `data` بصلاحيات كتابة، ويضيف اختصاراً + اختصار سطح مكتب اختياري.
**لا** يحذف `data` عند إلغاء التثبيت (حماية للبيانات).

## 6) الترقية

```bash
git pull            # أو فك حزمة جديدة فوق القديمة (دون data/)
npm install
npm run build
# أعد تشغيل الخدمة
```

المخطط يُنشأ بـ`CREATE TABLE IF NOT EXISTS`، لذا الترقيات الحالية آمنة. أي ترقية
ستغيّر مخططاً يجب أن تُرفق بسكربت `ALTER TABLE` داخل `server/src/db.ts` ونسخة احتياطية.

## 7) النسخ الاحتياطي والاستعادة

- تلقائي كل 24 ساعة في `data/backups/` (يحتفظ بـ`BACKUP_RETENTION` نسخة، افتراضياً 14).
- يدوي: `npm run backup` أو نسخ ملف `.sqlite` بعد إيقاف الخدمة.
- استعادة: أوقف الخدمة، استبدل `data/amin-lab-genie.sqlite` بالنسخة، ثم شغّل.

> عند النسخ الاحتياطي اليدوي أثناء التشغيل، انسخ أيضاً ملفي `-wal` و`-shm` أو استعمل `npm run backup`.

## 8) التحقق بعد النشر

```bash
curl -s http://localhost:3000/api/health
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}'
```

ثم افتح الواجهة، سجّل الدخول، وأنشئ جلسة إعارة تجريبية ثم أرجعها للتأكد من
تحديث المخزون.

## 9) قائمة تحقق قبل التسليم

- [ ] تغيير `admin123` و`teacher123`
- [ ] ضبط `APP_SECRET` بقيمة عشوائية طويلة
- [ ] تفعيل HTTPS
- [ ] التأكد من عمل `data/backups`
- [ ] تجربة الطباعة من المتصفح (A4)
- [ ] اختبار من جهاز آخر على الشبكة المحلية
- [ ] توثيق كلمة مرور الحساب الإداري في مكان آمن
