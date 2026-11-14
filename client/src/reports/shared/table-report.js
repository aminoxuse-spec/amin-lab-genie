(function () {
  'use strict';

  var type = document.body.dataset.report;
  if (!type) return;
  if (!App.mount('reports')) return;

  var host = document.getElementById('report');
  var fromInput = document.getElementById('from');
  var toInput = document.getElementById('to');

  function isoDaysAgo(days) {
    var date = new Date();
    date.setDate(date.getDate() - days);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  if (fromInput && !fromInput.value) fromInput.value = isoDaysAgo(30);
  if (toInput && !toInput.value) toInput.value = App.today();

  function query() {
    var params = [];
    if (fromInput && fromInput.value) params.push('from=' + encodeURIComponent(fromInput.value));
    if (toInput && toInput.value) params.push('to=' + encodeURIComponent(toInput.value));
    return params.length ? '?' + params.join('&') : '';
  }

  function filename(extension) {
    return 'amin-lab-' + type + '-' + (fromInput ? fromInput.value : '') + '_' + (toInput ? toInput.value : '') + '.' + extension;
  }

  function render(report) {
    var rows = report.rows.map(function (row) {
      return report.columns.map(function (column) {
        var value = row[column.key];
        if (column.numeric) return Number(value || 0);
        return App.escape(value === undefined || value === null || value === '' ? '—' : value);
      });
    });

    host.innerHTML =
      ReportKit.header({
        title: report.title,
        subtitle: 'قسم التقارير والإحصائيات',
        period: App.fmtDate(report.from) + ' ← ' + App.fmtDate(report.to)
      }) +
      '<section class="report-section"><h2>المؤشرات</h2>' +
      ReportKit.stats(report.summary) +
      '</section>' +
      '<section class="report-section"><h2>' + App.escape(report.title) + '</h2>' +
      ReportKit.table(report.columns.map(function (column) { return column.label; }), rows, 'لا توجد بيانات في هذه الفترة') +
      (report.note ? '<p class="muted" style="margin-top:.6rem">' + App.escape(report.note) + '</p>' : '') +
      '</section>' +
      ReportKit.footer('Amin-Lab -Pro🔬 — ' + report.title);

    App.decorateDocument(host, report.title);
  }

  function load() {
    host.innerHTML = '<div class="empty">جارٍ تحميل التقرير…</div>';
    App.api('/reports/' + type + query())
      .then(render)
      .catch(function (error) {
        host.innerHTML = '<div class="empty">' + App.escape(error.message) + '</div>';
      });
  }

  if (fromInput) fromInput.addEventListener('change', load);
  if (toInput) toInput.addEventListener('change', load);

  var printBtn = document.getElementById('printBtn');
  if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

  var csvBtn = document.getElementById('csvBtn');
  if (csvBtn) {
    csvBtn.addEventListener('click', function () {
      App.download('/reports/' + type + '.csv' + query(), filename('csv'))
        .catch(function (error) { App.toast(error.message, 'error'); });
    });
  }

  var xlsBtn = document.getElementById('xlsBtn');
  if (xlsBtn) {
    xlsBtn.addEventListener('click', function () {
      App.download('/reports/' + type + '.xls' + query(), filename('xls'))
        .catch(function (error) { App.toast(error.message, 'error'); });
    });
  }

  load();
})();
