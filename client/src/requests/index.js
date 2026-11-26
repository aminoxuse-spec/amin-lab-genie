(function () {
        if (!App.mount('requests')) return;

        var state = { status: 'pending', requests: [] };
        var body = document.getElementById('requestsBody');
        var badge = document.getElementById('requestsBadge');
        var stats = document.getElementById('requestStats');

        function esc(value) {
          return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        var LABEL = { pending: 'بانتظار الموافقة', approved: 'مقبولة', rejected: 'مرفوضة', cancelled: 'ملغاة' };
        var TONE = { pending: 'warn', approved: 'ok', rejected: 'danger', cancelled: 'info' };

        function load() {
          body.innerHTML = '<div class="empty">جارٍ التحميل…</div>';
          var query = state.status ? '?status=' + state.status : '';
          Promise.all([App.api('/requests' + query), App.api('/requests/pending-count')])
            .then(function (results) {
              state.requests = results[0].requests || [];
              var pending = results[1].pending || 0;
              badge.textContent = pending ? pending + ' معلّق' : 'لا طلبات معلّقة';
              badge.className = 'badge ' + (pending ? 'warn' : 'ok');
              stats.innerHTML =
                '<div class="stat ' + (pending ? 'warn' : 'ok') + '"><span>طلبات معلّقة</span><strong>' + pending + '</strong></div>' +
                '<div class="stat"><span>المعروضة الآن</span><strong>' + state.requests.length + '</strong></div>' +
                '<div class="stat"><span>وحدات مطلوبة</span><strong>' +
                state.requests.reduce(function (sum, request) {
                  return sum + (request.items || []).reduce(function (inner, item) { return inner + item.quantity; }, 0);
                }, 0) + '</strong></div>' +
                '<div class="stat"><span>مرتبطة بجلسات</span><strong>' +
                state.requests.filter(function (request) { return request.session_id; }).length + '</strong></div>';
              render();
            })
            .catch(function (error) { body.innerHTML = '<div class="empty">' + esc(error.message) + '</div>'; });
        }

        function render() {
          if (!state.requests.length) {
            body.innerHTML = '<div class="empty">لا توجد طلبات في هذه الحالة.</div>';
            return;
          }
          body.innerHTML = state.requests.map(function (request) {
            var items = (request.items || []).map(function (item) {
              var shortage = item.available_quantity < item.quantity;
              return '<li>' + esc(item.name_ar || item.name) +
                (item.owner_no ? ' <small class="muted">· جرد خاص ' + esc(item.owner_no) + '</small>' : '') +
                ' × ' + item.quantity + ' ' + esc(item.unit || '') +
                ' <small class="muted">(متوفر ' + item.available_quantity + ')' +
                (shortage ? ' ⚠️' : '') + '</small></li>';
            }).join('');
            var actions = request.status === 'pending'
              ? '<div class="row-actions u-margin-top-6rem">' +
                '<button class="btn btn-primary" type="button" data-approve="' + request.id + '">✅ موافقة</button>' +
                '<button class="btn" type="button" data-reject="' + request.id + '">✖️ رفض</button></div>'
              : (request.session_id
                ? '<div class="row-actions u-margin-top-6rem"><a class="btn" href="/borrowing/borrowing.html">عرض جلسة الإعارة #' + request.session_id + '</a></div>'
                : '');
            return '<article class="card u-margin-bottom-7rem">' +
              '<div class="card-head"><h2>#' + request.id + ' · ' + esc(request.teacher_name) + '</h2>' +
              '<span class="badge ' + (TONE[request.status] || 'info') + '">' + (LABEL[request.status] || request.status) + '</span></div>' +
              '<p class="muted">' + esc(request.session_date) + ' · ' + esc(request.start_time) + ' → ' + esc(request.end_time) +
              ' · ' + esc(request.class_name) + ' · ' + esc(request.subject) + '</p>' +
              (items ? '<ul class="muted u-line-height-1-8-padding-inline-start-1-1rem">' + items + '</ul>' : '') +
              (request.notes ? '<p class="muted">ملاحظات الأستاذ: ' + esc(request.notes) + '</p>' : '') +
              (request.admin_note ? '<p class="muted">ملاحظة المدير: ' + esc(request.admin_note) + '</p>' : '') +
              actions +
              '</article>';
          }).join('');

          Array.prototype.forEach.call(body.querySelectorAll('[data-approve]'), function (button) {
            button.addEventListener('click', function () {
              var id = button.getAttribute('data-approve');
              var note = prompt('ملاحظة على الموافقة (اختياري):', '') || '';
              button.disabled = true;
              App.api('/requests/' + id + '/approve', { method: 'POST', body: { admin_note: note } })
                .then(function (result) {
                  App.toast('تمت الموافقة وإنشاء جلسة الإعارة #' + result.session_id, 'ok');
                  load();
                })
                .catch(function (error) { App.toast(error.message, 'error'); button.disabled = false; });
            });
          });

          Array.prototype.forEach.call(body.querySelectorAll('[data-reject]'), function (button) {
            button.addEventListener('click', function () {
              var id = button.getAttribute('data-reject');
              var note = prompt('سبب الرفض (يظهر للأستاذ):', '');
              if (note === null) return;
              button.disabled = true;
              App.api('/requests/' + id + '/reject', { method: 'POST', body: { admin_note: note } })
                .then(function () { App.toast('تم رفض الطلب', 'ok'); load(); })
                .catch(function (error) { App.toast(error.message, 'error'); button.disabled = false; });
            });
          });
        }

        document.getElementById('refreshBtn').addEventListener('click', load);
        Array.prototype.forEach.call(document.querySelectorAll('#statusChips [data-status]'), function (button) {
          button.addEventListener('click', function () {
            state.status = button.getAttribute('data-status');
            Array.prototype.forEach.call(document.querySelectorAll('#statusChips [data-status]'), function (other) {
              other.className = 'btn' + (other === button ? ' btn-primary' : '');
            });
            load();
          });
        });

        load();
      })();
