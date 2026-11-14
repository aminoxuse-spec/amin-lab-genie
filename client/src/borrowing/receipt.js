(function () {
  'use strict';
  if (!App.mount('borrowing')) return;

  var params = new URLSearchParams(location.search);
  var id = Number(params.get('id'));
  var host = document.getElementById('receipt');

  document.getElementById('printBtn').addEventListener('click', function () { window.print(); });

  if (!id) {
    host.innerHTML = '<div class="empty">رقم الجلسة غير محدد</div>';
    return;
  }

  App.api('/borrowing/' + id + '/receipt')
    .then(function (data) {
      var session = data.session;
      var totals = data.totals;

      var lines =
        session.items.length === 0
          ? '<div class="empty">لا توجد عناصر مسجلة</div>'
          : ReportKit.table(
              ['#', 'العنصر', 'الرمز', 'الكمية', 'الحالة', 'المُرجع', 'ملاحظات'],
              session.items.map(function (item, index) {
                var condition =
                  item.condition_out === 'consumed'
                    ? '<span class="badge warn">مستهلك</span>'
                    : item.condition_out === 'damaged'
                      ? '<span class="badge danger">تالف مسبقاً</span>'
                      : '<span class="badge ok">صالح</span>';
                return [
                  index + 1,
                  App.escape(item.name),
                  App.escape(item.code),
                  item.quantity_out + ' ' + App.escape(item.unit),
                  condition,
                  item.quantity_returned,
                  App.escape(item.notes || '—')
                ];
              }),
              'لا توجد عناصر'
            );

      host.innerHTML =
        ReportKit.header({
          title: 'وصل إعارة رقم #' + session.id,
          subtitle: 'مختبر العلوم',
          period: App.fmtDate(session.session_date)
        }) +
        '<section class="report-section">' +
        '<div class="receipt-info">' +
        '<div><span>الأستاذ</span>' + App.escape(session.teacher_name) + '</div>' +
        '<div><span>المادة الدراسية</span>' + App.escape(session.subject) + '</div>' +
        '<div><span>المستوى</span>' + App.escape(session.level || '—') + '</div>' +
        '<div><span>القسم</span>' + App.escape(session.class_name) + '</div>' +
        '<div><span>تاريخ الإعارة</span>' + App.fmtDate(session.session_date) + '</div>' +
        '<div><span>ساعة الإعارة</span>' + session.start_time + ' - ' + session.end_time + '</div>' +
        '<div><span>القاعة</span>' + App.escape(session.room_name || '—') + '</div>' +
        '<div><span>الحالة</span>' + App.statusLabel(session.status) + '</div>' +
        '</div>' +
        lines +
        '</section>' +
        '<section class="report-section">' +
        ReportKit.stats([
          { label: 'عدد العناصر', value: totals.lines },
          { label: 'إجمالي الوحدات', value: totals.units },
          { label: 'المستهلك', value: totals.consumed },
          { label: 'المُرجع', value: totals.returned },
          { label: 'المتبقي', value: totals.outstanding }
        ]) +
        '</section>' +
        (session.notes ? '<p class="muted">ملاحظات: ' + App.escape(session.notes) + '</p>' : '') +
        '<div class="receipt-sign"><div>توقيع الأستاذ</div><div>توقيع مسؤول المختبر</div></div>' +
        ReportKit.footer('وصل إعارة — Amin-Lab -cem🔬');

      App.decorateDocument(host, 'وصل إعارة').then(function () {
        if (params.get('print') === '1') {
          setTimeout(function () { window.print(); }, 350);
        }
      });
    })
    .catch(function (error) {
      host.innerHTML = '<div class="empty">' + App.escape(error.message) + '</div>';
    });
})();
