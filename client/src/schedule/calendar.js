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
  var START_HOUR = 8;
  var END_HOUR = 18;
  var PX_PER_HOUR = 56;

  var calendar = document.getElementById('calendar');
  var lessons = [];
  var roomsCache = [];

  var DAY_NAMES = { 'الاثنين': 1, 'الثلاثاء': 2, 'الأربعاء': 3, 'الخميس': 4, 'الجمعة': 5, 'السبت': 6, 'الأحد': 0 };

  Actions.bar(document.getElementById('pageActions'), {
    onAdd: function () { openLesson(null); },
    onPrint: function () { window.print(); },
    onEdit: function () {
      if (lessons.length === 0) {
        App.toast('لا توجد حصص لتعديلها', 'error');
        return;
      }
      App.toast('اضغط على الحصة في الشبكة لتعديلها', 'ok');
    },
    onImport: function (file) { importLessons(file); }
  });

  function openLesson(lesson) {
    document.getElementById('lessonTitle').textContent = lesson ? 'تعديل حصة' : 'حصة جديدة';
    document.getElementById('lessonId').value = lesson ? lesson.id : '';
    document.getElementById('className').value = lesson ? lesson.class_name : '';
    document.getElementById('subject').value = lesson ? lesson.subject : '';
    document.getElementById('roomId').value = lesson && lesson.room_id ? lesson.room_id : '';
    document.getElementById('day').value = lesson ? lesson.day_of_week : 1;
    document.getElementById('startTime').value = lesson ? lesson.start_time : '08:00';
    document.getElementById('endTime').value = lesson ? lesson.end_time : '10:00';
    document.getElementById('deleteLessonBtn').hidden = !lesson;
    App.openModal('lessonModal');
  }

  function importLessons(file) {
    Actions.importRows({
      file: file,
      transform: function (row) {
        var rawDay = row.day || row['اليوم'] || '';
        var day = DAY_NAMES[rawDay] !== undefined ? DAY_NAMES[rawDay] : Number(rawDay);
        if (!Number.isInteger(day) || day < 0 || day > 6) throw new Error('يوم غير صالح: ' + rawDay);
        var className = (row['class'] || row.class_name || row['القسم'] || '').trim();
        var subject = (row.subject || row['المادة'] || '').trim();
        if (!className || !subject) throw new Error('القسم والمادة مطلوبان');
        var roomName = (row.room || row['القاعة'] || '').trim();
        var room = roomsCache.find(function (entry) { return entry.name === roomName; });
        return {
          day_of_week: day,
          class_name: className,
          subject: subject,
          start_time: (row.start || row['من'] || '').trim(),
          end_time: (row.end || row['إلى'] || '').trim(),
          room_id: room ? room.id : undefined
        };
      },
      submit: function (payload) { return App.api('/schedule', { method: 'POST', body: payload }); },
      done: function () { load(); }
    });
  }

  document.querySelectorAll('[data-close]').forEach(function (button) {
    button.addEventListener('click', function () { App.closeModal(button.dataset.close); });
  });

  function minutes(time) {
    var parts = String(time || '00:00').split(':');
    return Number(parts[0]) * 60 + Number(parts[1] || 0);
  }

  function buildGrid() {
    var hours = '';
    for (var hour = START_HOUR; hour < END_HOUR; hour += 1) {
      hours += '<div class="cal-hour-label">' + String(hour).padStart(2, '0') + ':00</div>';
    }

    var head = '<div class="cal-head-day"></div>';
    DAYS.forEach(function (day) {
      head += '<div class="cal-head-day">' + day.label + '</div>';
    });

    var columns = '';
    DAYS.forEach(function (day) {
      var blocks = lessons
        .filter(function (lesson) { return lesson.day_of_week === day.value; })
        .map(function (lesson) {
          var start = minutes(lesson.start_time) - START_HOUR * 60;
          var duration = Math.max(30, minutes(lesson.end_time) - minutes(lesson.start_time));
          var top = (start / 60) * PX_PER_HOUR;
          var height = (duration / 60) * PX_PER_HOUR - 4;
          return (
            '<div class="cal-block" data-lesson="' + lesson.id + '" style="top:' + Math.max(0, top) + 'px;height:' + height + 'px">' +
            '<strong>' + App.escape(lesson.subject) + '</strong>' +
            '<small>' + App.escape(lesson.class_name) + '</small>' +
            '<small>' + lesson.start_time + ' - ' + lesson.end_time + '</small>' +
            '<small>' + App.escape(lesson.room_name || '—') + '</small></div>'
          );
        })
        .join('');
      columns += '<div class="cal-col" data-day="' + day.value + '">' + blocks + '</div>';
    });

    calendar.innerHTML =
      '<div class="cal-grid">' + head +
      '<div class="cal-hours">' + hours + '</div>' + columns +
      '</div>';

    calendar.querySelectorAll('[data-lesson]').forEach(function (block) {
      block.addEventListener('click', function () {
        var lesson = lessons.find(function (row) { return row.id === Number(block.dataset.lesson); });
        if (!lesson) return;
        if (!App.isAdmin() && lesson.teacher_id !== (App.user || {}).id) {
          App.toast('لا يمكنك تعديل حصة أستاذ آخر', 'error');
          return;
        }
        openLesson(lesson);
      });
    });
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
    if (!confirm('حذف هذه الحصة نهائياً؟')) return;
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
        end_time: document.getElementById('endTime').value
      }
    })
      .then(function () {
        App.closeModal('lessonModal');
        App.toast(id ? 'تم تحديث الحصة' : 'تمت إضافة الحصة', 'ok');
        load();
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

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
    })
    .catch(function () {});

  load();
  App.preparePrintPage('استعمال الزمن — حصص المختبر');
})();
