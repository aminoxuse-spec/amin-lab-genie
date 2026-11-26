(function () {
        if (!App.mount('reports')) return;

        Promise.all([App.api('/inventory/summary'), App.api('/reports/late'), App.api('/reports/daily')])
          .then(function (results) {
            var summary = results[0].summary;
            var late = results[1];
            var today = results[2];
            document.getElementById('stats').innerHTML =
              '<div class="stat"><span>أصناف الجرد</span><strong>' + summary.total + '</strong></div>' +
              '<div class="stat ' + (today.totals.openSessions ? 'warn' : 'ok') + '"><span>إعارات غير مكتملة</span><strong>' + today.totals.openSessions + '</strong></div>' +
              '<div class="stat ' + (late.rows.length ? 'danger' : 'ok') + '"><span>إعارات متأخرة</span><strong>' + late.rows.length + '</strong></div>' +
              '<div class="stat"><span>وحدات لم تُرجع</span><strong>' + late.summary[1].value + '</strong></div>';
          })
          .catch(function (error) { App.toast(error.message, 'error'); });

        App.api('/reports/coverage?weeks=8')
          .then(function (data) {
            var badge = document.getElementById('coverageBadge');
            badge.textContent = data.summary.coverage + '% · ' + data.summary.covered + '/' + data.summary.weeks + ' أسبوع';
            badge.className = 'badge ' + (data.summary.missing ? 'warn' : 'ok');
            var rows = data.weeks.map(function (week) {
              var ok = week.sessions > 0;
              return '<tr><td>' + week.start + ' → ' + week.end + '</td>' +
                '<td>' + (week.report_no || '—') + '</td>' +
                '<td>' + week.sessions + '</td><td>' + week.teachers + '</td>' +
                '<td>' + week.units + '</td><td>' + week.consumed + '</td>' +
                '<td><span class="badge ' + (ok ? 'ok' : 'danger') + '">' + (ok ? 'مغطى' : 'ناقص') + '</span></td></tr>';
            }).join('');
            document.getElementById('coverageBody').innerHTML =
              '<div class="table-wrap"><table><thead><tr><th>الأسبوع</th><th>رقم التقرير</th><th>الإعارات</th><th>الأساتذة</th><th>وحدات</th><th>مستهلك</th><th>الحالة</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
          })
          .catch(function (error) { App.toast(error.message, 'error'); });
      })();
