(function () {
  'use strict';
  if (!App.mount('borrowing')) return;

  var rows = document.getElementById('rows');
  var state = { sessions: [] };
  var activeSession = null;
  var rooms = [];
  var teachers = [];
  var getSelected = null;
  var importState = { valid: [], invalid: [] };

  Actions.bar(document.getElementById('pageActions'), {
    // الإعارة متاحة للمدير والأستاذ (الخادم يسمح للمستخدم المُسجَّل)
    allow: { import: true, add: true, edit: true, print: true },
    onAdd: function () { location.href = '/borrowing/create-session.html'; },
    onPrint: function () { window.print(); },
    onEdit: function () {
      var id = getSelected && getSelected();
      if (!id) {
        App.toast('اختر جلسة من الجدول أولاً ثم اضغط «تعديل»', 'error');
        return;
      }
      openEdit(id);
    },
    onImportClick: openImportModal
  });

  getSelected = Actions.selection(rows, null);

  App.api('/rooms')
    .then(function (data) {
      rooms = data.rooms;
      var select = document.getElementById('editRoom');
      rooms.forEach(function (room) {
        var option = document.createElement('option');
        option.value = room.id;
        option.textContent = room.name;
        select.appendChild(option);
      });
    })
    .catch(function () {});

  if (App.isAdmin()) {
    App.api('/auth/users')
      .then(function (data) { teachers = data.users || []; })
      .catch(function () { teachers = []; });
  } else {
    teachers = App.user ? [App.user] : [];
  }

  function openEdit(id) {
    App.api('/borrowing/' + id)
      .then(function (data) {
        var session = data.session;
        document.getElementById('sessionId').value = session.id;
        document.getElementById('editLevel').value = session.level || '';
        document.getElementById('editClass').value = session.class_name;
        document.getElementById('editSubject').value = session.subject;
        document.getElementById('editDate').value = session.session_date;
        document.getElementById('editStart').value = session.start_time;
        document.getElementById('editEnd').value = session.end_time;
        document.getElementById('editRoom').value = session.room_id || '';
        document.getElementById('editNotes').value = session.notes || '';
        App.openModal('sessionModal');
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  }

  function openImportModal() {
    importState = { valid: [], invalid: [] };
    var preview = document.getElementById('importPreview');
    if (preview) {
      preview.hidden = true;
      preview.innerHTML = '';
    }
    var input = document.getElementById('importFile');
    if (input) input.value = '';
    var submit = document.getElementById('importSubmitBtn');
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'استيراد';
    }
    App.openModal('importModal');
  }

  function csvCell(value) {
    var text = String(value == null ? '' : value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function downloadTemplate() {
    var today = App.today();
    var due = new Date();
    due.setDate(due.getDate() + 7);
    var dueText = due.toISOString().slice(0, 10);
    var headers = ['الوسيلة', 'الأستاذ', 'تاريخ الإرجاع المتوقع', 'تاريخ الإعارة', 'الكمية', 'ملاحظات'];
    var sample = ['APP-001', (App.user && App.user.full_name) || 'الأستاذ', dueText, today, '1', 'استعمال في الحصة'];
    var csv = '\ufeff' + [headers, sample].map(function (row) { return row.map(csvCell).join(','); }).join('\r\n') + '\r\n';
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'نموذج-استيراد-الإعارة.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  function normalizeDate(value) {
    var text = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    var match = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (!match) return '';
    var year = Number(match[3]);
    if (year < 100) year += 2000;
    return year + '-' + String(match[2]).padStart(2, '0') + '-' + String(match[1]).padStart(2, '0');
  }

  function findItem(value, items) {
    var text = String(value || '').trim().toLowerCase();
    if (!text) return null;
    return items.find(function (item) {
      if (String(item.code || '').toLowerCase() === text) return true;
      if (String(item.name || '').toLowerCase() === text) return true;
      if (String(item.name_ar || '').toLowerCase() === text) return true;
      return String(item.aliases_text || '')
        .toLowerCase()
        .split('|')
        .some(function (alias) { return alias && alias === text; });
    }) || null;
  }

  function findTeacher(value) {
    var text = String(value || '').trim().toLowerCase();
    if (!text) return null;
    return teachers.find(function (teacher) {
      return String(teacher.full_name || '').toLowerCase() === text || String(teacher.username || '').toLowerCase() === text;
    }) || null;
  }

  function buildImportRows(rows, items) {
    var valid = [];
    var invalid = [];
    rows.forEach(function (row, index) {
      var line = index + 2;
      try {
        var itemText = row['الوسيلة'] || row.item || row.code || row['الرمز'];
        var item = findItem(itemText, items);
        if (!item) throw new Error('الوسيلة غير موجودة: ' + (itemText || '—'));

        var teacherText = row['الأستاذ'] || row.teacher || '';
        var teacher = findTeacher(teacherText);
        if (!teacher && App.isAdmin()) throw new Error('الأستاذ غير موجود: ' + (teacherText || '—'));
        if (teacher && !App.isAdmin() && teacher.id !== (App.user || {}).id) throw new Error('لا يمكنك الاستيراد باسم أستاذ آخر');
        if (!teacher) teacher = App.user || null;

        var due = normalizeDate(row['تاريخ الإرجاع المتوقع'] || row.due_date || row['تاريخ الإرجاع']);
        if (!due) throw new Error('تاريخ الإرجاع المتوقع مطلوب (YYYY-MM-DD)');

        var date = normalizeDate(row['تاريخ الإعارة'] || row.date || App.today()) || App.today();
        var quantity = Number(row['الكمية'] || row.quantity || 1);
        if (!quantity || quantity < 1) throw new Error('كمية غير صالحة');

        var roomName = String(row['القاعة'] || row.room || '').trim();
        var room = roomName ? rooms.find(function (entry) { return entry.name === roomName; }) : null;
        var start = String(row['من'] || row.start || '08:00').trim().slice(0, 5);
        var end = String(row['إلى'] || row.end || '').trim().slice(0, 5);

        valid.push({
          item: item,
          teacher: teacher,
          due: due,
          date: date,
          quantity: quantity,
          notes: String(row['ملاحظات'] || row.notes || '').trim(),
          className: String(row['القسم'] || row.class || row.class_name || 'استيراد Excel').trim(),
          subject: String(row['المادة'] || row.subject || 'إعارة مستوردة').trim(),
          room: room,
          start: start,
          end: end
        });
      } catch (error) {
        invalid.push('السطر ' + line + ': ' + error.message);
      }
    });
    return { valid: valid, invalid: invalid };
  }

  function renderImportPreview() {
    var preview = document.getElementById('importPreview');
    var submit = document.getElementById('importSubmitBtn');
    if (!preview || !submit) return;
    var valid = importState.valid;
    var invalid = importState.invalid;
    preview.hidden = false;
    if (!valid.length && !invalid.length) {
      preview.innerHTML = '<span class="muted">لم يتم العثور على صفوف صالحة.</span>';
      submit.disabled = true;
      return;
    }

    var rows = valid.slice(0, 5).map(function (row) {
      return '<tr><td>' + App.escape(row.item.name_ar || row.item.name) + '</td><td>' + App.escape((row.teacher && row.teacher.full_name) || '—') + '</td><td dir="ltr">' + App.escape(row.date) + '</td><td>' + row.quantity + '</td></tr>';
    }).join('');

    preview.innerHTML =
      '<strong>' + valid.length + ' صف صالح' + (invalid.length ? ' · ' + invalid.length + ' صف فيه خطأ' : '') + '</strong>' +
      (rows ? '<table><thead><tr><th>الوسيلة</th><th>الأستاذ</th><th>التاريخ</th><th>الكمية</th></tr></thead><tbody>' + rows + '</tbody></table>' : '') +
      (invalid.length ? '<ul class="import-errors">' + invalid.slice(0, 5).map(function (message) { return '<li>' + App.escape(message) + '</li>'; }).join('') + '</ul>' : '');
    submit.disabled = valid.length === 0;
  }

  function inspectImportFile(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      App.toast('حجم الملف كبير جداً (الحد 5 ميغابايت)', 'error');
      return;
    }
    App.toast('جارٍ فحص الملف…', 'ok');
    Promise.all([Actions.readFile(file), App.api('/inventory')])
      .then(function (results) {
        var parsed = Actions.parseCsv(results[0]);
        if (!parsed.rows.length) throw new Error('الملف فارغ أو بلا صفوف صالحة');
        var items = (results[1] && results[1].items) || [];
        importState = buildImportRows(parsed.rows, items);
        renderImportPreview();
        if (importState.valid.length) App.toast('تم فحص الملف — راجع النتيجة ثم اضغط «استيراد»', 'ok');
      })
      .catch(function (error) {
        importState = { valid: [], invalid: [] };
        var preview = document.getElementById('importPreview');
        if (preview) {
          preview.hidden = false;
          preview.innerHTML = '<span class="muted">' + App.escape(error.message) + '</span>';
        }
        var submit = document.getElementById('importSubmitBtn');
        if (submit) submit.disabled = true;
        App.toast(error.message, 'error');
      });
  }

  function runImport() {
    var valid = importState.valid;
    if (!valid.length) return;
    var button = document.getElementById('importSubmitBtn');
    button.disabled = true;
    button.textContent = 'جارٍ الاستيراد…';
    var stats = { ok: 0, failed: 0, errors: [] };

    valid.reduce(function (chain, line) {
      return chain.then(function () {
        var body = {
          teacher_id: App.isAdmin() && line.teacher ? line.teacher.id : undefined,
          class_name: line.className,
          subject: line.subject,
          session_date: line.date,
          start_time: line.start,
          due_date: line.due,
          notes: line.notes || undefined,
          items: [{ inventory_id: line.item.id, quantity: line.quantity, condition_out: 'good' }]
        };
        if (line.end) body.end_time = line.end;
        if (line.room) body.room_id = line.room.id;
        return App.api('/borrowing', { method: 'POST', body: body }).then(
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
        App.closeModal('importModal');
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

  function load() {
    var params = [];
    var status = document.getElementById('status').value;
    var date = document.getElementById('date').value;
    if (status) params.push('status=' + status);
    if (date) params.push('date=' + date);

    App.api('/borrowing' + (params.length ? '?' + params.join('&') : ''))
      .then(function (data) {
        state.sessions = data.sessions;
        render();
      })
      .catch(function (error) {
        rows.innerHTML = '<tr><td colspan="11" class="empty">' + App.escape(error.message) + '</td></tr>';
      });
  }

  function render() {
    if (state.sessions.length === 0) {
      rows.innerHTML = '<tr><td colspan="11" class="empty">لا توجد جلسات إعارة</td></tr>';
      return;
    }
    rows.innerHTML = state.sessions
      .map(function (session) {
        return (
          '<tr data-id="' + session.id + '">' +
          '<td>' + session.id + '</td>' +
          '<td>' + App.fmtDate(session.session_date) + '</td>' +
          '<td>' + session.start_time + ' - ' + session.end_time + '</td>' +
          '<td>' + App.escape(session.class_name) + '</td>' +
          '<td>' + App.escape(session.subject) + '</td>' +
          '<td>' + App.escape(session.teacher_name) + '</td>' +
          '<td>' + App.escape(session.room_name || '—') + '</td>' +
          '<td>' + session.item_count + '</td>' +
          '<td>' + session.units_returned + ' / ' + session.units_out + '</td>' +
          '<td>' + App.statusBadge(session.status) + '</td>' +
          '<td class="row-actions">' +
          '<button class="btn btn-sm" data-detail="' + session.id + '">تفاصيل</button>' +
          '<a class="btn btn-sm" href="/borrowing/receipt.html?id=' + session.id + '" target="_blank" rel="noopener">🧾 وصل</a>' +
          (session.status !== 'returned'
            ? '<button class="btn btn-sm btn-primary" data-return="' + session.id + '">إرجاع</button>'
            : '') +
          '<button class="btn btn-sm btn-danger" data-delete="' + session.id + '" title="حذف">' + App.icon('trash') + '</button>' +
          '</td></tr>'
        );
      })
      .join('');

    rows.querySelectorAll('[data-detail]').forEach(function (button) {
      button.addEventListener('click', function () { showDetails(Number(button.dataset.detail)); });
    });
    rows.querySelectorAll('[data-return]').forEach(function (button) {
      button.addEventListener('click', function () { openReturn(Number(button.dataset.return)); });
    });
    rows.querySelectorAll('[data-delete]').forEach(function (button) {
      button.addEventListener('click', function () {
                 if (!confirm(App.t('حذف جلسة الإعارة نهائياً؟ سيتم إرجاع الكميات غير المُرجعة إلى المخزون.') || 'حذف جلسة الإعارة نهائياً؟ سيتم إرجاع الكميات غير المُرجعة إلى المخزون.')) return;
        App.api('/borrowing/' + button.dataset.delete, { method: 'DELETE' })
          .then(function () {
            App.toast('تم حذف جلسة الإعارة', 'ok');
            load();
          })
          .catch(function (error) { App.toast(error.message, 'error'); });
      });
    });
  }

  function showDetails(id) {
    App.api('/borrowing/' + id)
      .then(function (data) {
        var session = data.session;
        var summary =
          '<div class="session-summary">' +
          '<div>القسم<strong>' + App.escape(session.class_name) + '</strong></div>' +
          '<div>المادة<strong>' + App.escape(session.subject) + '</strong></div>' +
          '<div>الأستاذ<strong>' + App.escape(session.teacher_name) + '</strong></div>' +
          '<div>المستوى<strong>' + App.escape(session.level || '—') + '</strong></div>' +
          '<div>القاعة<strong>' + App.escape(session.room_name || '—') + '</strong></div>' +
          '<div>التاريخ<strong>' + App.fmtDate(session.session_date) + '</strong></div>' +
          '<div>الحالة<strong>' + App.statusLabel(session.status) + '</strong></div>' +
          '</div>';

        var table =
          '<div class="table-wrap"><table><thead><tr><th>الصنف</th><th>الرمز</th><th>معار</th><th>مُرجع</th><th>حالة الإرجاع</th></tr></thead><tbody>' +
          session.items
            .map(function (item) {
              return (
                '<tr><td>' + App.escape(item.name_ar || item.name) + (item.notes ? '<br><small class="muted">' + App.escape(item.notes) + '</small>' : '') + '</td><td>' + App.escape(item.code) +
                (item.owner_no ? '<br><small class="muted">جرد خاص ' + App.escape(item.owner_no) + '</small>' : '') +
                '</td>' +
                '<td>' + item.quantity_out + ' ' + App.escape(item.unit) + '</td>' +
                '<td>' + (item.condition_out === 'consumed' ? '—' : item.quantity_returned) + '</td>' +
                '<td>' + (item.condition_out === 'consumed' ? '<span class="badge warn">مستهلك</span>' : item.damaged === 1 ? '<span class="badge danger">تالف/مفقود</span>' : item.quantity_returned >= item.quantity_out ? '<span class="badge ok">سليم</span>' : '<span class="badge warn">معلّق</span>') + '</td></tr>'
              );
            })
            .join('') +
          '</tbody></table></div>';

        document.getElementById('detailBody').innerHTML = summary + table + (session.notes ? '<p class="muted">ملاحظات: ' + App.escape(session.notes) + '</p>' : '');
        App.openModal('detailModal');
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  }

  function openReturn(id) {
    App.api('/borrowing/' + id)
      .then(function (data) {
        activeSession = data.session;
        document.getElementById('returnInfo').textContent =
          data.session.class_name + ' — ' + App.fmtDate(data.session.session_date) + ' (' + data.session.start_time + '-' + data.session.end_time + ')';

        var pending = data.session.items.filter(function (item) {
          return item.condition_out !== 'consumed' && item.quantity_returned < item.quantity_out;
        });
        var consumed = data.session.items.filter(function (item) { return item.condition_out === 'consumed'; });
        if (pending.length === 0) {
          App.toast(consumed.length ? 'لا يوجد ما يُرجع: العناصر مستهلكة أو أُرجعت كلها' : 'كل العناصر أُرجعت بالفعل', 'ok');
          return;
        }

        document.getElementById('returnRows').innerHTML = pending
          .map(function (item) {
            var remaining = item.quantity_out - item.quantity_returned;
            return (
              '<div class="return-line" data-item="' + item.id + '">' +
              '<div class="line-name">' + App.escape(item.name_ar || item.name) +
              '<small>معار ' + item.quantity_out + ' — متبقٍ ' + remaining + ' ' + App.escape(item.unit) + '</small></div>' +
              '<input type="number" min="0" max="' + remaining + '" value="' + remaining + '" aria-label="الكمية المرجعة" />' +
              '<select aria-label="حالة الصنف">' +
              '<option value="good">سليم</option>' +
              '<option value="damaged">تالف</option>' +
              '<option value="missing">مفقود</option>' +
              '</select></div>'
            );
          })
          .join('');
        App.openModal('returnModal');
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  }

  document.getElementById('returnForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!activeSession) return;

    var items = [];
    document.querySelectorAll('#returnRows .return-line').forEach(function (line) {
      var quantity = Number(line.querySelector('input').value);
      var condition = line.querySelector('select').value;
      if (quantity > 0) items.push({ item_id: Number(line.dataset.item), quantity: quantity, condition_in: condition });
    });

    if (items.length === 0) {
      App.toast('أدخل كمية واحدة على الأقل', 'error');
      return;
    }

    App.api('/borrowing/' + activeSession.id + '/return', { method: 'POST', body: { items: items } })
      .then(function (data) {
        App.closeModal('returnModal');
        App.toast('تم تسجيل الإرجاع — الحالة: ' + App.statusLabel(data.session.status), 'ok');
        load();
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  document.getElementById('sessionForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var id = document.getElementById('sessionId').value;
    var roomId = document.getElementById('editRoom').value;
    var payload = {
      level: document.getElementById('editLevel').value.trim() || undefined,
      class_name: document.getElementById('editClass').value.trim(),
      subject: document.getElementById('editSubject').value.trim(),
      session_date: document.getElementById('editDate').value,
      start_time: document.getElementById('editStart').value,
      end_time: document.getElementById('editEnd').value,
      notes: document.getElementById('editNotes').value.trim() || undefined
    };
    if (roomId) payload.room_id = Number(roomId);

    App.api('/borrowing/' + id, { method: 'PUT', body: payload })
      .then(function () {
        App.closeModal('sessionModal');
        App.toast('تم حفظ تعديل الإعارة', 'ok');
        load();
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  document.getElementById('deleteSessionBtn').addEventListener('click', function () {
    var id = document.getElementById('sessionId').value;
    if (!id) return;
             if (!confirm(App.t('حذف جلسة الإعارة نهائياً؟ سيتم إرجاع الكميات غير المُرجعة إلى المخزون.') || 'حذف جلسة الإعارة نهائياً؟ سيتم إرجاع الكميات غير المُرجعة إلى المخزون.')) return;
    App.api('/borrowing/' + id, { method: 'DELETE' })
      .then(function () {
        App.closeModal('sessionModal');
        App.toast('تم حذف جلسة الإعارة', 'ok');
        load();
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  document.getElementById('fillAllBtn').addEventListener('click', function () {
    document.querySelectorAll('#returnRows input').forEach(function (input) {
      input.value = input.max;
    });
    App.toast('تم تعبئة الكميات المتبقية — اضغط «تأكيد الإرجاع»', 'ok');
  });

  document.getElementById('downloadTemplateBtn').addEventListener('click', downloadTemplate);

  document.getElementById('importFile').addEventListener('change', function (event) {
    var file = event.target.files && event.target.files[0];
    inspectImportFile(file);
  });

  var dropZone = document.getElementById('importDrop');
  ['dragenter', 'dragover'].forEach(function (name) {
    dropZone.addEventListener(name, function (event) {
      event.preventDefault();
      dropZone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function (name) {
    dropZone.addEventListener(name, function (event) {
      event.preventDefault();
      dropZone.classList.remove('dragover');
    });
  });
  dropZone.addEventListener('drop', function (event) {
    var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    inspectImportFile(file);
  });

  document.getElementById('importSubmitBtn').addEventListener('click', runImport);

  document.getElementById('status').addEventListener('change', load);
  document.getElementById('date').addEventListener('change', load);
  document.getElementById('resetBtn').addEventListener('click', function () {
    document.getElementById('status').value = '';
    document.getElementById('date').value = '';
    load();
  });

  load();
  App.preparePrintPage('سجل الإعارات والإرجاع');
})();
