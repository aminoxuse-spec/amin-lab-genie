(function () {
  'use strict';
  if (!App.mount('schedule')) return;

  var DAYS = [
    { value: 1, label: 'الاثنين' },
    { value: 2, label: 'الثلاثاء' },
    { value: 3, label: 'الأربعاء' },
    { value: 4, label: 'الخميس' },
    { value: 5, label: 'الجمعة' },
    { value: 6, label: 'السبت' },
    { value: 0, label: 'الأحد' }
  ];
  var STATUS_LABELS = { scheduled: 'مبرمجة', done: 'منجزة', cancelled: 'ملغاة' };
  var START_HOUR = 8;
  var END_HOUR = 18;
  var PX_PER_HOUR = 72;

  var calendar = document.getElementById('calendar');
  var calendarList = document.getElementById('calendarList');
  var roomTabs = document.getElementById('roomTabs');
  var lessons = [];
  var roomsCache = [];
  var teachersCache = [];
  var weekOffset = 0;
  var selectedLab = 'physics';
  var selectedTeacher = null; // null = كل الأساتذة
  var scheduleImportState = { valid: [], invalid: [] };
  var LAB_TABS = [
    { id: 'physics', name: 'مخبر العلوم الفيزيائية' },
    { id: 'physics2', name: 'مخبر العلوم الفزيائية 2' },
    { id: 'natural', name: 'مخبر العلوم الطبيعية' },
    { id: 'natural2', name: 'مخبر العلوم الطبيعية 2' }
  ];
  var AR_MONTHS = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  // ألوان ثابتة لكل أستاذ (حسب المعرّف) لتمييز الحصص بصرياً
  var TEACHER_COLORS = [
    '#0f766e', '#7c3aed', '#b91c1c', '#1d4ed8', '#c2410c',
    '#4d7c0f', '#be185d', '#0e7490', '#854d0e', '#4338ca'
  ];

  /** اسم الفوج انطلاقاً من مادة الحصة (فوج علوم طبيعية / فوج علوم فيزيائية). */
  function groupLabel(lesson) {
    var subject = String((lesson && lesson.subject) || '');
    if (subject.indexOf('الطبيعية') !== -1) return 'فوج العلوم الطبيعية';
    if (subject.indexOf('فيزيائية') !== -1 || subject.indexOf('الفزيائية') !== -1) return 'فوج العلوم الفيزيائية';
    return '';
  }

  function teacherColor(teacherId) {
    var id = Number(teacherId) || 0;
    return TEACHER_COLORS[id % TEACHER_COLORS.length];
  }

  /** بداية الأسبوع (الاثنين) مع إزاحة الأسابيع. */
  function weekMonday(offset) {
    var date = new Date();
    date.setHours(0, 0, 0, 0);
    var shift = (date.getDay() + 6) % 7; // الاثنين = 0
    date.setDate(date.getDate() - shift + (offset || 0) * 7);
    return date;
  }

  function dateForDay(monday, dayValue) {
    var date = new Date(monday);
    date.setDate(date.getDate() + (dayValue === 0 ? 6 : dayValue - 1));
    return date;
  }

  function fmtDate(date) {
    return String(date.getDate()).padStart(2, '0') + '/' +
      String(date.getMonth() + 1).padStart(2, '0') + '/' + date.getFullYear();
  }

  function fmtArabicDate(date) {
    return date.getDate() + ' ' + AR_MONTHS[date.getMonth()];
  }

  /** تصنيف الحصة إلى أحد المخابر الأربعة حسب اسم القاعة (ثم المادة عند غياب القاعة). */
  function labKey(text) {
    var value = String(text || '');
    var second = /[\u0662]/.test(value) || /(^|[^0-9])2([^0-9]|$)/.test(value);
    if (/فيزي|فزي/.test(value)) return second ? 'physics2' : 'physics';
    return second ? 'natural2' : 'natural';
  }

  function lessonLab(lesson) {
    var room = String((lesson && lesson.room_name) || '');
    if (room) return labKey(room);
    return labKey([lesson && lesson.subject, groupLabel(lesson)].join(' '));
  }

  /** دمج الحصص المتتالية لنفس الأستاذ/القسم/القاعة في حصة واحدة (ساعتان مثلاً). */
  function mergeLessons(list) {
    var groups = {};
    list.forEach(function (lesson) {
      var key = [lesson.day_of_week, lesson.teacher_id, lesson.class_name, lesson.room_id || '', lesson.subject].join('|');
      if (!groups[key]) groups[key] = [];
      groups[key].push(lesson);
    });
    var merged = [];
    Object.keys(groups).forEach(function (key) {
      var rows = groups[key].slice().sort(function (a, b) { return minutes(a.start_time) - minutes(b.start_time); });
      var current = null;
      rows.forEach(function (lesson) {
        if (current && minutes(lesson.start_time) <= minutes(current.end_time)) {
          if (minutes(lesson.end_time) > minutes(current.end_time)) current.end_time = lesson.end_time;
        } else {
          current = Object.assign({}, lesson);
          merged.push(current);
        }
      });
    });
    return merged;
  }

  // الحصص الافتراضية عند استيراد ملف لا يحدد المادة
  var DEFAULT_SUBJECT = 'علوم فيزيائية وتكنولوجيا';

  /** مادة الأستاذ تُستنتج من تخصصه في الاسم الكامل. */
  function teacherSubject(teacher) {
    var name = String((teacher && teacher.full_name) || '');
    if (name.indexOf('الطبيعية') !== -1) return 'علوم الطبيعة والحياة';
    if (name.indexOf('الفزيائية') !== -1 || name.indexOf('الفيزيائية') !== -1) return 'علوم فيزيائية وتكنولوجيا';
    return DEFAULT_SUBJECT;
  }

  var SLOT_TIMES = { 1: '08:00', 2: '09:00', 3: '10:00', 4: '11:00', 5: '13:00', 6: '14:00', 7: '15:00', 8: '16:00' };

  var DAY_NAMES = { 'الاثنين': 1, 'الثلاثاء': 2, 'الأربعاء': 3, 'الخميس': 4, 'الجمعة': 5, 'السبت': 6, 'الأحد': 0 };

  Actions.bar(document.getElementById('pageActions'), {
    // استعمال الزمن متاح لكل مستخدم مُسجَّل
    allow: { import: true, add: true, edit: true, print: true },
    onAdd: function () { openLesson(null); },
    onPrint: function () { window.print(); },
    onEdit: function () {
      if (lessons.length === 0) {
        App.toast('لا توجد حصص لتعديلها', 'error');
        return;
      }
      App.toast('اضغط على الحصة في الشبكة لتعديلها', 'ok');
    },
    onImportClick: openScheduleImport
  });

  function openLesson(lesson) {
    document.getElementById('lessonTitle').textContent = lesson ? 'تعديل حصة' : 'حصة جديدة';
    document.getElementById('lessonId').value = lesson ? lesson.id : '';
    document.getElementById('className').value = lesson ? lesson.class_name : '';
    document.getElementById('subject').value = lesson ? lesson.subject : '';
    var teacherSelect = document.getElementById('teacherId');
    if (teacherSelect) {
      teacherSelect.value = lesson && lesson.teacher_id ? String(lesson.teacher_id) : '';
    }
    document.getElementById('roomId').value = lesson && lesson.room_id ? lesson.room_id : '';
    document.getElementById('day').value = lesson ? lesson.day_of_week : 1;
    document.getElementById('startTime').value = lesson ? lesson.start_time : '08:00';
    document.getElementById('endTime').value = lesson ? lesson.end_time : '10:00';
    document.getElementById('lessonStatus').value = (lesson && lesson.status) || 'scheduled';
    document.getElementById('deleteLessonBtn').hidden = !lesson;
    App.openModal('lessonModal');
  }

  function dayFromDate(value) {
    var match = String(value || '').trim().match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (!match) return null;
    var year = Number(match[3]);
    if (year < 100) year += 2000;
    var parsed = new Date(year, Number(match[2]) - 1, Number(match[1]));
    return Number.isNaN(parsed.getTime()) ? null : parsed.getDay();
  }

  function startTimeOf(value) {
    var raw = String(value || '').trim();
    var clock = raw.match(/^(\d{1,2}):(\d{2})$/);
    if (clock) return String(Number(clock[1])).padStart(2, '0') + ':' + clock[2];
    return SLOT_TIMES[Number(raw)] || null;
  }

  function endTimeOf(start) {
    var parts = start.split(':');
    return String(Number(parts[0]) + 1).padStart(2, '0') + ':' + parts[1];
  }

  function dateToDay(value) {
    var text = String(value || '').trim();
    var iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      var date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      return Number.isNaN(date.getTime()) ? null : date.getDay();
    }
    return dayFromDate(text);
  }

  function parseSlot(value) {
    var raw = String(value || '').trim();
    var range = raw.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})/);
    if (range) {
      return {
        start: String(Number(range[1])).padStart(2, '0') + ':' + range[2],
        end: String(Number(range[3])).padStart(2, '0') + ':' + range[4]
      };
    }
    var slotNumber = raw.match(/الحصة\s*(\d+)/);
    var start = startTimeOf(slotNumber ? slotNumber[1] : raw);
    return start ? { start: start, end: endTimeOf(start) } : null;
  }

  function findTeacherByName(value) {
    var text = String(value || '').trim().toLowerCase();
    if (!text) return null;
    return teachersCache.find(function (entry) {
      return String(entry.full_name || '').toLowerCase() === text ||
        String(entry.full_name || '').split(' / ')[0].trim().toLowerCase() === text ||
        String(entry.username || '').toLowerCase() === text;
    }) || null;
  }

  function openScheduleImport() {
    scheduleImportState = { valid: [], invalid: [] };
    var preview = document.getElementById('scheduleImportPreview');
    if (preview) {
      preview.hidden = true;
      preview.innerHTML = '';
    }
    var input = document.getElementById('scheduleImportFile');
    if (input) input.value = '';
    var submit = document.getElementById('scheduleImportSubmitBtn');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'استيراد';
    }
    App.openModal('scheduleImportModal');
  }

  function csvCell(value) {
    var text = String(value == null ? '' : value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function downloadScheduleTemplate() {
    var headers = ['التاريخ', 'الحصة', 'الأستاذ', 'القسم', 'المخبر', 'التجربة', 'ملاحظات'];
    var teacher = teachersCache[0] || App.user || {};
    var room = roomsCache[0] || {};
    var sample = [
      App.today(),
      '08:00-10:00',
      teacher.full_name || 'الأستاذ',
      '1م1',
      room.name || '',
      'علوم فيزيائية وتكنولوجيا',
      'حصة تطبيقية'
    ];
    var csv = '\ufeff' + [headers, sample].map(function (row) { return row.map(csvCell).join(','); }).join('\r\n') + '\r\n';
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'نموذج-استيراد-استعمال-الزمن.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  function buildScheduleImportRows(rows) {
    var valid = [];
    var invalid = [];
    rows.forEach(function (row, index) {
      var line = index + 2;
      try {
        var day = dateToDay(row['التاريخ'] || row.date);
        if (day === null) throw new Error('التاريخ غير صالح أو مفقود');

        var slot = parseSlot(row['الحصة'] || row.slot || row.start || row['من']);
        if (!slot) throw new Error('الحصة غير صالحة (مثال: 08:00-10:00)');
        if (slot.end <= slot.start) throw new Error('وقت نهاية الحصة يجب أن يلي بدايتها');

        var teacherText = String(row['الأستاذ'] || row.teacher || '').trim();
        var teacher = findTeacherByName(teacherText);
        if (!teacher && App.isAdmin()) throw new Error('الأستاذ غير موجود: ' + (teacherText || '—'));
        if (teacher && !App.isAdmin() && teacher.id !== (App.user || {}).id) throw new Error('لا يمكنك الاستيراد باسم أستاذ آخر');
        if (!teacher) teacher = App.user || null;

        var className = String(row['القسم'] || row.class || row.class_name || '').trim();
        if (!className) throw new Error('القسم مطلوب');
        var roomName = String(row['المخبر'] || row['القاعة'] || row.room || '').trim();
        var room = roomName ? roomsCache.find(function (entry) { return entry.name === roomName; }) : null;
        if (roomName && !room) throw new Error('المخبر غير موجود: ' + roomName);

        var subject = String(row['التجربة'] || row['المادة'] || row.subject || '').trim() || (teacher ? teacherSubject(teacher) : DEFAULT_SUBJECT);
        valid.push({
          day_of_week: day,
          class_name: className,
          subject: subject,
          start_time: slot.start,
          end_time: slot.end,
          teacher_id: teacher ? teacher.id : undefined,
          room_id: room ? room.id : undefined,
          dateLabel: String(row['التاريخ'] || '').trim()
        });
      } catch (error) {
        invalid.push('السطر ' + line + ': ' + error.message);
      }
    });
    return { valid: valid, invalid: invalid };
  }

  function renderScheduleImportPreview() {
    var preview = document.getElementById('scheduleImportPreview');
    var submit = document.getElementById('scheduleImportSubmitBtn');
    if (!preview || !submit) return;
    var valid = scheduleImportState.valid;
    var invalid = scheduleImportState.invalid;
    preview.hidden = false;
    if (!valid.length && !invalid.length) {
      preview.innerHTML = '<span class="muted">لم يتم العثور على صفوف صالحة.</span>';
      submit.disabled = true;
      return;
    }
    var rows = valid.slice(0, 5).map(function (row) {
      var teacher = teachersCache.find(function (entry) { return entry.id === row.teacher_id; });
      return '<tr><td>' + App.escape(row.dateLabel || '—') + '</td><td dir="ltr">' + App.escape(row.start_time + '-' + row.end_time) + '</td><td>' + App.escape((teacher && teacher.full_name) || (App.user && App.user.full_name) || '—') + '</td><td>' + App.escape(row.class_name) + '</td></tr>';
    }).join('');
    preview.innerHTML =
      '<strong>' + valid.length + ' صف صالح' + (invalid.length ? ' · ' + invalid.length + ' صف فيه خطأ' : '') + '</strong>' +
      (rows ? '<table><thead><tr><th>التاريخ</th><th>الحصة</th><th>الأستاذ</th><th>القسم</th></tr></thead><tbody>' + rows + '</tbody></table>' : '') +
      (invalid.length ? '<ul class="import-errors">' + invalid.slice(0, 5).map(function (message) { return '<li>' + App.escape(message) + '</li>'; }).join('') + '</ul>' : '');
    submit.disabled = valid.length === 0;
  }

  function inspectScheduleImportFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      App.toast('حجم الملف كبير جداً (الحد 5 ميغابايت)', 'error');
      return;
    }
    App.toast('جارٍ فحص الملف…', 'ok');
    var ready = App.isAdmin() && !teachersCache.length
      ? App.api('/auth/users').then(function (data) { teachersCache = data.users || []; })
      : Promise.resolve();
    ready
      .then(function () { return Actions.readFile(file); })
      .then(function (text) {
        var parsed = Actions.parseCsv(text);
        if (!parsed.rows.length) throw new Error('الملف فارغ أو بلا صفوف صالحة');
        scheduleImportState = buildScheduleImportRows(parsed.rows);
        renderScheduleImportPreview();
        if (scheduleImportState.valid.length) App.toast('تم فحص الملف — راجع النتيجة ثم اضغط «استيراد»', 'ok');
      })
      .catch(function (error) {
        scheduleImportState = { valid: [], invalid: [] };
        var preview = document.getElementById('scheduleImportPreview');
        if (preview) {
          preview.hidden = false;
          preview.innerHTML = '<span class="muted">' + App.escape(error.message) + '</span>';
        }
        var submit = document.getElementById('scheduleImportSubmitBtn');
        if (submit) submit.disabled = true;
        App.toast(error.message, 'error');
      });
  }

  function runScheduleImport() {
    var valid = scheduleImportState.valid;
    if (!valid.length) return;
    var button = document.getElementById('scheduleImportSubmitBtn');
    button.disabled = true;
    button.textContent = 'جارٍ الاستيراد…';
    var stats = { ok: 0, failed: 0, errors: [] };

    valid.reduce(function (chain, row) {
      return chain.then(function () {
        var body = Object.assign({}, row);
        delete body.dateLabel;
        return App.api('/schedule', { method: 'POST', body: body }).then(
          function () { stats.ok += 1; },
          function (error) {
            stats.failed += 1;
            if (stats.errors.length < 3) stats.errors.push(error.message);
          }
        );
      });
    }, Promise.resolve()).then(function () {
      App.toast('استيراد: ' + stats.ok + ' ناجح · ' + stats.failed + ' فاشل', stats.failed ? 'error' : 'ok');
      if (stats.errors.length) App.toast(stats.errors.join(' · '), 'error');
      if (stats.ok) {
        App.closeModal('scheduleImportModal');
        load();
      } else {
        button.disabled = false;
        button.textContent = 'استيراد';
      }
    });
  }

  document.querySelectorAll('[data-close]').forEach(function (button) {
    button.addEventListener('click', function () { App.closeModal(button.dataset.close); });
  });

  function minutes(time) {
    var parts = String(time || '00:00').split(':');
    return Number(parts[0]) * 60 + Number(parts[1] || 0);
  }

  function renderLegend(list) {
    var host = document.getElementById('teacherLegend');
    if (!host) return;
    var seen = {};
    var items = [
      '<button class="legend-item legend-btn' + (selectedTeacher === null ? ' active' : '') +
        '" type="button" data-teacher-filter="">كل الأساتذة</button>'
    ];
    list.forEach(function (lesson) {
      var id = Number(lesson.teacher_id) || 0;
      if (seen[id]) return;
      seen[id] = true;
      items.push(
        '<button class="legend-item legend-btn' + (selectedTeacher === id ? ' active' : '') +
        '" type="button" data-teacher-filter="' + id + '" title="عرض استعمال زمن هذا الأستاذ وحده">' +
        '<i data-bg="' + teacherColor(id) + '"></i>' +
        App.escape(String(lesson.teacher_name || '').split(' / ')[0]) + '</button>'
      );
    });
    host.innerHTML = items.join('');
    host.querySelectorAll('[data-bg]').forEach(function (el) { el.style.background = el.dataset.bg; });
    host.querySelectorAll('[data-teacher-filter]').forEach(function (button) {
      button.addEventListener('click', function () {
        var value = button.dataset.teacherFilter;
        selectedTeacher = value ? Number(value) : null;
        buildGrid();
      });
    });
  }

  function renderRoomTabs() {
    if (!roomTabs) return;
    roomTabs.innerHTML = LAB_TABS
      .map(function (lab) {
        return '<button class="room-tab' + (lab.id === selectedLab ? ' active' : '') + '" type="button" data-lab-tab="' + lab.id + '">' + App.escape(lab.name) + '</button>';
      })
      .join('');
    roomTabs.querySelectorAll('[data-lab-tab]').forEach(function (button) {
      button.addEventListener('click', function () {
        selectedLab = button.dataset.labTab;
        // إن لم يكن الأستاذ المحدد يعمل في المخبر الجديد، أعد ضبط التصفية تلقائياً
        if (selectedTeacher !== null) {
          var teacherInLab = lessons.some(function (lesson) {
            return lessonLab(lesson) === selectedLab && Number(lesson.teacher_id) === selectedTeacher;
          });
          if (!teacherInLab) {
            selectedTeacher = null;
            App.toast('هذا الأستاذ غير موجود في هذا المخبر — تم عرض كل الأساتذة', 'ok');
          }
        }
        buildGrid();
      });
    });
  }

  function renderList(merged, conflictIds, monday) {
    if (!calendarList) return;
    var list = merged.filter(function (lesson) { return lessonLab(lesson) === selectedLab; });
    var order = [0, 1, 2, 3, 4, 5, 6];
    calendarList.innerHTML = order
      .map(function (dayValue) {
        var day = DAYS.find(function (item) { return item.value === dayValue; }) || { value: dayValue, label: '' };
        var date = dateForDay(monday, dayValue);
        var rows = list
          .filter(function (lesson) { return lesson.day_of_week === dayValue; })
          .sort(function (a, b) { return minutes(a.start_time) - minutes(b.start_time); });
        var cards = rows.length
          ? rows
              .map(function (lesson) {
                var group = groupLabel(lesson);
                return (
                  '<article class="cal-list-card' + (conflictIds[lesson.id] ? ' conflict' : '') + '" data-lesson="' + lesson.id + '" data-brc="' + teacherColor(lesson.teacher_id) + '">' +
                  '<span class="cal-list-time">' + lesson.start_time + '<br>' + lesson.end_time + '</span>' +
                  '<div class="cal-list-main"><strong>' + App.escape(lesson.subject) + '</strong>' +
                  '<small>' + App.escape(group ? group + ' · ' + lesson.class_name : lesson.class_name) + '</small>' +
                  '<small><span class="cal-teacher-link" data-teacher-link="' + (lesson.teacher_id || '') + '" title="عرض استعمال زمن هذا الأستاذ وحده">' + App.escape(lesson.teacher_name || '') + '</span>' + (lesson.room_name ? ' · ' + App.escape(lesson.room_name) : '') + '</small></div>' +
                  '<span class="cal-status ' + (lesson.status || 'scheduled') + '">' + (STATUS_LABELS[lesson.status] || STATUS_LABELS.scheduled) + '</span>' +
                  (conflictIds[lesson.id] ? '<span class="badge danger">تعارض</span>' : '') +
                  '</article>'
                );
              })
              .join('')
          : '<div class="cal-list-empty">لا توجد حصص</div>';
        return (
          '<section class="cal-list-day"><header><div><strong>' + day.label + '</strong> <span class="muted">' + fmtArabicDate(date) + '</span></div>' +
          '<button class="btn btn-sm btn-ghost" type="button" data-add-day="' + dayValue + '">＋ حجز</button></header>' +
          cards + '</section>'
        );
      })
      .join('');

    calendarList.querySelectorAll('[data-add-day]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        openLesson(null);
        document.getElementById('day').value = button.dataset.addDay;
      });
    });
    bindLessonClicks(calendarList, merged);
  }

  function bindLessonClicks(host, merged) {
    host.querySelectorAll('[data-lesson]').forEach(function (block) {
      block.addEventListener('click', function () {
        var lesson = merged.find(function (row) { return row.id === Number(block.dataset.lesson); });
        if (!lesson) return;
        if (!App.isAdmin() && lesson.teacher_id !== (App.user || {}).id) {
          App.toast('لا يمكنك تعديل حصة أستاذ آخر', 'error');
          return;
        }
        openLesson(lesson);
      });
    });
    // النقر على اسم الأستاذ يحصر العرض على استعمال زمنه وحده
    host.querySelectorAll('[data-teacher-link]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.stopPropagation();
        var id = Number(link.dataset.teacherLink);
        selectedTeacher = selectedTeacher === id ? null : id || null;
        buildGrid();
      });
    });
  }

  function buildGrid() {
    var monday = weekMonday(weekOffset);
    var merged = mergeLessons(lessons);
    // كل تبويب مخبر يعرض حصص ذلك المخبر فقط، مع إمكانية حصر العرض على أستاذ واحد
    var labLessons = merged.filter(function (lesson) { return lessonLab(lesson) === selectedLab; });
    var visible = selectedTeacher === null
      ? labLessons
      : labLessons.filter(function (lesson) { return Number(lesson.teacher_id) === selectedTeacher; });

    // كشف التعارضات: نفس القاعة أو نفس الأستاذ في نفس اليوم مع تداخل الأوقات
    var conflictIds = {};
    for (var i = 0; i < visible.length; i += 1) {
      for (var j = i + 1; j < visible.length; j += 1) {
        var a = visible[i];
        var b = visible[j];
        if (a.day_of_week !== b.day_of_week) continue;
        var overlaps = minutes(a.start_time) < minutes(b.end_time) && minutes(b.start_time) < minutes(a.end_time);
        if (!overlaps) continue;
        var sameRoom = a.room_id && b.room_id && Number(a.room_id) === Number(b.room_id);
        var sameTeacher = Number(a.teacher_id) === Number(b.teacher_id);
        if (sameRoom || sameTeacher) {
          conflictIds[a.id] = true;
          conflictIds[b.id] = true;
        }
      }
    }

    var hours = '';
    for (var hour = START_HOUR; hour < END_HOUR; hour += 1) {
      hours += '<div class="cal-hour-label">' + String(hour).padStart(2, '0') + ':00</div>';
    }

    var head = '<div class="cal-head-day"></div>';
    DAYS.forEach(function (day) {
      var date = dateForDay(monday, day.value);
      head += '<div class="cal-head-day">' + day.label + '<small>' + fmtArabicDate(date) + '</small></div>';
    });

    var columns = '';
    DAYS.forEach(function (day) {
      var blocks = visible
        .filter(function (lesson) { return lesson.day_of_week === day.value; })
        .map(function (lesson) {
          var start = minutes(lesson.start_time) - START_HOUR * 60;
          var duration = Math.max(30, minutes(lesson.end_time) - minutes(lesson.start_time));
          var top = (start / 60) * PX_PER_HOUR;
          var height = (duration / 60) * PX_PER_HOUR - 4;
          var shortTeacher = String(lesson.teacher_name || '').split(' / ')[0].trim();
          var group = groupLabel(lesson);
          var blockTitle = [lesson.subject, group, lesson.teacher_name, lesson.class_name, lesson.start_time + ' - ' + lesson.end_time, lesson.room_name || '—'].join(' · ');
          return (
            '<div class="cal-block' + (conflictIds[lesson.id] ? ' conflict' : '') + '" data-lesson="' + lesson.id + '" title="' + App.escape(blockTitle) + '" data-top="' + Math.max(0, top) + '" data-h="' + height + '" data-bg="' + teacherColor(lesson.teacher_id) + '">' +
            '<strong>' + App.escape(lesson.subject) + '</strong>' +
            '<small><span class="cal-teacher-link" data-teacher-link="' + (lesson.teacher_id || '') + '">' + App.escape(shortTeacher) + '</span></small>' +
            '<small>' + App.escape(group ? group + ' · ' + lesson.class_name : lesson.class_name) + '</small>' +
            '<small>' + lesson.start_time + ' - ' + lesson.end_time + ' · ' + App.escape(lesson.room_name || 'بدون قاعة') + '</small></div>'
          );
        })
        .join('');
      columns += '<div class="cal-col" data-day="' + day.value + '">' + blocks + '</div>';
    });

    calendar.innerHTML =
      '<div class="cal-grid">' + head +
      '<div class="cal-hours">' + hours + '</div>' + columns +
      '</div>';

    var weekEnd = new Date(monday);
    weekEnd.setDate(weekEnd.getDate() + 6);
    var weekLabel = document.getElementById('weekLabel');
    var weekText = fmtArabicDate(monday) + ' — ' + fmtArabicDate(weekEnd) + ' ' + weekEnd.getFullYear();
    if (weekLabel) weekLabel.textContent = weekText;
    var selectedName = '';
    if (selectedTeacher !== null) {
      var match = labLessons.find(function (lesson) { return Number(lesson.teacher_id) === selectedTeacher; });
      selectedName = match ? String(match.teacher_name || '').split(' / ')[0].trim() : '';
    }
    document.getElementById('countBadge').textContent =
      visible.length + ' حصة' + (selectedName ? ' · ' + selectedName : '');
    // عنوان يظهر في الورقة فقط: المخبر + الأسبوع + العدد (تبويبات المخابر لا تُطبع)
    var printTitle = document.getElementById('calPrintTitle');
    if (printTitle) {
      var currentLab = LAB_TABS.filter(function (lab) { return lab.id === selectedLab; })[0];
      printTitle.textContent = (currentLab ? currentLab.name : '') + ' — ' + weekText +
        ' — ' + visible.length + ' حصة' + (selectedName ? ' · ' + selectedName : '');
    }
    var conflictCount = Object.keys(conflictIds).length;
    var conflictBadge = document.getElementById('conflictBadge');
    if (conflictBadge) {
      conflictBadge.hidden = conflictCount === 0;
      conflictBadge.textContent = conflictCount + ' تعارض';
    }
    // تطبيق الأنماط الديناميكية (CSP-safe: بدون style="...")
    calendar.querySelectorAll('[data-bg]').forEach(function (el) { el.style.background = el.dataset.bg; });
    calendar.querySelectorAll('[data-brc]').forEach(function (el) { el.style.borderRightColor = el.dataset.brc; });
    calendar.querySelectorAll('[data-top]').forEach(function (el) { el.style.top = el.dataset.top + 'px'; });
    calendar.querySelectorAll('[data-h]').forEach(function (el) { el.style.height = el.dataset.h + 'px'; });
    renderLegend(labLessons);
    renderRoomTabs();
    renderList(visible, conflictIds, monday);
    calendarList.querySelectorAll('[data-brc]').forEach(function (el) { el.style.borderRightColor = el.dataset.brc; });
    bindLessonClicks(calendar, merged);
  }

  function load() {
    App.api('/schedule')
      .then(function (data) {
        lessons = data.schedule;
        document.getElementById('countBadge').textContent = lessons.length + ' حصة';
        buildGrid();
      })
      .catch(function (error) {
        calendar.innerHTML = '<div class="empty">' + App.escape(error.message) + '</div>';
      });
  }

  document.getElementById('deleteLessonBtn').addEventListener('click', function () {
    var id = document.getElementById('lessonId').value;
    if (!id) return;
    if (!confirm(App.t('حذف هذه الحصة نهائياً؟') || 'حذف هذه الحصة نهائياً؟')) return;
    App.api('/schedule/' + id, { method: 'DELETE' })
      .then(function () {
        App.closeModal('lessonModal');
        App.toast('تم حذف الحصة', 'ok');
        load();
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  document.getElementById('lessonForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var roomId = document.getElementById('roomId').value;
    var id = document.getElementById('lessonId').value;
    App.api(id ? '/schedule/' + id : '/schedule', {
      method: id ? 'PUT' : 'POST',
      body: {
        room_id: roomId ? Number(roomId) : undefined,
        class_name: document.getElementById('className').value.trim(),
        subject: document.getElementById('subject').value.trim(),
        day_of_week: Number(document.getElementById('day').value),
        start_time: document.getElementById('startTime').value,
        end_time: document.getElementById('endTime').value,
        status: document.getElementById('lessonStatus').value,
        teacher_id: (function () {
          var select = document.getElementById('teacherId');
          return select && select.value ? Number(select.value) : undefined;
        })()
      }
    })
      .then(function () {
        App.closeModal('lessonModal');
        App.toast(id ? 'تم تحديث الحصة' : 'تمت إضافة الحصة', 'ok');
        load();
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  var teacherSelect = document.getElementById('teacherId');
  if (teacherSelect && App.isAdmin()) {
    App.api('/auth/users')
      .then(function (data) {
        teachersCache = data.users || [];
        teachersCache.forEach(function (teacher) {
          var option = document.createElement('option');
          option.value = teacher.id;
          option.textContent = teacher.full_name;
          teacherSelect.appendChild(option);
        });
      })
      .catch(function () {});
  } else {
    teachersCache = App.user ? [{ id: App.user.id, full_name: App.user.full_name }] : [];
    if (teacherSelect) document.getElementById('teacherField').hidden = true;
  }

  App.api('/rooms')
    .then(function (data) {
      roomsCache = data.rooms;
      var select = document.getElementById('roomId');
      data.rooms.forEach(function (room) {
        var option = document.createElement('option');
        option.value = room.id;
        option.textContent = room.name;
        select.appendChild(option);
      });
      renderRoomTabs();
    })
    .catch(function () {});

  document.getElementById('downloadScheduleTemplateBtn').addEventListener('click', downloadScheduleTemplate);
  document.getElementById('scheduleImportFile').addEventListener('change', function (event) {
    var file = event.target.files && event.target.files[0];
    inspectScheduleImportFile(file);
  });
  var scheduleDrop = document.getElementById('scheduleImportDrop');
  ['dragenter', 'dragover'].forEach(function (name) {
    scheduleDrop.addEventListener(name, function (event) {
      event.preventDefault();
      scheduleDrop.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function (name) {
    scheduleDrop.addEventListener(name, function (event) {
      event.preventDefault();
      scheduleDrop.classList.remove('dragover');
    });
  });
  scheduleDrop.addEventListener('drop', function (event) {
    var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    inspectScheduleImportFile(file);
  });
  document.getElementById('scheduleImportSubmitBtn').addEventListener('click', runScheduleImport);

  var clearScheduleBtn = document.getElementById('clearScheduleBtn');
  if (clearScheduleBtn && !App.isAdmin()) clearScheduleBtn.hidden = true;
  if (clearScheduleBtn) {
    clearScheduleBtn.addEventListener('click', function () {
      if (!confirm('تفريغ استعمال الزمن بالكامل؟ سيتم حذف كل الحصص.')) return;
      clearScheduleBtn.disabled = true;
      App.api('/schedule/clear', { method: 'POST' })
        .then(function () {
          App.toast('تم تفريغ استعمال الزمن', 'ok');
          load();
        })
        .catch(function (error) { App.toast(error.message, 'error'); })
        .finally(function () { clearScheduleBtn.disabled = false; });
    });
  }

  document.getElementById('prevWeek').addEventListener('click', function () {
    weekOffset -= 1;
    buildGrid();
  });
  document.getElementById('nextWeek').addEventListener('click', function () {
    weekOffset += 1;
    buildGrid();
  });
  document.getElementById('thisWeek').addEventListener('click', function () {
    weekOffset = 0;
    buildGrid();
  });

  load();
  App.preparePrintPage('استعمال الزمن — حصص المختبر');
})();
