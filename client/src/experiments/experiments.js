(function () {
  'use strict';

  if (!App.mount('experiments')) return;

  var STAGES = ['middle', 'secondary'];

  var sections = {
    middle: {
      stage: 'middle',
      all: [],
      cache: [],
      getter: null
    },
    secondary: {
      stage: 'secondary',
      all: [],
      cache: [],
      getter: null
    }
  };

  document.getElementById('pageActions').innerHTML =
    '<button class="btn" type="button" id="printAllBtn">🖨️ طباعة الكل</button>';
  document.getElementById('printAllBtn').addEventListener('click', function () {
    window.print();
  });

  function escape(value) {
    return App.escape(value);
  }

  function printSection(stage) {
    document.body.classList.add('printing-' + stage);
    window.print();
    setTimeout(function () {
      document.body.classList.remove('printing-' + stage);
    }, 700);
  }

  function fillSelect(select, values, selected) {
    var current = selected || select.value;
    select.innerHTML = '<option value="">كل ' + (select.id.indexOf('Level') !== -1 ? 'المستويات' : 'المواد') + '</option>' +
      values.map(function (value) {
        return '<option value="' + escape(value) + '"' + (value === current ? ' selected' : '') + '>' + escape(value) + '</option>';
      }).join('');
  }

  function populateFilters(stage) {
    var section = sections[stage];
    var levels = Array.from(new Set(section.all.map(function (item) { return item.level; }))).sort();
    var subjects = Array.from(new Set(section.all.map(function (item) { return item.subject; }).filter(Boolean))).sort();
    fillSelect(document.getElementById(stage + 'Level'), levels);
    fillSelect(document.getElementById(stage + 'Subject'), subjects);
  }

  function applyFilters(stage) {
    var section = sections[stage];
    var query = document.getElementById(stage + 'Search').value.trim().toLowerCase();
    var level = document.getElementById(stage + 'Level').value;
    var subject = document.getElementById(stage + 'Subject').value;

    var filtered = section.all.filter(function (item) {
      if (level && item.level !== level) return false;
      if (subject && (item.subject || '') !== subject) return false;
      if (query) {
        var haystack = [item.level, item.subject, item.title, item.objective, item.materials, item.notes]
          .join(' ')
          .toLowerCase();
        if (haystack.indexOf(query) === -1) return false;
      }
      return true;
    });

    section.cache = filtered;
    render(stage, filtered);
    document.getElementById(stage + 'ResultCount').textContent = filtered.length + ' نتيجة';
  }

  function render(stage, items) {
    var body = document.getElementById(stage + 'Body');
    if (!items.length) {
      body.innerHTML = '<tr><td colspan="8" class="empty">لا توجد تجارب مطابقة</td></tr>';
      return;
    }

    body.innerHTML = items.map(function (item) {
      return (
        '<tr data-id="' + item.id + '">' +
        '<td>' + escape(item.level) + '</td>' +
        '<td>' + escape(item.subject || '—') + '</td>' +
        '<td><strong>' + escape(item.title) + '</strong></td>' +
        '<td class="wrap">' + escape(item.objective || '—') + '</td>' +
        '<td class="wrap">' + escape(item.materials || '—') + '</td>' +
        '<td>' + (item.duration_minutes === null || item.duration_minutes === undefined ? '—' : item.duration_minutes + ' د') + '</td>' +
        '<td class="wrap">' + escape(item.notes || '—') + '</td>' +
        '<td class="no-print row-actions">' +
        '<button class="btn btn-sm" data-edit="' + item.id + '" title="تعديل">' + App.icon('pencil') + '</button>' +
        '<button class="btn btn-sm btn-danger" data-delete="' + item.id + '" title="حذف">' + App.icon('trash') + '</button>' +
        '</td></tr>'
      );
    }).join('');

    body.querySelectorAll('[data-edit]').forEach(function (button) {
      button.addEventListener('click', function () {
        var item = items.find(function (row) { return row.id === Number(button.dataset.edit); });
        if (item) openForm(item, stage);
      });
    });

    body.querySelectorAll('[data-delete]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!confirm(App.t('حذف هذه التجربة نهائياً؟') || 'حذف هذه التجربة نهائياً؟')) return;
        App.api('/experiments/' + button.dataset.delete, { method: 'DELETE' })
          .then(function () {
            App.toast('تم حذف التجربة', 'ok');
            load(stage);
          })
          .catch(function (error) { App.toast(error.message, 'error'); });
      });
    });
  }

  function load(stage) {
    App.api('/experiments?stage=' + encodeURIComponent(stage))
      .then(function (data) {
        var section = sections[stage];
        section.all = data.experiments || [];
        document.getElementById(stage + 'Count').textContent = section.all.length + ' تجربة';
        populateFilters(stage);
        applyFilters(stage);
      })
      .catch(function (error) {
        document.getElementById(stage + 'Body').innerHTML =
          '<tr><td colspan="8" class="empty">' + escape(error.message) + '</td></tr>';
      });
  }

  function openForm(item, stage) {
    document.getElementById('experimentModalTitle').textContent = item ? 'تعديل تجربة' : 'تجربة جديدة';
    document.getElementById('experimentId').value = item ? item.id : '';
    document.getElementById('experimentStage').value = stage;
    document.getElementById('experimentLevel').value = item ? item.level : '';
    document.getElementById('experimentSubject').value = item && item.subject ? item.subject : '';
    document.getElementById('experimentTitle').value = item ? item.title : '';
    document.getElementById('experimentObjective').value = item && item.objective ? item.objective : '';
    document.getElementById('experimentMaterials').value = item && item.materials ? item.materials : '';
    document.getElementById('experimentDuration').value = item && item.duration_minutes !== null ? item.duration_minutes : '';
    document.getElementById('experimentNotes').value = item && item.notes ? item.notes : '';
    App.openModal('experimentModal');
  }

  function importExperiments(file, stage) {
    Actions.importRows({
      file: file,
      transform: function (row) {
        var level = (row.level || row['المستوى'] || '').trim();
        var title = (row.title || row['العنوان'] || row['التجربة'] || row['اسم التجربة'] || '').trim();
        if (!level) throw new Error('المستوى مطلوب');
        if (!title) throw new Error('عنوان التجربة مطلوب');

        var durationRaw = (row.duration_minutes || row['المدة'] || row['duration'] || '').trim();
        var duration = undefined;
        if (durationRaw) {
          duration = Number(durationRaw);
          if (!Number.isFinite(duration) || duration < 0) throw new Error('مدة غير صالحة');
        }

        return {
          stage: stage,
          level: level,
          subject: (row.subject || row['المادة'] || '').trim(),
          title: title,
          objective: (row.objective || row['الهدف'] || '').trim(),
          materials: (row.materials || row['الأجهزة'] || row['المواد'] || '').trim(),
          duration_minutes: duration,
          notes: (row.notes || row['ملاحظات'] || '').trim()
        };
      },
      submit: function (payload) {
        return App.api('/experiments', { method: 'POST', body: payload });
      },
      done: function () {
        load(stage);
      }
    });
  }

  STAGES.forEach(function (stage) {
    var section = sections[stage];
    section.getter = Actions.selection(document.getElementById(stage + 'Body'), null);

    Actions.bar(document.getElementById(stage + 'Actions'), {
      // برنامج التجارب متاح لكل مستخدم مُسجَّل
      allow: { import: true, add: true, edit: true, print: true },
      onPrint: function () { printSection(stage); },
      onAdd: function () { openForm(null, stage); },
      onEdit: function () {
        var id = section.getter();
        var item = section.cache.find(function (row) { return row.id === id; });
        if (!item) {
          App.toast('اختر تجربة من الجدول أولاً ثم اضغط «تعديل»', 'error');
          return;
        }
        openForm(item, stage);
      },
      onImport: function (file) { importExperiments(file, stage); }
    });

    ['Search', 'Level', 'Subject'].forEach(function (suffix) {
      var input = document.getElementById(stage + suffix);
      if (!input) return;
      input.addEventListener(suffix === 'Search' ? 'input' : 'change', function () {
        if (suffix === 'Search') {
          clearTimeout(input._debounce);
          input._debounce = setTimeout(function () { applyFilters(stage); }, 200);
        } else {
          applyFilters(stage);
        }
      });
    });
  });

  document.getElementById('experimentForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var id = document.getElementById('experimentId').value;
    var stage = document.getElementById('experimentStage').value;
    var durationRaw = document.getElementById('experimentDuration').value.trim();
    var duration = durationRaw ? Number(durationRaw) : undefined;
    if (durationRaw && !Number.isFinite(duration)) {
      App.toast('مدة غير صالحة', 'error');
      return;
    }

    var payload = {
      stage: stage,
      level: document.getElementById('experimentLevel').value.trim(),
      subject: document.getElementById('experimentSubject').value.trim(),
      title: document.getElementById('experimentTitle').value.trim(),
      objective: document.getElementById('experimentObjective').value.trim(),
      materials: document.getElementById('experimentMaterials').value.trim(),
      duration_minutes: duration,
      notes: document.getElementById('experimentNotes').value.trim()
    };

    App.api(id ? '/experiments/' + id : '/experiments', {
      method: id ? 'PUT' : 'POST',
      body: payload
    })
      .then(function () {
        App.closeModal('experimentModal');
        App.toast('تم حفظ التجربة', 'ok');
        load(stage);
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  document.querySelectorAll('[data-close]').forEach(function (button) {
    button.addEventListener('click', function () {
      App.closeModal(button.dataset.close);
    });
  });

  STAGES.forEach(load);
  App.preparePrintPage('برنامج التجارب التطبيقية');
})();