(function () {
        if (!App.token) return;
        var attention = document.getElementById('attention');
        var distribution = document.getElementById('distribution');

        function alertRow(tone, title, note, href) {
          var body =
            '<span class="dot"></span><div class="alert-main"><strong>' + App.escape(title) + '</strong>' +
            '<small>' + App.escape(note) + '</small></div>';
          return href
            ? '<a class="alert-item ' + tone + ' u-color-inherit" href="' + href + '">' + body + '</a>'
            : '<div class="alert-item ' + tone + '">' + body + '</div>';
        }

        App.api('/qc/analysis')
          .then(function (data) {
            var rows = [];
            (data.expiring || []).forEach(function (item) {
              rows.push(
                alertRow('danger', item.name, 'تنتهي الصلاحية في ' + App.fmtDate(item.expiry_date), '/inventory/inventory.html?category=chemical')
              );
            });
            (data.lowStock || []).forEach(function (item) {
              rows.push(
                alertRow(
                  item.available_quantity === 0 ? 'danger' : 'warn',
                  item.name,
                  'الكمية ' + item.available_quantity + ' أقل من الحد الأدنى ' + item.min_quantity,
                  '/inventory/inventory.html?category=' + item.category
                )
              );
            });
            document.getElementById('attentionCount').textContent = rows.length;
            attention.innerHTML = rows.length ? rows.join('') : '<div class="empty">لا توجد تنبيهات — المخزون في حالة جيدة</div>';
          })
          .catch(function (error) {
            attention.innerHTML = '<div class="empty">' + App.escape(error.message) + '</div>';
          });

        var types = [
          { label: 'أجهزة', category: 'apparatus' },
          { label: 'زجاجيات', category: 'glassware' },
          { label: 'مواد كيميائية', category: 'chemical' }
        ];
        Promise.all(
          types.map(function (type) {
            return App.api('/inventory?category=' + type.category).then(function (data) {
              return { label: type.label, count: (data.items || []).length };
            });
          })
        )
          .then(function (rows) {
            var max = rows.reduce(function (top, row) { return Math.max(top, row.count); }, 1);
            distribution.innerHTML = rows
              .map(function (row) {
                return (
                  '<div class="dist-row"><span class="dist-label">' + row.label + '</span>' +
                  '<span class="dist-bar"><i data-w="' + Math.round((row.count / max) * 100) + '"></i></span>' +
                  '<span class="dist-value">' + row.count + '</span></div>'
                );
              })
              .join('');
            distribution.querySelectorAll('[data-w]').forEach(function (el) { el.style.width = el.dataset.w + '%'; });
          })
          .catch(function () {
            distribution.innerHTML = '<div class="empty">تعذّر تحميل التوزيع</div>';
          });
      })();
