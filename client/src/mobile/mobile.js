/* تطبيق الأساتذة — واجهة مستقلة خفيفة تتصل بخادم التطبيق الأساسي عبر الـAPI. */
(function () {
  'use strict';

  var SESSION_KEY = 'amin.mobile.session';
  var SERVER_KEY = 'amin.mobile.server';
  var STATUS_LABEL = {
    pending: 'بانتظار الموافقة',
    approved: 'مقبولة',
    rejected: 'مرفوضة',
    cancelled: 'ملغاة',
  };

  var state = {
    token: '',
    user: null,
    base: '',
    requests: [],
    items: [],
    selected: {},
    filter: '',
    view: 'list',
  };

  function $(id) { return document.getElementById(id); }

  function toast(message, isError) {
    var node = $('toast');
    node.textContent = message;
    node.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { node.className = 'toast'; }, 2600);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function apiBase() { return String(state.base || '').replace(/\/+$/, ''); }

  function api(path, options) {
    var opts = options || {};
    var headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    return fetch(apiBase() + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (!response.ok) throw new Error(data.error || 'تعذّر تنفيذ الطلب');
        return data;
      });
    });
  }

  function saveSession() {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token: state.token, user: state.user }));
      localStorage.setItem(SERVER_KEY, apiBase());
    } catch (error) { /* التخزين غير متاح */ }
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (error) { /* تجاهل */ }
    state.token = '';
    state.user = null;
  }

  /* ---------------------------- الدخول ---------------------------- */

  function showLogin() {
    $('loginView').classList.remove('hidden');
    $('listView').classList.add('hidden');
    $('newView').classList.add('hidden');
    $('stockView').classList.add('hidden');
    $('stockTab').hidden = true;
    $('tabs').classList.add('hidden');
    $('refreshBtn').classList.add('hidden');
    $('logoutBtn').classList.add('hidden');
  }

  function showApp() {
    $('loginView').classList.add('hidden');
    $('tabs').classList.remove('hidden');
    $('refreshBtn').classList.remove('hidden');
    $('logoutBtn').classList.remove('hidden');
    // تبويب الجرد للمدير فقط؛ الخادم يرفض التعديل لأي حساب آخر.
    var admin = Boolean(state.user && state.user.role === 'admin');
    $('stockTab').hidden = !admin;
    if (!admin && state.view === 'stock') state.view = 'list';
    $('userLine').textContent = (state.user && state.user.full_name ? state.user.full_name : 'أستاذ') +
      (state.user && state.user.role === 'admin' ? ' · مدير' : '');
    switchView('list');
    loadRequests();
    loadItems();
  }

  function login() {
    var username = $('username').value.trim();
    var password = $('password').value;
    var server = $('serverUrl').value.trim();
    if (!username || !password) { toast('أدخل اسم المستخدم وكلمة المرور', true); return; }
    if (server) state.base = server;
    $('loginBtn').disabled = true;
    api('/api/auth/login', { method: 'POST', body: { username: username, password: password } })
      .then(function (data) {
        state.token = data.token;
        state.user = data.user;
        saveSession();
        $('password').value = '';
        showApp();
      })
      .catch(function (error) { toast(error.message, true); })
      .finally(function () { $('loginBtn').disabled = false; });
  }

  function logout() {
    clearSession();
    showLogin();
  }

  /* --------------------------- الطلبات ---------------------------- */

  function switchView(view) {
    state.view = view;
    $('listView').classList.toggle('hidden', view !== 'list');
    $('newView').classList.toggle('hidden', view !== 'new');
    $('stockView').classList.toggle('hidden', view !== 'stock');
    Array.prototype.forEach.call($('tabs').querySelectorAll('button'), function (button) {
      button.classList.toggle('active', button.getAttribute('data-view') === view);
    });
    if ((view === 'new' || view === 'stock') && !state.items.length) loadItems();
    if (view === 'stock') renderStock();
  }

  function loadRequests() {
    if (!state.token) return;
    $('requestsBody').innerHTML = '<div class="empty">جارٍ التحميل…</div>';
    var query = state.filter ? '?status=' + encodeURIComponent(state.filter) : '';
    api('/api/requests' + query)
      .then(function (data) {
        state.requests = data.requests || [];
        renderRequests();
      })
      .catch(function (error) {
        $('requestsBody').innerHTML = '<div class="empty">' + escapeHtml(error.message) + '</div>';
      });
  }

  function renderRequests() {
    var body = $('requestsBody');
    if (!state.requests.length) {
      body.innerHTML = '<div class="card"><div class="empty">لا توجد طلبات. استخدم «طلب جديد».</div></div>';
      return;
    }
    body.innerHTML = state.requests.map(function (request) {
      var items = (request.items || []).map(function (item) {
        return '<li>' + escapeHtml(item.name_ar || item.name) +
          (item.owner_no ? ' <small class="muted">· جرد خاص ' + escapeHtml(item.owner_no) + '</small>' : '') +
          ' × ' + item.quantity + ' ' + escapeHtml(item.unit || '') + '</li>';
      }).join('');
      var decision = request.admin_note
        ? '<p class="muted">ملاحظة المدير: ' + escapeHtml(request.admin_note) + '</p>'
        : '';
      return '<article class="card">' +
        '<div class="req-head"><strong>' + escapeHtml(request.class_name) + ' · ' + escapeHtml(request.subject) + '</strong>' +
        '<span class="badge ' + request.status + '">' + STATUS_LABEL[request.status] + '</span></div>' +
        '<div class="muted">' + escapeHtml(request.session_date) + ' · ' + escapeHtml(request.start_time) + ' → ' + escapeHtml(request.end_time) + '</div>' +
        (items ? '<ul class="items">' + items + '</ul>' : '') +
        decision +
        (request.status === 'pending'
          ? '<div class="u-margin-top-6rem"><button class="btn btn-danger btn-block" type="button" data-cancel="' + request.id + '">إلغاء الطلب</button></div>'
          : '') +
        '</article>';
    }).join('');

    Array.prototype.forEach.call(body.querySelectorAll('[data-cancel]'), function (button) {
      button.addEventListener('click', function () {
        if (!confirm('إلغاء هذا الطلب؟')) return;
        api('/api/requests/' + button.getAttribute('data-cancel') + '/cancel', { method: 'POST' })
          .then(function () { toast('أُلغي الطلب'); loadRequests(); })
          .catch(function (error) { toast(error.message, true); });
      });
    });
  }

  /* ---------------------------- الوسائل ---------------------------- */

  function loadItems() {
    if (!state.token) return;
    api('/api/inventory')
      .then(function (data) {
        state.items = (data.items || []).filter(function (item) { return !item.deleted_at; });
        renderItems();
        renderStock();
      })
      .catch(function (error) {
        $('itemsBody').innerHTML = '<div class="empty">' + escapeHtml(error.message) + '</div>';
      });
  }

  function renderItems() {
    var term = $('itemSearch').value.trim().toLowerCase();
    var list = state.items.filter(function (item) {
      var haystack = String(item.name || '') + ' ' + String(item.name_ar || '') + ' ' + String(item.code || '');
      return !term || haystack.toLowerCase().indexOf(term) !== -1;
    });
    var body = $('itemsBody');
    if (!list.length) {
      body.innerHTML = '<div class="empty">لا نتائج.</div>';
      return;
    }
    body.innerHTML = list.map(function (item) {
      var picked = state.selected[item.id];
      var available = Number(item.available_quantity || 0);
      return '<div class="item-row">' +
        '<input type="checkbox" data-pick="' + item.id + '"' + (picked ? ' checked' : '') + ' />' +
        '<span class="name">' + escapeHtml(item.name_ar || item.name) +
        (item.owner_no ? ' <small class="muted">· ' + escapeHtml(item.owner_no) + '</small>' : '') +
        '<br><small class="muted">متوفر ' + available + ' ' + escapeHtml(item.unit || '') + '</small></span>' +
        '<input class="qty" type="number" min="1" step="1" value="' + (picked ? picked.quantity : 1) + '" data-qty="' + item.id + '"' + (available <= 0 ? ' disabled' : '') + ' />' +
        '</div>';
    }).join('');

    Array.prototype.forEach.call(body.querySelectorAll('[data-pick]'), function (box) {
      box.addEventListener('change', function () {
        var id = Number(box.getAttribute('data-pick'));
        if (box.checked) {
          state.selected[id] = { id: id, quantity: 1 };
        } else {
          delete state.selected[id];
        }
        updateSummary();
      });
    });
    Array.prototype.forEach.call(body.querySelectorAll('[data-qty]'), function (input) {
      input.addEventListener('input', function () {
        var id = Number(input.getAttribute('data-qty'));
        if (state.selected[id]) {
          state.selected[id].quantity = Math.max(1, Number(input.value) || 1);
          updateSummary();
        }
      });
    });
    updateSummary();
  }

  /* ----------------------- تعديل الجرد (مدير) ---------------------- */

  function renderStock() {
    var body = $('stockBody');
    if (!body) return;
    // لا نبني قائمة الجرد المخفية على هاتف الأستاذ: التعديل للمدير فقط.
    if (!state.user || state.user.role !== 'admin') return;
    var term = ($('stockSearch').value || '').trim().toLowerCase();
    var list = state.items.filter(function (item) {
      var haystack = String(item.name || '') + ' ' + String(item.name_ar || '') + ' ' + String(item.code || '') + ' ' + String(item.owner_no || '');
      return !term || haystack.toLowerCase().indexOf(term) !== -1;
    });
    if (!list.length) {
      body.innerHTML = '<div class="empty">لا نتائج.</div>';
      return;
    }
    body.innerHTML = list.map(function (item) {
      var total = Number(item.quantity || 0);
      var available = Number(item.available_quantity || 0);
      var borrowed = Math.max(0, total - available);
      return '<div class="item-row">' +
        '<span class="name">' + escapeHtml(item.name_ar || item.name) +
        (item.code ? ' <small class="muted">· ' + escapeHtml(item.code) + '</small>' : '') +
        '<br><small class="muted">إجمالي ' + total + ' · متوفر ' + available + ' ' + escapeHtml(item.unit || '') +
        (borrowed > 0 ? ' · معار ' + borrowed : '') + '</small></span>' +
        '<input class="qty" type="number" min="0" step="1" inputmode="numeric" value="' + total + '" data-stock="' + item.id + '" />' +
        '<button class="btn btn-sm" type="button" data-save="' + item.id + '">حفظ</button>' +
        '</div>';
    }).join('');

    Array.prototype.forEach.call(body.querySelectorAll('[data-save]'), function (button) {
      button.addEventListener('click', function () {
        var id = Number(button.getAttribute('data-save'));
        var input = body.querySelector('[data-stock="' + id + '"]');
        var value = Number(input.value);
        if (!Number.isInteger(value) || value < 0) {
          toast('أدخل كمية صحيحة (0 أو أكثر)', true);
          return;
        }
        button.disabled = true;
        api('/api/inventory/movements', {
          method: 'POST',
          body: {
            item_id: id,
            type: 'adjust',
            quantity: value,
            reason: 'تعديل الجرد من الهاتف',
          },
        })
          .then(function (data) {
            if (data && data.item) {
              state.items = state.items.map(function (row) {
                return row.id === id ? data.item : row;
              });
            }
            toast('تم تحديث كمية الجرد');
            renderStock();
            renderItems();
            updateSummary();
          })
          .catch(function (error) {
            toast(error.message, true);
            button.disabled = false;
          });
      });
    });
  }

  function selectedLines() {
    return Object.keys(state.selected).map(function (key) { return state.selected[key]; });
  }

  function updateSummary() {
    var lines = selectedLines();
    $('selectedSummary').textContent = lines.length
      ? 'محدّد: ' + lines.length + ' وسيلة · ' + lines.reduce(function (sum, line) { return sum + line.quantity; }, 0) + ' وحدة'
      : 'لم تُحدّد وسائل بعد.';
  }

  /* --------------------------- إرسال طلب --------------------------- */

  function submitRequest() {
    var lines = selectedLines();
    if (!lines.length) { toast('اختر وسيلة واحدة على الأقل', true); return; }
    var payload = {
      session_date: $('reqDate').value,
      start_time: $('reqStart').value,
      end_time: $('reqEnd').value,
      class_name: $('reqClass').value.trim(),
      subject: $('reqSubject').value,
      notes: $('reqNotes').value.trim(),
      items: lines.map(function (line) { return { inventory_id: line.id, quantity: line.quantity }; }),
    };
    if (!payload.session_date) { toast('حدّد التاريخ', true); return; }
    if (!payload.class_name) { toast('أدخل القسم', true); return; }
    if (payload.start_time >= payload.end_time) { toast('وقت البداية يجب أن يسبق النهاية', true); return; }

    $('submitBtn').disabled = true;
    api('/api/requests', { method: 'POST', body: payload })
      .then(function () {
        toast('تم إرسال الطلب إلى المدير');
        state.selected = {};
        $('reqNotes').value = '';
        renderItems();
        switchView('list');
        loadRequests();
      })
      .catch(function (error) { toast(error.message, true); })
      .finally(function () { $('submitBtn').disabled = false; });
  }

  /* --------------------------- التهيئة ---------------------------- */

  function boot() {
    var origin = location.origin && location.origin.indexOf('http') === 0 ? location.origin : '';
    var storedServer = '';
    try { storedServer = localStorage.getItem(SERVER_KEY) || ''; } catch (error) { /* تجاهل */ }
    state.base = storedServer || origin;
    $('serverUrl').value = state.base;

    var today = new Date();
    $('reqDate').value = today.toISOString().slice(0, 10);

    $('loginBtn').addEventListener('click', login);
    $('password').addEventListener('keydown', function (event) { if (event.key === 'Enter') login(); });
    $('logoutBtn').addEventListener('click', logout);
    $('refreshBtn').addEventListener('click', function () { loadRequests(); loadItems(); });
    $('itemSearch').addEventListener('input', renderItems);
    $('stockSearch').addEventListener('input', renderStock);
    $('submitBtn').addEventListener('click', submitRequest);

    Array.prototype.forEach.call($('tabs').querySelectorAll('button'), function (button) {
      button.addEventListener('click', function () { switchView(button.getAttribute('data-view')); });
    });
    Array.prototype.forEach.call($('statusChips').querySelectorAll('.chip'), function (chip) {
      chip.addEventListener('click', function () {
        state.filter = chip.getAttribute('data-status');
        Array.prototype.forEach.call($('statusChips').querySelectorAll('.chip'), function (other) {
          other.classList.toggle('active', other === chip);
        });
        loadRequests();
      });
    });

    try {
      var saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      if (saved && saved.token) {
        state.token = saved.token;
        state.user = saved.user;
        showApp();
        return;
      }
    } catch (error) { /* تجاهل */ }
    showLogin();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/mobile/sw.js', { scope: '/mobile/' }).catch(function () {
        /* التسجيل غير متاح دون HTTPS — لا يؤثر على الاستخدام */
      });
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
