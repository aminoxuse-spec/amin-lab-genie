(function () {
  'use strict';
  if (!App.mount('settings')) return;

  var sheet = document.getElementById('signSheet');
  var autoPrint = new URLSearchParams(location.search).get('print') === '1';

  document.getElementById('printBtn').addEventListener('click', function () { window.print(); });

  function nameLine(name) {
    var value = (name || '').trim();
    return value
      ? '<strong class="sign-sheet-name">' + App.escape(value) + '</strong>'
      : '<span class="sign-sheet-dots"></span>';
  }

  App.loadInstitution().then(function (inst) {
    var signature = (inst && inst.signature) || {};
    var roles = [
      {
        ar: 'الملحق الرئيسي بالمخبر',
        fr: signature.lab_fr || 'Adjoint(e) principal(e) du laboratoire',
        name: signature.lab
      },
      {
        ar: 'مستشار(ة) التربية',
        fr: signature.counselor_fr || "Conseiller(ère) d'éducation",
        name: signature.counselor
      },
      {
        ar: 'مدير(ة) المؤسسة',
        fr: signature.director_fr || "Directeur(trice) de l'établissement",
        name: signature.director
      }
    ];

    var blocks = roles
      .map(function (role, index) {
        return (
          '<article class="sign-sheet-block">' +
          '<header class="sign-sheet-role">' +
          '<span class="sign-sheet-index">' + (index + 1) + '</span>' +
          '<div><strong>' + role.ar + '</strong><small class="sign-sheet-fr">' + App.escape(role.fr) + '</small></div>' +
          '</header>' +
          '<div class="sign-sheet-row"><span>الاسم واللقب:</span>' + nameLine(role.name) + '</div>' +
          '<div class="sign-sheet-row"><span>التاريخ:</span><span class="sign-sheet-dots"></span></div>' +
          '<div class="sign-sheet-space"><span>الإمضاء والختم</span></div>' +
          '</article>'
        );
      })
      .join('');

    sheet.innerHTML =
      App.docHeaderHtml('وثيقة الإمضاءات') +
      '<h2 class="sign-sheet-title">وثيقة الإمضاءات</h2>' +
      '<p class="sign-sheet-sub">تُوقَّع هذه الوثيقة من طرف المسؤولين المذكورين أدناه، ويُحتفظ بها ضمن وثائق المختبر.</p>' +
      '<div class="sign-sheet-meta">' +
      '<div><span>الموضوع:</span><span class="sign-sheet-dots"></span></div>' +
      '<div><span>المرجع:</span><span class="sign-sheet-dots"></span></div>' +
      '<div><span>التاريخ:</span><strong>' + App.escape(App.fmtDate(App.today())) + '</strong></div>' +
      '</div>' +
      blocks;

    if (autoPrint) {
      setTimeout(function () { window.print(); }, 400);
    }
  });
})();
