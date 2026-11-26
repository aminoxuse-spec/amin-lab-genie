(function () {
  'use strict';
  if (!App.mount()) return;

  var sheet = document.getElementById('sheet');
  var countBadge = document.getElementById('count');
  var sizeSelect = document.getElementById('size');
  var categorySelect = document.getElementById('category');
  var searchInput = document.getElementById('search');
  var trialNote = document.getElementById('trialNote');

  var state = { items: [], trial: true, institution: {}, onlyIds: [] };
  var idsParam = new URLSearchParams(location.search).get('ids');
  if (idsParam) {
    state.onlyIds = idsParam
      .split(',')
      .map(function (value) { return Number(value.trim()); })
      .filter(function (value) { return Number.isInteger(value) && value > 0; });
  }

  document.getElementById('printBtn').addEventListener('click', function () { window.print(); });

  sizeSelect.addEventListener('change', function () {
    sheet.className = 'labels-sheet size-' + sizeSelect.value;
  });

  categorySelect.addEventListener('change', render);
  searchInput.addEventListener('input', render);

  function filtered() {
    var query = searchInput.value.trim().toLowerCase();
    var category = categorySelect.value;
    return state.items.filter(function (item) {
      if (state.onlyIds.length && state.onlyIds.indexOf(item.id) === -1) return false;
      if (category && item.category !== category) return false;
      if (
        query &&
        item.code.toLowerCase().indexOf(query) === -1 &&
        item.name.toLowerCase().indexOf(query) === -1 &&
        String(item.owner_no || '').toLowerCase().indexOf(query) === -1
      )
        return false;
      return true;
    });
  }

  function labelHtml(item, dataUrl) {
    var name = state.institution.name || 'مختبر العلوم';
    return (
      '<div class="label">' +
      '<img src="' + dataUrl + '" alt="QR ' + App.escape(item.code) + '" />' +
      '<div class="label-text">' +
      '<strong>' + App.escape(item.code) + '</strong>' +
      (item.owner_no ? '<b class="owner-no">' + App.escape(item.owner_no) + '</b>' : '') +
      '<span>' + App.escape(item.name_ar || item.name) + '</span>' +
      '<small>' + App.escape(name) + '</small>' +
      '</div>' +
      (state.trial ? '<span class="trial">نسخة تجريبية</span>' : '') +
      '</div>'
    );
  }

  function render() {
    var items = filtered();
    countBadge.textContent = items.length + ' ملصق';

    if (items.length === 0) {
      sheet.innerHTML = '<div class="empty">لا توجد وسائل مطابقة</div>';
      return;
    }

    Promise.all(
      items.map(function (item) {
        return QRKit.image(QRKit.payload(item.code), 240).then(function (dataUrl) {
          return { item: item, dataUrl: dataUrl };
        });
      }),
    )
      .then(function (entries) {
        sheet.innerHTML = entries
          .map(function (entry) { return labelHtml(entry.item, entry.dataUrl); })
          .join('');
      })
      .catch(function (error) {
        sheet.innerHTML = '<div class="empty">' + App.escape(error.message) + '</div>';
      });
  }

  Promise.all([
    App.api('/inventory'),
    QRKit.license(),
    App.loadInstitution(),
  ])
    .then(function (results) {
      state.items = results[0].items;
      state.trial = results[1].trial !== false;
      state.institution = results[2] || {};
      trialNote.hidden = !state.trial;
      sheet.className = 'labels-sheet size-' + sizeSelect.value;
      render();
    })
    .catch(function (error) {
      sheet.innerHTML = '<div class="empty">' + App.escape(error.message) + '</div>';
    });
})();
