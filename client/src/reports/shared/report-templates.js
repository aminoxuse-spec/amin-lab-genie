/* أدوات مشتركة لبناء التقارير (يومي/أسبوعي) */
(function () {
  'use strict';

  function escape(value) {
    return App.escape(value);
  }

  var ReportKit = {
    header: function (options) {
      return (
        '<header class="report-head"><div>' +
        '<div class="report-brand">Amin-Lab -cem🔬</div>' +
        '<h1>' + escape(options.title) + '</h1>' +
        '<div class="muted">' + escape(options.subtitle || 'نظام إدارة مختبر العلوم') + '</div>' +
        '</div><div class="report-meta">' +
        '<div>الفترة: <strong>' + escape(options.period) + '</strong></div>' +
        '<div>أُنشئ في: ' + escape(new Date().toLocaleString('ar-MA')) + '</div>' +
        '<div>المستخدم: ' + escape((App.user || {}).full_name || '—') + '</div>' +
        '</div></header>'
      );
    },

    stats: function (items) {
      return (
        '<div class="report-stats">' +
        items
          .map(function (item) {
            return '<div class="report-stat"><span>' + escape(item.label) + '</span><strong>' + escape(item.value) + '</strong></div>';
          })
          .join('') +
        '</div>'
      );
    },

    table: function (headers, rows, emptyText) {
      if (!rows || rows.length === 0) {
        return '<div class="empty">' + escape(emptyText || 'لا توجد بيانات') + '</div>';
      }
      return (
        '<div class="table-wrap"><table><thead><tr>' +
        headers.map(function (header) { return '<th>' + escape(header) + '</th>'; }).join('') +
        '</tr></thead><tbody>' +
        rows
          .map(function (row) {
            return '<tr>' + row.map(function (cell) { return '<td>' + cell + '</td>'; }).join('') + '</tr>';
          })
          .join('') +
        '</tbody></table></div>'
      );
    },

    session: function (session) {
      var items = session.items && session.items.length
        ? ReportKit.table(
            ['الصنف', 'الرمز', 'معار', 'مُرجع', 'الحالة'],
            session.items.map(function (item) {
              return [
                escape(item.name),
                escape(item.code),
                item.quantity_out,
                item.quantity_returned,
                item.damaged === 1 ? '<span class="badge danger">تالف/مفقود</span>' : item.quantity_returned >= item.quantity_out ? '<span class="badge ok">سليم</span>' : '<span class="badge warn">معلّق</span>'
              ];
            }),
            'لا توجد أصناف'
          )
        : '<div class="empty">لم تُسجَّل أصناف في هذه الحصة</div>';

      return (
        '<article class="report-session"><header>' +
        '<div><strong>' + escape((session.level ? session.level + ' — ' : '') + session.class_name) + '</strong> — ' + escape(session.subject) + '</div>' +
        '<div class="muted">' + escape(session.start_time + ' - ' + session.end_time) + ' · ' +
        escape(session.teacher_name) + ' · ' + escape(session.room_name || 'بدون قاعة') + '</div>' +
        '<div>' + App.statusBadge(session.status) + '</div>' +
        '</header>' + items + '</article>'
      );
    },

    footer: function (note) {
      return '<footer class="report-footer"><span>' + escape(note || 'Amin-Lab -cem🔬 — تقرير آلي') + '</span><span>صفحة 1</span></footer>';
    }
  };

  window.ReportKit = ReportKit;
})();
