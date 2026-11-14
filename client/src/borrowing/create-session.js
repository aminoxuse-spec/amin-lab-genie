(function () {
  'use strict';
  if (!App.mount('borrowing')) return;

  var inventory = [];
  var lines = document.getElementById('lines');
  var emptyRow = document.getElementById('emptyRow');
  var counter = 0;

  document.getElementById('sessionDate').value = App.today();

  function hideEmpty() {
    if (emptyRow && emptyRow.parentNode) emptyRow.remove();
  }

  function optionList(kind) {
    var items = inventory.filter(function (item) {
      return kind === 'chemical' ? item.category === 'chemical' : item.category !== 'chemical';
    });
    if (items.length === 0) {
      return '<option value="">— لا توجد عناصر متوفرة —</option>';
    }
    return items
      .map(function (item) {
        return (
          '<option value="' + item.id + '"' + (item.available_quantity <= 0 ? ' disabled' : '') + '>' +
          App.escape(item.code + ' — ' + item.name + ' (' + item.available_quantity + ' ' + item.unit + ')') +
          '</option>'
        );
      })
      .join('');
  }

  function addLine(kind) {
    hideEmpty();
    counter += 1;
    var row = document.createElement('tr');
    row.dataset.kind = kind;
    row.dataset.line = String(counter);

    var conditions =
      kind === 'chemical'
        ? '<option value="good">صالح</option><option value="consumed">مستهلك</option>'
        : '<option value="good">صالح</option><option value="damaged">تالف مسبقاً</option>';

    row.innerHTML =
      '<td><select data-role="item" required>' + optionList(kind) + '</select></td>' +
      '<td><input data-role="qty" type="number" min="1" step="1" value="1" required /></td>' +
      '<td><select data-role="condition">' + conditions + '</select></td>' +
      '<td><input data-role="notes" maxlength="120" placeholder="اختياري" /></td>' +
      '<td class="row-actions"><button class="btn btn-sm btn-danger" type="button" data-remove="' + counter + '">حذف</button></td>';

    row.querySelector('[data-remove]').addEventListener('click', function () {
      row.remove();
      if (!lines.querySelector('tr')) {
        lines.appendChild(emptyRow);
      }
    });

    lines.appendChild(row);
  }

  document.getElementById('addEquipmentBtn').addEventListener('click', function () { addLine('equipment'); });
  document.getElementById('addChemicalBtn').addEventListener('click', function () { addLine('chemical'); });

  Promise.all([App.api('/inventory'), App.api('/rooms')])
    .then(function (results) {
      inventory = results[0].items;
      var roomSelect = document.getElementById('roomId');
      results[1].rooms.forEach(function (room) {
        var option = document.createElement('option');
        option.value = room.id;
        option.textContent = room.name;
        roomSelect.appendChild(option);
      });

      // فتح الصفحة من ماسح QR: تعبئة الوسيلة مباشرة
      var preselected = Number(new URLSearchParams(location.search).get('item') || 0);
      var target = inventory.find(function (item) { return item.id === preselected; });

      if (target) {
        addLine(target.category === 'chemical' ? 'chemical' : 'equipment');
        var added = document.querySelectorAll('#lines tr[data-kind]');
        var last = added[added.length - 1];
        var select = last.querySelector('[data-role="item"]');
        if (select) select.value = String(target.id);
      } else {
        addLine('equipment');
      }
    })
    .catch(function (error) { App.toast(error.message, 'error'); });

  // اسم الأستاذ: المدير يختار، والأستاذ يظهر باسمه فقط
  var teacherSelect = document.getElementById('teacherId');
  var me = App.user || {};
  if (App.isAdmin()) {
    App.api('/auth/users')
      .then(function (data) {
        teacherSelect.innerHTML = data.users
          .map(function (user) {
            return '<option value="' + user.id + '"' + (user.id === me.id ? ' selected' : '') + '>' +
              App.escape(user.full_name + (user.role === 'admin' ? ' (مدير)' : '')) + '</option>';
          })
          .join('');
      })
      .catch(function () { teacherSelect.innerHTML = '<option value="">' + App.escape(me.full_name || '—') + '</option>'; });
  } else {
    teacherSelect.innerHTML = '<option value="' + me.id + '">' + App.escape(me.full_name || '—') + '</option>';
    teacherSelect.disabled = true;
  }

  document.getElementById('sessionForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var button = document.getElementById('submitBtn');

    var items = [];
    document.querySelectorAll('#lines tr[data-kind]').forEach(function (row) {
      var select = row.querySelector('[data-role="item"]');
      if (!select.value) return;
      var quantity = Number(row.querySelector('[data-role="qty"]').value);
      if (!quantity || quantity < 1) return;
      items.push({
        inventory_id: Number(select.value),
        quantity: quantity,
        condition_out: row.querySelector('[data-role="condition"]').value,
        notes: row.querySelector('[data-role="notes"]').value.trim() || undefined
      });
    });

    if (items.length === 0) {
      App.toast('أضف عتاداً أو مادة كيميائية واحدة على الأقل', 'error');
      return;
    }

    var payload = {
      class_name: document.getElementById('className').value.trim(),
      subject: document.getElementById('subject').value.trim(),
      session_date: document.getElementById('sessionDate').value,
      start_time: document.getElementById('startTime').value,
      level: document.getElementById('level').value.trim() || undefined,
      notes: document.getElementById('notes').value.trim() || undefined,
      items: items
    };

    var roomId = document.getElementById('roomId').value;
    if (roomId) payload.room_id = Number(roomId);
    if (App.isAdmin() && teacherSelect.value) payload.teacher_id = Number(teacherSelect.value);

    button.disabled = true;
    button.textContent = 'جارٍ الحفظ…';

    App.api('/borrowing', { method: 'POST', body: payload })
      .then(function (data) {
        App.toast('تم حفظ الإعارة #' + data.session.id, 'ok');
        location.href = '/borrowing/receipt.html?id=' + data.session.id + '&print=1';
      })
      .catch(function (error) {
        App.toast(error.message, 'error');
        button.disabled = false;
        button.textContent = '💾 حفظ الإعارة';
      });
  });
})();
