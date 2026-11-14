/* Amin-Lab -cem🔬 — توليد رموز QR، بطاقة الوسيلة، الماسح، والملصقات */
(function () {
  'use strict';

  var libPromise = null;
  var licensePromise = null;

  function loadLib() {
    if (window.qrcode) return Promise.resolve();
    if (libPromise) return libPromise;
    libPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = '/vendor/qrcode.js';
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error('تعذّر تحميل مولّد QR')); };
      document.head.appendChild(script);
    });
    return libPromise;
  }

  function payload(code) {
    return 'AMIN:' + code;
  }

  /** صورة QR بصيغة PNG (data URL) — تُستخدم للمعاينة والتنزيل والملصقات. */
  function image(text, size) {
    return loadLib().then(function () {
      var qr = window.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
      var gif = qr.createDataURL(8, 4);
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          canvas.width = size || 320;
          canvas.height = size || 320;
          var context = canvas.getContext('2d');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.imageSmoothingEnabled = false;
          context.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = function () { resolve(gif); };
        img.src = gif;
      });
    });
  }

  function license() {
    if (!licensePromise) {
      licensePromise = fetch('/api/settings/license', { headers: { Authorization: 'Bearer ' + App.token } })
        .then(function (response) { return response.ok ? response.json() : { trial: true }; })
        .catch(function () { return { trial: true }; });
    }
    return licensePromise;
  }

  function modal(id, html) {
    var existing = document.getElementById(id);
    if (existing) existing.remove();
    var node = document.createElement('div');
    node.className = 'modal';
    node.id = id;
    node.innerHTML = '<div class="modal-box">' + html + '</div>';
    document.body.appendChild(node);
    node.classList.add('open');
    node.querySelectorAll('[data-close]').forEach(function (button) {
      button.addEventListener('click', function () { node.remove(); });
    });
    node.addEventListener('click', function (event) {
      if (event.target === node) node.remove();
    });
    return node;
  }

  function categoryLabel(category) {
    return { apparatus: 'أجهزة', glassware: 'زجاجيات', chemical: 'مواد كيميائية' }[category] || category;
  }

  /** بطاقة الوسيلة: رمز QR + بيانات + تعديل/حركة/ملصق. */
  function showItem(item) {
    return image(payload(item.code)).then(function (dataUrl) {
      var node = modal(
        'qrItemModal',
        '<h2>بطاقة الوسيلة</h2>' +
          '<div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:flex-start">' +
          '<img src="' + dataUrl + '" alt="QR ' + App.escape(item.code) + '" style="width:170px;height:170px;border:1px solid var(--line);border-radius:12px;padding:6px;background:#fff" />' +
          '<div style="flex:1;min-width:200px">' +
          '<h3 style="margin-bottom:.2rem">' + App.escape(item.name) + '</h3>' +
          '<p class="muted" style="margin-bottom:.4rem"><code>' + App.escape(item.code) + '</code> — ' + categoryLabel(item.category) + '</p>' +
          '<div class="muted">المتوفر: <strong>' + item.available_quantity + ' / ' + item.quantity + ' ' + App.escape(item.unit) + '</strong></div>' +
          '<div class="muted">المكان: ' + App.escape(item.location || '—') + '</div>' +
          '<div class="muted">الصلاحية: ' + (item.expiry_date ? App.fmtDate(item.expiry_date) : '—') + '</div>' +
          '<div class="row-actions" style="margin-top:.8rem;flex-wrap:wrap">' +
          '<button class="btn btn-sm" data-qr-download>⬇️ تنزيل الرمز</button>' +
          '<a class="btn btn-sm" href="/labels.html?ids=' + item.id + '">🏷️ ملصق</a>' +
          '<a class="btn btn-sm" href="/inventory/inventory.html?edit=' + item.id + '">✏️ تعديل</a>' +
          '<a class="btn btn-sm btn-primary" href="/borrowing/create-session.html?item=' + item.id + '">↔️ تسجيل حركة</a>' +
          '</div></div></div>' +
          '<div class="modal-actions"><button class="btn" data-close>إغلاق</button></div>',
      );

      node.querySelector('[data-qr-download]').addEventListener('click', function () {
        var link = document.createElement('a');
        link.href = dataUrl;
        link.download = item.code + '-qr.png';
        document.body.appendChild(link);
        link.click();
        link.remove();
      });
    });
  }

  function renderResults(host, items, onPick) {
    if (items.length === 0) {
      host.innerHTML = '<div class="empty">لا توجد وسيلة مطابقة</div>';
      return;
    }
    host.innerHTML =
      '<p class="muted" style="margin-bottom:.4rem">' +
      (items.length > 1 ? items.length + ' وسيلة مطابقة — اختر واحدة:' : 'نتيجة واحدة:') +
      '</p>' +
      '<div style="display:flex;flex-direction:column;gap:.35rem">' +
      items
        .map(function (item, index) {
          return (
            '<button class="btn" type="button" data-pick="' + index + '" style="justify-content:space-between;text-align:right">' +
            '<span>' + App.escape(item.name) + ' <small class="muted">— ' + App.escape(item.code) + '</small></span>' +
            '<span class="badge">' + item.available_quantity + ' / ' + item.quantity + '</span></button>'
          );
        })
        .join('') +
      '</div>';

    host.querySelectorAll('[data-pick]').forEach(function (button) {
      button.addEventListener('click', function () {
        onPick(items[Number(button.dataset.pick)]);
      });
    });
  }

  /** الماسح: كاميرا / قارئ USB / صورة / كتابة رقم الجرد. */
  function openScanner() {
    var node = modal(
      'qrScannerModal',
      '<h2>مسح QR</h2>' +
        '<p class="muted">امسح بالكاميرا، أو استعمل قارئ USB، أو ارفع صورة، أو اكتب رقم الجرد.</p>' +
        '<form id="qrScanForm" style="display:flex;gap:.4rem">' +
        '<input id="qrScanInput" placeholder="AMIN:APP-001 أو APP-001" autocomplete="off" style="flex:1" />' +
        '<button class="btn btn-primary" type="submit">بحث</button>' +
        '</form>' +
        '<div class="row-actions" style="margin-top:.6rem">' +
        '<button class="btn btn-sm" type="button" id="qrCameraBtn">📷 تشغيل الكاميرا</button>' +
        '<label class="btn btn-sm" style="margin:0">🖼️ من صورة<input type="file" accept="image/*" id="qrImageInput" hidden /></label>' +
        '</div>' +
        '<video id="qrVideo" playsinline muted style="display:none;width:100%;max-height:240px;border-radius:12px;margin-top:.6rem;background:#000"></video>' +
        '<div id="qrResults" style="margin-top:.8rem"></div>' +
        '<div class="modal-actions"><button class="btn" type="button" data-close>إغلاق</button></div>',
    );

    var input = node.querySelector('#qrScanInput');
    var results = node.querySelector('#qrResults');
    var video = node.querySelector('#qrVideo');
    var cameraButton = node.querySelector('#qrCameraBtn');
    var stream = null;
    var timer = null;

    function stopCamera() {
      if (timer) clearInterval(timer);
      timer = null;
      if (stream) stream.getTracks().forEach(function (track) { track.stop(); });
      stream = null;
      video.style.display = 'none';
      cameraButton.textContent = '📷 تشغيل الكاميرا';
    }

    node.addEventListener('click', function (event) {
      if (event.target === node || event.target.closest('[data-close]')) stopCamera();
    });

    function lookup(raw) {
      var code = String(raw || '').trim();
      if (!code) return;
      results.innerHTML = '<div class="empty">جارٍ البحث…</div>';
      App.api('/inventory/lookup?code=' + encodeURIComponent(code))
        .then(function (data) {
          renderResults(results, data.items, function (item) {
            stopCamera();
            node.remove();
            showItem(item);
          });
          if (data.items.length === 0) App.toast('لا توجد وسيلة بهذا الرمز', 'error');
        })
        .catch(function (error) {
          results.innerHTML = '<div class="empty">' + App.escape(error.message) + '</div>';
        });
    }

    node.querySelector('#qrScanForm').addEventListener('submit', function (event) {
      event.preventDefault();
      lookup(input.value);
      input.value = '';
      input.focus();
    });

    node.querySelector('#qrImageInput').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;
      if (!('BarcodeDetector' in window)) {
        App.toast('قراءة QR من صورة غير مدعومة في هذا المتصفح — استعمل الكاميرا أو اكتب الرقم', 'error');
        return;
      }
      var detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      createImageBitmap(file)
        .then(function (bitmap) { return detector.detect(bitmap); })
        .then(function (codes) {
          if (codes.length === 0) {
            App.toast('لم يُعثر على رمز QR في الصورة', 'error');
            return;
          }
          lookup(codes[0].rawValue);
        })
        .catch(function () { App.toast('تعذّرت قراءة الصورة', 'error'); });
    });

    cameraButton.addEventListener('click', function () {
      if (stream) {
        stopCamera();
        return;
      }
      if (!navigator.mediaDevices || !window.BarcodeDetector) {
        App.toast('كاميرا QR تحتاج متصفح Chromium حديثاً — استعمل USB أو الكتابة', 'error');
        return;
      }
      var detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'environment' } })
        .then(function (mediaStream) {
          stream = mediaStream;
          video.srcObject = mediaStream;
          video.style.display = 'block';
          video.play();
          cameraButton.textContent = '⏹️ إيقاف الكاميرا';
          timer = setInterval(function () {
            detector
              .detect(video)
              .then(function (codes) {
                if (codes.length > 0) {
                  stopCamera();
                  lookup(codes[0].rawValue);
                }
              })
              .catch(function () {});
          }, 350);
        })
        .catch(function () { App.toast('تعذّر الوصول إلى الكاميرا', 'error'); });
    });

    input.focus();
  }

  window.QRKit = {
    payload: payload,
    image: image,
    showItem: showItem,
    openScanner: openScanner,
    license: license
  };
})();
