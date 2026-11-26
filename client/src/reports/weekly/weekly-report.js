(function () {
  'use strict';
  if (!App.mount('reports')) return;

  var reportHost = document.getElementById('report');
  var analyticsHost = document.getElementById('weeklyAnalytics');
  var startInput = document.getElementById('start');
  var endInput = document.getElementById('end');
  var directorateInput = document.getElementById('hdrDirectorate');
  var schoolInput = document.getElementById('hdrSchool');
  var hint = document.getElementById('weeklyHint');
  var HEADER_KEY = 'amin.weekly.header';

  function addDays(iso, days) {
    var value = new Date(iso + 'T00:00:00');
    value.setDate(value.getDate() + days);
    return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  var now = new Date();
  now.setDate(now.getDate() - 6);
  startInput.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  endInput.value = addDays(startInput.value, 6);

  var DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  /* ------------------------- تنسيق الحقول ------------------------- */

  /** تاريخ رسمي dd/mm/yyyy كما في التقرير الورقي. */
  function shortDate(iso) {
    var match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return match ? match[3] + '/' + match[2] + '/' + match[1] : String(iso || '—');
  }

  function schoolYearOf(iso) {
    var year = Number(String(iso || '').slice(0, 4)) || new Date().getFullYear();
    var month = Number(String(iso || '').slice(5, 7)) || (new Date().getMonth() + 1);
    return month >= 9 ? year + '/' + (year + 1) : year - 1 + '/' + year;
  }

  /** "8سا" أو "8سا30" بدل 08:00. */
  function timeLabel(value) {
    var match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
    if (!match) return String(value || '—');
    var minutes = Number(match[2]);
    return Number(match[1]) + 'سا' + (minutes ? match[2] : '');
  }

  function timeRange(session) {
    if (!session.start_time) return '—';
    if (!session.end_time || session.end_time === session.start_time) return timeLabel(session.start_time);
    return timeLabel(session.start_time) + ' —— ' + timeLabel(session.end_time);
  }

  /** اختصار المادة كما في الجدول الورقي: ع.ف / ع.ط. */
  function subjectLabel(subject) {
    var text = String(subject || '').trim();
    if (/فيزيائ|فزيائ/.test(text)) return 'ع.ف';
    if (/طبيعي/.test(text)) return 'ع.ط';
    return text || '—';
  }

  function teacherLabel(name) {
    return String(name || '').replace(/^الأستاذ(ة)?\s+/, '').trim() || '—';
  }

  function itemName(item) {
    return item.name_ar || item.name || item.code || '—';
  }

  /** "5 أنبوب اختبار – ماصة – دورق" كما في التقرير الورقي. */
  function itemsLabel(session) {
    var items = session.items || [];
    if (items.length) {
      return items
        .map(function (item) {
          var quantity = Number(item.quantity_out) || 0;
          return (quantity > 1 ? quantity + ' ' : '') + itemName(item);
        })
        .join(' – ');
    }
    var note = String(session.notes || '').replace(/^\[تقرير[^\]]*\]\s*/, '').trim();
    return note || '—';
  }

  function conditionText(item, side) {
    if (side === 'in') {
      if (item.condition_out === 'consumed') return '';
      if (item.damaged === 1) return 'تالفة/مفقودة';
      if (item.condition_in === 'good') return 'جيدة';
      if (item.condition_in === 'damaged') return 'تالفة';
      if (item.condition_in === 'missing') return 'مفقودة';
      if (Number(item.quantity_returned) > 0) return 'جيدة';
      return 'لم تُرجع';
    }
    if (item.condition_out === 'consumed') return 'مستهلكة';
    if (item.condition_out === 'damaged') return 'تالفة';
    if (item.condition_out === 'missing') return 'مفقودة';
    return 'جيدة';
  }

  function conditionsLabel(session, side) {
    var items = session.items || [];
    if (!items.length) return '—';
    var labels = [];
    items.forEach(function (item) {
      var label = conditionText(item, side);
      if (label && labels.indexOf(label) === -1) labels.push(label);
    });
    return labels.length ? labels.join(' / ') : '—';
  }

  function sortedSessions(sessions) {
    return sessions.slice().sort(function (a, b) {
      return (a.session_date + ' ' + a.start_time).localeCompare(b.session_date + ' ' + b.start_time);
    });
  }

  /** رقم التقرير المأخوذ من الحصص المستوردة (مثل 06). */
  function reportNumber(sessions) {
    var values = sessions
      .map(function (session) { return String(session.report_no || '').trim(); })
      .filter(Boolean);
    if (!values.length) return '';
    var value = values[values.length - 1];
    return /^\d$/.test(value) ? '0' + value : value;
  }

  /* ------------------------- الجدول الرسمي ------------------------- */

  function officialTable(sessions) {
    if (!sessions.length) {
      return '<p class="weekly-empty">لا توجد إعارات مسجلة في هذه الفترة.</p>';
    }
    var rows = sessions
      .map(function (session) {
        return (
          '<tr>' +
          '<td class="weekly-subject">' + App.escape(subjectLabel(session.subject)) + '</td>' +
          '<td class="weekly-time">' + shortDate(session.session_date) +
          '<small>' + App.escape(timeRange(session)) + '</small></td>' +
          '<td class="weekly-items">' + App.escape(itemsLabel(session)) + '</td>' +
          '<td>' + App.escape(teacherLabel(session.teacher_name)) + '</td>' +
          '<td>' + App.escape(conditionsLabel(session, 'out')) + '</td>' +
          '<td>' + App.escape(conditionsLabel(session, 'in')) + '</td>' +
          '</tr>'
        );
      })
      .join('');

    return (
      '<table class="weekly-table">' +
      '<colgroup><col class="u-width-8" /><col class="u-width-15" /><col class="u-width-35" />' +
      '<col class="u-width-12" /><col class="u-width-15" /><col class="u-width-15" /></colgroup>' +
      '<thead><tr>' +
      '<th>المادة</th><th>التوقيت</th><th>الوسائل المستعملة</th><th>الأستاذ</th>' +
      '<th>حالة الوسائل عند أخذها</th><th>حالة الوسائل عند إرجاعها</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>'
    );
  }

  /* ----------------------- الترويسة والتوقيعات ---------------------- */

  function signaturesHtml() {
    var inst = App.institution || {};
    var signature = inst.signature || {};
    var blocks = [
      { name: signature.lab, title: 'ملحق رئيس بالمخبر' },
      { name: signature.counselor, title: 'مستشار التربية' },
      { name: signature.director, title: 'المدير' }
    ];
    return (
      '<footer class="weekly-signatures">' +
      blocks
        .map(function (block) {
          return (
            '<div><span class="weekly-sign-line"></span>' +
            '<strong>' + App.escape(block.name || '\u00a0') + '</strong>' +
            '<small>' + App.escape(block.title) + '</small></div>'
          );
        })
        .join('') +
      '</footer>'
    );
  }

  function officialSheet(data, sessions) {
    var inst = App.institution || {};
    var directorate = (directorateInput.value || '').trim();
    var school = (schoolInput.value || '').trim();
    var schoolYear = String(inst.school_year || '').trim() || schoolYearOf(data.start);
    var number = reportNumber(sessions);
    var periodEnd = endInput.value || data.end;

    return (
      '<header class="weekly-official-head">' +
      '<p class="weekly-directorate" id="weeklyDirectorate">' +
      (directorate ? App.escape(directorate) : '&nbsp;') + '</p>' +
      '<p class="weekly-school" id="weeklySchool">' +
      (school ? App.escape(school) : '&nbsp;') + '</p>' +
      '<p class="weekly-number">الرقم « ' + App.escape(number || '.....') + ' ..... ' +
      App.escape(schoolYear) + '</p>' +
      '<h1 class="weekly-title">التقرير الأسبوعي للمخبر</h1>' +
      '<p class="weekly-period">من ' + shortDate(data.start) + ' إلى ' + shortDate(periodEnd) + '</p>' +
      '</header>' +
      officialTable(sessions) +
      '<div class="weekly-notes"><span>الملاحظات:</span><span class="weekly-dots"></span></div>' +
      signaturesHtml()
    );
  }

  /* -------------------- التحليل (شاشة فقط، لا يُطبع) ------------------- */

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
            '<b data-h="' + Math.max(2, outHeight) + '"></b>' +
            '<b class="returned" data-h="' + Math.max(2, returnHeight) + '"></b>' +
            '</div><span>' + weekday + '</span><span>' + day.date.slice(5) + '</span></div>'
          );
        })
        .join('') +
      '</div>' +
      '<div class="legend u-display-flex-gap-1rem-font-size-75rem-color-64748b-margin-to">' +
      '<span><i class="u-display-inline-block-width-10px-height-10px-background-0f766"></i>معار</span>' +
      '<span><i class="u-display-inline-block-width-10px-height-10px-background-94a3b"></i>مُرجع</span></div>'
    );
  }

  function analytics(data) {
    var topItems = data.topItems.length
      ? '<div class="weekly-top">' +
        data.topItems
          .map(function (item, index) {
            return '<div class="top-item"><span>' + (index + 1) + '. ' + App.escape(item.name) + '</span><b>' + item.quantity + '</b></div>';
          })
          .join('') +
        '</div>'
      : '<div class="empty">لا توجد أصناف معارة خلال هذه الفترة</div>';

    return (
      '<details class="weekly-analytics-box">' +
      '<summary>تحليل الأسبوع (لا يُطبع)</summary>' +
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
      '</details>'
    );
  }

  /* ---------------------- ترويسة قابلة للتحرير --------------------- */

  function loadStoredHeader() {
    var stored = {};
    try {
      stored = JSON.parse(localStorage.getItem(HEADER_KEY) || '{}') || {};
    } catch (error) {
      stored = {};
    }
    if (!directorateInput.value) directorateInput.value = stored.directorate || '';
    if (!schoolInput.value) {
      schoolInput.value = stored.school || (App.institution && App.institution.name) || '';
    }
    updateHeaderText();
  }

  function updateHeaderText() {
    var directorate = (directorateInput.value || '').trim();
    var school = (schoolInput.value || '').trim();
    try {
      localStorage.setItem(HEADER_KEY, JSON.stringify({ directorate: directorate, school: school }));
    } catch (error) {
      /* التخزين غير متاح — تبقى القيم للجلسة */
    }
    var directorateNode = document.getElementById('weeklyDirectorate');
    var schoolNode = document.getElementById('weeklySchool');
    if (directorateNode) directorateNode.textContent = directorate || '\u00a0';
    if (schoolNode) schoolNode.textContent = school || '\u00a0';
    if (hint) hint.hidden = Boolean(directorate && school);
  }

  /* ---------------------------- التحميل ---------------------------- */

  function render(data) {
    var periodEnd = endInput.value || data.end;
    var sessions = sortedSessions(data.sessions || []).filter(function (session) {
      return !periodEnd || session.session_date <= periodEnd;
    });
    reportHost.className = 'report-sheet weekly-official';
    reportHost.innerHTML = officialSheet(data, sessions);
    analyticsHost.innerHTML = analytics(data);
    reportHost.querySelectorAll('[data-h]').forEach(function (el) { el.style.height = el.dataset.h + 'px'; });
    if (analyticsHost) analyticsHost.querySelectorAll('[data-h]').forEach(function (el) { el.style.height = el.dataset.h + 'px'; });
    analyticsHost.hidden = false;
  }

  function load() {
    var weekStart = startInput.value;
    if (!endInput.value) endInput.value = addDays(weekStart, 6);
    reportHost.className = 'report-sheet';
    reportHost.innerHTML = '<div class="empty">جارٍ تحميل التقرير…</div>';
    analyticsHost.hidden = true;
    App.loadInstitution()
      .then(function () {
        loadStoredHeader();
        return App.api('/reports/weekly?start=' + encodeURIComponent(weekStart));
      })
      .then(render)
      .catch(function (error) {
        reportHost.innerHTML = '<div class="empty">' + App.escape(error.message) + '</div>';
      });
  }

  /** نهاية الأسبوع لا تتجاوز سبعة أيام ولا تسبق البداية. */
  function clampEnd() {
    var maximum = addDays(startInput.value, 6);
    if (!endInput.value) endInput.value = maximum;
    if (endInput.value < startInput.value) endInput.value = startInput.value;
    if (endInput.value > maximum) endInput.value = maximum;
  }

  startInput.addEventListener('change', function () {
    endInput.value = addDays(startInput.value, 6);
    load();
  });
  endInput.addEventListener('change', function () {
    clampEnd();
    load();
  });
  directorateInput.addEventListener('input', updateHeaderText);
  schoolInput.addEventListener('input', updateHeaderText);

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
