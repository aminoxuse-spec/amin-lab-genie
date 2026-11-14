(function () {
  'use strict';

  var SECTIONS = {
    chemical: { key: 'chemicals', title: 'المواد الكيميائية', subtitle: 'مخزون المواد الكيميائية وكمياتها وتواريخ صلاحيتها' },
    glassware: { key: 'glassware', title: 'الزجاجيات', subtitle: 'الكؤوس والأنابيب والأدوات الزجاجية' },
    apparatus: { key: 'apparatus', title: 'العتاد', subtitle: 'الأجهزة والمعدات العلمية في المختبر' }
  };

  var categoryParam = new URLSearchParams(location.search).get('category') || '';
  var section = SECTIONS[categoryParam];
  if (!App.mount(section ? section.key : 'inventory')) return;

  var rows = document.getElementById('rows');
  var summary = document.getElementById('summary');
  var addBtn = document.getElementById('addBtn');
  var trashBtn = document.getElementById('trashBtn');
  var trashCount = document.getElementById('trashCount');
  var trashBody = document.getElementById('trashBody');
  var form = document.getElementById('itemForm');
  var categorySelect = document.getElementById('category');
  var cache = [];
  var fetchSelected = null;

  if (section) {
    document.title = section.title + ' — Amin-Lab -cem🔬';
    document.getElementById('pageTitle').textContent = section.title;
    document.getElementById('pageSubtitle').textContent = section.subtitle;
    categorySelect.value = categoryParam;
    // في صفحات الأقسام يكفي عدّاد النتائج بدل بطاقات الملخص الأربع
    var summaryNode = document.getElementById('summary');
    if (summaryNode) summaryNode.hidden = true;
  }

  // تبويبات الأقسام
  var tabs = [
    { label: 'الجرد العام', href: '/inventory/inventory.html', value: '' },
    { label: 'المواد الكيميائية', href: '/inventory/inventory.html?category=chemical', value: 'chemical' },
    { label: 'الزجاجيات', href: '/inventory/inventory.html?category=glassware', value: 'glassware' },
    { label: 'العتاد', href: '/inventory/inventory.html?category=apparatus', value: 'apparatus' }
  ];
  document.getElementById('sectionTabs').innerHTML = tabs
    .map(function (tab) {
      return '<a href="' + tab.href + '" class="' + (tab.value === categoryParam ? 'active' : '') + '">' + tab.label + '</a>';
    })
    .join('');

  if (App.isAdmin()) {
    if (addBtn) addBtn.hidden = false;
    trashBtn.hidden = false;
  }

  document.querySelectorAll('[data-close]').forEach(function (button) {
    button.addEventListener('click', function () {
      App.closeModal(button.dataset.close);
    });
  });

  // شريط الأدوات الموحّد: استيراد · طباعة · إضافة · تعديل
  Actions.bar(document.getElementById('pageActions'), {
    onPrint: function () { window.print(); },
    onAdd: function () { openForm(null); },
    onEdit: function () {
      var id = fetchSelected && fetchSelected();
      var item = cache.find(function (row) { return row.id === id; });
      if (!item) {
        App.toast('اختر صفاً من الجدول أولاً ثم اضغط «تعديل»', 'error');
        return;
      }
      openForm(item);
    },
    onImport: function (file) { importItems(file); }
  });

  fetchSelected = Actions.selection(rows, null);

  function defaultCategory(row) {
    return categoryParam || row.category || '';
  }

  function importItems(file) {
    Actions.importRows({
      file: file,
      transform: function (row) {
        var code = (row.code || row['الرمز'] || '').trim();
        var name = (row.name || row['الصنف'] || row['الاسم'] || '').trim();
        var category = defaultCategory(row);
        if (!code || !name) throw new Error('الرمز والاسم مطلوبان');
        if (!category) throw new Error('الفئة مطلوبة (apparatus | glassware | chemical)');
        if (['apparatus', 'glassware', 'chemical'].indexOf(category) === -1) throw new Error('فئة غير معروفة: ' + category);
        return {
          code: code,
          name: name,
          category: category,
          quantity: Number(row.quantity || row['الكمية'] || 0),
          unit: row.unit || row['الوحدة'] || 'قطعة',
          min_quantity: Number(row.min_quantity || row['الحد الأدنى'] || 1),
          location: row.location || row['المكان'] || '',
          expiry_date: row.expiry_date || row['الصلاحية'] || undefined
        };
      },
      submit: function (payload) {
        return App.api('/inventory', { method: 'POST', body: payload });
      },
      done: function () {
        load();
        loadTrash();
      }
    });
  }

  function filters() {
    var params = [];
    var q = document.getElementById('search').value.trim();
    var category = document.getElementById('category').value;
    var status = document.getElementById('status').value;
    if (q) params.push('q=' + encodeURIComponent(q));
    if (category) params.push('category=' + category);
    if (status === 'low') params.push('lowStock=true');
    return params.length ? '?' + params.join('&') : '';
  }

  function stockClass(item) {
    if (item.available_quantity === 0) return 'out';
    if (item.available_quantity <= item.min_quantity) return 'low';
    return '';
  }

  function render(items, stats) {
    cache = items;
    var counter = document.getElementById('resultCount');
    if (counter) counter.textContent = items.length + ' عنصر';
    trashCount.textContent = stats.deleted || 0;
    summary.innerHTML =
      '<div class="stat"><span>عدد الأصناف</span><strong>' + stats.total + '</strong></div>' +
      '<div class="stat"><span>إجمالي الوحدات</span><strong>' + stats.units + '</strong></div>' +
      '<div class="stat ' + (stats.lowStock ? 'warn' : 'ok') + '"><span>تحت الحد الأدنى</span><strong>' + stats.lowStock + '</strong></div>' +
      '<div class="stat ' + (stats.expiring ? 'danger' : 'ok') + '"><span>قاربت الصلاحية</span><strong>' + stats.expiring + '</strong></div>';

    if (items.length === 0) {
      rows.innerHTML = '<div class="empty">لا توجد أصناف مطابقة</div>';
      return;
    }

    rows.innerHTML = items
      .map(function (item) {
        var percent = item.quantity === 0 ? 0 : Math.round((item.available_quantity / item.quantity) * 100);
        var tone = item.available_quantity === 0 ? 'danger' : item.available_quantity <= item.min_quantity ? 'warn' : 'ok';
        var state = item.available_quantity === 0 ? 'نافد' : item.available_quantity <= item.min_quantity ? 'كمية منخفضة' : 'سليم';
        return (
          '<article class="inv-card" data-id="' + item.id + '">' +
          '<div class="inv-top"><div>' +
          '<div class="inv-title">' + App.escape(item.name) + '</div>' +
          '<div class="inv-code">' + App.escape(item.code) + ' · ' + App.categoryLabel(item.category) + '</div>' +
          '<div class="inv-chips"><span class="badge ' + tone + '">' + state + '</span></div>' +
          '</div><span class="badge qty">' + item.quantity + ' ' + App.escape(item.unit) + '</span></div>' +
          '<div class="inv-meta">' +
          '<span>' + App.icon('pin') + App.escape(item.location || 'بدون مكان') + '</span>' +
          '<span>' + item.available_quantity + ' / ' + item.quantity + ' ' + App.escape(item.unit) + '</span>' +
          (item.expiry_date ? '<span>' + App.fmtDate(item.expiry_date) + '</span>' : '') +
          '</div>' +
          '<div class="inv-stock"><div class="progress ' + stockClass(item) + '"><i style="width:' + percent + '%"></i></div>' +
          '<span>الحد الأدنى ' + item.min_quantity + '</span></div>' +
          '<div class="inv-actions">' +
          '<button class="btn" data-qr="' + item.id + '" title="رمز QR">' + App.icon('qr') + ' QR</button>' +
          (App.isAdmin()
            ? '<button class="btn" data-edit="' + item.id + '">' + App.icon('pencil') + ' تعديل</button>' +
              '<button class="btn danger" data-delete="' + item.id + '">' + App.icon('trash') + ' حذف</button>'
            : '') +
          '</div></article>'
        );
      })
      .join('');

    rows.querySelectorAll('[data-qr]').forEach(function (button) {
      button.addEventListener('click', function () {
        var item = items.find(function (row) { return row.id === Number(button.dataset.qr); });
        if (!item) return;
        if (window.QRKit) window.QRKit.showItem(item);
        else App.toast('جارٍ تحميل مولّد QR… أعد المحاولة', 'error');
      });
    });

    rows.querySelectorAll('[data-edit]').forEach(function (button) {
      button.addEventListener('click', function () {
        var item = items.find(function (row) { return row.id === Number(button.dataset.edit); });
        if (item) openForm(item);
      });
    });
    rows.querySelectorAll('[data-delete]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!confirm('نقل هذا الصنف إلى سلة المحذوفات؟ يمكنك استرجاعه لاحقاً.')) return;
        App.api('/inventory/' + button.dataset.delete, { method: 'DELETE' })
          .then(function () {
            App.toast('تم نقل الصنف إلى سلة المحذوفات — يمكنك استرجاعه', 'ok');
            load();
            loadTrash();
          })
          .catch(function (error) { App.toast(error.message, 'error'); });
      });
    });
  }

  function load() {
    var status = document.getElementById('status').value;
    App.api('/inventory' + filters())
      .then(function (data) {
        var items = status === 'out'
          ? data.items.filter(function (item) { return item.available_quantity === 0; })
          : data.items;
        render(items, data.summary);
        if (editParam) {
          var target = data.items.find(function (row) { return row.id === editParam; });
          if (target) openForm(target);
          editParam = 0;
        }
      })
      .catch(function (error) {
        rows.innerHTML = '<div class="empty">' + App.escape(error.message) + '</div>';
      });
  }

  function openForm(item) {
    document.getElementById('modalTitle').textContent = item ? 'تعديل صنف' : 'صنف جديد';
    document.getElementById('itemId').value = item ? item.id : '';
    document.getElementById('code').value = item ? item.code : '';
    document.getElementById('name').value = item ? item.name : '';
    document.getElementById('itemCategory').value = item ? item.category : (categoryParam || 'apparatus');
    document.getElementById('quantity').value = item ? item.quantity : 1;
    document.getElementById('unit').value = item ? item.unit : 'قطعة';
    document.getElementById('minQuantity').value = item ? item.min_quantity : 1;
    document.getElementById('location').value = item ? item.location || '' : '';
    document.getElementById('expiry').value = item && item.expiry_date ? item.expiry_date : '';
    App.openModal('itemModal');
  }

  function loadTrash() {
    if (!App.isAdmin()) return;
    App.api('/inventory/deleted')
      .then(function (data) {
        trashCount.textContent = data.count;
        if (data.items.length === 0) {
          trashBody.innerHTML = '<div class="empty">سلة المحذوفات فارغة</div>';
          return;
        }
        trashBody.innerHTML =
          '<table><thead><tr><th>الرمز</th><th>الصنف</th><th>الفئة</th><th>الكمية</th><th>تاريخ الحذف</th><th></th></tr></thead><tbody>' +
          data.items
            .map(function (item) {
              return (
                '<tr><td><code>' + App.escape(item.code) + '</code></td>' +
                '<td>' + App.escape(item.name) + '</td>' +
                '<td>' + App.categoryLabel(item.category) + '</td>' +
                '<td>' + item.quantity + ' ' + App.escape(item.unit) + '</td>' +
                '<td>' + App.fmtDate(item.deleted_at) + '</td>' +
                '<td class="row-actions">' +
                '<button class="btn btn-sm btn-primary" data-restore="' + item.id + '">↩️ استرجاع</button>' +
                '<button class="btn btn-sm btn-danger" data-purge="' + item.id + '">حذف نهائي</button>' +
                '</td></tr>'
              );
            })
            .join('') +
          '</tbody></table>';

        trashBody.querySelectorAll('[data-restore]').forEach(function (button) {
          button.addEventListener('click', function () {
            App.api('/inventory/' + button.dataset.restore + '/restore', { method: 'POST' })
              .then(function (data) {
                App.toast('تم استرجاع «' + data.item.name + '» إلى الجرد', 'ok');
                load();
                loadTrash();
              })
              .catch(function (error) { App.toast(error.message, 'error'); });
          });
        });

        trashBody.querySelectorAll('[data-purge]').forEach(function (button) {
          button.addEventListener('click', function () {
            if (!confirm('حذف نهائي لا يمكن التراجع عنه. متابعة؟')) return;
            App.api('/inventory/' + button.dataset.purge + '/permanent', { method: 'DELETE' })
              .then(function () {
                App.toast('تم الحذف النهائي', 'ok');
                load();
                loadTrash();
              })
              .catch(function (error) { App.toast(error.message, 'error'); });
          });
        });
      })
      .catch(function (error) {
        trashBody.innerHTML = '<div class="empty">' + App.escape(error.message) + '</div>';
      });
  }

  /** فتح نموذج التعديل مباشرة عند الوصول من ماسح QR (?edit=<id>). */
  var editParam = Number(new URLSearchParams(location.search).get('edit') || 0);

  trashBtn.addEventListener('click', function () {
    App.openModal('trashModal');
    loadTrash();
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var id = document.getElementById('itemId').value;
    var payload = {
      code: document.getElementById('code').value.trim(),
      name: document.getElementById('name').value.trim(),
      category: document.getElementById('itemCategory').value,
      quantity: Number(document.getElementById('quantity').value),
      unit: document.getElementById('unit').value.trim() || 'قطعة',
      min_quantity: Number(document.getElementById('minQuantity').value || 0),
      location: document.getElementById('location').value.trim(),
      expiry_date: document.getElementById('expiry').value || undefined
    };

    App.api(id ? '/inventory/' + id : '/inventory', { method: id ? 'PUT' : 'POST', body: payload })
      .then(function () {
        App.closeModal('itemModal');
        App.toast('تم حفظ الصنف', 'ok');
        load();
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  var debounce;
  document.getElementById('search').addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(load, 250);
  });
  categorySelect.addEventListener('change', load);
  document.getElementById('status').addEventListener('change', load);
  App.loadScript('/qr.js');

  load();
  loadTrash();
  App.preparePrintPage(section ? section.title : 'قائمة الجرد');
})();
