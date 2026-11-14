(function () {
  'use strict';
  if (!App.mount('reports')) return;

  var reportHost = document.getElementById('report');
  var dateInput = document.getElementById('date');
  dateInput.value = App.today();

  function alertsBlock(alerts) {
    var cards = [];
    alerts.lowStock.forEach(function (item) {
      cards.push(
        '<div class="daily-alert"><strong>' + App.escape(item.name) + '</strong>' +
        '<small>المتوفر ' + item.available_quantity + ' — الحد الأدنى ' + item.min_quantity + '</small></div>'
      );
    });
    alerts.expiring.forEach(function (item) {
      cards.push(
        '<div class="daily-alert danger"><strong>' + App.escape(item.name) + '</strong>' +
        '<small>تنتهي الصلاحية في ' + App.fmtDate(item.expiry_date) + '</small></div>'
      );
    });
    return cards.length ? '<div class="daily-alerts">' + cards.join('') + '</div>' : '<div class="empty">لا توجد تنبيهات</div>';
  }

  function render(data) {
    var sessionBlocks = data.sessions.length
      ? data.sessions.map(ReportKit.session).join('')
      : '<div class="empty">لا توجد حصص مسجلة في هذا التاريخ</div>';

    reportHost.innerHTML =
      ReportKit.header({
        title: 'التقرير اليومي لنشاط المختبر',
        subtitle: 'الجرد · الإعارة · فحص الجودة',
        period: App.fmtDate(data.date)
      }) +
      '<section class="report-section"><h2>المؤشرات العامة</h2>' +
      ReportKit.stats([
        { label: 'عدد الحصص', value: data.totals.sessions },
        { label: 'الأصناف المعارة', value: data.totals.items },
        { label: 'وحدات معارة', value: data.totals.unitsOut },
        { label: 'وحدات مُرجعة', value: data.totals.unitsReturned },
        { label: 'مواد مستهلكة', value: data.totals.consumed },
        { label: 'وحدات معلّقة', value: data.totals.outstanding },
        { label: 'أصناف جرد', value: data.inventory.total }
      ]) +
      '</section>' +
      '<section class="report-section"><h2>تفاصيل الحصص</h2>' + sessionBlocks + '</section>' +
      '<section class="report-section"><h2>تنبيهات المخزون</h2>' + alertsBlock(data.alerts) + '</section>' +
      ReportKit.footer('تقرير يومي — ' + data.date);

    App.decorateDocument(reportHost, 'التقرير اليومي');
  }

  function load() {
    reportHost.innerHTML = '<div class="empty">جارٍ تحميل التقرير…</div>';
    App.api('/reports/daily?date=' + encodeURIComponent(dateInput.value))
      .then(render)
      .catch(function (error) {
        reportHost.innerHTML = '<div class="empty">' + App.escape(error.message) + '</div>';
      });
  }

  dateInput.addEventListener('change', load);

  document.getElementById('printBtn').addEventListener('click', function () {
    window.print();
  });

  document.getElementById('csvBtn').addEventListener('click', function () {
    App.downloadCsv('/reports/daily.csv?date=' + encodeURIComponent(dateInput.value), 'amin-lab-daily-' + dateInput.value + '.csv')
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  document.getElementById('xlsBtn').addEventListener('click', function () {
    App.download('/reports/daily.xls?date=' + encodeURIComponent(dateInput.value), 'amin-lab-daily-' + dateInput.value + '.xls')
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  load();
})();
