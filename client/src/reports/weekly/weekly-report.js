(function () {
  'use strict';
  if (!App.mount('reports')) return;

  var reportHost = document.getElementById('report');
  var startInput = document.getElementById('start');

  var now = new Date();
  now.setDate(now.getDate() - 6);
  startInput.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  var DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  function chart(days) {
    var max = Math.max.apply(null, days.map(function (day) { return Math.max(day.unitsOut, 1); }));
    return (
      '<div class="day-chart">' +
      days
        .map(function (day) {
          var outHeight = Math.round((day.unitsOut / max) * 120);
          var returnHeight = Math.round((day.unitsReturned / max) * 120);
          var weekday = DAY_NAMES[new Date(day.date + 'T00:00:00').getDay()];
          return (
            '<div class="day" title="' + day.date + '">' +
            '<div class="day-bars">' +
            '<b style="height:' + Math.max(2, outHeight) + 'px"></b>' +
            '<b class="returned" style="height:' + Math.max(2, returnHeight) + 'px"></b>' +
            '</div><span>' + weekday + '</span><span>' + day.date.slice(5) + '</span></div>'
          );
        })
        .join('') +
      '</div>' +
      '<div class="legend" style="display:flex;gap:1rem;font-size:.75rem;color:#64748b;margin-top:.5rem">' +
      '<span><i style="display:inline-block;width:10px;height:10px;background:#0f766e;border-radius:3px;margin-inline-end:.3rem"></i>معار</span>' +
      '<span><i style="display:inline-block;width:10px;height:10px;background:#94a3b8;border-radius:3px;margin-inline-end:.3rem"></i>مُرجع</span></div>'
    );
  }

  function render(data) {
    var topItems = data.topItems.length
      ? '<div class="weekly-top">' +
        data.topItems
          .map(function (item, index) {
            return '<div class="top-item"><span>' + (index + 1) + '. ' + App.escape(item.name) + '</span><b>' + item.quantity + '</b></div>';
          })
          .join('') +
        '</div>'
      : '<div class="empty">لا توجد أصناف معارة خلال هذه الفترة</div>';

    var sessionsTable = ReportKit.table(
      ['التاريخ', 'القسم', 'المادة', 'الأستاذ', 'معار', 'مُرجع', 'الحالة'],
      data.sessions.map(function (session) {
        return [
          App.fmtDate(session.session_date),
          App.escape(session.class_name),
          App.escape(session.subject),
          App.escape(session.teacher_name),
          session.units_out,
          session.units_returned,
          App.statusBadge(session.status)
        ];
      }),
      'لا توجد حصص في هذه الفترة'
    );

    reportHost.innerHTML =
      ReportKit.header({
        title: 'التقرير الأسبوعي لنشاط المختبر',
        subtitle: 'الحركة اليومية واستهلاك الأصناف',
        period: App.fmtDate(data.start) + ' ← ' + App.fmtDate(data.end)
      }) +
      '<section class="report-section"><h2>المؤشرات العامة</h2>' +
      ReportKit.stats([
        { label: 'عدد الحصص', value: data.totals.sessions },
        { label: 'وحدات معارة', value: data.totals.unitsOut },
        { label: 'وحدات مُرجعة', value: data.totals.unitsReturned },
        { label: 'مواد مستهلكة', value: data.totals.consumed },
        { label: 'وحدات معلّقة', value: data.totals.unitsOut - data.totals.unitsReturned },
        { label: 'أصناف متضررة', value: data.totals.damaged }
      ]) +
      '</section>' +
      '<section class="report-section"><h2>الحركة اليومية</h2>' + chart(data.days) + '</section>' +
      '<section class="report-section"><h2>أكثر الأصناف استعمالاً</h2>' + topItems + '</section>' +
      '<section class="report-section"><h2>تفصيل الحصص</h2>' + sessionsTable + '</section>' +
      ReportKit.footer('تقرير أسبوعي — ' + data.start + ' / ' + data.end);

    App.decorateDocument(reportHost, 'التقرير الأسبوعي');
  }

  function load() {
    reportHost.innerHTML = '<div class="empty">جارٍ تحميل التقرير…</div>';
    App.api('/reports/weekly?start=' + encodeURIComponent(startInput.value))
      .then(render)
      .catch(function (error) {
        reportHost.innerHTML = '<div class="empty">' + App.escape(error.message) + '</div>';
      });
  }

  startInput.addEventListener('change', load);
  document.getElementById('printBtn').addEventListener('click', function () { window.print(); });
  document.getElementById('csvBtn').addEventListener('click', function () {
    App.downloadCsv('/reports/weekly.csv?start=' + encodeURIComponent(startInput.value), 'amin-lab-weekly-' + startInput.value + '.csv')
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  document.getElementById('xlsBtn').addEventListener('click', function () {
    App.download('/reports/weekly.xls?start=' + encodeURIComponent(startInput.value), 'amin-lab-weekly-' + startInput.value + '.xls')
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  load();
})();
