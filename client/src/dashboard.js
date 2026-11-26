(function () {
        if (!App.mount('dashboard')) return;

        // ربط زر «خروج» (بدون onclick inline — متوافق مع CSP).
        document.querySelectorAll('[data-action="logout"]').forEach(function (node) {
          node.addEventListener('click', function (event) { event.preventDefault(); App.logout(); });
        });

        Actions.bar(document.getElementById('pageActions'), {
          // الاستيراد يضيف أصناف جرد (للمدير)، والتعديل يفتح الإعدادات (للمدير)، والإضافة حصة إعارة للجميع
          allow: { import: App.isAdmin(), add: true, edit: App.isAdmin(), print: true },
          onPrint: function () { window.print(); },
          onAdd: function () { location.href = '/borrowing/create-session.html'; },
          onEdit: function () { location.href = '/settings.html'; },
          onImport: function (file) {
            Actions.importRows({
              file: file,
              transform: function (row) {
                var code = (row.code || row['الرمز'] || '').trim();
                var name = (row.name || row['الصنف'] || '').trim();
                var category = (row.category || row['الفئة'] || '').trim();
                if (!code || !name) throw new Error('الرمز والاسم مطلوبان');
                if (['apparatus', 'glassware', 'chemical'].indexOf(category) === -1) throw new Error('فئة غير معروفة: ' + category);
                return {
                  code: code,
                  name: name,
                  category: category,
                  quantity: Number(row.quantity || row['الكمية'] || 0),
                  unit: row.unit || row['الوحدة'] || 'قطعة',
                  min_quantity: Number(row.min_quantity || 0),
                  location: row.location || row['المكان'] || '',
                  expiry_date: row.expiry_date || row['الصلاحية'] || undefined
                };
              },
              submit: function (payload) { return App.api('/inventory', { method: 'POST', body: payload }); },
              done: function () { location.reload(); }
            });
          }
        });

        var user = App.user || {};
        document.getElementById('todayLine').textContent =
          new Date().toLocaleDateString('ar-MA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) +
          ' · نظرة شاملة على حالة هذا المختبر';

        App.loadInstitution().then(function (inst) {
          var name = (inst && inst.name) || 'مختبر العلوم';
          var welcomeNode = document.getElementById('welcomeLine');
        welcomeNode.textContent = 'مرحباً بك في ' + name;
        if (typeof App !== 'undefined' && typeof App.translateContent === 'function') App.translateContent(welcomeNode);
        });

        function statCard(options) {
          return (
            '<a class="stat ' + (options.tone || '') + '" href="' + options.href + '">' +
            '<div class="stat-head"><div>' +
            '<span>' + options.label + '</span>' +
            '<strong' + (options.key ? ' data-stat-key="' + options.key + '"' : '') + '>' + options.value + '</strong>' +
            '<small' + (options.key ? ' data-stat-hint="' + options.key + '"' : '') + '>' + (options.hint || '') + '</small>' +
            '</div><span class="stat-ico">' + App.icon(options.icon) + '</span></div></a>'
          );
        }

        function setStat(key, value, hint) {
          var node = document.querySelector('[data-stat-key="' + key + '"]');
          if (node) node.textContent = value;
          if (hint !== undefined) {
            var hintNode = document.querySelector('[data-stat-hint="' + key + '"]');
            if (hintNode) hintNode.textContent = hint;
          }
        }

        var counts = { apparatus: 0, glassware: 0, chemical: 0 };

        Promise.all([
          App.api('/reports/daily'),
          App.api('/borrowing?status=open')
        ])
          .then(function (results) {
            var report = results[0];
            var open = results[1];

            document.getElementById('stats').innerHTML =
              statCard({ key: 'apparatus', label: 'العتاد', value: counts.apparatus, hint: 'صنف', icon: 'boxes', href: '/inventory/inventory.html?category=apparatus' }) +
              statCard({ key: 'glassware', label: 'الزجاجيات', value: counts.glassware, hint: 'صنف', icon: 'beaker', href: '/inventory/inventory.html?category=glassware' }) +
              statCard({ key: 'chemical', label: 'المواد الكيميائية', value: counts.chemical, hint: 'مادة', icon: 'chemical', href: '/inventory/inventory.html?category=chemical' }) +
              statCard({ key: 'qc', label: 'فحوصات الجودة', value: 0, hint: 'سجل فحص', icon: 'flask', href: '/experiments/experiments.html' }) +
              statCard({ key: 'teachers', label: 'الأساتذة', value: 0, hint: 'أستاذ مسجل', icon: 'users', href: '/schedule/calendar.html' }) +
              statCard({ key: 'schedule', label: 'استعمال الزمن', value: 0, hint: 'حصة أسبوعية', icon: 'calendar', href: '/schedule/calendar.html' }) +
              statCard({
                label: 'الإعارة',
                value: open.sessions.length,
                hint: report.totals.outstanding + ' وحدة لم تُرجع',
                icon: 'repeat',
                tone: open.sessions.length ? 'warn' : 'ok',
                href: '/borrowing/borrowing.html'
              }) +
              statCard({
                label: 'تحت الحد الأدنى',
                value: report.inventory.lowStock,
                hint: 'أصناف تحتاج تعبئة',
                icon: 'chart',
                tone: report.inventory.lowStock ? 'warn' : 'ok',
                href: '/inventory/inventory.html?category='
              }) +
              statCard({
                key: 'items',
                label: 'عناصر الجرد',
                value: report.inventory.total,
                hint: report.inventory.units + ' وحدة إجمالاً',
                icon: 'boxes',
                href: '/inventory/inventory.html'
              });

            loadExtraStats();

            document.getElementById('dashDate').textContent = new Date().toLocaleDateString('ar-MA');
            App.loadInstitution();
            var currentUser = App.user || {};
            document.getElementById('dashUser').textContent = currentUser.full_name || currentUser.username || 'حجاج اول محمد الامين';
            document.getElementById('dashUserRole').textContent =
              currentUser.role === 'admin' ? 'ملحق رئيس بالمخبر' : 'أستاذ';

            document.getElementById('sessionCount').textContent = report.sessions.length + ' حصة';
            var body = document.getElementById('sessionsBody');
            if (report.sessions.length === 0) {
              body.innerHTML = '<tr><td colspan="5" class="empty">لا توجد حصص مسجلة اليوم</td></tr>';
            } else {
              body.innerHTML = report.sessions
                .map(function (session) {
                  return (
                    '<tr><td>' + App.escape(session.class_name) + '</td>' +
                    '<td>' + App.escape(session.subject) + '</td>' +
                    '<td>' + session.start_time + ' - ' + session.end_time + '</td>' +
                    '<td>' + session.item_count + '</td>' +
                    '<td>' + App.statusBadge(session.status) + '</td></tr>'
                  );
                })
                .join('');
            }

            var alerts = [];
            report.alerts.lowStock.slice(0, 5).forEach(function (item) {
              alerts.push(
                '<div class="u-display-flex-justify-content-space-between-gap-5rem-padding-">' +
                '<span>' + App.escape(item.name_ar || item.name) + '</span>' +
                '<span class="badge warn">' + item.available_quantity + ' / ' + item.min_quantity + '</span></div>'
              );
            });
            report.alerts.expiring.slice(0, 3).forEach(function (item) {
              alerts.push(
                '<div class="u-display-flex-justify-content-space-between-gap-5rem-padding-">' +
                '<span>' + App.escape(item.name_ar || item.name) + '</span>' +
                '<span class="badge danger">ينتهي ' + App.fmtDate(item.expiry_date) + '</span></div>'
              );
            });
            var alertsNode = document.getElementById('alerts');
            alertsNode.className = '';
            alertsNode.innerHTML = alerts.length ? alerts.join('') : '<div class="empty">لا توجد تنبيهات</div>';
          })
          .catch(function (error) {
            App.toast(error.message, 'error');
          });

        // عدّادات إضافية: الفئات، فحوصات الجودة، الأساتذة، استعمال الزمن
        function loadExtraStats() {
          ['apparatus', 'glassware', 'chemical'].forEach(function (category) {
            App.api('/inventory?category=' + category)
              .then(function (data) {
                counts[category] = (data && data.items ? data.items.length : 0) || 0;
                setStat(category, counts[category]);
              })
              .catch(function () {});
          });

          App.api('/qc/analysis')
            .then(function (data) {
              setStat('qc', (data.summary && data.summary.totalChecks) || 0);
            })
            .catch(function () {});

          App.api('/settings')
            .then(function (data) {
              var teachers = (data.users || []).filter(function (user) { return user.role !== 'admin'; });
              setStat('teachers', teachers.length);
            })
            .catch(function () {});

          App.api('/schedule')
            .then(function (data) {
              setStat('schedule', (data.schedule || []).length);
            })
            .catch(function () {});
        }
      })();
