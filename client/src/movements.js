(function () {
  'use strict';
  if (!App.mount('movements')) return;

  var list = document.getElementById('movementList');
  var state = { type: '', movements: [], items: [], loadedItems: false };
  var AR_MONTHS = ['جانفي', 'فيفري', 'مارس', 'أفريل', 'ماي', 'جوان', 'جويلية', 'أوت', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

  var META = {
    in: { label: 'إدخال', icon: '↓', className: 'in' },
    consume: { label: 'استهلاك', icon: '↑', className: 'consume' },
    damage: { label: 'كسر / تلف', icon: '⚒', className: 'damage' },
    adjust: { label: 'تسوية جرد', icon: '⚖', className: 'adjust' }
  };

  function fmtMovementDate(value) {
    var raw = String(value || '').slice(0, 10);
    var match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return raw || '—';
    return Number(match[3]) + ' ' + AR_MONTHS[Number(match[2]) - 1] + ' ' + match[1];
  }

  function render() {
    if (!state.movements.length) {
      list.innerHTML = '<div class="empty">لا توجد حركات مسجلة بعد. أضف حركة جديدة أو عدّل كمية صنف من الجرد.</div>';
      return;
    }
    list.innerHTML = state.movements
      .map(function (movement) {
        var meta = META[movement.type] || META.adjust;
        var quantity = Number(movement.quantity) || 0;
        var sign = quantity > 0 ? '+' : '';
        return (
          '<article class="movement-card ' + meta.className + '">' +
          '<span class="movement-icon">' + meta.icon + '</span>' +
          '<div class="movement-main"><strong>' + App.escape(movement.item_name) + '</strong>' +
          '<small>' + App.escape(fmtMovementDate(movement.movement_date)) + (movement.reason ? ' · ' + App.escape(movement.reason) : '') + '</small></div>' +
          '<div class="movement-side"><span class="movement-badge ' + meta.className + '">' + sign + quantity + ' ' + meta.label + '</span>' +
          '<small>الرصيد: ' + movement.balance_after + ' ' + App.escape(movement.unit || '') + '</small></div>' +
          '</article>'
        );
      })
      .join('');
  }

  function load() {
    var query = state.type ? '?type=' + encodeURIComponent(state.type) : '';
    App.api('/inventory/movements' + query)
      .then(function (data) {
        state.movements = data.movements || [];
        render();
      })
      .catch(function (error) {
        list.innerHTML = '<div class="empty">' + App.escape(error.message) + '</div>';
      });
  }

  function loadItems() {
    return App.api('/inventory').then(function (data) {
      state.items = data.items || [];
      state.loadedItems = true;
      var select = document.getElementById('movementItem');
      select.innerHTML = state.items
        .map(function (item) {
          return '<option value="' + item.id + '">' + App.escape(item.name_ar || item.name) + ' — ' + item.available_quantity + ' ' + App.escape(item.unit) + '</option>';
        })
        .join('');
      if (!state.items.length) select.innerHTML = '<option value="">لا توجد أصناف في الجرد</option>';
    });
  }

  function openMovement(type) {
    if (!App.isAdmin()) {
      App.toast('تسجيل الحركات متاح للمدير فقط', 'error');
      return;
    }
    var meta = META[type] || META.in;
    document.getElementById('movementType').value = type;
    document.getElementById('movementModalTitle').textContent = type === 'adjust' ? 'تسوية جرد' : 'حركة جديدة';
    document.getElementById('movementQuantityLabel').textContent = type === 'adjust' ? 'الرصيد الجديد' : 'الكمية';
    document.getElementById('movementQuantity').min = type === 'adjust' ? '0' : '1';
    document.getElementById('movementQuantity').value = '';
    document.getElementById('movementReason').value = '';
    document.getElementById('movementDate').value = App.today();
    document.getElementById('movementHint').textContent = type === 'adjust'
      ? 'أدخل الرصيد الإجمالي بعد الجرد. سيُحسب الفرق تلقائياً.'
      : 'النوع: ' + meta.label + '. سيُخصم أو يُضاف من رصيد الصنف المحدد.';

    var show = function () { App.openModal('movementModal'); };
    if (state.loadedItems) show();
    else loadItems().then(show).catch(function (error) { App.toast(error.message, 'error'); });
  }

  document.getElementById('movementFilters').addEventListener('click', function (event) {
    var button = event.target.closest('[data-type]');
    if (!button) return;
    document.querySelectorAll('.movement-filter[data-type]').forEach(function (other) {
      other.classList.toggle('active', other === button);
    });
    state.type = button.dataset.type || '';
    load();
  });

  document.getElementById('newMovementBtn').addEventListener('click', function () { openMovement('in'); });
  document.getElementById('adjustBtn').addEventListener('click', function () { openMovement('adjust'); });

  document.getElementById('movementForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var type = document.getElementById('movementType').value;
    var itemId = document.getElementById('movementItem').value;
    var quantity = Number(document.getElementById('movementQuantity').value);
    if (!itemId) {
      App.toast('اختر صنفاً من الجرد', 'error');
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 0 || (type !== 'adjust' && quantity < 1)) {
      App.toast('أدخل كمية صحيحة', 'error');
      return;
    }
    var button = document.getElementById('movementSubmitBtn');
    button.disabled = true;
    App.api('/inventory/movements', {
      method: 'POST',
      body: {
        item_id: Number(itemId),
        type: type,
        quantity: quantity,
        reason: document.getElementById('movementReason').value.trim() || undefined,
        movement_date: document.getElementById('movementDate').value
      }
    })
      .then(function () {
        App.closeModal('movementModal');
        App.toast('تم تسجيل الحركة', 'ok');
        state.loadedItems = false;
        load();
      })
      .catch(function (error) { App.toast(error.message, 'error'); })
      .then(function () { button.disabled = false; });
  });

  if (!App.isAdmin()) {
    document.getElementById('newMovementBtn').disabled = true;
    document.getElementById('adjustBtn').disabled = true;
  }

  load();
  App.preparePrintPage('سجل الحركات');
})();
