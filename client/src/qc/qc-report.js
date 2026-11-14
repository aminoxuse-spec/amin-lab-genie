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
          '<div class="bar-track"><div class="bar-fill ' + status + '" style="width:' + percent + '%"></div></div>' +
          '<span>' + count + '</span></div>'
        );
      })
      .join('');
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
            '<i style="height:' + Math.max(2, okHeight) + 'px"></i>' +
            '<i class="issues" style="height:' + Math.max(2, issueHeight) + 'px"></i>' +
            '</div><span>' + day.check_date.slice(5) + '</span></div>'
          );
        })
        .join('') +
      '<div class="legend" style="grid-column:1/-1"><span><i style="background:#15803d"></i>سليم</span><span><i style="background:#f59e0b"></i>مشاكل</span></div>';
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

  function loadChecks() {
    var body = document.getElementById('checksBody');
    if (!body) return;
    App.api('/qc')
      .then(function (data) {
        checksCache = data.checks;
        document.getElementById('checksCount').textContent = data.checks.length + ' فحص';
        body.innerHTML = data.checks.length
          ? data.checks
              .map(function (check) {
                return (
                  '<tr data-id="' + check.id + '"><td>' + App.fmtDate(check.check_date) + '</td><td>' + App.escape(check.name) + '</td>' +
                  '<td>' + App.escape(check.code) + '</td><td>' + statusBadge(check.status) + '</td>' +
                  '<td>' + check.quantity_found + '</td><td class="wrap">' + App.escape(check.notes || '—') + '</td></tr>'
                );
              })
              .join('')
          : '<tr><td colspan="6" class="empty">لم تُسجَّل أي فحوصات بعد</td></tr>';
      })
      .catch(function (error) {
        body.innerHTML = '<tr><td colspan="6" class="empty">' + App.escape(error.message) + '</td></tr>';
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

    loadChecks();
  }

  loadAnalysis();
  App.preparePrintPage('سجل التجارب وفحوصات الجودة');
})();
