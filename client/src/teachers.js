(function () {
  'use strict';
  if (!App.mount('teachers')) return;

  var host = document.getElementById('teacherCards');
  var search = document.getElementById('search');
  var state = { teachers: [] };
  var COLORS = ['#0f766e', '#7c3aed', '#b91c1c', '#1d4ed8', '#c2410c', '#4d7c0f', '#be185d', '#0e7490', '#854d0e', '#4338ca'];

  Actions.bar(document.getElementById('pageActions'), {
    allow: { import: App.isAdmin(), add: App.isAdmin(), edit: App.isAdmin(), print: true },
    onAdd: function () { openTeacher(null); },
    onEdit: function () {
      App.toast('اضغط على أيقونة التعديل داخل بطاقة الأستاذ', 'ok');
    },
    onImport: function (file) { importTeachers(file); },
    onPrint: function () { window.print(); }
  });

  function specialtyLabel(code) {
    if (code === 'physics') return 'علوم فيزيائية';
    if (code === 'natural') return 'علوم طبيعية';
    return '';
  }

  function specialty(name) {
    var value = String(name || '');
    if (value.indexOf('الطبيعية') !== -1 || value.indexOf('الطبيعة') !== -1) return 'علوم طبيعية';
    if (value.indexOf('الفزيائية') !== -1 || value.indexOf('الفيزيائية') !== -1) return 'علوم فيزيائية';
    return '—';
  }

  function initial(name) {
    var clean = String(name || '').replace(/^[أا]\.?\s*/, '').trim();
    return clean.charAt(0) || '؟';
  }

  function build(users, schedule, sessions) {
    var map = {};
    users.forEach(function (user) {
      map[user.id] = {
        id: user.id,
        username: user.username,
        name: user.full_name,
        phone: user.phone || '',
        role: user.role,
        specialtyCode: user.specialty || '',
        specialty: specialtyLabel(user.specialty) || specialty(user.full_name),
        classes: {},
        rooms: {},
        lessons: 0,
        done: 0,
        upcoming: 0,
        borrowings: 0
      };
    });

    schedule.forEach(function (lesson) {
      var teacher = map[lesson.teacher_id];
      if (!teacher) {
        map[lesson.teacher_id] = {
          id: lesson.teacher_id,
          username: '',
          name: lesson.teacher_name || '',
          phone: '',
          role: 'teacher',
          specialtyCode: '',
          specialty: specialty(lesson.teacher_name || lesson.subject),
          classes: {},
          rooms: {},
          lessons: 0,
          done: 0,
          upcoming: 0,
          borrowings: 0
        };
        teacher = map[lesson.teacher_id];
      }
      teacher.lessons += 1;
      if (lesson.status === 'done') teacher.done += 1;
      else if (lesson.status !== 'cancelled') teacher.upcoming += 1;
      if (lesson.class_name) teacher.classes[lesson.class_name] = true;
      if (lesson.room_name) teacher.rooms[lesson.room_name] = true;
      if (teacher.specialty === '—' && lesson.subject) teacher.specialty = specialty(lesson.subject);
    });

    sessions.forEach(function (session) {
      var teacher = map[session.teacher_id];
      if (!teacher) return;
      teacher.borrowings += 1;
      if (session.class_name) teacher.classes[session.class_name] = true;
    });

    return Object.keys(map)
      .map(function (id) { return map[id]; })
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ar'); });
  }

  function render() {
    var term = String(search.value || '').trim();
    var list = state.teachers.filter(function (teacher) {
      if (!term) return true;
      var haystack = [teacher.name, teacher.username, teacher.phone, teacher.specialty, Object.keys(teacher.classes).join(' '), Object.keys(teacher.rooms).join(' ')].join(' ');
      return haystack.indexOf(term) !== -1;
    });

    if (!list.length) {
      host.innerHTML = '<div class="empty">لا يوجد أساتذة مطابقون</div>';
      return;
    }

    host.innerHTML = list
      .map(function (teacher) {
        var color = COLORS[Number(teacher.id) % COLORS.length];
        var classes = Object.keys(teacher.classes).sort().join('، ') || '—';
        var subjectClass = teacher.specialty === 'علوم طبيعية' ? 'natural' : teacher.specialty === 'علوم فيزيائية' ? 'physics' : '';
        return (
          '<article class="teacher-card" data-id="' + teacher.id + '">' +
          '<div class="teacher-card-actions">' +
          (App.isAdmin() ? '<button class="teacher-icon-btn" type="button" data-edit="' + teacher.id + '" title="تعديل">✏️</button>' +
            '<button class="teacher-icon-btn danger" type="button" data-delete="' + teacher.id + '" title="حذف">🗑️</button>' : '') +
          '</div>' +
          '<div class="teacher-card-head">' +
          '<span class="teacher-avatar" data-bg="' + color + '1a" data-color="' + color + '">' + App.escape(initial(teacher.name)) + '</span>' +
          '<div class="teacher-card-title"><strong>' + App.escape(teacher.name) + '</strong>' +
          '<span class="teacher-subject ' + subjectClass + '">' + App.escape(teacher.specialty) + '</span></div>' +
          '</div>' +
          '<div class="teacher-meta"><span><strong>الأقسام:</strong> ' + App.escape(classes) + '</span>' +
          (teacher.phone ? '<span><strong>📞</strong> <a href="tel:' + App.escape(teacher.phone) + '" dir="ltr">' + App.escape(teacher.phone) + '</a></span>' : '') +
          '</div>' +
          '<div class="teacher-stats">' +
          '<div><strong>' + teacher.done + '</strong><small>حصص منجزة</small></div>' +
          '<div><strong>' + teacher.upcoming + '</strong><small>قادمة</small></div>' +
          '<div><strong>' + teacher.borrowings + '</strong><small>إعارات</small></div>' +
          '</div></article>'
        );
      })
      .join('');

    host.querySelectorAll('[data-edit]').forEach(function (button) {
      button.addEventListener('click', function () {
        var teacher = state.teachers.find(function (row) { return row.id === Number(button.dataset.edit); });
        if (teacher) openTeacher(teacher);
      });
    });
    host.querySelectorAll('[data-bg]').forEach(function (el) { el.style.background = el.dataset.bg; });
    host.querySelectorAll('[data-color]').forEach(function (el) { el.style.color = el.dataset.color; });
    host.querySelectorAll('[data-delete]').forEach(function (button) {
      button.addEventListener('click', function () {
        var teacher = state.teachers.find(function (row) { return row.id === Number(button.dataset.delete); });
        if (!teacher) return;
        if (!confirm('حذف الأستاذ «' + teacher.name + '»؟')) return;
        App.api('/auth/users/' + teacher.id, { method: 'DELETE' })
          .then(function () { App.toast('تم حذف الأستاذ', 'ok'); load(); })
          .catch(function (error) { App.toast(error.message, 'error'); });
      });
    });
  }

  function openTeacher(teacher) {
    if (!App.isAdmin()) {
      App.toast('إدارة الأساتذة متاحة للمدير فقط', 'error');
      return;
    }
    document.getElementById('teacherModalTitle').textContent = teacher ? 'تعديل أستاذ' : 'أستاذ جديد';
    document.getElementById('teacherId').value = teacher ? teacher.id : '';
    document.getElementById('teacherName').value = teacher ? teacher.name : '';
    document.getElementById('teacherUsername').value = teacher ? teacher.username : '';
    document.getElementById('teacherUsername').disabled = !!teacher;
    document.getElementById('teacherPhone').value = teacher ? teacher.phone : '';
    document.getElementById('teacherRole').value = teacher ? teacher.role : 'teacher';
    document.getElementById('teacherSpecialty').value = teacher ? (teacher.specialtyCode || '') : '';
    document.getElementById('teacherPassword').value = '';
    document.getElementById('teacherPassword').required = !teacher;
    document.getElementById('teacherPasswordHint').textContent = teacher
      ? 'اترك كلمة المرور فارغة للإبقاء على الحالية.'
      : 'كلمة المرور مطلوبة عند إنشاء حساب جديد.';
    App.openModal('teacherModal');
  }

  document.getElementById('teacherForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var id = document.getElementById('teacherId').value;
    var password = document.getElementById('teacherPassword').value;
    var body = {
      full_name: document.getElementById('teacherName').value.trim(),
      role: document.getElementById('teacherRole').value,
      phone: document.getElementById('teacherPhone').value.trim(),
      specialty: document.getElementById('teacherSpecialty').value || undefined
    };
    if (password) body.password = password;
    var request;
    if (id) {
      request = App.api('/auth/users/' + id, { method: 'PUT', body: body });
    } else {
      body.username = document.getElementById('teacherUsername').value.trim();
      body.password = password;
      request = App.api('/auth/users', { method: 'POST', body: body });
    }
    request
      .then(function () {
        App.closeModal('teacherModal');
        App.toast(id ? 'تم تحديث بيانات الأستاذ' : 'تمت إضافة الأستاذ', 'ok');
        load();
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  function importTeachers(file) {
    if (!App.isAdmin()) {
      App.toast('الاستيراد متاح للمدير فقط', 'error');
      return;
    }
    Actions.importRows({
      file: file,
      transform: function (row) {
        var username = (row.username || row['اسم المستخدم'] || '').trim();
        var fullName = (row.full_name || row['الاسم'] || row['الاسم الكامل'] || '').trim();
        var password = (row.password || row['كلمة المرور'] || '').trim();
        if (!username || !fullName || !password) throw new Error('اسم المستخدم والاسم وكلمة المرور مطلوبة');
        var role = (row.role || row['الدور'] || 'teacher').trim();
        return {
          username: username,
          full_name: fullName,
          phone: (row.phone || row['الهاتف'] || '').trim(),
          password: password,
          role: role === 'admin' ? 'admin' : 'teacher'
        };
      },
      submit: function (payload) { return App.api('/auth/users', { method: 'POST', body: payload }); },
      done: function () { load(); }
    });
  }

  function load() {
    var usersPromise = App.isAdmin() ? App.api('/auth/users') : Promise.resolve({ users: [] });
    Promise.all([usersPromise, App.api('/schedule'), App.api('/borrowing').catch(function () { return { sessions: [] }; })])
      .then(function (results) {
        state.teachers = build(results[0].users || [], results[1].schedule || [], results[2].sessions || []);
        render();
      })
      .catch(function (error) {
        host.innerHTML = '<div class="empty">' + App.escape(error.message) + '</div>';
      });
  }

  document.querySelectorAll('[data-close]').forEach(function (button) {
    button.addEventListener('click', function () { App.closeModal(button.dataset.close); });
  });
  search.addEventListener('input', render);
  load();
  App.preparePrintPage('قائمة الأساتذة');
})();
