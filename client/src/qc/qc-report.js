(function () {
  'use strict';

  var isDashboard = !!document.getElementById('checkForm');
  if (!App.mount('experiments')) return;

  var inventorySelect = document.getElementById('inventoryId');
  var inventoryCache = [];
  var checksCache = [];
  var getSelectedCheck = null;

  var printBtn = document.getElementById('printBtn');
  if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

  function statusBadge(status) {
    var map = { ok: 'ok', low: 'warn', expired: 'danger', damaged: 'danger' };
    return '<span class="badge ' + (map[status] || '') + '">' + App.conditionLabel(status) + '</span>';
  }

  function renderStats(summary) {
    var host = document.getElementById('stats');
    if (!host) return;
    host.innerHTML =
      '<div class="stat"><span>مؤشر الجودة</span><strong>' + summary.qualityRate + '%</strong><small>' + summary.totalChecks + ' فحص مسجل</small></div>' +
      '<div class="stat ' + (summary.issues ? 'warn' : 'ok') + '"><span>نتائج غير سليمة</span><strong>' + summary.issues + '</strong><small>تحتاج متابعة</small></div>' +
      '<div class="stat ' + (summary.lowStock ? 'warn' : 'ok') + '"><span>تحت الحد الأدنى</span><strong>' + summary.lowStock + '</strong><small>من ' + summary.total + ' صنف</small></div>' +
      '<div class="stat ' + (summary.expiring ? 'danger' : 'ok') + '"><span>قاربت الصلاحية</span><strong>' + summary.expiring + '</strong><small>خلال 60 يوماً</small></div>';
  }

  function renderBreakdown(breakdown) {
    var host = document.getElementById('breakdown');
    if (!host) return;
    var total = breakdown.reduce(function (sum, row) { return sum + row.total; }, 0);
    if (total === 0) {
      host.innerHTML = '<div class="empty">لم تُسجَّل أي فحوصات بعد</div>';
      return;
    }
    var order = ['ok', 'low', 'damaged', 'expired'];
    host.innerHTML = order
      .map(function (status) {
        var row = breakdown.find(function (entry) { return entry.status === status; });
        var count = row ? row.total : 0;
        var percent = Math.round((count / total) * 100);
        return (
          '<div class="bar-row"><span>' + App.conditionLabel(status) + '</span>' +
          '<div class="bar-track"><div class="bar-fill ' + status + '" data-w="' + percent + '"></div></div>' +
          '<span>' + count + '</span></div>'
        );
      })
      .join('');
    host.querySelectorAll('[data-w]').forEach(function (el) { el.style.width = el.dataset.w + '%'; });
  }

  function renderTrend(trend) {
    var host = document.getElementById('trend');
    if (!host) return;
    if (!trend || trend.length === 0) {
      host.innerHTML = '<div class="empty">لا توجد بيانات كافية لرسم الاتجاه</div>';
      return;
    }
    var max = Math.max.apply(null, trend.map(function (day) { return Math.max(day.ok, day.issues, 1); }));
    host.innerHTML =
      trend
        .map(function (day) {
          var okHeight = Math.round((day.ok / max) * 120);
          var issueHeight = Math.round((day.issues / max) * 120);
          return (
            '<div class="trend-day" title="' + day.check_date + '">' +
            '<div class="trend-bars">' +
            '<i data-h="' + Math.max(2, okHeight) + '"></i>' +
            '<i class="issues" data-h="' + Math.max(2, issueHeight) + '"></i>' +
            '</div><span>' + day.check_date.slice(5) + '</span></div>'
          );
        })
        .join('') +
      '<div class="legend u-grid-column-1-1"><span><i class="u-background-15803d"></i>سليم</span><span><i class="u-background-f59e0b"></i>مشاكل</span></div>';
  }

  function renderLists(lowStock, expiring) {
    var lowBody = document.getElementById('lowStockBody');
    if (lowBody) {
      lowBody.innerHTML = lowStock.length
        ? lowStock
            .map(function (item) {
              return (
                '<tr><td>' + App.escape(item.code) + '</td><td>' + App.escape(item.name) + '</td>' +
                '<td>' + App.categoryLabel(item.category) + '</td>' +
                '<td><span class="badge warn">' + item.available_quantity + '</span></td>' +
                '<td>' + item.min_quantity + '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="5" class="empty">كل الأصناف فوق الحد الأدنى</td></tr>';
    }

    var expiringBody = document.getElementById('expiringBody');
    if (expiringBody) {
      expiringBody.innerHTML = expiring.length
        ? expiring
            .map(function (item) {
              return (
                '<tr><td>' + App.escape(item.code) + '</td><td>' + App.escape(item.name) + '</td>' +
                '<td>' + App.fmtDate(item.expiry_date) + '</td><td>' + item.quantity + ' ' + App.escape(item.unit) + '</td></tr>'
              );
            })
            .join('')
        : '<tr><td colspan="4" class="empty">لا توجد مواد قاربت الصلاحية</td></tr>';
    }
  }

  function loadAnalysis() {
    App.api('/qc/analysis')
      .then(function (data) {
        renderStats(data.summary);
        renderBreakdown(data.breakdown);
        renderTrend(data.trend);
        renderLists(data.lowStock, data.expiring);
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  }

  var checksSearch = document.getElementById('checkSearch');
  var checksStatus = document.getElementById('checkStatus');

  var qcView = App.loadView(
    'qc',
    { sortKey: 'check_date', sortDir: 'desc', pageSize: 25 },
    { sortKeys: ['check_date', 'name', 'code', 'status', 'quantity_found', 'notes'], pageSizes: [0, 25, 50, 100] },
  );

  var QC_COLUMNS = [
    { key: 'check_date', label: 'التاريخ' },
    { key: 'name', label: 'الصنف' },
    { key: 'code', label: 'الرمز' },
    { key: 'status', label: 'النتيجة' },
    { key: 'quantity_found', label: 'الكمية' },
    { key: 'notes', label: 'ملاحظات' }
  ];

  var QC_SORT = {
    check_date: function (check) { return check.check_date || ''; },
    name: function (check) { return check.name || ''; },
    code: function (check) { return check.code || ''; },
    status: function (check) { return App.conditionLabel(check.status) || ''; },
    quantity_found: function (check) { return Number(check.quantity_found) || 0; },
    notes: function (check) { return check.notes || ''; }
  };

  function filteredChecks() {
    var term = (checksSearch ? checksSearch.value : '').trim().toLowerCase();
    var wanted = checksStatus ? checksStatus.value : '';
    var list = checksCache.filter(function (check) {
      if (wanted && check.status !== wanted) return false;
      if (!term) return true;
      return (String(check.name) + ' ' + String(check.code)).toLowerCase().indexOf(term) !== -1;
    });
    return App.sortBy(list, QC_SORT[qcView.sortKey], qcView.sortDir);
  }

  function renderChecks() {
    var body = document.getElementById('checksBody');
    if (!body) return;
    var list = filteredChecks();
    var pageSize = qcView.pageSize > 0 ? qcView.pageSize : Math.max(list.length, 1);
    var pages = Math.max(1, Math.ceil(list.length / pageSize));
    qcView.page = Math.min(Math.max(1, qcView.page), pages);
    var start = (qcView.page - 1) * pageSize;
    var pageRows = qcView.pageSize > 0 ? list.slice(start, start + pageSize) : list;

    var counter = document.getElementById('checksCount');
    if (counter) counter.textContent = list.length + ' فحص';

    var headRow = document.getElementById('checksHeadRow');
    if (headRow) headRow.innerHTML = App.sortHead(QC_COLUMNS, qcView.sortKey, qcView.sortDir);

    body.innerHTML = pageRows.length
      ? pageRows
          .map(function (check) {
            return (
              '<tr data-id="' + check.id + '"><td>' + App.fmtDate(check.check_date) + '</td><td>' + App.escape(check.name) + '</td>' +
              '<td><code>' + App.escape(check.code) + '</code></td><td>' + statusBadge(check.status) + '</td>' +
              '<td>' + check.quantity_found + '</td><td class="wrap">' + App.escape(check.notes || '—') + '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="6" class="empty">' +
        (checksCache.length ? 'لا توجد فحوصات مطابقة' : 'لم تُسجَّل أي فحوصات بعد') +
        '</td></tr>';

    var host = body.closest('.table-wrap');
    if (host) {
      var old = host.parentNode.querySelector('.inv-foot');
      if (old) old.remove();
      if (list.length) {
        host.insertAdjacentHTML(
          'afterend',
          App.pageFoot(qcView, list.length, start + 1, Math.min(start + pageSize, list.length), pages),
        );
      }
    }

    var scope = host ? host.parentNode : document;
    App.bindSort(scope, function (key) {
      App.toggleSort(qcView, key);
      App.saveView('qc', qcView);
      renderChecks();
    });
    App.bindPager(scope, qcView, function () {
      App.saveView('qc', qcView);
      renderChecks();
    });
  }

  if (checksSearch) {
    checksSearch.addEventListener('input', function () {
      qcView.page = 1;
      renderChecks();
    });
  }
  if (checksStatus) {
    checksStatus.addEventListener('change', function () {
      qcView.page = 1;
      renderChecks();
    });
  }

  function loadChecks() {
    App.api('/qc')
      .then(function (data) {
        checksCache = data.checks;
        renderChecks();
      })
      .catch(function (error) {
        var body = document.getElementById('checksBody');
        if (body) body.innerHTML = '<tr><td colspan="6" class="empty">' + App.escape(error.message) + '</td></tr>';
      });
  }

  function openCheck(check) {
    document.getElementById('checkId').value = check.id;
    document.getElementById('checkItemName').textContent = check.code + ' — ' + check.name;
    document.getElementById('editStatus').value = check.status;
    document.getElementById('editQuantity').value = check.quantity_found;
    document.getElementById('editCheckDate').value = check.check_date;
    document.getElementById('editCheckNotes').value = check.notes || '';
    App.openModal('checkModal');
  }

  /** استيراد فحوصات من CSV: code,status,quantity_found,check_date,notes */
  function importChecks(file) {
    if (inventoryCache.length === 0) {
      App.toast('انتظر تحميل قائمة الجرد ثم أعد المحاولة', 'error');
      return;
    }
    var byCode = {};
    inventoryCache.forEach(function (item) { byCode[item.code] = item; });

    Actions.importRows({
      file: file,
      transform: function (row) {
        var code = (row.code || row['الرمز'] || '').trim();
        var item = byCode[code];
        if (!item) throw new Error('رمز غير موجود في الجرد: ' + code);
        var rawStatus = (row.status || row['النتيجة'] || 'ok').trim();
        var statusMap = { 'سليم': 'ok', 'منخفض': 'low', 'كمية منخفضة': 'low', 'تالف': 'damaged', 'منتهي': 'expired', ok: 'ok', low: 'low', damaged: 'damaged', expired: 'expired' };
        var status = statusMap[rawStatus];
        if (!status) throw new Error('نتيجة غير معروفة: ' + rawStatus);
        return {
          inventory_id: item.id,
          check_date: (row.check_date || row['التاريخ'] || App.today()).trim(),
          status: status,
          quantity_found: Number(row.quantity_found || row['الكمية'] || 0),
          notes: (row.notes || row['ملاحظات'] || '').trim() || undefined
        };
      },
      submit: function (payload) { return App.api('/qc', { method: 'POST', body: payload }); },
      done: function () { loadChecks(); loadAnalysis(); }
    });
  }

  if (isDashboard) {
    document.getElementById('checkDate').value = App.today();

    Actions.bar(document.getElementById('pageActions'), {
      // مراقبة الجودة متاحة لكل مستخدم مُسجَّل
      allow: { import: true, add: true, edit: true, print: true },
      onPrint: function () { window.print(); },
      onAdd: function () {
        document.getElementById('inventoryId').focus();
        App.toast('اختر الصنف ثم سجّل الفحص من النموذج', 'ok');
      },
      onEdit: function () {
        var id = getSelectedCheck && getSelectedCheck();
        var check = checksCache.find(function (row) { return row.id === id; });
        if (!check) {
          App.toast('اختر سجلاً من «آخر الفحوصات» ثم اضغط «تعديل»', 'error');
          return;
        }
        openCheck(check);
      },
      onImport: function (file) { importChecks(file); }
    });

    getSelectedCheck = Actions.selection(document.getElementById('checksBody'), null);

    document.getElementById('checkEditForm').addEventListener('submit', function (event) {
      event.preventDefault();
      var id = document.getElementById('checkId').value;
      App.api('/qc/' + id, {
        method: 'PUT',
        body: {
          status: document.getElementById('editStatus').value,
          quantity_found: Number(document.getElementById('editQuantity').value),
          check_date: document.getElementById('editCheckDate').value,
          notes: document.getElementById('editCheckNotes').value.trim() || undefined
        }
      })
        .then(function () {
          App.closeModal('checkModal');
          App.toast('تم تحديث سجل الفحص', 'ok');
          loadChecks();
          loadAnalysis();
        })
        .catch(function (error) { App.toast(error.message, 'error'); });
    });

    App.api('/inventory')
      .then(function (data) {
        inventoryCache = data.items;
        inventorySelect.innerHTML = data.items
          .map(function (item) {
            return '<option value="' + item.id + '">' + App.escape(item.code + ' — ' + item.name) + '</option>';
          })
          .join('');
      })
      .catch(function (error) { App.toast(error.message, 'error'); });

    inventorySelect.addEventListener('change', function () {
      var item = inventoryCache.find(function (row) { return row.id === Number(inventorySelect.value); });
      if (item) document.getElementById('quantityFound').value = item.available_quantity;
    });

    document.getElementById('checkForm').addEventListener('submit', function (event) {
      event.preventDefault();
      App.api('/qc', {
        method: 'POST',
        body: {
          inventory_id: Number(inventorySelect.value),
          check_date: document.getElementById('checkDate').value,
          status: document.getElementById('status').value,
          quantity_found: Number(document.getElementById('quantityFound').value),
          notes: document.getElementById('notes').value.trim() || undefined
        }
      })
        .then(function () {
          App.toast('تم تسجيل الفحص', 'ok');
          document.getElementById('notes').value = '';
          loadAnalysis();
          loadChecks();
        })
        .catch(function (error) { App.toast(error.message, 'error'); });
    });

    function exportChecksCsv() {
      var list = filteredChecks();
      if (!list.length) {
        App.toast('لا توجد فحوصات لتصديرها', 'error');
        return;
      }
      var headers = ['check_date', 'code', 'name', 'status', 'quantity_found', 'notes'];
      var lines = list.map(function (check) {
        return [
          check.check_date,
          check.code,
          check.name,
          App.conditionLabel(check.status),
          check.quantity_found,
          check.notes || ''
        ];
      });
      var csv = '\ufeff' + [headers].concat(lines)
        .map(function (row) { return row.map(App.csvCell).join(','); })
        .join('\r\n') + '\r\n';
      var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      var link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'فحوصات-الجودة-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
      App.toast('تم تصدير ' + list.length + ' فحصاً (بالترتيب الحالي)', 'ok');
    }

    var qcCsvBtn = document.getElementById('qcCsvBtn');
    if (qcCsvBtn) qcCsvBtn.addEventListener('click', exportChecksCsv);

    loadChecks();
  }

  loadAnalysis();
  App.preparePrintPage('سجل التجارب وفحوصات الجودة');
})();
