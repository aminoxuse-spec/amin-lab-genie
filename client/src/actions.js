/* Amin-Lab -Pro🔬 — شريط الأدوات الموحّد: استيراد · طباعة · إضافة · تعديل */
(function () {
  'use strict';

  var Actions = {
    /**
     * يبني شريط الأدوات داخل العنصر المحدد.
     * config: { onImport, onPrint, onAdd, onEdit, importLabel, printLabel, addLabel, editLabel }
     */
    bar: function (host, config) {
      if (!host) return;
      config = config || {};

      var labels = {
        import: config.importLabel || App.t('act.import'),
        print: config.printLabel || App.t('act.print'),
        add: config.addLabel || App.t('act.add'),
        edit: config.editLabel || App.t('act.edit')
      };
      var icons = {
        import: 'import',
        print: 'print',
        add: 'plus',
        edit: 'pencil'
      };

      host.innerHTML =
        '<div class="actions-bar">' +
        ['import', 'print', 'add', 'edit']
          .map(function (action) {
            return (
              '<button class="btn' + (action === 'add' ? ' btn-primary' : '') + '" type="button" data-act="' + action + '">' +
              '<span class="ico">' + App.icon(icons[action]) + '</span>' +
              '<span>' + App.escape(labels[action]) + '</span></button>'
            );
          })
          .join('') +
        '<input type="file" accept=".csv,text/csv" hidden />' +
        '</div>';

      var fileInput = host.querySelector('input[type="file"]');

      host.querySelector('[data-act="print"]').addEventListener('click', function () {
        if (config.onPrint) config.onPrint();
        else window.print();
      });

      host.querySelector('[data-act="add"]').addEventListener('click', function () {
        if (config.onAdd) config.onAdd();
        else App.toast('الإضافة غير متاحة في هذه الصفحة', 'error');
      });

      host.querySelector('[data-act="edit"]').addEventListener('click', function () {
        if (config.onEdit) config.onEdit();
        else App.toast('التعديل غير متاح في هذه الصفحة', 'error');
      });

      host.querySelector('[data-act="import"]').addEventListener('click', function () {
        if (!config.onImport) {
          App.toast('الاستيراد غير متاح في هذه الصفحة', 'error');
          return;
        }
        fileInput.click();
      });

      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        fileInput.value = '';
        if (file && config.onImport) config.onImport(file);
      });
    },

    readFile: function (file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result || '')); };
        reader.onerror = function () { reject(new Error('تعذّر قراءة الملف')); };
        reader.readAsText(file, 'utf-8');
      });
    },

    /** محلّل CSV بسيط يدعم علامات التنصيص والأسطر الجديدة داخل الخلايا. */
    parseCsv: function (text) {
      var content = String(text || '').replace(/^\uFEFF/, '');
      var rows = [];
      var field = '';
      var row = [];
      var quoted = false;

      for (var index = 0; index < content.length; index += 1) {
        var char = content[index];
        if (quoted) {
          if (char === '"') {
            if (content[index + 1] === '"') {
              field += '"';
              index += 1;
            } else {
              quoted = false;
            }
          } else {
            field += char;
          }
          continue;
        }
        if (char === '"') {
          quoted = true;
        } else if (char === ',' || char === ';' || char === '\t') {
          row.push(field);
          field = '';
        } else if (char === '\n') {
          row.push(field);
          rows.push(row);
          row = [];
          field = '';
        } else if (char !== '\r') {
          field += char;
        }
      }
      if (field !== '' || row.length) {
        row.push(field);
        rows.push(row);
      }

      rows = rows.filter(function (cells) {
        return cells.some(function (cell) { return String(cell).trim() !== ''; });
      });
      if (rows.length < 2) return { headers: [], rows: [] };

      var headers = rows[0].map(function (header) {
        return String(header).trim().toLowerCase();
      });

      return {
        headers: headers,
        rows: rows.slice(1).map(function (cells) {
          var record = {};
          headers.forEach(function (header, position) {
            record[header] = cells[position] === undefined ? '' : String(cells[position]).trim();
          });
          return record;
        })
      };
    },

    /**
     * استيراد صفوف ملف CSV تِباعاً مع تقرير بالنتائج.
     * opts: { file, transform(row, i) -> payload|null, submit(payload) -> Promise, done(stats) }
     */
    importRows: function (opts) {
      return Actions.readFile(opts.file).then(function (text) {
        var parsed = Actions.parseCsv(text);
        if (parsed.rows.length === 0) {
          App.toast('الملف فارغ أو بلا صفوف صالحة (تحقق من الترويسة)', 'error');
          return { ok: 0, failed: 0, errors: ['ملف بلا صفوف'] };
        }

        var stats = { ok: 0, failed: 0, errors: [] };
        return parsed.rows
          .reduce(function (chain, row, index) {
            return chain.then(function () {
              var payload;
              try {
                payload = opts.transform(row, index);
              } catch (error) {
                stats.failed += 1;
                if (stats.errors.length < 3) stats.errors.push('السطر ' + (index + 2) + ': ' + error.message);
                return undefined;
              }
              if (payload === null || payload === undefined) return undefined;
              return opts.submit(payload).then(
                function () { stats.ok += 1; },
                function (error) {
                  stats.failed += 1;
                  if (stats.errors.length < 3) stats.errors.push('السطر ' + (index + 2) + ': ' + error.message);
                },
              );
            });
          }, Promise.resolve())
          .then(function () {
            App.toast('استيراد: ' + stats.ok + ' ناجح · ' + stats.failed + ' فاشل', stats.failed ? 'error' : 'ok');
            if (stats.errors.length) App.toast(stats.errors.join(' · '), 'error');
            if (opts.done) opts.done(stats);
            return stats;
          });
      }).catch(function (error) {
        App.toast(error.message, 'error');
        return { ok: 0, failed: 0, errors: [error.message] };
      });
    },

    /** تمكين اختيار صف/بطاقة (العناصر تحمل data-id). يعيد دالة تُرجع المعرّف المحدد. */
    selection: function (tbody, onChange) {
      var current = null;
      if (!tbody) return function () { return null; };

      tbody.addEventListener('click', function (event) {
        var row = event.target.closest ? event.target.closest('[data-id]') : null;
        if (!row || !tbody.contains(row)) return;
        if (event.target.closest('button, a, input, select')) return;
        tbody.querySelectorAll('.selected').forEach(function (element) {
          element.classList.remove('selected');
        });
        row.classList.add('selected');
        current = Number(row.dataset.id);
        if (onChange) onChange(current);
      });

      return function () { return current; };
    }
  };

  window.Actions = Actions;
})();
