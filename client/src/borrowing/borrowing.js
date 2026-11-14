(function () {
  'use strict';
  if (!App.mount('borrowing')) return;

  var rows = document.getElementById('rows');
  var state = { sessions: [] };
  var activeSession = null;
  var rooms = [];
  var getSelected = null;

  Actions.bar(document.getElementById('pageActions'), {
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
    onImport: function (file) { importSessions(file); }
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

  /**
   * استيراد إعارات من CSV: صف لكل عنصر مع تكرار حقول الجلسة.
   * الأعمدة: date,start,end,level,class,subject,room,code,quantity,condition,notes
   */
  function importSessions(file) {
    App.api('/inventory')
      .then(function (data) {
        var byCode = {};
        data.items.forEach(function (item) { byCode[item.code] = item; });

        Actions.importRows({
          file: file,
          transform: function (row) {
            var code = (row.code || row['الرمز'] || '').trim();
            var item = byCode[code];
            if (!item) throw new Error('رمز غير موجود في الجرد: ' + code);
            var quantity = Number(row.quantity || row['الكمية'] || 0);
            if (!quantity || quantity < 1) throw new Error('كمية غير صالحة للصنف ' + code);
            var condition = (row.condition || row['الحالة'] || 'good').trim();
            var conditionMap = { 'صالح': 'good', 'مستهلك': 'consumed', 'تالف': 'damaged', good: 'good', consumed: 'consumed', damaged: 'damaged' };
            return {
              date: (row.date || row['التاريخ'] || App.today()).trim(),
              start: (row.start || row['من'] || '08:00').trim(),
              end: (row.end || row['إلى'] || '').trim(),
              level: (row.level || row['المستوى'] || '').trim(),
              className: (row['class'] || row.class_name || row['القسم'] || '').trim(),
              subject: (row.subject || row['المادة'] || '').trim(),
              room: (row.room || row['القاعة'] || '').trim(),
              item: item,
              quantity: quantity,
              condition: conditionMap[condition] || 'good',
              notes: (row.notes || row['ملاحظات'] || '').trim()
            };
          },
          submit: function (line) {
            if (!line.className || !line.subject) throw new Error('القسم والمادة مطلوبان');
            var room = rooms.find(function (entry) { return entry.name === line.room; });
            var body = {
              class_name: line.className,
              subject: line.subject,
              session_date: line.date,
              start_time: line.start,
              level: line.level || undefined,
              notes: line.notes || undefined,
              items: [{ inventory_id: line.item.id, quantity: line.quantity, condition_out: line.condition, notes: line.notes || undefined }]
            };
            if (line.end) body.end_time = line.end;
            if (room) body.room_id = room.id;
            return App.api('/borrowing', { method: 'POST', body: body });
          },
          done: function () { load(); }
        });
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
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
                '<tr><td>' + App.escape(item.name) + (item.notes ? '<br><small class="muted">' + App.escape(item.notes) + '</small>' : '') + '</td><td>' + App.escape(item.code) + '</td>' +
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
              '<div class="line-name">' + App.escape(item.name) +
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

  document.getElementById('fillAllBtn').addEventListener('click', function () {
    document.querySelectorAll('#returnRows input').forEach(function (input) {
      input.value = input.max;
    });
    App.toast('تم تعبئة الكميات المتبقية — اضغط «تأكيد الإرجاع»', 'ok');
  });

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
