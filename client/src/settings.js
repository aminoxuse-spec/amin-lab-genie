(function () {
  'use strict';
  if (!App.mount('settings')) return;

  var state = { users: [], rooms: [], info: null, institution: null };
  var getSelectedUser = null;
  var logoData = '';

  /** تصغير الصورة قبل الحفظ (حد أقصى 512 بكسل، ثم 384/256 إن كانت كبيرة). */
  function resizeImage(file, maxSize) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var image = new Image();
        image.onload = function () {
          var scale = Math.min(1, maxSize / Math.max(image.width, image.height));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        };
        image.onerror = function () { reject(new Error('الملف ليس صورة صالحة')); };
        image.src = String(reader.result);
      };
      reader.onerror = function () { reject(new Error('تعذّر قراءة الملف')); };
      reader.readAsDataURL(file);
    });
  }

  function shrinkLogo(file) {
    return resizeImage(file, 512).then(function (data) {
      if (data.length <= 360_000) return data;
      return resizeImage(file, 320).then(function (smaller) {
        if (smaller.length <= 360_000) return smaller;
        return resizeImage(file, 200);
      });
    });
  }

  function showLogo(data) {
    logoData = data || '';
    var preview = document.getElementById('logoPreview');
    preview.hidden = !logoData;
    if (logoData) preview.src = logoData;
    document.getElementById('removeLogoBtn').hidden = !logoData;
  }

  function markColor(color) {
    document.querySelectorAll('#colorPalette .color-dot').forEach(function (button) {
      button.classList.toggle('active', String(button.dataset.color).toLowerCase() === String(color).toLowerCase());
    });
  }

  function fillInstitution(inst) {
    state.institution = inst;
    document.getElementById('appName').value = inst.app_name || '';
    document.getElementById('appLanguage').value = inst.language || 'ar';
    var color = inst.primary_color || '#16a34a';
    document.getElementById('primaryColor').value = color;
    markColor(color);
    document.getElementById('instName').value = inst.name || '';
    document.getElementById('instNameFr').value = inst.name_fr || '';
    document.getElementById('instLevel').value = inst.level || 'middle';
    document.getElementById('instSchoolYear').value = inst.school_year || '';
    document.getElementById('logoInPrint').checked = inst.logo_in_print !== false;
    showLogo(inst.logo || '');
    var signature = inst.signature || {};
    document.getElementById('sigLabAr').value = signature.lab || '';
    document.getElementById('sigLabFr').value = signature.lab_fr || '';
    document.getElementById('sigCounselorAr').value = signature.counselor || '';
    document.getElementById('sigCounselorFr').value = signature.counselor_fr || '';
    document.getElementById('sigDirectorAr').value = signature.director || '';
    document.getElementById('sigDirectorFr').value = signature.director_fr || '';

    if (!App.isAdmin()) {
      document.querySelectorAll('#institutionForm input, #institutionForm select, #institutionForm button').forEach(function (element) {
        if (element.id !== 'institutionPrintBtn' && element.id !== 'signaturesPrintBtn') element.disabled = true;
      });
    }
  }

  document.querySelectorAll('[data-close]').forEach(function (button) {
    button.addEventListener('click', function () { App.closeModal(button.dataset.close); });
  });

  Actions.bar(document.getElementById('pageActions'), {
    // إدارة المستخدمين والترخيص والمؤسسة: إضافة/تعديل/استيراد للمدير فقط
    allow: { import: App.isAdmin(), add: App.isAdmin(), edit: App.isAdmin(), print: true },
    onPrint: function () { window.print(); },
    onAdd: function () { openUser(null); },
    onEdit: function () {
      var id = getSelectedUser && getSelectedUser();
      var user = state.users.find(function (row) { return row.id === id; });
      if (!user) {
        App.toast('اختر مستخدماً من الجدول أولاً ثم اضغط «تعديل»', 'error');
        return;
      }
      openUser(user);
    },
    onImport: function (file) { importUsers(file); }
  });

  getSelectedUser = Actions.selection(document.getElementById('usersBody'), null);

  function renderStats(info) {
    document.getElementById('stats').innerHTML =
      '<div class="stat"><span>المستخدمون</span><strong>' + info.counts.users + '</strong></div>' +
      '<div class="stat"><span>القاعات</span><strong>' + info.counts.rooms + '</strong></div>' +
      '<div class="stat"><span>أصناف الجرد</span><strong>' + info.counts.inventory.total + '</strong><small>' + info.counts.inventory.units + ' وحدة</small></div>' +
      '<div class="stat ' + (info.counts.openSessions ? 'warn' : 'ok') + '"><span>إعارات مفتوحة</span><strong>' + info.counts.openSessions + '</strong></div>';

    var rows = [
      ['التطبيق', info.app],
      ['الإصدار', info.version],
      ['المنفذ', info.port],
      ['قاعدة البيانات', info.database],
      ['إجمالي الإعارات', info.counts.sessions],
      ['فحوصات اليوم', info.counts.checksToday]
    ];
    if (!App.isAdmin()) rows = rows.filter(function (row) { return row[0] !== 'قاعدة البيانات'; });

    document.getElementById('systemInfo').innerHTML = rows
      .map(function (row) {
        return '<div class="u-display-flex-justify-content-space-between-gap-6rem-padding-">' +
          '<span>' + row[0] + '</span><strong class="u-font-size-85rem-word-break-break-all">' + App.escape(row[1]) + '</strong></div>';
      })
      .join('');
  }

  function renderUsers() {
    var body = document.getElementById('usersBody');
    document.getElementById('usersCount').textContent = state.users.length;
    body.innerHTML = state.users.length
      ? state.users
          .map(function (user) {
            return (
              '<tr data-id="' + user.id + '"><td>' + user.id + '</td>' +
              '<td><code>' + App.escape(user.username) + '</code></td>' +
              '<td>' + App.escape(user.full_name) + '</td>' +
              '<td>' + (user.role === 'admin' ? '<span class="badge info">مدير</span>' : '<span class="badge">أستاذ</span>') + '</td>' +
              '<td class="row-actions">' +
              '<button class="btn btn-sm" data-user-edit="' + user.id + '">تعديل</button>' +
              '<button class="btn btn-sm btn-danger" data-user-delete="' + user.id + '">حذف</button>' +
              '</td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="5" class="empty">لا يوجد مستخدمون</td></tr>';

    body.querySelectorAll('[data-user-edit]').forEach(function (button) {
      button.addEventListener('click', function () {
        var user = state.users.find(function (row) { return row.id === Number(button.dataset.userEdit); });
        if (user) openUser(user);
      });
    });
    body.querySelectorAll('[data-user-delete]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!confirm('حذف هذا المستخدم؟')) return;
        App.api('/auth/users/' + button.dataset.userDelete, { method: 'DELETE' })
          .then(function () {
            App.toast('تم حذف المستخدم', 'ok');
            load();
          })
          .catch(function (error) { App.toast(error.message, 'error'); });
      });
    });
  }

  function renderRooms() {
    var body = document.getElementById('roomsBody');
    var count = document.getElementById('roomsCount');
    if (count) count.textContent = state.rooms.length;
    body.innerHTML = state.rooms.length
      ? state.rooms
          .slice()
          .sort(function (a, b) { return a.id - b.id; })
          .map(function (room, index) {
            return (
              '<div class="settings-list-item" data-room-id="' + room.id + '">' +
              '<span class="settings-list-index">' + (index + 1) + '</span>' +
              '<div class="settings-list-main"><strong>' + App.escape(room.name) + '</strong>' +
              '<small>السعة ' + room.capacity + ' · ' + App.escape(room.location || 'بدون موقع') + '</small></div>' +
              '<div class="settings-list-actions">' +
              '<button class="btn btn-sm" type="button" data-room-edit="' + room.id + '">✏️ تعديل</button>' +
              '<button class="btn btn-sm btn-danger" type="button" data-room-delete="' + room.id + '">🗑️ حذف</button>' +
              '</div></div>'
            );
          })
          .join('')
      : '<div class="empty">لا توجد مخابر</div>';

    body.querySelectorAll('[data-room-edit]').forEach(function (button) {
      button.addEventListener('click', function () {
        var room = state.rooms.find(function (row) { return row.id === Number(button.dataset.roomEdit); });
        if (room) startRoomEdit(room);
      });
    });
    body.querySelectorAll('[data-room-delete]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!confirm(App.t('حذف هذه القاعة؟') || 'حذف هذه القاعة؟')) return;
        App.api('/rooms/' + button.dataset.roomDelete, { method: 'DELETE' })
          .then(function () {
            App.toast('تم حذف القاعة', 'ok');
            load();
          })
          .catch(function (error) { App.toast(error.message, 'error'); });
      });
    });
  }

  function renderLicense(status) {
    var badge = document.getElementById('licenseBadge');
    var deactivate = document.getElementById('deactivateBtn');
    var info = document.getElementById('licenseInfo');
    var box = document.getElementById('licenseStatusBox');
    var title = document.getElementById('licenseStatusTitle');
    var sub = document.getElementById('licenseStatusSub');
    var days = document.getElementById('licenseStatusDays');
    var install = document.getElementById('installId');
    if (install && status.installId) install.value = status.installId;
    var device = document.getElementById('deviceId');
    if (device && status.deviceId) device.value = status.deviceId;

    if (status.deviceMismatch) {
      badge.className = 'badge danger';
      badge.textContent = 'جهاز آخر';
      deactivate.hidden = true;
      if (box) box.className = 'license-status-box danger';
      if (title) title.textContent = 'الترخيص مربوط بجهاز آخر';
      if (sub) sub.textContent = 'هذه النسخة منسوخة من حاسوب مختلف';
      if (days) days.textContent = '—';
      info.textContent = 'هذا الترخيص مُسجّل لجهاز آخر ولا يعمل على هذا الحاسوب. أدخل مفتاح ترخيص جديداً لهذا الجهاز.';
    } else if (status.active) {
      badge.className = 'badge ok';
      badge.textContent = 'مُفعّل';
      deactivate.hidden = false;
      if (box) box.className = 'license-status-box active';
      if (title) title.textContent = 'ترخيص مُفعّل';
      if (sub) sub.textContent = status.expiresAt ? 'ينتهي في' : 'ترخيص دائم';
      if (days) days.textContent = status.expiresAt ? App.fmtDate(status.expiresAt.slice(0, 10)) : '—';
      var extra = '';
      if (status.expiresAt) extra = ' — ينتهي في ' + App.fmtDate(status.expiresAt.slice(0, 10));
      var bind = status.bound ? ' — مرتبط بهذا الجهاز.' : ' — غير مرتبط بجهاز.';
      info.textContent = 'الترخيص مُفعّل' + (status.activatedAt ? ' منذ ' + App.fmtDate(status.activatedAt.slice(0, 10)) : '') + extra + bind + ' عبارة «نسخة تجريبية» مخفية عن الملصقات.';
    } else if (status.expired) {
      badge.className = 'badge danger';
      badge.textContent = 'منتهي';
      deactivate.hidden = false;
      if (box) box.className = 'license-status-box danger';
      if (title) title.textContent = 'انتهت الصلاحية';
      if (sub) sub.textContent = 'أدخل مفتاحاً جديداً';
      if (days) days.textContent = '—';
      info.textContent = 'انتهت صلاحية الترخيص. أدخل مفتاحاً جديداً أو ألغِ التفعيل.';
    } else if (status.locked) {
      badge.className = 'badge danger';
      badge.textContent = 'التجربة منتهية';
      deactivate.hidden = true;
      if (box) box.className = 'license-status-box danger';
      if (title) title.textContent = 'انتهت الفترة التجريبية';
      if (sub) sub.textContent = 'أدخل مفتاح ترخيص للمتابعة';
      if (days) days.textContent = '0 يوم';
      info.textContent = 'انتهت الفترة التجريبية ولا يمكن استعمال واجهات العمل. أدخل مفتاح ترخيص للمتابعة.';
    } else {
      badge.className = 'badge warn';
      badge.textContent = 'نسخة تجريبية';
      deactivate.hidden = true;
      var left = typeof status.trialDaysLeft === 'number' ? status.trialDaysLeft : null;
      if (box) box.className = 'license-status-box warn';
      if (title) title.textContent = 'نسخة تجريبية';
      if (sub) sub.textContent = 'الأيام المتبقية';
      if (days) days.textContent = left === null ? '—' : left + ' يوم';
      info.textContent =
        'الملصقات تعرض حالياً عبارة «نسخة تجريبية» باللون الأحمر — ' +
        (left === null ? '' : 'بقي ' + left + ' يوماً من الفترة التجريبية. ');
    }
    if (!App.isAdmin()) {
      document.querySelectorAll('#licenseForm input, #licenseForm textarea, #licenseForm select, #licenseForm button').forEach(function (element) {
        element.disabled = true;
      });
    }
  }

  function loadLicense() {
    App.api('/settings/license')
      .then(renderLicense)
      .catch(function () { renderLicense({ active: false }); });
  }

  function renderLicenses(list) {
    var body = document.getElementById('licensesBody');
    if (!list || !list.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty">لا توجد تراخيص مولّدة</td></tr>';
      return;
    }
    body.innerHTML = list.map(function (row) {
      return (
        '<tr><td><code>' + App.escape(row.key) + '</code></td>' +
        '<td>' + App.escape(row.type) + '</td>' +
        '<td>' + (row.durationDays ? row.durationDays + ' يوم' : '—') + '</td>' +
        '<td>' + App.fmtDate((row.createdAt || '').slice(0, 10)) + '</td>' +
        '<td>' + (row.usedAt ? App.fmtDate(row.usedAt.slice(0, 10)) : 'غير مستخدم') + '</td>' +
        '<td class="row-actions"><button class="btn btn-sm" data-export="' + App.escape(row.key) + '">📥 تصدير</button><button class="btn btn-sm btn-danger" data-revoke="' + App.escape(row.key) + '">إلغاء</button></td></tr>'
      );
    }).join('');
    body.querySelectorAll('[data-export]').forEach(function (button) {
      button.addEventListener('click', function () {
        var row = (list || []).find(function (r) { return r.key === button.dataset.export; });
        if (!row) return;
        var blob = new Blob([JSON.stringify({ license: row }, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'license-' + row.key.replace(/[^A-Z0-9]/g, '') + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    });
    body.querySelectorAll('[data-revoke]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!confirm(App.t('إلغاء هذا الترخيص؟') || 'إلغاء هذا الترخيص؟')) return;
        App.api('/settings/licenses/revoke', { method: 'POST', body: { key: button.dataset.revoke } })
          .then(function () {
            App.toast('تم إلغاء الترخيص', 'ok');
            loadLicenses();
          })
          .catch(function (error) { App.toast(error.message, 'error'); });
      });
    });
  }

  function loadLicenses() {
    if (!App.isAdmin()) return;
    document.getElementById('licenseManageCard').hidden = false;
    App.api('/settings/licenses')
      .then(function (data) { renderLicenses(data.licenses || []); })
      .catch(function () { renderLicenses([]); });
  }

  function loadBackups() {
    if (!App.isAdmin()) return;
    App.api('/settings/backups')
      .then(function (data) {
        var list = data.backups || [];
        var count = document.getElementById('backupsCount');
        if (count) count.textContent = list.length;
        var body = document.getElementById('backupsBody');
        if (!body) return;
        body.innerHTML = list.length
          ? list
              .map(function (backup) {
                return (
                  '<div class="backup-item"><div><strong>' + App.escape(backup.file) + '</strong>' +
                  '<small>' + App.fmtDate(String(backup.createdAt).slice(0, 10)) + ' · ' + Math.max(1, Math.round(backup.size / 1024)) + ' KB</small></div>' +
                  '<button class="btn btn-sm" type="button" data-backup="' + App.escape(backup.file) + '">⬇️ تنزيل</button></div>'
                );
              })
              .join('')
          : '<div class="empty">لا توجد نسخ احتياطية بعد</div>';
        body.querySelectorAll('[data-backup]').forEach(function (button) {
          button.addEventListener('click', function () {
            App.download('/settings/backups/' + encodeURIComponent(button.dataset.backup), button.dataset.backup);
          });
        });
      })
      .catch(function () {});
  }

  function loadSections() {
    App.api('/schedule')
      .then(function (data) {
        var seen = {};
        (data.schedule || []).forEach(function (lesson) { seen[lesson.class_name] = true; });
        var classes = Object.keys(seen).sort();
        var count = document.getElementById('sectionsCount');
        if (count) count.textContent = classes.length;
        var body = document.getElementById('sectionsBody');
        if (!body) return;
        body.innerHTML = classes.length
          ? classes.map(function (name) { return '<span class="chip">' + App.escape(name) + '</span>'; }).join('')
          : '<div class="empty">لا توجد أقسام بعد</div>';
      })
      .catch(function () {});
  }

  function fmtActivityDate(value) {
    if (!value) return '—';
    var raw = String(value);
    var date = new Date(raw.indexOf('T') > -1 ? raw : raw.replace(' ', 'T') + 'Z');
    if (isNaN(date.getTime())) return raw;
    return date.toLocaleString('ar-DZ', { dateStyle: 'short', timeStyle: 'short' });
  }

  function loadActivity() {
    var body = document.getElementById('activityBody');
    if (!body) return;
    App.api('/settings/activity')
      .then(function (data) {
        var rows = data.activity || [];
        body.innerHTML = rows.length
          ? rows
              .map(function (row) {
                return (
                  '<tr><td dir="ltr" class="u-white-space-nowrap">' + App.escape(fmtActivityDate(row.createdAt)) + '</td>' +
                  '<td>' + App.escape(row.user || '—') + '</td>' +
                  '<td>' + App.escape(row.action) +
                  (row.details ? '<br><small class="muted">' + App.escape(row.details) + '</small>' : '') +
                  '</td></tr>'
                );
              })
              .join('')
          : '<tr><td colspan="3" class="empty">لا يوجد نشاط مسجل</td></tr>';
      })
      .catch(function (error) {
        body.innerHTML = '<tr><td colspan="3" class="empty">' + App.escape(error.message) + '</td></tr>';
      });
  }

  function initTabs() {
    var tabs = document.querySelectorAll('.settings-tab');
    var panels = document.querySelectorAll('.settings-panel');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (other) { other.classList.toggle('active', other === tab); });
        panels.forEach(function (panel) { panel.hidden = panel.dataset.panel !== tab.dataset.tab; });
        if (tab.dataset.tab === 'general') loadBackups();
        if (tab.dataset.tab === 'identity') loadSections();
        if (tab.dataset.tab === 'activity') loadActivity();
      });
    });
    if (location.hash === '#licenseCard') {
      var licenseTab = document.querySelector('.settings-tab[data-tab="license"]');
      if (licenseTab) licenseTab.click();
    }
  }

  function load() {
    App.api('/settings')
      .then(function (info) {
        state.info = info;
        state.users = info.users || [];
        state.rooms = info.rooms || [];
        renderStats(info);
        fillInstitution(info.institution || {});
        loadLicense();
        loadLicenses();
        if (App.isAdmin()) {
          document.getElementById('usersCard').hidden = false;
          document.getElementById('roomsCard').hidden = false;
          document.getElementById('backupsCard').hidden = false;
          renderUsers();
          renderRooms();
        }
        loadBackups();
        loadSections();
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  }

  function openUser(user) {
    if (!App.isAdmin()) {
      App.toast('إدارة المستخدمين للمدير فقط', 'error');
      return;
    }
    document.getElementById('userModalTitle').textContent = user ? 'تعديل مستخدم' : 'مستخدم جديد';
    document.getElementById('userId').value = user ? user.id : '';
    document.getElementById('username').value = user ? user.username : '';
    document.getElementById('username').disabled = !!user;
    document.getElementById('fullName').value = user ? user.full_name : '';
    document.getElementById('role').value = user ? user.role : 'teacher';
    document.getElementById('userPhone').value = user ? (user.phone || '') : '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userPassword').required = !user;
    App.openModal('userModal');
  }

  /** استيراد مستخدمين من CSV: username,full_name,password,role */
  function importUsers(file) {
    if (!App.isAdmin()) {
      App.toast('الاستيراد متاح للمدير فقط', 'error');
      return;
    }
    Actions.importRows({
      file: file,
      transform: function (row) {
        var username = (row.username || row['اسم المستخدم'] || '').trim();
        var fullName = (row.full_name || row['الاسم'] || row['الاسم الكامل'] || '').trim();
        var password = (row.password || row['كلمة المرور'] || '').trim();
        if (!username || !fullName || !password) throw new Error('اسم المستخدم والاسم وكلمة المرور مطلوبة');
        var role = (row.role || row['الدور'] || 'teacher').trim();
        return { username: username, full_name: fullName, password: password, phone: (row.phone || row['الهاتف'] || '').trim(), role: role === 'admin' ? 'admin' : 'teacher' };
      },
      submit: function (payload) { return App.api('/auth/users', { method: 'POST', body: payload }); },
      done: function () { load(); }
    });
  }

  document.getElementById('genLicenseBtn').addEventListener('click', function () {
    if (!App.isAdmin()) return;
    var type = document.getElementById('genLicenseType').value;
    var days = Number(document.getElementById('genLicenseDays').value || 0);
    App.api('/settings/licenses', { method: 'POST', body: { type: type, duration_days: days } })
      .then(function (data) {
        var key = (data.license && data.license.key) || '';
        document.getElementById('generatedLicense').textContent = key ? 'مفتاح جديد: ' + key : '';
        App.toast('تم توليد الترخيص', 'ok');
        loadLicenses();
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  var importLicenseBtn = document.getElementById('importLicenseBtn');
  if (importLicenseBtn) {
    importLicenseBtn.addEventListener('click', function () {
      if (!App.isAdmin()) return;
      var fileInput = document.getElementById('importLicenseFile');
      var file = fileInput && fileInput.files && fileInput.files[0];
      if (!file) { App.toast('اختر ملف ترخيص (JSON)', 'error'); return; }
      file.text()
        .then(function (text) {
          var parsed = JSON.parse(text);
          var license = parsed.license || parsed;
          return App.api('/settings/licenses/import', { method: 'POST', body: { license: license } });
        })
        .then(function () {
          App.toast('تم استيراد الترخيص', 'ok');
          if (fileInput) fileInput.value = '';
          loadLicenses();
        })
        .catch(function (error) { App.toast(error.message, 'error'); });
    });
  }

  document.getElementById('licenseForm').addEventListener('submit', function (event) {
    event.preventDefault();
    App.api('/settings/license', { method: 'PUT', body: { key: document.getElementById('licenseKey').value.trim(), duration_days: Number(document.getElementById('licenseDuration').value || 0) } })
      .then(function (status) {
        renderLicense(status);
        document.getElementById('licenseKey').value = '';
        App.toast('تم تفعيل الترخيص', 'ok');
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  document.getElementById('deactivateBtn').addEventListener('click', function () {
    if (!confirm(App.t('إلغاء تفعيل الترخيص وإعادة عبارة النسخة التجريبية؟') || 'إلغاء تفعيل الترخيص وإعادة عبارة النسخة التجريبية؟')) return;
    App.api('/settings/license', { method: 'DELETE' })
      .then(function (status) {
        renderLicense(status);
        App.toast('تم إلغاء التفعيل', 'ok');
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  document.getElementById('logoFile').addEventListener('change', function (event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      App.toast('اختر ملف صورة (PNG/JPG/SVG)', 'error');
      return;
    }
    shrinkLogo(file)
      .then(function (data) {
        showLogo(data);
        App.toast('تم تحميل الشعار — اضغط «حفظ معلومات المؤسسة»', 'ok');
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  document.getElementById('removeLogoBtn').addEventListener('click', function () {
    showLogo('');
  });

  document.getElementById('institutionPrintBtn').addEventListener('click', function () {
    window.print();
  });

  /** ورقة إمضاءات مستقلة: ملحق رئيس المخبر — مستشار(ة) التربية — مدير(ة) المؤسسة. */
  document.getElementById('signaturesPrintBtn').addEventListener('click', function () {
    window.open('/signatures.html?print=1', '_blank');
  });

  document.getElementById('institutionForm').addEventListener('submit', function (event) {
    event.preventDefault();
    if (!App.isAdmin()) {
      App.toast('تعديل معلومات المؤسسة للمدير فقط', 'error');
      return;
    }
    var button = event.submitter || document.getElementById('saveInstitutionBtn');
    button.disabled = true;

    App.api('/settings/institution', {
      method: 'PUT',
      body: {
        app_name: document.getElementById('appName').value.trim(),
        language: document.getElementById('appLanguage').value,
        primary_color: document.getElementById('primaryColor').value,
        name: document.getElementById('instName').value.trim(),
        name_fr: document.getElementById('instNameFr').value.trim(),
        level: document.getElementById('instLevel').value,
        school_year: document.getElementById('instSchoolYear').value.trim(),
        logo: logoData,
        logo_in_print: document.getElementById('logoInPrint').checked,
        signature_lab: document.getElementById('sigLabAr').value.trim(),
        signature_lab_fr: document.getElementById('sigLabFr').value.trim(),
        signature_counselor: document.getElementById('sigCounselorAr').value.trim(),
        signature_counselor_fr: document.getElementById('sigCounselorFr').value.trim(),
        signature_director: document.getElementById('sigDirectorAr').value.trim(),
        signature_director_fr: document.getElementById('sigDirectorFr').value.trim()
      }
    })
      .then(function (data) {
        fillInstitution(data.institution || {});
        App.institution = data.institution;
        App.applyLogo();
        if (App.applyBranding) App.applyBranding(data.institution);
        App.toast('تم حفظ معلومات المؤسسة', 'ok');
      })
      .catch(function (error) { App.toast(error.message, 'error'); })
      .then(function () { button.disabled = false; });
  });

  document.getElementById('passwordForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var next = document.getElementById('newPassword').value;
    if (next !== document.getElementById('confirmPassword').value) {
      App.toast('تأكيد كلمة المرور غير مطابق', 'error');
      return;
    }
    App.api('/auth/password', {
      method: 'PUT',
      body: {
        current_password: document.getElementById('currentPassword').value,
        new_password: next
      }
    })
      .then(function () {
        App.toast('تم تحديث كلمة المرور', 'ok');
        document.getElementById('passwordForm').reset();
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  document.getElementById('userForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var id = document.getElementById('userId').value;
    var body = {
      full_name: document.getElementById('fullName').value.trim(),
      role: document.getElementById('role').value,
      phone: document.getElementById('userPhone').value.trim()
    };
    var password = document.getElementById('userPassword').value;

    if (id) {
      if (password) body.password = password;
      App.api('/auth/users/' + id, { method: 'PUT', body: body })
        .then(function () {
          App.closeModal('userModal');
          App.toast('تم تحديث المستخدم', 'ok');
          load();
        })
        .catch(function (error) { App.toast(error.message, 'error'); });
      return;
    }

    body.username = document.getElementById('username').value.trim();
    body.password = password;
    App.api('/auth/users', { method: 'POST', body: body })
      .then(function () {
        App.closeModal('userModal');
        App.toast('تم إنشاء المستخدم', 'ok');
        load();
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  function resetRoomForm() {
    document.getElementById('roomForm').reset();
    document.getElementById('roomId').value = '';
    document.getElementById('roomCapacity').value = 24;
    document.getElementById('roomSubmitBtn').textContent = 'إضافة قاعة';
    document.getElementById('roomCancelBtn').hidden = true;
  }

  function startRoomEdit(room) {
    document.getElementById('roomId').value = room.id;
    document.getElementById('roomName').value = room.name;
    document.getElementById('roomCapacity').value = room.capacity;
    document.getElementById('roomLocation').value = room.location || '';
    document.getElementById('roomSubmitBtn').textContent = 'حفظ التعديل';
    document.getElementById('roomCancelBtn').hidden = false;
    document.getElementById('roomForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('roomName').focus();
  }

  document.getElementById('roomCancelBtn').addEventListener('click', resetRoomForm);

  document.getElementById('roomForm').addEventListener('submit', function (event) {
    event.preventDefault();
    var id = document.getElementById('roomId').value;
    var body = {
      name: document.getElementById('roomName').value.trim(),
      capacity: Number(document.getElementById('roomCapacity').value || 24),
      location: document.getElementById('roomLocation').value.trim() || undefined
    };
    App.api(id ? '/rooms/' + id : '/rooms', {
      method: id ? 'PUT' : 'POST',
      body: body
    })
      .then(function () {
        resetRoomForm();
        App.toast(id ? 'تم تحديث القاعة' : 'تمت إضافة القاعة', 'ok');
        load();
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  var newUserBtn = document.getElementById('newUserBtn');
  if (newUserBtn) newUserBtn.addEventListener('click', function () { openUser(null); });

  var backupNowBtn = document.getElementById('backupNowBtn');
  if (backupNowBtn) {
    backupNowBtn.addEventListener('click', function () {
      backupNowBtn.disabled = true;
      App.api('/settings/backups', { method: 'POST' })
        .then(function (data) {
          var backup = data.backup;
          App.toast('تم إنشاء النسخة الاحتياطية', 'ok');
          if (backup && backup.file) {
            App.download('/settings/backups/' + encodeURIComponent(backup.file), backup.file);
          }
          loadBackups();
        })
        .catch(function (error) { App.toast(error.message, 'error'); })
        .then(function () { backupNowBtn.disabled = false; });
    });
  }

  var sectionAutoBtn = document.getElementById('sectionAutoBtn');
  if (sectionAutoBtn) {
    sectionAutoBtn.addEventListener('click', function () {
      loadSections();
      App.toast('تم تحديث الأقسام من حصص استعمال الزمن', 'ok');
    });
  }

  document.querySelectorAll('#colorPalette .color-dot').forEach(function (button) {
    button.addEventListener('click', function () {
      var color = button.dataset.color;
      document.getElementById('primaryColor').value = color;
      markColor(color);
      document.documentElement.style.setProperty('--primary', color);
    });
  });

  var copyInstallBtn = document.getElementById('copyInstallBtn');
  if (copyInstallBtn) {
    copyInstallBtn.addEventListener('click', function () {
      var value = document.getElementById('installId').value;
      if (!value) return;
      (navigator.clipboard ? navigator.clipboard.writeText(value) : Promise.reject(new Error('clipboard')))
        .then(function () { App.toast('تم نسخ رقم التثبيت', 'ok'); })
        .catch(function () { App.toast('تعذّر النسخ — انسخ الرقم يدوياً', 'error'); });
    });
  }

  var copyDeviceBtn = document.getElementById('copyDeviceBtn');
  if (copyDeviceBtn) {
    copyDeviceBtn.addEventListener('click', function () {
      var value = document.getElementById('deviceId').value;
      if (!value) return;
      (navigator.clipboard ? navigator.clipboard.writeText(value) : Promise.reject(new Error('clipboard')))
        .then(function () { App.toast('تم نسخ بصمة الجهاز', 'ok'); })
        .catch(function () { App.toast('تعذّر النسخ — انسخ البصمة يدوياً', 'error'); });
    });
  }

  var clearLogBtn = document.getElementById('clearLogBtn');
  if (clearLogBtn) {
    clearLogBtn.addEventListener('click', function () {
      if (!confirm(App.t('مسح سجل النشاط بالكامل؟') || 'مسح سجل النشاط بالكامل؟')) return;
      App.api('/settings/activity', { method: 'DELETE' })
        .then(function () { App.toast('تم مسح سجل النشاط', 'ok'); loadActivity(); })
        .catch(function (error) { App.toast(error.message, 'error'); });
    });
  }

  var restoreDemoBtn = document.getElementById('restoreDemoBtn');
  if (restoreDemoBtn) {
    restoreDemoBtn.addEventListener('click', function () {
      if (!confirm(App.t('سيتم حذف بيانات الجرد والإعارة والحصص والتجارب الحالية واستعادة بيانات العرض التجريبية. هل أنت متأكد؟') || 'سيتم حذف بيانات الجرد والإعارة والحصص والتجارب الحالية واستعادة بيانات العرض التجريبية. هل أنت متأكد؟')) return;
      restoreDemoBtn.disabled = true;
      App.api('/settings/reset-demo', { method: 'POST' })
        .then(function () {
          App.toast('تمت استعادة بيانات العرض التجريبية — سيُعاد تحميل الصفحة', 'ok');
          setTimeout(function () { window.location.reload(); }, 700);
        })
        .catch(function (error) {
          App.toast(error.message, 'error');
          restoreDemoBtn.disabled = false;
        });
    });
  }

  var wipeDataBtn = document.getElementById('wipeDataBtn');
  if (wipeDataBtn) {
    wipeDataBtn.addEventListener('click', function () {
      var answer = prompt('سيتم مسح كل بيانات الجرد والإعارة والحصص والتجارب. اكتب «مسح» للتأكيد:');
      if (answer !== 'مسح') return;
      wipeDataBtn.disabled = true;
      App.api('/settings/wipe', { method: 'POST' })
        .then(function () {
          App.toast('تم مسح البيانات — بداية جديدة', 'ok');
          setTimeout(function () { window.location.reload(); }, 700);
        })
        .catch(function (error) {
          App.toast(error.message, 'error');
          wipeDataBtn.disabled = false;
        });
    });
  }

  if (!App.isAdmin()) {
    ['restoreDemoBtn', 'wipeDataBtn', 'clearLogBtn'].forEach(function (id) {
      var element = document.getElementById(id);
      if (element) element.disabled = true;
    });
  }

  initTabs();
  load();
  App.preparePrintPage('معلومات المؤسسة والإعدادات');
})();
