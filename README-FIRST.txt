Amin-Lab -Pro — حزمة البيع | Pack de vente | Sale pack
======================================================

1) ابدأ من هنا / Commencez ici / Start here
   - Windows 10/11 (64-bit) فقط — لا حاجة لتثبيت Node.js (مضمّن)
   - الأفضل: شغّل installer\output\Amin-Lab-Genie-Setup-1.5.2.exe
     (يثبّت كل شيء ويعمل بدون إنترنت)
   - بديل بدون تثبيت: انقر مزدوجاً على:  installer\launch.cmd
     (يشغّل التطبيق ثم يفتح http://localhost:3000)
   - تحقق من سلامة التثبيت:  installer\verify-install.cmd
     Vérification rapide de l'installation / Quick install check
   - أول دخول: كلمة مرور admin موجودة في  data\first-run-credentials.txt
   - الدليل الكامل المصوّر:  SETUP-GUIDE-AR-FR-EN.pdf

2) إنشاء مثبت Setup.exe (للمطوّر فقط)
   - ثبّت Inno Setup 6 (jrsoftware.org/isdl.php)
   - شغّل:  installer\build-setup.cmd
   - الناتج: installer\output\Amin-Lab-Genie-Setup-1.5.2.exe
             installer\output\Amin-Lab-Genie-Sale-Setup-1.5.2.exe
   - بعد البناء شغّل:  installer\verify-install.cmd  قبل التوزيع

3) محتوى الحزمة / Contenu / Contents
   client\  server\      واجهة التطبيق وخادمه
   runtime\              Node.js مضمّن (لا يحتاج تثبيتاً على الجهاز)
   node_modules\         تبعيات الإنتاج مضمّنة (تشغيل بدون إنترنت)
   installer\            مشغّل Windows + سكربت Inno Setup
   docs\                 التوثيق وسجل التغييرات
   data\                 تُنشأ عند أول تشغيل (قاعدة البيانات + النسخ الاحتياطية)

4) الدعم / Support
   aminhadjadj13@gmail.com   ·   +213 558 128 160
