/* Amin-Lab -Pro🔬 — منطق التحكم المشترك بين الصفحات */
(function () {
  'use strict';

  var TOKEN_KEY = 'amin_token';
  var USER_KEY = 'amin_user';

  var THEME_KEY = 'amin_theme';
  var LANG_KEY = 'amin_lang';

  // تطبيق المظهر واللغة قبل رسم الصفحة (تفادي الوميض)
  try {
    document.documentElement.setAttribute('data-theme', localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light');
    document.documentElement.lang = localStorage.getItem(LANG_KEY) || 'ar';
  } catch (error) {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  var NAV = [
    { key: 'dashboard', href: '/dashboard.html', icon: 'home', emoji: '🏠', t: 'nav.dashboard' },
    { key: 'experiments', href: '/experiments/experiments.html', icon: 'flask', emoji: '🔬', t: 'nav.experiments' },
    { key: 'schedule', href: '/schedule/calendar.html', icon: 'calendar', emoji: '📅', t: 'nav.schedule' },
    { key: 'borrowing', href: '/borrowing/borrowing.html', icon: 'repeat', emoji: '🔄', t: 'nav.borrowing', badge: 'borrowing' },
    { key: 'chemicals', href: '/inventory/inventory.html?category=chemical', icon: 'chemical', emoji: '🧪', t: 'nav.chemicals', badge: 'chemical' },
    { key: 'glassware', href: '/inventory/inventory.html?category=glassware', icon: 'beaker', emoji: '🧫', t: 'nav.glassware', badge: 'glassware' },
    { key: 'apparatus', href: '/inventory/inventory.html?category=apparatus', icon: 'boxes', emoji: '🔧', t: 'nav.apparatus', badge: 'apparatus' },
    { key: 'reports', href: '/reports/index.html', icon: 'chart', emoji: '📊', t: 'nav.reports', group: 'extra' },
    { key: 'settings', href: '/settings.html', icon: 'settings', emoji: '⚙️', t: 'nav.settings', group: 'extra' }
  ];

  /** أيقونات خطية موحّدة (SVG) بدل الرموز التعبيرية. */
  var ICONS = {
    home: '<rect x="3" y="3" width="7.6" height="7.6" rx="2.2"/><rect x="13.4" y="3" width="7.6" height="7.6" rx="2.2"/><rect x="3" y="13.4" width="7.6" height="7.6" rx="2.2"/><rect x="13.4" y="13.4" width="7.6" height="7.6" rx="2.2"/>',
    logo: '<path d="M9 3h6M10 3v5.3L5.7 17a2 2 0 0 0 1.7 3h9.2a2 2 0 0 0 1.7-3L14 8.3V3"/><path d="M7.8 15.5h8.4"/>',
    flask: '<path d="M9 3h6M10 3v5.3L5.7 17a2 2 0 0 0 1.7 3h9.2a2 2 0 0 0 1.7-3L14 8.3V3"/><path d="M7.8 15.5h8.4"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16.5 6.4a3.2 3.2 0 0 1 0 5.6M18 20a5.6 5.6 0 0 0-2-4.2"/>',
    repeat: '<path d="M4 9h13l-3-3M20 15H7l3 3"/>',
    chemical: '<path d="M10 3h4M11 3v4.6L6.5 17.2A2.4 2.4 0 0 0 8.7 21h6.6a2.4 2.4 0 0 0 2.2-3.8L13 7.6V3"/><circle cx="11" cy="16" r="1"/>',
    beaker: '<path d="M6 4h12v9a6 6 0 0 1-12 0V4z"/><path d="M6 9h12"/>',
    boxes: '<path d="M12 3 3 7.5v9L12 21l9-4.5v-9L12 3z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
    chart: '<path d="M4 20h16"/><path d="M7 20v-6M12 20V9M17 20V5"/>',
    settings: '<circle cx="12" cy="12" r="3.1"/><path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.3 5.3l1.9 1.9M16.8 16.8l1.9 1.9M5.3 18.7l1.9-1.9M16.8 7.2l1.9-1.9"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    moon: '<path d="M20.5 13.4A8.6 8.6 0 0 1 10.6 3.5a8.6 8.6 0 1 0 9.9 9.9z"/>',
    sun: '<circle cx="12" cy="12" r="4.1"/><path d="M12 2.4v2.2M12 19.4v2.2M2.4 12h2.2M19.4 12h2.2M5 5l1.6 1.6M17.4 17.4 19 19M5 19l1.6-1.6M17.4 6.6 19 5"/>',
    translate: '<path d="M4 6h9M8.5 6v1.6c0 3-1.6 5.6-4.5 7"/><path d="M6 11c1.6 2.4 3.6 3.8 5.6 4.6"/><path d="M13 20l4-10 4 10M14.6 16.8h4.8"/>',
    scan: '<path d="M4 8.5V6.5A2.5 2.5 0 0 1 6.5 4h2M20 8.5v-2A2.5 2.5 0 0 0 17.5 4h-2M4 15.5v2A2.5 2.5 0 0 0 6.5 20h2M20 15.5v2A2.5 2.5 0 0 1 17.5 20h-2M4 12h16"/>',
    import: '<path d="M12 3v11M8 10.5l4 4 4-4M4 19.5h16"/>',
    print: '<path d="M7 8V4h10v4M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="6" rx="1.6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    pencil: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M14.5 5.5l3 3"/>',
    trash: '<path d="M4 7h16M9 7V4.6h6V7M6.5 7l.9 12.4A2 2 0 0 0 9.4 21h5.2a2 2 0 0 0 2-1.6L17.5 7"/>',
    qr: '<rect x="3.5" y="3.5" width="6" height="6" rx="1.4"/><rect x="14.5" y="3.5" width="6" height="6" rx="1.4"/><rect x="3.5" y="14.5" width="6" height="6" rx="1.4"/><path d="M14.5 14.5h3v3h-3zM20.5 14.5v6h-6"/>',
    move: '<path d="M8 4v16M16 4v16M4 8h16M4 16h16"/>',
    pin: '<path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z"/><circle cx="12" cy="10.6" r="2.2"/>'
  };

  /** ترجمات الواجهة (العربية / الفرنسية / الإنجليزية). */
  var I18N = {
    ar: {
      'app.name': 'مخبري',
      'app.subtitle': 'تسيير مخابر العلوم',
      'app.defaultInstitution': 'مؤسسة تعليمية',
      'nav.sections': 'الأقسام',
      'nav.extra': 'أدوات إضافية',
      'nav.dashboard': 'الرئيسية',
      'nav.experiments': 'التجارب',
      'nav.schedule': 'استعمال الزمن الأساتذة',
      'nav.borrowing': 'الإعارة',
      'nav.chemicals': 'المواد الكيميائية',
      'nav.glassware': 'الزجاجيات',
      'nav.apparatus': 'العتاد',
      'nav.reports': 'التقارير والإحصائيات',
      'nav.settings': 'الإعدادات',
      'shell.menu': 'القائمة',
      'shell.theme': 'الوضع الليلي',
      'shell.language': 'اللغة',
      'shell.scan': 'مسح QR',
      'shell.logout': 'خروج',
      'roles.admin': 'ملحق رئيس بالمخبر',
      'roles.teacher': 'أستاذ',
      'act.import': 'استيراد',
      'act.print': 'طباعة',
      'act.add': 'إضافة',
      'act.edit': 'تعديل'
    },
    fr: {
      'app.name': 'Mon labo',
      'app.subtitle': 'Gestion du laboratoire',
      'app.defaultInstitution': 'Établissement',
      'nav.sections': 'Sections',
      'nav.extra': 'Outils',
      'nav.dashboard': 'Accueil',
      'nav.experiments': 'Expériences',
      'nav.schedule': 'Emploi du temps',
      'nav.borrowing': 'Prêts',
      'nav.chemicals': 'Produits chimiques',
      'nav.glassware': 'Verrerie',
      'nav.apparatus': 'Matériel',
      'nav.reports': 'Rapports',
      'nav.settings': 'Paramètres',
      'shell.menu': 'Menu',
      'shell.theme': 'Mode sombre',
      'shell.language': 'Langue',
      'shell.scan': 'Scanner QR',
      'shell.logout': 'Sortir',
      'roles.admin': 'Attaché principal du laboratoire',
      'roles.teacher': 'Enseignant',
      'act.import': 'Importer',
      'act.print': 'Imprimer',
      'act.add': 'Ajouter',
      'act.edit': 'Modifier'
    },
    en: {
      'app.name': 'My Lab',
      'app.subtitle': 'Laboratory manager',
      'app.defaultInstitution': 'School',
      'nav.sections': 'Sections',
      'nav.extra': 'Extra tools',
      'nav.dashboard': 'Home',
      'nav.experiments': 'Experiments',
      'nav.schedule': 'Teacher timetable',
      'nav.borrowing': 'Loans',
      'nav.chemicals': 'Chemicals',
      'nav.glassware': 'Glassware',
      'nav.apparatus': 'Equipment',
      'nav.reports': 'Reports',
      'nav.settings': 'Settings',
      'shell.menu': 'Menu',
      'shell.theme': 'Dark mode',
      'shell.language': 'Language',
      'shell.scan': 'Scan QR',
      'shell.logout': 'Sign out',
      'roles.admin': 'Chief laboratory attaché',
      'roles.teacher': 'Teacher',
      'act.import': 'Import',
      'act.print': 'Print',
      'act.add': 'Add',
      'act.edit': 'Edit'
    }
  };

  var App = {
    get token() {
      return localStorage.getItem(TOKEN_KEY) || '';
    },
    get user() {
      try {
        return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
      } catch (error) {
        return null;
      }
    },
    isAdmin: function () {
      return !!App.user && App.user.role === 'admin';
    },
    saveSession: function (token, user) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    },
    clearSession: function () {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    },
    logout: function () {
      App.clearSession();
      location.replace('/index.html');
    },

    /** شاشة قفل عند انتهاء التجربة أو الترخيص — تسمح بالوصول إلى الإعدادات فقط. */
    showLicenseLock: function (data) {
      if (document.getElementById('licenseLock')) return;
      if (location.pathname.indexOf('settings') !== -1) return;
      var expired = data && data.code === 'LICENSE_EXPIRED';
      var wrap = document.createElement('div');
      wrap.id = 'licenseLock';
      wrap.className = 'license-lock';
      wrap.innerHTML =
        '<div class="license-lock-card">' +
        '<div class="license-lock-icon">🔒</div>' +
        '<h2>' + (expired ? 'انتهت صلاحية الترخيص' : 'انتهت الفترة التجريبية') + '</h2>' +
        '<p>' + App.escape((data && data.error) || 'يلزم تفعيل الترخيص للمتابعة.') + '</p>' +
        '<p class="muted">بياناتك محفوظة كما هي؛ التفعيل لا يمسّها.</p>' +
        '<div class="license-lock-actions">' +
        '<a class="btn btn-primary" href="/settings.html#licenseCard">فتح الإعدادات</a>' +
        '<button class="btn" type="button" id="licenseLockReload">إعادة المحاولة</button>' +
        '</div></div>';
      document.body.appendChild(wrap);
      document.getElementById('licenseLockReload').addEventListener('click', function () {
        location.reload();
      });
    },

    /** طلب إلى الـ API مع إرفاق رمز الجلسة ومعالجة 401 وقفل الترخيص. */
    api: function (path, options) {
      options = options || {};
      var headers = { Accept: 'application/json' };
      if (options.body !== undefined) headers['Content-Type'] = 'application/json';
      if (App.token) headers.Authorization = 'Bearer ' + App.token;

      return fetch('/api' + path, {
        method: options.method || 'GET',
        headers: headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      }).then(function (response) {
        if (response.status === 401) {
          App.clearSession();
          if (location.pathname !== '/index.html' && location.pathname !== '/') {
            location.replace('/index.html');
          }
          throw new Error('انتهت الجلسة. يرجى تسجيل الدخول من جديد.');
        }
        if (response.status === 403) {
          return response
            .json()
            .catch(function () {
              return {};
            })
            .then(function (data) {
              if (data.code === 'TRIAL_EXPIRED' || data.code === 'LICENSE_EXPIRED') {
                App.showLicenseLock(data);
              }
              throw new Error(data.error || 'فشل الطلب');
            });
        }
        return response
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            if (!response.ok) {
              var details = Array.isArray(data.details) ? ' — ' + data.details.join(' / ') : '';
              throw new Error((data.error || 'فشل الطلب') + details);
            }
            return data;
          });
      });
    },

    /** تنزيل أي ملف من الـ API (يتطلب ترويسة المصادقة). */
    download: function (path, filename) {
      return fetch('/api' + path, { headers: { Authorization: 'Bearer ' + App.token } }).then(function (response) {
        if (!response.ok) throw new Error('تعذّر إنشاء الملف');
        return response.blob();
      }).then(function (blob) {
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      });
    },

    /** تنزيل ملف CSV من الـ API (يتطلب ترويسة المصادقة). */
    downloadCsv: function (path, filename) {
      return App.download(path, filename);
    },


    escape: function (value) {
      return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, function (char) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
      });
    },

    toast: function (message, type) {
      var wrap = document.querySelector('.toast-wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'toast-wrap';
        document.body.appendChild(wrap);
      }
      var node = document.createElement('div');
      node.className = 'toast ' + (type || '');
      node.textContent = message;
      wrap.appendChild(node);
      setTimeout(function () {
        node.remove();
      }, 3200);
    },

    fmtDate: function (iso) {
      if (!iso) return '—';
      var date = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
      if (isNaN(date.getTime())) return iso;
      return date.toLocaleDateString('ar-MA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    },

    today: function () {
      var now = new Date();
      var offset = now.getTimezoneOffset();
      return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
    },

    categoryLabel: function (category) {
      return { apparatus: 'أجهزة', glassware: 'زجاجيات', chemical: 'مواد كيميائية' }[category] || category;
    },

    statusLabel: function (status) {
      return { open: 'قيد الإعارة', partial: 'إرجاع جزئي', returned: 'مُرجعة' }[status] || status;
    },

    statusBadge: function (status) {
      var map = { open: 'warn', partial: 'info', returned: 'ok' };
      return '<span class="badge ' + (map[status] || '') + '">' + App.statusLabel(status) + '</span>';
    },

    conditionLabel: function (condition) {
      return { good: 'سليم', damaged: 'تالف', missing: 'مفقود', low: 'كمية منخفضة', expired: 'منتهي الصلاحية', ok: 'سليم' }[condition] || condition;
    },

    /** معلومات المؤسسة (الاسم والشعار والتوقيعات) — تُجلب مرة واحدة وتُخزَُن مؤقتاً. */
    institution: null,
    _institutionPromise: null,
    loadInstitution: function (force) {
      if (App.institution && !force) return Promise.resolve(App.institution);
      if (App._institutionPromise && !force) return App._institutionPromise;
      App._institutionPromise = fetch('/api/institution')
        .then(function (response) { return response.json(); })
        .then(function (data) {
          App.institution = (data && data.institution) || {};
          return App.institution;
        })
        .catch(function () {
          App.institution = App.institution || {};
          return App.institution;
        });
      return App._institutionPromise;
    },

    /**
     * إظهار شعار المؤسسة في الشريط الجانبي وصفحة الدخول والرئيسية.
     * إن لم يُضف شعار بعد، يبقى الشعار النصّي الاحتياطي.
     */
    applyLogo: function () {
      App.loadInstitution().then(function (inst) {
        var logo = inst && inst.logo;
        if (logo) {
          document.querySelectorAll('[data-brand]').forEach(function (element) {
            element.classList.add('has-logo');
            element.innerHTML = '<img src="' + logo + '" alt="' + App.escape(inst.name || 'Amin-Lab -Pro🔬') + '" />';
          });
        }
        if (inst && inst.name) {
          document.querySelectorAll('[data-institution-name]').forEach(function (element) {
            element.textContent = inst.name;
          });
        }
        var schoolYear = (inst && inst.school_year) || '';
        if (!schoolYear) {
          var now = new Date();
          var y = now.getFullYear();
          schoolYear = (now.getMonth() >= 8 ? y : y - 1) + ' / ' + (now.getMonth() >= 8 ? y + 1 : y);
        }
        document.querySelectorAll('[data-institution-year]').forEach(function (element) {
          element.textContent = 'Année Scolaire : ' + schoolYear;
        });
        document.querySelectorAll('[data-institution-subtitle]').forEach(function (element) {
          element.textContent = inst && inst.level === 'secondary' ? 'تسيير مخابر العلوم' : 'تسيير مخابر العلوم';
        });
      });
    },

    /** ترويسة وثيقة مطبوعة: شعار المؤسسة واسمها وتاريخ الوثيقة. */
    docHeaderHtml: function (title) {
      var inst = App.institution || {};
      var showLogo = inst.logo && inst.logo_in_print !== false;
      return (
        '<header class="doc-brand">' +
        (inst.logo ? '<img class="doc-logo' + (showLogo ? '' : ' hide-on-print') + '" src="' + inst.logo + '" alt="" />' : '') +
        '<div class="doc-brand-text"><strong>' + App.escape(inst.name || 'مختبر العلوم') + '</strong>' +
        (inst.name_fr ? '<small>' + App.escape(inst.name_fr) + '</small>' : '') +
        '</div>' +
        '<div class="doc-brand-meta"><span>' + App.escape(title || 'وثيقة') + '</span>' +
        '<small>' + App.fmtDate(App.today()) + '</small></div>' +
        '</header>'
      );
    },

    /** توقيعات أسفل الوثيقة: الملحق بالمخبر، مستشار(ة) التربية، مدير(ة) المؤسسة + الختم. */
    docSignaturesHtml: function () {
      var inst = App.institution || {};
      var signature = inst.signature || {};
      var blocks = [
        {
          name: signature.lab || '—',
          ar: 'الملحق الرئيسي بالمخبر',
          fr: signature.lab_fr || 'Adjoint(e) principal(e) du laboratoire',
          stamp: false
        },
        {
          name: signature.counselor || '—',
          ar: 'مستشار(ة) التربية',
          fr: signature.counselor_fr || "Conseiller(ère) d'éducation",
          stamp: false
        },
        {
          name: signature.director || '—',
          ar: 'مدير(ة) المؤسسة',
          fr: signature.director_fr || "Directeur(trice) de l'établissement",
          stamp: true
        }
      ];

      return (
        '<footer class="doc-signatures">' +
        blocks
          .map(function (block) {
            return (
              '<div class="doc-sign">' +
              (block.stamp ? '<div class="doc-stamp">' + App.escape(inst.name || 'المؤسسة') + '<br />الختم</div>' : '') +
              '<span class="doc-sign-line"></span>' +
              '<strong>' + App.escape(block.name) + '</strong>' +
              '<small>' + block.ar + '</small>' +
              '<small class="doc-sign-fr">' + App.escape(block.fr) + '</small>' +
              '</div>'
            );
          })
          .join('') +
        '</footer>'
      );
    },

    /** إضافة الترويسة والتوقيعات إلى وثيقة معروضة (وصل، تقرير). */
    decorateDocument: function (container, title) {
      if (!container) return Promise.resolve();
      return App.loadInstitution().then(function () {
        if (container.querySelector('.doc-brand')) return;
        container.insertAdjacentHTML('afterbegin', App.docHeaderHtml(title));
        container.insertAdjacentHTML('beforeend', App.docSignaturesHtml());
      });
    },

    /** لصفحات التطبيق: ترويسة وتوقيعات تظهر عند الطباعة فقط. */
    preparePrintPage: function (title) {
      return App.loadInstitution().then(function () {
        if (document.querySelector('.print-brand')) return;
        var content = document.querySelector('.content');
        if (!content) return;
        content.insertAdjacentHTML('afterbegin', '<div class="print-brand only-print">' + App.docHeaderHtml(title) + '</div>');
        content.insertAdjacentHTML('beforeend', '<div class="print-brand only-print">' + App.docSignaturesHtml() + '</div>');
      });
    },

    get lang() {
      try {
        return localStorage.getItem(LANG_KEY) || 'ar';
      } catch (error) {
        return 'ar';
      }
    },
    t: function (key) {
      var dictionary = I18N[App.lang] || I18N.ar;
      if (dictionary && dictionary[key]) return dictionary[key];
      return I18N.ar[key] || key;
    },
    icon: function (name) {
      return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
    },
    get theme() {
      try {
        return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
      } catch (error) {
        return 'light';
      }
    },
    setTheme: function (theme) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch (error) {
        // التخزين غير متاح: يبقى المظهر للجلسة فقط
      }
      document.documentElement.setAttribute('data-theme', theme);
    },
    toggleTheme: function () {
      App.setTheme(App.theme === 'dark' ? 'light' : 'dark');
    },
    setLang: function (lang) {
      try {
        localStorage.setItem(LANG_KEY, lang);
      } catch (error) {
        // تجاهل
      }
      // الواجهة عربية الاتجاه دائماً: تغيير اللغة يترجم التسميات فقط
      document.documentElement.lang = lang;
    },
    toggleDrawer: function () {
      var shell = document.querySelector('.app-shell');
      if (shell) shell.classList.toggle('nav-open');
    },
    closeDrawer: function () {
      var shell = document.querySelector('.app-shell');
      if (shell) shell.classList.remove('nav-open');
    },
    setNavCount: function (badge, count) {
      document.querySelectorAll('[data-nav-count="' + badge + '"]').forEach(function (node) {
        node.textContent = count;
        node.hidden = !count;
      });
    },
    /** عدّادات الأقسام في القائمة الجانبية. */
    loadNavCounts: function () {
      if (!App.token) return;
      ['glassware', 'apparatus', 'chemical'].forEach(function (category) {
        App.api('/inventory?category=' + category)
          .then(function (data) {
            App.setNavCount(category, (data && data.items ? data.items.length : 0) || 0);
          })
          .catch(function () {});
      });
      App.api('/borrowing?status=open')
        .then(function (data) {
          App.setNavCount('borrowing', (data.sessions || []).length);
        })
        .catch(function () {});
    },
    /** الشريط العلوي: القائمة، اللغة، الوضع الليلي، ماسح QR. */
    mountTools: function () {
      var topbar = document.querySelector('.topbar');
      if (!topbar) return;

      if (!document.querySelector('.topbar-brand')) {
        var brandWrap = document.createElement('div');
        brandWrap.className = 'topbar-brand';
        brandWrap.innerHTML =
          '<button class="icon-btn menu-btn" type="button" id="menuBtn" aria-label="' + App.escape(App.t('shell.menu')) + '">' + App.icon('menu') + '</button>' +
          '<span class="app-mark" data-brand style="width:40px;height:40px;flex:0 0 40px;border-radius:13px">' + App.icon('logo') + '</span>';
        topbar.insertBefore(brandWrap, topbar.firstChild);
      }

      if (document.querySelector('.shell-tools')) return;

      var tools = document.createElement('div');
      tools.className = 'shell-tools';
      var langs = [['ar', 'العربية'], ['fr', 'Français'], ['en', 'English']];
      tools.innerHTML =
        '<div class="lang-wrap">' +
        '<button class="icon-btn" type="button" id="langBtn" aria-label="' + App.escape(App.t('shell.language')) + '">' + App.icon('translate') + '</button>' +
        '<div class="lang-menu" id="langMenu">' +
        langs
          .map(function (pair) {
            return (
              '<button type="button" data-lang="' + pair[0] + '" aria-current="' + (App.lang === pair[0]) + '">' +
              '<span>' + pair[1] + '</span>' + (App.lang === pair[0] ? '✓' : '') + '</button>'
            );
          })
          .join('') +
        '</div></div>' +
        '<button class="icon-btn" type="button" id="themeBtn" aria-label="' + App.escape(App.t('shell.theme')) + '">' + App.icon(App.theme === 'dark' ? 'sun' : 'moon') + '</button>' +
        '<button class="icon-btn primary" type="button" id="scanQrBtn" aria-label="' + App.escape(App.t('shell.scan')) + '">' + App.icon('scan') + '</button>';
      topbar.appendChild(tools);

      var shell = document.querySelector('.app-shell');
      if (shell && !document.querySelector('.drawer-backdrop')) {
        var backdrop = document.createElement('div');
        backdrop.className = 'drawer-backdrop';
        shell.appendChild(backdrop);
        backdrop.addEventListener('click', App.closeDrawer);
      }

      var menuBtn = document.getElementById('menuBtn');
      if (menuBtn) menuBtn.addEventListener('click', App.toggleDrawer);
      document.querySelectorAll('.nav a').forEach(function (link) {
        link.addEventListener('click', App.closeDrawer);
      });

      var themeBtn = document.getElementById('themeBtn');
      themeBtn.addEventListener('click', function () {
        App.toggleTheme();
        themeBtn.innerHTML = App.icon(App.theme === 'dark' ? 'sun' : 'moon');
      });

      var langBtn = document.getElementById('langBtn');
      var langMenu = document.getElementById('langMenu');
      langBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        langMenu.classList.toggle('open');
      });
      langMenu.querySelectorAll('[data-lang]').forEach(function (button) {
        button.addEventListener('click', function () {
          App.setLang(button.dataset.lang);
          location.reload();
        });
      });
      document.addEventListener('click', function (event) {
        if (!langMenu.contains(event.target) && event.target !== langBtn) langMenu.classList.remove('open');
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
          langMenu.classList.remove('open');
          App.closeDrawer();
        }
      });

      var scan = document.getElementById('scanQrBtn');
      scan.addEventListener('click', function () {
        if (window.QRKit) window.QRKit.openScanner();
        else App.toast('جارٍ تحميل الماسح… أعد المحاولة بعد لحظة', 'error');
      });
    },

    /** بناء الهيكل الجانبي وحماية الصفحة. */
    mount: function (activeKey) {
      if (!App.token) {
        location.replace('/index.html');
        return false;
      }
      var sidebar = document.getElementById('sidebar');
      document.body.classList.add('page-' + (activeKey || 'dashboard'));
      var user = App.user || { full_name: 'مستخدم', role: 'teacher' };
      var current = location.pathname + location.search;

      function isActive(item) {
        return (
          item.href === current ||
          (item.href.indexOf('?') === -1 && item.href === location.pathname) ||
          (item.key === activeKey && item.href.indexOf('?') === -1)
        );
      }

      function navLink(item) {
        return (
          '<a href="' + item.href + '" class="nav-' + item.key + ' ' + (isActive(item) ? 'active' : '') + '">' +
          '<span class="nav-ico" aria-hidden="true">' + (item.emoji ? App.escape(item.emoji) : App.icon(item.icon)) + '</span>' +
          '<span class="nav-label">' + App.escape(App.t(item.t)) + '</span>' +
          (item.badge ? '<span class="nav-count" data-nav-count="' + item.badge + '" hidden>0</span>' : '') +
          '</a>'
        );
      }

      if (sidebar) {
        var mainLinks = NAV.filter(function (item) { return !item.group; }).map(navLink).join('');
        var extraLinks = NAV.filter(function (item) { return item.group === 'extra'; }).map(navLink).join('');
        sidebar.innerHTML =
          '<div class="brand"><div class="app-mark" data-brand>' + App.icon('logo') + '</div>' +
          '<div class="brand-text"><strong>' + App.escape(App.t('app.name')) + '</strong>' +
          '<span data-institution-subtitle>' + App.escape(App.t('app.subtitle')) + '</span></div></div>' +
          '<nav class="nav"><div class="nav-group">' + App.escape(App.t('nav.sections')) + '</div>' + mainLinks +
          '<div class="nav-group">' + App.escape(App.t('nav.extra')) + '</div>' + extraLinks + '</nav>' +
          '<div class="sidebar-footer">' +
          '<div class="user-chip"><div><strong>' + App.escape(user.full_name) + '</strong>' +
          '<small>' + App.escape(user.role === 'admin' ? App.t('roles.admin') : App.t('roles.teacher')) + '</small></div>' +
          '<button class="btn btn-sm" type="button" id="logoutBtn">' + App.escape(App.t('shell.logout')) + '</button></div>' +
          '<div class="institution" id="sideInstitution"></div>' +
          '<div class="year" id="sideYear"></div></div>';
        var logout = document.getElementById('logoutBtn');
        if (logout) logout.addEventListener('click', App.logout);
      }
      App.applyLogo();
      App.loadInstitution().then(function (inst) {
        var nameNode = document.getElementById('sideInstitution');
        if (nameNode) nameNode.textContent = (inst && inst.name) || App.t('app.defaultInstitution');
        var yearNode = document.getElementById('sideYear');
        if (yearNode) {
          var startYear = new Date().getFullYear();
          yearNode.textContent = startYear + '/' + (startYear + 1);
        }
      });
      App.loadNavCounts();
      App.mountTools();

      App.loadScript('/qr.js');

      return true;
    },

    /** تحميل سكربت إضافي مرة واحدة (مثل مولّد QR). */
    loadScript: function (src) {
      if (document.querySelector('script[src="' + src + '"]')) return;
      var script = document.createElement('script');
      script.src = src;
      script.defer = true;
      document.head.appendChild(script);
    },

    openModal: function (id) {
      var modal = document.getElementById(id);
      if (modal) modal.classList.add('open');
    },
    closeModal: function (id) {
      var modal = document.getElementById(id);
      if (modal) modal.classList.remove('open');
    }
  };

  window.App = App;
  window.addEventListener('online', function () { App.toast('تم استعادة الاتصال', 'ok'); });
  window.addEventListener('offline', function () { App.toast('أنت غير متصل بالشبكة', 'error'); });
})();
