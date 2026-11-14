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

  function fillInstitution(inst) {
    state.institution = inst;
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
      document.querySelectorAll('#institutionForm input, #institutionForm button').forEach(function (element) {
        if (element.id !== 'institutionPrintBtn' && element.id !== 'signaturesPrintBtn') element.disabled = true;
      });
    }
  }

  document.querySelectorAll('[data-close]').forEach(function (button) {
    button.addEventListener('click', function () { App.closeModal(button.dataset.close); });
  });

  Actions.bar(document.getElementById('pageActions'), {
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
        return '<div style="display:flex;justify-content:space-between;gap:.6rem;padding:.35rem 0;border-bottom:1px solid var(--line)">' +
          '<span>' + row[0] + '</span><strong style="font-size:.85rem;word-break:break-all">' + App.escape(row[1]) + '</strong></div>';
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
    body.innerHTML = state.rooms.length
      ? state.rooms
          .map(function (room) {
            return (
              '<tr><td>' + room.id + '</td><td>' + App.escape(room.name) + '</td>' +
              '<td>' + room.capacity + '</td><td>' + App.escape(room.location || '—') + '</td>' +
              '<td class="row-actions"><button class="btn btn-sm btn-danger" data-room-delete="' + room.id + '">حذف</button></td></tr>'
            );
          })
          .join('')
      : '<tr><td colspan="5" class="empty">لا توجد قاعات</td></tr>';

    body.querySelectorAll('[data-room-delete]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!confirm('حذف هذه القاعة؟')) return;
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
    if (status.active) {
      badge.className = 'badge ok';
      badge.textContent = 'مُفعّل';
      deactivate.hidden = false;
      var extra = '';
      if (status.expiresAt) extra = ' — ينتهي في ' + App.fmtDate(status.expiresAt.slice(0, 10));
      info.textContent = 'الترخيص مُفعّل' + (status.activatedAt ? ' منذ ' + App.fmtDate(status.activatedAt.slice(0, 10)) : '') + extra + ' — عبارة «نسخة تجريبية» مخفية عن الملصقات.';
    } else if (status.expired) {
      badge.className = 'badge danger';
      badge.textContent = 'منتهي';
      deactivate.hidden = false;
      info.textContent = 'انتهت صلاحية الترخيص. أدخل مفتاحاً جديداً أو ألغِ التفعيل.';
    } else if (status.locked) {
      badge.className = 'badge danger';
      badge.textContent = 'التجربة منتهية';
      deactivate.hidden = true;
      info.textContent = 'انتهت الفترة التجريبية ولا يمكن استعمال واجهات العمل. أدخل مفتاح ترخيص للمتابعة.';
    } else {
      badge.className = 'badge warn';
      badge.textContent = 'نسخة تجريبية';
      deactivate.hidden = true;
      var left = typeof status.trialDaysLeft === 'number' ? status.trialDaysLeft : null;
      info.textContent =
        'الملصقات تعرض حالياً عبارة «نسخة تجريبية» باللون الأحمر — ' +
        (left === null ? '' : 'بقي ' + left + ' يوماً من الفترة التجريبية. ');
    }
    if (!App.isAdmin()) {
      document.querySelectorAll('#licenseForm input, #licenseForm button').forEach(function (element) {
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
        '<td class="row-actions"><button class="btn btn-sm btn-danger" data-revoke="' + App.escape(row.key) + '">إلغاء</button></td></tr>'
      );
    }).join('');
    body.querySelectorAll('[data-revoke]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!confirm('إلغاء هذا الترخيص؟')) return;
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
          renderUsers();
          renderRooms();
        }
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
        return { username: username, full_name: fullName, password: password, role: role === 'admin' ? 'admin' : 'teacher' };
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
    if (!confirm('إلغاء تفعيل الترخيص وإعادة عبارة النسخة التجريبية؟')) return;
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
    var button = document.getElementById('saveInstitutionBtn');
    button.disabled = true;

    App.api('/settings/institution', {
      method: 'PUT',
      body: {
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
      role: document.getElementById('role').value
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

  document.getElementById('roomForm').addEventListener('submit', function (event) {
    event.preventDefault();
    App.api('/rooms', {
      method: 'POST',
      body: {
        name: document.getElementById('roomName').value.trim(),
        capacity: Number(document.getElementById('roomCapacity').value || 24),
        location: document.getElementById('roomLocation').value.trim() || undefined
      }
    })
      .then(function () {
        document.getElementById('roomForm').reset();
        document.getElementById('roomCapacity').value = 24;
        App.toast('تمت إضافة القاعة', 'ok');
        load();
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  load();
  App.preparePrintPage('معلومات المؤسسة والإعدادات');
})();
