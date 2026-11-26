(function () {
        if (!App.isAdmin()) return;
        var card = document.getElementById('clientUpdateCard');
        if (!card) return;
        card.hidden = false;
        var badge = document.getElementById('clientUpdateBadge');
        var info = document.getElementById('clientUpdateInfo');

        function refresh() {
          App.api('/app/client-update')
            .then(function (data) {
              badge.textContent = data.applied ? 'طبقة تحديث ' + data.version : 'النسخة المثبّتة';
              info.textContent = data.applied ? 'مطبّق: ' + data.version + ' · ' + data.files.length + ' ملف' : '';
            })
            .catch(function () { badge.textContent = '—'; });
        }

        document.getElementById('clientUpdateBtn').addEventListener('click', function () {
          var input = document.getElementById('clientBundleFile');
          var file = input.files && input.files[0];
          if (!file) { App.toast('اختر ملف client-bundle.json', 'error'); return; }
          file.text()
            .then(function (text) {
              var bundle = JSON.parse(text);
              if (!bundle.version || !Array.isArray(bundle.files)) throw new Error('حزمة غير صالحة');
              return App.api('/app/client-update', { method: 'POST', body: { version: bundle.version, files: bundle.files } });
            })
            .then(function (res) {
              App.toast('تم تطبيق تحديث الواجهة (' + res.files + ' ملف)', 'ok');
              info.textContent = 'أُعيد تحميل الصفحة…';
              setTimeout(function () { location.reload(); }, 1200);
            })
            .catch(function (error) { App.toast(error.message, 'error'); });
        });

        document.getElementById('clientUpdateReset').addEventListener('click', function () {
          if (!confirm('حذف طبقة التحديث والعودة إلى الواجهة المثبّتة؟')) return;
          App.api('/app/client-update', { method: 'DELETE' })
            .then(function () { App.toast('أُزيلت طبقة التحديث', 'ok'); refresh(); })
            .catch(function (error) { App.toast(error.message, 'error'); });
        });

        refresh();
      })();
