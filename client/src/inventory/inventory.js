(function () {
  'use strict';

  var SECTIONS = {
    chemical: { key: 'chemicals', title: 'المواد الكيميائية', subtitle: 'مخزون المواد الكيميائية وكمياتها وتواريخ صلاحيتها' },
    glassware: { key: 'glassware', title: 'الزجاجيات', subtitle: 'الكؤوس والأنابيب والأدوات الزجاجية' },
    apparatus: { key: 'apparatus', title: 'العتاد', subtitle: 'الأجهزة والمعدات العلمية في المختبر' }
  };

  var categoryParam = new URLSearchParams(location.search).get('category') || '';

  var section = SECTIONS[categoryParam];
  if (!App.mount(section ? section.key : 'inventory')) return;

  var rows = document.getElementById('rows');
  var rowsFoot = document.getElementById('rowsFoot');

  var summary = document.getElementById('summary');

  var addBtn = document.getElementById('addBtn');

  var trashBtn = document.getElementById('trashBtn');

  var trashCount = document.getElementById('trashCount');

  var trashBody = document.getElementById('trashBody');

  var form = document.getElementById('itemForm');

  var categorySelect = document.getElementById('category');

  var cache = [];

  var fetchSelected = null;
  if (section) {
    document.title = section.title + ' — Amin-Lab -Pro🔬';
    document.getElementById('pageTitle').textContent = section.title;
    document.getElementById('pageSubtitle').textContent = section.subtitle;
    categorySelect.value = categoryParam;
    // في صفحات الأقسام يكفي عدّاد النتائج بدل بطاقات الملخص الأربع
    var summaryNode = document.getElementById('summary');
    if (summaryNode) summaryNode.hidden = true;
  }

  // تبويبات الأقسام

  var tabs = [
    { label: 'الجرد العام', href: '/inventory/inventory.html', value: '' },
    { label: 'المواد الكيميائية', href: '/inventory/inventory.html?category=chemical', value: 'chemical' },
    { label: 'الزجاجيات', href: '/inventory/inventory.html?category=glassware', value: 'glassware' },
    { label: 'العتاد', href: '/inventory/inventory.html?category=apparatus', value: 'apparatus' }
  ];
  document.getElementById('sectionTabs').innerHTML = tabs
    .map(function (tab) {
      return '<a href="' + tab.href + '" class="' + (tab.value === categoryParam ? 'active' : '') + '">' + tab.label + '</a>';
    })
    .join('');
  if (App.isAdmin()) {
    if (addBtn) addBtn.hidden = false;
    trashBtn.hidden = false;
    var downloadTemplateBtn = document.getElementById('downloadTemplateBtn');
    if (downloadTemplateBtn) downloadTemplateBtn.hidden = false;
  }
  document.querySelectorAll('[data-close]').forEach(function (button) {
    button.addEventListener('click', function () {
      App.closeModal(button.dataset.close);
    });
  });

  // شريط الأدوات الموحّد: استيراد · طباعة · إضافة · تعديل
  Actions.bar(document.getElementById('pageActions'), {
    // الاستيراد والإضافة والتعديل تتطلب مديراً (كما يفرضه الخادم)، والطباعة للجميع
    allow: { import: App.isAdmin(), add: App.isAdmin(), edit: App.isAdmin(), print: true },
    onPrint: function () { window.print(); },
    onAdd: function () { openForm(null); },
    onEdit: function () {
      var id = fetchSelected && fetchSelected();
      var item = cache.find(function (row) { return row.id === id; });
      if (!item) {
        App.toast('اختر صفاً من الجدول أولاً ثم اضغط «تعديل»', 'error');
        return;
      }
      openForm(item);
    },
    onImport: function (file) { importItems(file); }
  });
  fetchSelected = Actions.selection(rows, null);

  function defaultCategory(row) {
    return categoryParam || row.category || '';
  }

  var DANGER_VALUES = { 'منخفض': 'low', 'متوسط': 'medium', 'خطر': 'high', low: 'low', medium: 'medium', high: 'high' };

  // قاموس المواد الكيميائية: الاسم (كما في المستورد/الإدخال) -> { ar, formula }

  var CHEMICALS = {
    'acide chlorhydrique': { ar: 'حمض الهيدروكلوريك', formula: 'HCl' },
    'acide nitrique': { ar: 'حمض النتريك', formula: 'HNO3' },
    'agar-agar': { ar: 'آغار آغار', formula: null },
    'benzène': { ar: 'بنزين', formula: 'C6H6' },
    'benzene': { ar: 'بنزين', formula: 'C6H6' },
    'bicarbonate de sodium': { ar: 'بيكربونات الصوديوم', formula: 'NaHCO3' },
    'bleu de nile': { ar: 'أزرق النيل', formula: null },
    'bleu de bromothymol': { ar: 'أزرق بروموثيمول', formula: 'C27H28Br2O5S' },
    'carbonate de calcium': { ar: 'كربونات الكالسيوم', formula: 'CaCO3' },
    'chlorure d\'étain ii': { ar: 'كلوريد القصدير II', formula: 'SnCl2' },
    "chlorure d'étain ii": { ar: 'كلوريد القصدير II', formula: 'SnCl2' },
    'chlorure de baryum': { ar: 'كلوريد الباريوم', formula: 'BaCl2' },
    'chlorure de calcium': { ar: 'كلوريد الكالسيوم', formula: 'CaCl2' },
    'chlorure de fer': { ar: 'كلوريد الحديد III', formula: 'FeCl3' },
    'chlorure de fer ii': { ar: 'كلوريد الحديد II', formula: 'FeCl2' },
    'chlorure de sodium': { ar: 'كلوريد الصوديوم', formula: 'NaCl' },
    'chlorure de zinc': { ar: 'كلوريد الزنك', formula: 'ZnCl2' },
    'eau de chaux': { ar: 'ماء الجير', formula: 'Ca(OH)2' },
    'eau distillée': { ar: 'ماء مقطر', formula: 'H2O' },
    'eau distillee': { ar: 'ماء مقطر', formula: 'H2O' },
    'eau iodée': { ar: 'ماء يود', formula: 'I2' },
    'eau iodee': { ar: 'ماء يود', formula: 'I2' },
    'hydroxyde de sodium': { ar: 'هيدروكسيد الصوديوم', formula: 'NaOH' },
    'liqueur de fehling a': { ar: 'كاشف فهلينغ A', formula: 'CuSO4' },
    'liqueur de fehling b': { ar: 'كاشف فهلينغ B', formula: null },
    'nitrate d\'argent': { ar: 'نترات الفضة', formula: 'AgNO3' },
    "nitrate d'argent": { ar: 'نترات الفضة', formula: 'AgNO3' },
    'oxalate d\'ammonium (poudre)': { ar: 'أوكزالات الأمونيوم (بودرة)', formula: '(NH4)2C2O4' },
    "oxalate d'ammonium (poudre)": { ar: 'أوكزالات الأمونيوم (بودرة)', formula: '(NH4)2C2O4' },
    'oxalate d\'ammonium (solution)': { ar: 'أوكزالات الأمونيوم (محلول)', formula: '(NH4)2C2O4' },
    "oxalate d'ammonium (solution)": { ar: 'أوكزالات الأمونيوم (محلول)', formula: '(NH4)2C2O4' },
    'permanganate de potassium': { ar: 'برمنغنات البوتاسيوم', formula: 'KMnO4' },
    'rouge neutre': { ar: 'أحمر محايد', formula: 'C15H17ClN4' },
    'sulfate de cuivre': { ar: 'كبريتات النحاس', formula: 'CuSO4,5H2O' },
    'vert de méthyle': { ar: 'أخضر ميثيل', formula: null },
    'vert de methyle': { ar: 'أخضر ميثيل', formula: null },
    'zinc en poudre': { ar: 'زنك (بودرة)', formula: 'Zn' },
    'éosine alcoolique': { ar: 'إيوسين (محلول كحولي)', formula: 'C20H6Br4Na2O5' },
    'eosine alcoolique': { ar: 'إيوسين (محلول كحولي)', formula: 'C20H6Br4Na2O5' },
    'éther diéthylique': { ar: 'إثير ثنائي الإيثيل', formula: '(C2H5)2O' },
    'ether die thylique': { ar: 'إثير ثنائي الإيثيل', formula: '(C2H5)2O' },
  };

  function normalizeChemicalKey(value) {
    return String(value || '').trim().toLowerCase()
      .replace(/é/g, 'e').replace(/è/g, 'e').replace(/ê/g, 'e')
      .replace(/à/g, 'a').replace(/ù/g, 'u').replace(/ô/g, 'o')
      .replace(/ç/g, 'c').replace(/ï/g, 'i');
  }

  function chemicalInfo(name) {
    var raw = String(name || '').trim();
    if (!raw) return null;
    var key = raw.toLowerCase();
    var info = CHEMICALS[key];
    if (!info) info = CHEMICALS[normalizeChemicalKey(raw)];
    return info || null;
  }

  // قاموس العتاد: الاسم (كما في المستورد/الإدخال) -> { ar }
  var APPARATUS = {
    'دينامو dynamo (1)': { ar: 'دينامو (1)' },
    'دينامو dynamo (2)': { ar: 'دينامو (2)' },
    'main optical system': { ar: 'النظام البصري الرئيسي' },
    'دينامو dynamo (3)': { ar: 'دينامو (3)' },
    'pied a coulisse': { ar: 'قدمة التزلاق (مقياس كوليس)' },
    'transmission experimentationsion': { ar: 'تجربة الانتقال' },
    'plaque chauffante sans regulateur': { ar: 'لوحة تسخين بدون منظم' },
    'ampermetre mmpo71': { ar: 'أمبيرمتر' },
    'galvanomelre a zero': { ar: 'غالفانومتر (صفر)' },
    'volt metre': { ar: 'فولتمتر' },
    'electrolyseur': { ar: 'جهاز التحليل الكهربائي' },
    'electroscope': { ar: 'إلكتروسكوب' },
    'aiguille dorsed': { ar: 'مؤشر (needle)' },
    'samples of rock': { ar: 'عينات صخور' },
    'coffre de 20 spécimen roche': { ar: 'صندوق 20 عينة صخور' },
    'coffre de 20 specimen roche': { ar: 'صندوق 20 عينة صخور' },
    'microscope xsp103 a (1)': { ar: 'مجهر XSP103 A' },
    'microscope 4x (2)': { ar: 'مجهر 4X' },
    'spatules en inox 05 unite': { ar: 'ملاعق (سباتولا) من الصلب' },
    'toile metalique': { ar: 'شبكة معدنية' },
    'barreaux manitique': { ar: 'قضبان مغناطيسية' },
    'cuvette en plastique': { ar: 'وعاء بلاستيكي (كوفيت)' },
    'les anticorps et le susteme abo': { ar: 'الأجسام المضادة ونظام ABO' },
  };

  function normalizeApparatusKey(value) {
    return String(value || '').trim().toLowerCase()
      .replace(/é/g, 'e').replace(/è/g, 'e').replace(/ê/g, 'e')
      .replace(/à/g, 'a').replace(/ù/g, 'u').replace(/ô/g, 'o')
      .replace(/ç/g, 'c').replace(/ï/g, 'i').replace(/ü/g, 'u');
  }

  function apparatusInfo(name) {
    var raw = String(name || '').trim();
    if (!raw) return null;
    var key = raw.toLowerCase();
    var info = APPARATUS[key];
    if (!info) info = APPARATUS[normalizeApparatusKey(raw)];
    return info || null;
  }

  var DANGER_LABELS = { low: 'خطورة منخفضة', medium: 'خطورة متوسطة', high: 'خطورة عالية' };

  var DANGER_TONES = { low: 'ok', medium: 'warn', high: 'danger' };

  function dangerValue(raw) {
    var key = String(raw || '').trim().toLowerCase();
    var value = DANGER_VALUES[key] || DANGER_VALUES[String(raw || '').trim()];
    return value;
  }

  /** أول قيمة غير فارغة من عدة أسماء أعمدة (إنجليزي/عربي/أسماء بديلة). */

  function pick(row, names) {
    for (var index = 0; index < names.length; index += 1) {
      var value = row[names[index]];
      if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
    }
    return '';
  }

  function toCount(raw, fallback) {
    var value = Number(String(raw === undefined ? '' : raw).replace(',', '.'));
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
  }

  function nextCode(category, taken) {
    var prefix = category === 'glassware' ? 'GLS' : category === 'chemical' ? 'CHM' : 'APP';
    var pattern = new RegExp('^' + prefix + '-(\\d+)$');
    var max = 0;
    taken.forEach(function (code) {
      var match = pattern.exec(String(code || '').trim());
      if (match) max = Math.max(max, Number(match[1]));
    });
    var next = max + 1;
    var code = prefix + '-' + String(next).padStart(3, '0');
    while (taken.indexOf(code) !== -1) {
      next += 1;
      code = prefix + '-' + String(next).padStart(3, '0');
    }
    return code;
  }

  /**
   * استيراد ذكي: يقرأ الترويسات الإنجليزية/العربية وأسماء الأعمدة البديلة
   * (min_threshold, storage_location, danger_level…)، يولّد الرمز تلقائياً عند غيابه،
   * ويدمج الأسطر المتكررة لنفس المادة في صنف واحد بدل إنشاء نسخ مكررة.
   */

  var importing = false;

  function csvCell(value) {
    var text = String(value === undefined || value === null ? '' : value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }
    function downloadInventoryTemplate() {
    var headers = ['name', 'category', 'quantity', 'unit', 'min_quantity', 'location', 'expiry_date', 'formula', 'danger_level', 'supplier', 'invoice_no', 'purchase_date', 'cost', 'owner_no'];
    var section = categoryParam || '';
    var samples = [];
    var today = new Date().toISOString().slice(0, 10);
    var nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
        if (section === 'apparatus') { samples.push(['مجهر ضوئي', 'apparatus', '12', 'قطعة', '2', 'خزانة A', '', '', '', '', '', today, '']); }
    else if (section === 'glassware') { samples.push(['أنبوب اختبار', 'glassware', '120', 'أنبوب', '20', 'خزانة الزجاجيات', '', '', '', '', '', today, '']); }
    else if (section === 'chemical') {
      samples.push(['حمض الهيدروكلوريك', 'chemical', '5', 'قارورة', '1', 'خزانة C', nextYear, 'HCl', 'high', '', 'INV-001', today, '']);
      samples.push(['كاشف الفينولفتالين', 'chemical', '4', 'قارورة', '1', 'خزانة C', nextYear, '', 'low', '', '', '', '']);
        } else {
      samples.push(['مجهر ضوئي', 'apparatus', '12', 'قطعة', '2', 'خزانة الدرج A', '', '', '', '', '', today, '']);
      samples.push(['أنبوب اختبار', 'glassware', '120', 'أنبوب', '20', 'خزانة الزجاجيات', '', '', '', '', '', today, '']);
      samples.push(['كأس بيشر 250 مل', 'glassware', '40', 'كأس', '8', 'خزانة الزجاجيات', '', '', '', '', '', today, '']);
      samples.push(['حمض الهيدروكلوريك', 'chemical', '5', 'قارورة', '1', 'خزانة C', nextYear, 'HCl', 'high', '', 'INV-001', today, '']);
    }
    var csv = '\ufeff' + [headers].concat(samples).map(function (row) { return row.map(csvCell).join(','); }).join('\r\n') + '\r\n';
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    var names = { apparatus: 'العتاد', glassware: 'الزجاجيات', chemical: 'المواد-الكيميائية' };
    link.download = 'نموذج-استيراد-' + (names[section] || 'الجرد') + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    App.toast('تم تحميل نموذج ' + (names[section] || 'الجرد') + ' — املأه ثم استورده', 'ok');
  }
    /** تصدير الجرد المعروض إلى CSV (يشمل رقم الجرد الخاص). */
  function exportInventoryCsv() {
    var headers = ['code', 'owner_no', 'name', 'name_ar', 'category', 'quantity', 'available_quantity', 'unit',
      'min_quantity', 'location', 'expiry_date', 'formula', 'danger_level', 'supplier', 'invoice_no', 'purchase_date', 'cost'];
    if (!cache.length) {
      App.toast('لا توجد أصناف لتصديرها', 'error');
      return;
    }
    var lines = sortItems(cache).map(function (item) {
      return headers.map(function (key) {
        return item[key] === null || item[key] === undefined ? '' : item[key];
      });
    });
    var csv = '\ufeff' + [headers].concat(lines).map(function (row) { return row.map(csvCell).join(','); }).join('\r\n') + '\r\n';
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'الجرد-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    App.toast('تم تصدير ' + cache.length + ' صنفاً (بالترتيب الحالي) إلى CSV', 'ok');
  }

  var exportCsvBtn = document.getElementById('exportCsvBtn');
  if (exportCsvBtn) exportCsvBtn.addEventListener('click', exportInventoryCsv);

  function importItems(file) {
    // منع استيرادين متزامنين: الأول لم يُنهِ قراءة الأصناف بعد فيتضاعف الإدماج.
    if (importing) {
      App.toast('جارٍ استيراد ملف آخر — انتظر انتهاءه أولاً', 'error');
      return;
    }
    importing = true;
    App.api('/inventory')
      .then(function (data) {
        var byName = {};
        var takenCodes = [];
        (data.items || []).forEach(function (item) {
          byName[String(item.name || '').trim().toLowerCase()] = item;
          takenCodes.push(item.code);
        });
        Actions.importRows({
          file: file,
          transform: function (row) {
            var name = pick(row, ['name', 'الصنف', 'الاسم', 'المادة']);
            if (!name) throw new Error('اسم الصنف مطلوب');
            var formula = pick(row, ['formula', 'الصيغة']);
            var dangerRaw = pick(row, ['danger_level', 'الخطورة']);
                        var category = pick(row, ['category', 'الفئة']) || defaultCategory(row) || (formula || dangerRaw ? 'chemical' : '');
            // خريطة فئات خارجية (نموذج C11 يستخدم "equipment") → عتاد
            if (category === 'equipment' || category === 'equipment ' || category === 'matériel') category = 'apparatus';
            if (['apparatus', 'glassware', 'chemical'].indexOf(category) === -1) {
              throw new Error('فئة غير معروفة: ' + category + ' (أضف عمود category)');
            }
            var cost = pick(row, ['cost', 'التكلفة']);
            return {
              code: pick(row, ['code', 'الرمز']),
              name: name,
              category: category,
              quantity: toCount(pick(row, ['quantity', 'الكمية']), 0),
              unit: pick(row, ['unit', 'الوحدة']) || 'قطعة',
              min_quantity: toCount(pick(row, ['min_quantity', 'min_threshold', 'الحد الأدنى']), toCount(pick(row, ['quantity', 'الكمية']), 0) > 1 ? 1 : 0),
              location: (function () {
                var baseLoc = pick(row, ['location', 'storage_location', 'المكان']);
                var state = pick(row, ['state', 'الحالة']);
                var notes = pick(row, ['notes', 'ملاحظات']);
                var extra = [];
                if (state) extra.push('الحالة: ' + state);
                if (notes) extra.push(notes);
                return extra.length ? (baseLoc ? baseLoc + ' — ' + extra.join(' · ') : extra.join(' · ')) : baseLoc;
              })(),
              expiry_date: pick(row, ['expiry_date', 'الصلاحية']) || undefined,
              formula: formula || (chemicalInfo(name) && chemicalInfo(name).formula) || undefined,
              name_ar: (chemicalInfo(name) && chemicalInfo(name).ar) || (apparatusInfo(name) && apparatusInfo(name).ar) || undefined,
              danger_level: dangerValue(dangerRaw),
              supplier: pick(row, ['supplier', 'المورد']) || undefined,
              invoice_no: pick(row, ['invoice_no', 'رقم الفاتورة']) || undefined,
              owner_no: String(pick(row, ['owner_no', 'رقم الجرد الخاص', 'رقم الجرد الخاص بي']) || '').trim() || undefined,
              purchase_date: pick(row, ['purchase_date', 'تاريخ الشراء']) || undefined,
              cost: cost ? Number(cost.replace(',', '.')) : undefined
            };
          },
          submit: function (payload) {
            var key = payload.name.toLowerCase();
            var current = byName[key];
            if (!current) {
              if (!payload.code) payload.code = nextCode(payload.category, takenCodes);
              takenCodes.push(payload.code);
              // الاستجابة مغلّفة: { item } — يجب فكّها قبل تخزينها في خريطة الدمج.
              return App.api('/inventory', { method: 'POST', body: payload }).then(function (response) {
                byName[key] = response.item || response;
                return byName[key];
              });
            }
            // نفس المادة موجودة: تجميع الكميات والتكلفة، وتحديث بيانات أحدث شراء.
            var samePurchase =
              Boolean(payload.invoice_no && payload.purchase_date) &&
              payload.invoice_no === current.invoice_no &&
              payload.purchase_date === current.purchase_date;
            var newerPurchase =
              Boolean(payload.purchase_date) &&
              (!current.purchase_date || payload.purchase_date >= current.purchase_date);
            var merged = {
              code: current.code,
              name: current.name,
              category: current.category,
              quantity: current.quantity + (samePurchase ? 0 : payload.quantity || 0),
              unit: payload.unit || current.unit,
              min_quantity: payload.min_quantity || current.min_quantity,
              location: payload.location || current.location || '',
              expiry_date: payload.expiry_date || current.expiry_date || undefined,
              formula: payload.formula || current.formula || undefined,
              name_ar: payload.name_ar || current.name_ar || undefined,
              danger_level: payload.danger_level || current.danger_level || undefined,
              supplier: payload.supplier || current.supplier || '',
              owner_no: payload.owner_no || current.owner_no || undefined,
              invoice_no: newerPurchase ? payload.invoice_no || current.invoice_no || '' : current.invoice_no || '',
              purchase_date: newerPurchase ? payload.purchase_date : current.purchase_date || undefined,
              cost: Math.round((Number(current.cost || 0) + (samePurchase ? 0 : Number(payload.cost || 0))) * 100) / 100
            };
            return App.api('/inventory/' + current.id, { method: 'PUT', body: merged }).then(function (response) {
              byName[key] = response.item || response;
              return byName[key];
            });
          },
          done: function () {
            importing = false;
            load();
            loadTrash();
          }
        });
      })
      .catch(function (error) {
        importing = false;
        App.toast(error.message, 'error');
      });
  }

  function filters() {
    var params = [];
    var q = document.getElementById('search').value.trim();
    var category = document.getElementById('category').value;
    var status = document.getElementById('status').value;
    if (q) params.push('q=' + encodeURIComponent(q));
    if (category) params.push('category=' + category);
    if (status === 'low') params.push('lowStock=true');
    return params.length ? '?' + params.join('&') : '';
  }

  // حالة العرض: الترتيب وحجم الصفحة يبقيان بين عمليات التحميل والتصفية.
  var COLUMNS = [
    { key: 'code', label: 'الرمز' },
    { key: 'name', label: 'التسمية' },
    { key: 'category', label: 'الصنف' },
    { key: 'quantity', label: 'الكمية' },
    { key: 'available', label: 'المتاح' },
    { key: 'status', label: 'الحالة' },
    { key: 'location', label: 'المكان' }
  ];

  var VIEW_KEY = 'inventory:' + (categoryParam || 'all');

  // الفرز وحجم الصفحة يُستعادان من تفضيلات المستخدم المحفوظة
  var view = App.loadView(
    VIEW_KEY,
    { sortKey: 'name', sortDir: 'asc', pageSize: 25 },
    {
      sortKeys: COLUMNS.map(function (column) { return column.key; }),
      pageSizes: [0, 25, 50, 100]
    },
  );

  // الأصناف المحددة للإجراءات الجماعية
  var selectedIds = [];

  function stateOf(item) {
    if (item.available_quantity === 0) return { tone: 'danger', label: 'نافد' };
    if (item.min_quantity > 0 && item.available_quantity <= item.min_quantity) return { tone: 'warn', label: 'كمية منخفضة' };
    return { tone: 'ok', label: 'سليم' };
  }

  var SORT_FIELDS = {
    code: function (item) { return item.code || ''; },
    name: function (item) { return item.name_ar || item.name || ''; },
    category: function (item) { return App.categoryLabel(item.category); },
    quantity: function (item) { return Number(item.quantity) || 0; },
    available: function (item) { return Number(item.available_quantity) || 0; },
    status: function (item) { return stateOf(item).label; },
    location: function (item) { return item.location || ''; }
  };

  function sortItems(items) {
    return App.sortBy(items, SORT_FIELDS[view.sortKey], view.sortDir);
  }

  function render(items, stats) {
    cache = items;
    var counter = document.getElementById('resultCount');
    if (counter) counter.textContent = items.length + ' عنصر';
    trashCount.textContent = stats.deleted || 0;
    summary.innerHTML =
      '<div class="stat"><span>عدد الأصناف</span><strong>' + stats.total + '</strong></div>' +
      '<div class="stat"><span>إجمالي الوحدات</span><strong>' + stats.units + '</strong></div>' +
      '<div class="stat ' + (stats.lowStock ? 'warn' : 'ok') + '"><span>تحت الحد الأدنى</span><strong>' + stats.lowStock + '</strong></div>' +
      '<div class="stat ' + (stats.outOfStock ? 'danger' : 'ok') + '"><span>غير متوفر</span><strong>' + (stats.outOfStock || 0) + '</strong></div>' +
      '<div class="stat ' + (stats.expiring ? 'danger' : 'ok') + '"><span>قاربت الصلاحية</span><strong>' + stats.expiring + '</strong></div>';

    var sorted = sortItems(items);
    var pageSize = view.pageSize > 0 ? view.pageSize : Math.max(sorted.length, 1);
    var pages = Math.max(1, Math.ceil(sorted.length / pageSize));
    view.page = Math.min(Math.max(1, view.page), pages);
    var start = (view.page - 1) * pageSize;
    var pageItems = view.pageSize > 0 ? sorted.slice(start, start + pageSize) : sorted;

    var head = '<table class="inv-table"><thead><tr>' +
      '<th class="col-check"><input type="checkbox" data-select-all aria-label="تحديد الكل" /></th>' +
      App.sortHead(COLUMNS, view.sortKey, view.sortDir) +
      '<th></th></tr></thead><tbody>';

    selectedIds = selectedIds.filter(function (id) {
      return items.some(function (item) { return item.id === id; });
    });

    var body = pageItems
      .map(function (item) {
        var state = stateOf(item);
        var title = item.name_ar || item.name;
        var secondary = item.name_ar && item.name_ar !== item.name ? item.name : '';
        return (
          '<tr data-id="' + item.id + '">' +
          '<td class="col-check"><input type="checkbox" data-select="' + item.id + '"' +
          (selectedIds.indexOf(item.id) !== -1 ? ' checked' : '') + ' aria-label="تحديد الصنف" /></td>' +
          '<td><code>' + App.escape(item.code) + '</code>' +
          (item.owner_no ? '<div class="inv-sub">جرد ' + App.escape(item.owner_no) + '</div>' : '') +
          '</td>' +
          '<td class="wrap"><strong>' + App.escape(title) + '</strong>' +
          (secondary ? '<div class="inv-sub">' + App.escape(secondary) + '</div>' : '') +
          (item.formula ? '<div><span class="badge info">' + App.escape(item.formula) + '</span></div>' : '') +
          '</td>' +
          '<td>' + App.categoryLabel(item.category) + '</td>' +
          '<td>' + item.quantity + ' ' + App.escape(item.unit) + '</td>' +
          '<td>' + item.available_quantity + '</td>' +
          '<td><span class="badge ' + state.tone + '">' + state.label + '</span>' +
          (item.danger_level
            ? ' <span class="badge ' + (DANGER_TONES[item.danger_level] || 'info') + '">' + (DANGER_LABELS[item.danger_level] || '') + '</span>'
            : '') +
          '</td>' +
          '<td class="wrap">' + App.escape(item.location || '—') + '</td>' +
          '<td><div class="row-actions">' +
          '<button class="btn btn-sm" type="button" data-qr="' + item.id + '" title="رمز QR">' + App.icon('qr') + '</button>' +
          (App.isAdmin()
            ? '<button class="btn btn-sm" type="button" data-edit="' + item.id + '" title="تعديل">' + App.icon('pencil') + '</button>' +
              '<button class="btn btn-sm danger" type="button" data-delete="' + item.id + '" title="حذف">' + App.icon('trash') + '</button>'
            : '') +
          '</div></td></tr>'
        );
      })
      .join('');

    var foot = sorted.length
      ? App.pageFoot(view, sorted.length, start + 1, Math.min(start + pageSize, sorted.length), pages)
      : '';

    rows.innerHTML =
      head + (body || '<tr><td colspan="9" class="empty">لا توجد أصناف مطابقة</td></tr>') + '</tbody></table>';
    if (rowsFoot) rowsFoot.innerHTML = foot;

    App.bindSort(rows, function (key) {
      App.toggleSort(view, key);
      App.saveView(VIEW_KEY, view);
      render(items, stats);
    });
    App.bindPager(rowsFoot, view, function () {
      App.saveView(VIEW_KEY, view);
      render(items, stats);
    });

    var selectAll = rows.querySelector('[data-select-all]');
    if (selectAll) {
      selectAll.checked =
        pageItems.length > 0 &&
        pageItems.every(function (item) { return selectedIds.indexOf(item.id) !== -1; });
      selectAll.addEventListener('change', function () {
        pageItems.forEach(function (item) {
          var at = selectedIds.indexOf(item.id);
          if (selectAll.checked && at === -1) selectedIds.push(item.id);
          if (!selectAll.checked && at !== -1) selectedIds.splice(at, 1);
        });
        render(items, stats);
      });
    }

    rows.querySelectorAll('[data-select]').forEach(function (box) {
      box.addEventListener('change', function () {
        var id = Number(box.dataset.select);
        var at = selectedIds.indexOf(id);
        if (box.checked && at === -1) selectedIds.push(id);
        if (!box.checked && at !== -1) selectedIds.splice(at, 1);
        updateBulkBar();
      });
    });

    updateBulkBar();

    rows.querySelectorAll('[data-qr]').forEach(function (button) {
      button.addEventListener('click', function () {
        var item = items.find(function (row) { return row.id === Number(button.dataset.qr); });
        if (!item) return;
        if (window.QRKit) window.QRKit.showItem(item);
        else App.toast('جارٍ تحميل مولّد QR… أعد المحاولة', 'error');
      });
    });

    rows.querySelectorAll('[data-edit]').forEach(function (button) {
      button.addEventListener('click', function () {
        var item = items.find(function (row) { return row.id === Number(button.dataset.edit); });
        if (item) openForm(item);
      });
    });

    rows.querySelectorAll('[data-delete]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (!confirm(App.t('نقل هذا الصنف إلى سلة المحذوفات؟ يمكنك استرجاعه لاحقاً.') || 'نقل هذا الصنف إلى سلة المحذوفات؟ يمكنك استرجاعه لاحقاً.')) return;
        App.api('/inventory/' + button.dataset.delete, { method: 'DELETE' })
          .then(function () {
            App.toast('تم نقل الصنف إلى سلة المحذوفات — يمكنك استرجاعه', 'ok');
            load();
            loadTrash();
          })
          .catch(function (error) { App.toast(error.message, 'error'); });
      });
    });
  }

  function load() {
    var status = document.getElementById('status').value;
    App.api('/inventory' + filters())
      .then(function (data) {
        var items = status === 'out'
          ? data.items.filter(function (item) { return item.available_quantity === 0; })
          : data.items;
        render(items, data.summary);
        if (editParam) {
          var target = data.items.find(function (row) { return row.id === editParam; });
          if (target) openForm(target);
          editParam = 0;
        }
      })
      .catch(function (error) {
        rows.innerHTML = '<div class="empty">' + App.escape(error.message) + '</div>';
      });
  }

  function openForm(item) {
    document.getElementById('modalTitle').textContent = item ? 'تعديل صنف' : 'صنف جديد';
    document.getElementById('itemId').value = item ? item.id : '';
    document.getElementById('code').value = item ? item.code : '';
    document.getElementById('ownerNo').value = item && item.owner_no ? item.owner_no : '';
    document.getElementById('name').value = item ? item.name : '';
    document.getElementById('nameAr').value = item && item.name_ar ? item.name_ar : '';
    document.getElementById('itemCategory').value = item ? item.category : (categoryParam || 'apparatus');
    document.getElementById('quantity').value = item ? item.quantity : 1;
    document.getElementById('unit').value = item ? item.unit : 'قطعة';
    document.getElementById('minQuantity').value = item ? item.min_quantity : 0;
    document.getElementById('itemAliases').value = item && item.aliases_text ? item.aliases_text.split('|').join('، ') : '';
    document.getElementById('location').value = item ? item.location || '' : '';
    document.getElementById('expiry').value = item && item.expiry_date ? item.expiry_date : '';
    document.getElementById('formula').value = item && item.formula ? item.formula : '';
    document.getElementById('danger').value = item && item.danger_level ? item.danger_level : '';
    document.getElementById('supplier').value = item && item.supplier ? item.supplier : '';
    document.getElementById('invoice').value = item && item.invoice_no ? item.invoice_no : '';
    document.getElementById('purchaseDate').value = item && item.purchase_date ? item.purchase_date : '';
    document.getElementById('cost').value = item && item.cost ? item.cost : '';
    App.openModal('itemModal');
  }

  // تعبئة تلقائية لاسم عربي وصيغة عند إدخال اسم مادة كيميائية معروفة.

  var nameInput = document.getElementById('name');
  if (nameInput) {
    nameInput.addEventListener('blur', function () {
      var info = chemicalInfo(nameInput.value) || apparatusInfo(nameInput.value);
      if (!info) return;
      var arInput = document.getElementById('nameAr');
      var formulaInput = document.getElementById('formula');
      if (arInput && !arInput.value.trim() && info.ar) arInput.value = info.ar;
      if (formulaInput && !formulaInput.value.trim() && info.formula) formulaInput.value = info.formula;
    });
  }

  function updateBulkBar() {
    var bar = document.getElementById('bulkBar');
    if (!bar) return;
    bar.hidden = selectedIds.length === 0;
    var count = document.getElementById('bulkCount');
    if (count) count.textContent = selectedIds.length;
  }

  function bulkDelete() {
    if (selectedIds.length === 0) return;
    if (!confirm('نقل ' + selectedIds.length + ' صنفاً إلى سلة المحذوفات؟ يمكنك استرجاعها لاحقاً.')) return;
    var ids = selectedIds.slice();
    var done = 0;
    var chain = Promise.resolve();
    ids.forEach(function (id) {
      chain = chain.then(function () {
        return App.api('/inventory/' + id, { method: 'DELETE' }).then(
          function () { done += 1; },
          function () { /* الفشل الفردي لا يوقف الباقي */ },
        );
      });
    });
    chain.then(function () {
      App.toast('نُقل ' + done + ' من ' + ids.length + ' صنفاً إلى سلة المحذوفات', done === ids.length ? 'ok' : 'error');
      selectedIds = [];
      load();
      loadTrash();
    });
  }

  var bulkLabelsBtn = document.getElementById('bulkLabels');
  if (bulkLabelsBtn) {
    bulkLabelsBtn.addEventListener('click', function () {
      if (selectedIds.length === 0) return;
      location.href = '/labels.html?ids=' + selectedIds.join(',');
    });
  }
  var bulkDeleteBtn = document.getElementById('bulkDelete');
  if (bulkDeleteBtn) bulkDeleteBtn.addEventListener('click', bulkDelete);
  var bulkClearBtn = document.getElementById('bulkClear');
  if (bulkClearBtn) {
    bulkClearBtn.addEventListener('click', function () {
      selectedIds = [];
      load();
    });
  }

  function loadTrash() {
    if (!App.isAdmin()) return;
    App.api('/inventory/deleted')
      .then(function (data) {
        trashCount.textContent = data.count;
        if (data.items.length === 0) {
          trashBody.innerHTML = '<div class="empty">سلة المحذوفات فارغة</div>';
          return;
        }
        trashBody.innerHTML =
          '<table><thead><tr><th>الرمز</th><th>الصنف</th><th>الفئة</th><th>الكمية</th><th>تاريخ الحذف</th><th></th></tr></thead><tbody>' +
          data.items
            .map(function (item) {
              return (
                '<tr><td><code>' + App.escape(item.code) + '</code></td>' +
                '<td>' + App.escape(item.name_ar || item.name) + '</td>' +
                '<td>' + App.categoryLabel(item.category) + '</td>' +
                '<td>' + item.quantity + ' ' + App.escape(item.unit) + '</td>' +
                '<td>' + App.fmtDate(item.deleted_at) + '</td>' +
                '<td class="row-actions">' +
                '<button class="btn btn-sm btn-primary" data-restore="' + item.id + '">↩️ استرجاع</button>' +
                '<button class="btn btn-sm btn-danger" data-purge="' + item.id + '">حذف نهائي</button>' +
                '</td></tr>'
              );
            })
            .join('') +
          '</tbody></table>';
        trashBody.querySelectorAll('[data-restore]').forEach(function (button) {
          button.addEventListener('click', function () {
            App.api('/inventory/' + button.dataset.restore + '/restore', { method: 'POST' })
              .then(function (data) {
                App.toast('تم استرجاع «' + data.item.name + '» إلى الجرد', 'ok');
                load();
                loadTrash();
              })
              .catch(function (error) { App.toast(error.message, 'error'); });
          });
        });
        trashBody.querySelectorAll('[data-purge]').forEach(function (button) {
          button.addEventListener('click', function () {
            if (!confirm(App.t('حذف نهائي لا يمكن التراجع عنه. متابعة؟') || 'حذف نهائي لا يمكن التراجع عنه. متابعة؟')) return;
            App.api('/inventory/' + button.dataset.purge + '/permanent', { method: 'DELETE' })
              .then(function () {
                App.toast('تم الحذف النهائي', 'ok');
                load();
                loadTrash();
              })
              .catch(function (error) { App.toast(error.message, 'error'); });
          });
        });
      })
      .catch(function (error) {
        trashBody.innerHTML = '<div class="empty">' + App.escape(error.message) + '</div>';
      });
  }

  /** فتح نموذج التعديل مباشرة عند الوصول من ماسح QR (?edit=<id>). */

  var editParam = Number(new URLSearchParams(location.search).get('edit') || 0);
  trashBtn.addEventListener('click', function () {
    App.openModal('trashModal');
    loadTrash();
  });

  var downloadTemplateBtn = document.getElementById('downloadTemplateBtn');
  if (downloadTemplateBtn) {
    downloadTemplateBtn.addEventListener('click', downloadInventoryTemplate);
  }
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var id = document.getElementById('itemId').value;
    var payload = {
      code: document.getElementById('code').value.trim(),
      owner_no: document.getElementById('ownerNo').value.trim(),
      name: document.getElementById('name').value.trim(),
      category: document.getElementById('itemCategory').value,
      quantity: Number(document.getElementById('quantity').value),
      unit: document.getElementById('unit').value.trim() || 'قطعة',
      min_quantity: Number(document.getElementById('minQuantity').value || 0),
      location: document.getElementById('location').value.trim(),
      expiry_date: document.getElementById('expiry').value || undefined,
      formula: document.getElementById('formula').value.trim() || undefined,
      name_ar: document.getElementById('nameAr').value.trim() || undefined,
      danger_level: document.getElementById('danger').value || undefined,
      supplier: document.getElementById('supplier').value.trim(),
      invoice_no: document.getElementById('invoice').value.trim(),
      purchase_date: document.getElementById('purchaseDate').value || undefined,
      cost: document.getElementById('cost').value ? Number(document.getElementById('cost').value) : undefined
    };
    var aliases = document.getElementById('itemAliases').value.split(/[،,]/).map(function (part) { return part.trim(); }).filter(Boolean);
    App.api(id ? '/inventory/' + id : '/inventory', { method: id ? 'PUT' : 'POST', body: payload })
      .then(function (response) {
        var savedId = id || (response && response.item ? response.item.id : null);
        if (!savedId) return null;
        return App.api('/inventory/' + savedId + '/aliases', { method: 'PUT', body: { aliases: aliases } });
      })
      .then(function () {
        App.closeModal('itemModal');
        App.toast('تم حفظ الصنف', 'ok');
        load();
      })
      .catch(function (error) { App.toast(error.message, 'error'); });
  });

  var debounce;
  document.getElementById('search').addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(function () {
      view.page = 1;
      load();
    }, 250);
  });
  categorySelect.addEventListener('change', function () {
    view.page = 1;
    load();
  });
  document.getElementById('status').addEventListener('change', function () {
    view.page = 1;
    load();
  });
  App.loadScript('/qr.js');
  load();
  loadTrash();
  App.preparePrintPage(section ? section.title : 'قائمة الجرد');

})();
