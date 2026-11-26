(function () {
        if (!App.mount('reports')) return;

        var textEl = document.getElementById('reportText');
        var noEl = document.getElementById('reportNo');
        var resultCard = document.getElementById('resultCard');
        var resultBadge = document.getElementById('resultBadge');
        var resultBody = document.getElementById('resultBody');

        function run(dryRun) {
          var text = textEl.value.trim();
          if (!text) {
            App.toast('الصق جدول التقرير أولاً', 'error');
            return;
          }
          resultCard.hidden = false;
          resultBody.innerHTML = '<div class="empty">جارٍ التحليل…</div>';
          App.api('/import/weekly', { method: 'POST', body: { text: text, report_no: noEl.value.trim(), dryRun: dryRun } })
            .then(render)
            .catch(function (error) {
              resultBody.innerHTML = '<div class="empty">' + error.message + '</div>';
              App.toast(error.message, 'error');
            });
        }

        function render(data) {
          resultBadge.textContent = data.dryRun
            ? data.sessions.length + ' جلسة جاهزة (معاينة)'
            : 'أُضيفت ' + data.inserted + ' جلسة · ' + data.lines + ' سطر صنف';
          resultBadge.className = 'badge ' + (data.sessions.length ? 'ok' : 'warn');

          var html = '';
          if (data.sessions.length) {
            html += '<div class="table-wrap"><table><thead><tr><th>التاريخ</th><th>من</th><th>إلى</th><th>الأستاذ</th><th>القسم</th><th>المستوى</th><th>أسطر</th><th>وحدات</th><th>الحالة</th></tr></thead><tbody>';
            data.sessions.forEach(function (session) {
              html += '<tr><td>' + session.date + '</td><td>' + session.start + '</td><td>' + session.end + '</td>' +
                '<td>' + session.teacher + '</td><td>' + session.className + '</td><td>' + (session.level || '—') + '</td>' +
                '<td>' + session.items + '</td><td>' + session.units + '</td>' +
                '<td><span class="badge ' + (session.duplicate ? 'warn' : 'ok') + '">' + (session.duplicate ? 'موجودة مسبقاً' : 'جديدة') + '</span></td></tr>';
            });
            html += '</tbody></table></div>';
          }
          if (data.unresolvedItems.length) {
            html += '<p class="muted u-margin-top-6rem"><strong>وسائل بلا صنف في الجرد:</strong> ' + data.unresolvedItems.join(' · ') + '</p>';
          }
          if (data.skipped.length) {
            html += '<p class="muted"><strong>سطور متجاهلة:</strong> ' +
              data.skipped.map(function (row) { return (row.date || '—') + ' ' + (row.teacher || '—') + ' (' + row.reason + ')'; }).join(' · ') + '</p>';
          }
          if (!data.sessions.length) html += '<div class="empty">لم يُقرأ أي جلسة صالحة من النص.</div>';
          resultBody.innerHTML = html;
          if (!data.dryRun && data.inserted) {
            App.toast('تم استيراد ' + data.inserted + ' جلسة', 'ok');
            textEl.value = '';
          }
        }

        document.getElementById('checkBtn').addEventListener('click', function () { run(true); });
        document.getElementById('importBtn').addEventListener('click', function () { run(false); });
        document.getElementById('clearBtn').addEventListener('click', function () {
          textEl.value = '';
          resultCard.hidden = true;
        });
      })();
