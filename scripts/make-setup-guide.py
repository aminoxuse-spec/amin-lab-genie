#!/usr/bin/env python3
"""مولّد دليل التثبيت (PDF) — عربي / فرنسي / إنجليزي."""
import os
import textwrap

from PIL import Image, ImageDraw, ImageFont, features

OUT = "artifacts/Amin-Lab-Pro-Setup-Guide.pdf"
PREVIEW_DIR = "artifacts/guide-preview"
FONT_DIR = "assets/fonts"
LOGO = "client/src/assets/icons/logo.png"

W, H = 1654, 2339          # A4 @ 200 dpi
M = 125
CW = W - 2 * M
FOOT = 150

INK = (15, 23, 42)
MUTED = (71, 85, 105)
ACCENT = (21, 128, 61)
ACCENT_DARK = (6, 60, 46)
SOFT_BG = (240, 253, 244)
CARD = (248, 250, 252)
BORDER = (203, 213, 225)
WARN_BG = (255, 251, 235)
WARN = (146, 64, 14)
WHITE = (255, 255, 255)

AR_REG = os.path.join(FONT_DIR, "Tajawal-Regular.ttf")
AR_BOLD = os.path.join(FONT_DIR, "Tajawal-Bold.ttf")
AR_BLACK = os.path.join(FONT_DIR, "Tajawal-Black.ttf")
LAT = os.path.join(FONT_DIR, "Cairo-Variable.ttf")

_cache = {}


def ar_font(path, size):
    key = (path, size)
    if key not in _cache:
        _cache[key] = ImageFont.truetype(path, size)
    return _cache[key]


def lat_font(size, bold=False):
    key = ("lat", size, bold)
    if key not in _cache:
        f = ImageFont.truetype(LAT, size)
        if bold:
            try:
                f.set_variation_by_name("Bold")
            except Exception:
                pass
        _cache[key] = f
    return _cache[key]


RAQM = features.check("raqm")


def stext(d, xy, text, font, fill, anchor="la", rtl=False, **kw):
    """رسم نص مع دعم التشكيل العربي عبر Raqm إن كان متاحاً."""
    if rtl:
        d.text(xy, text, font=font, fill=fill, anchor=anchor,
               direction="rtl", language="ar", **kw)
    else:
        d.text(xy, text, font=font, fill=fill, anchor=anchor, **kw)


def measure(text, font, rtl):
    if rtl:
        try:
            return font.getlength(text, direction="rtl", language="ar")
        except Exception:
            return font.getlength(text)
    return font.getlength(text)


class Guide:
    def __init__(self, rtl, footer_right, footer_left):
        self.rtl = rtl
        self.pages = []
        self.footer_right = footer_right
        self.footer_left = footer_left
        self.page_no = 0
        self.new_page()

    # ---------- fonts ----------
    def body(self, size=30):
        return ar_font(AR_REG, size) if self.rtl else lat_font(size)

    def bold(self, size=30):
        return ar_font(AR_BOLD, size) if self.rtl else lat_font(size, True)

    def black(self, size=34):
        return ar_font(AR_BLACK, size) if self.rtl else lat_font(size, True)

    # ---------- pages ----------
    def new_page(self):
        page = Image.new("RGB", (W, H), WHITE)
        d = ImageDraw.Draw(page)
        # top accent bar
        d.rectangle([0, 0, W, 14], fill=ACCENT)
        # footer rule + text
        d.line([M, H - 108, W - M, H - 108], fill=BORDER, width=2)
        f = ar_font(AR_REG, 22) if self.rtl else lat_font(22)
        fy = H - 88
        if self.rtl:
            stext(d, (W - M, fy), self.footer_right, f, MUTED, "ra", rtl=True)
            stext(d, (M, fy), self.footer_left, lat_font(22), MUTED, "la")
        else:
            stext(d, (M, fy), self.footer_left, f, MUTED, "la")
            stext(d, (W - M, fy), self.footer_right, lat_font(22), MUTED, "ra")
        self.pages.append(page)
        self.d = d
        self.y = M + 40
        self.page_no += 1

    def ensure(self, h):
        if self.y + h > H - FOOT:
            self.new_page()

    # ---------- blocks ----------
    def h(self, text, first=False):
        self.ensure(140)
        if not first:
            self.y += 26
        f = self.black(38)
        bar_h = 46
        if self.rtl:
            x_text = W - M - 26
            self.d.rounded_rectangle([W - M - 8, self.y - 2, W - M, self.y + bar_h], radius=4, fill=ACCENT)
        else:
            x_text = M + 26
            self.d.rounded_rectangle([M, self.y - 2, M + 8, self.y + bar_h], radius=4, fill=ACCENT)
        stext(self.d, (x_text, self.y), text, f, ACCENT_DARK,
              "ra" if self.rtl else "la", rtl=self.rtl)
        self.y += bar_h + 16

    def p(self, text, color=INK, size=30, gap=16, indent=0, lh_ratio=1.62):
        f = self.body(size)
        lh = int(size * lh_ratio)
        for line in self._wrap(text, f, CW - indent):
            self.ensure(lh)
            self._line(line, f, color, indent, lh)
        self.y += gap

    def _line(self, line, f, color, indent, lh):
        if self.rtl:
            stext(self.d, (W - M - indent, self.y), line, f, color, "ra", rtl=True)
        else:
            stext(self.d, (M + indent, self.y), line, f, color, "la")
        self.y += lh

    def _wrap(self, text, f, max_w):
        words = text.split()
        lines, cur = [], ""
        for w in words:
            cand = (cur + " " + w).strip()
            if measure(cand, f, self.rtl) <= max_w or not cur:
                cur = cand
            else:
                lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        return lines

    def bullets(self, items, color=INK, size=30, gap=14):
        f = self.body(size)
        lh = int(size * 1.6)
        for item in items:
            lines = self._wrap(item, f, CW - 56)
            block = lh * len(lines)
            self.ensure(block + 10)
            cy = self.y + int(lh * 0.42)
            if self.rtl:
                self.d.ellipse([W - M - 20, cy - 8, W - M - 4, cy + 8], fill=ACCENT)
            else:
                self.d.ellipse([M + 4, cy - 8, M + 20, cy + 8], fill=ACCENT)
            for line in lines:
                self._line(line, f, color, 56, lh)
            self.y += gap

    def steps(self, items, color=INK, size=30):
        for i, (title, detail) in enumerate(items, start=1):
            f_title = self.bold(size + 2)
            f_body = self.body(size - 2)
            lh_t = int((size + 2) * 1.5)
            lh_b = int((size - 2) * 1.6)
            detail_lines = self._wrap(detail, f_body, CW - 120)
            block = lh_t + lh_b * len(detail_lines) + 22
            self.ensure(block + 20)
            top = self.y
            r = 30
            cx = (W - M - r) if self.rtl else (M + r)
            cy = top + int(lh_t / 2) - 4
            self.d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ACCENT)
            num_font = ar_font(AR_BOLD, 30) if self.rtl else lat_font(30, True)
            stext(self.d, (cx, cy - 2), str(i), num_font, WHITE, "mm")
            x = (W - M - 92) if self.rtl else (M + 92)
            stext(self.d, (x, top), title, f_title, color,
                  "ra" if self.rtl else "la", rtl=self.rtl)
            self.y = top + lh_t
            for line in detail_lines:
                self._line(line, f_body, MUTED, 92, lh_b)
            self.y += 22

    def code(self, text, size=27):
        f = lat_font(size)
        pad = 22
        box_h = int(size * 1.5) + pad * 2
        self.ensure(box_h + 14)
        self.d.rounded_rectangle([M, self.y, W - M, self.y + box_h], radius=14,
                                fill=(15, 23, 42))
        self.d.text((M + 26, self.y + pad - 2), text, font=f, fill=(226, 232, 240), anchor="la")
        self.y += box_h + 14

    def note(self, text, kind="note"):
        bg, edge = (SOFT_BG, ACCENT) if kind == "note" else (WARN_BG, WARN)
        f = self.body(27)
        lines = self._wrap(text, f, CW - 90)
        lh = int(27 * 1.55)
        box_h = lh * len(lines) + 44
        self.ensure(box_h + 16)
        self.d.rounded_rectangle([M, self.y, W - M, self.y + box_h], radius=16, fill=bg,
                                outline=border_color(bg), width=2)
        yy = self.y + 22
        for line in lines:
            self._line(line, f, (20, 60, 40) if kind == "note" else WARN, 44, lh)
        self.y += box_h + 16


def border_color(bg):
    r, g, b = bg
    return (max(0, r - 30), max(0, g - 25), max(0, b - 30))


# ---------------- cover ----------------
def make_cover():
    import numpy as np

    top = np.array([5, 34, 26], dtype=float)
    bot = np.array([6, 18, 34], dtype=float)
    col = np.linspace(0, 1, H).reshape(H, 1, 1)
    grad = top.reshape(1, 1, 3) * (1 - col) + bot.reshape(1, 1, 3) * col
    arr = np.repeat(grad, W, axis=1).astype("uint8")
    page = Image.fromarray(arr, "RGB").convert("RGBA")

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W * 0.5 - 620, -420, W * 0.5 + 620, 780], fill=(34, 197, 94, 70))
    gd.ellipse([-360, H * 0.62 - 420, 620, H * 0.62 + 560], fill=(56, 189, 248, 34))
    from PIL import ImageFilter
    glow = glow.filter(ImageFilter.GaussianBlur(190))
    page.alpha_composite(glow)

    d = ImageDraw.Draw(page)
    logo = Image.open(LOGO).convert("RGBA").resize((300, 300), Image.LANCZOS)
    mask = Image.new("L", (300, 300), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, 299, 299], radius=52, fill=255)
    logo.putalpha(mask)
    page.alpha_composite(logo, (W // 2 - 150, 330))

    d.text((W // 2, 740), "Amin-Lab -Pro", font=lat_font(96, True), fill=WHITE, anchor="mm")
    stext(d, (W // 2, 850), "نظام إدارة مختبر العلوم", ar_font(AR_BOLD, 54),
          (134, 239, 172), "mm", rtl=True)

    d.line([W // 2 - 160, 950, W // 2 + 160, 950], fill=(34, 197, 94), width=5)

    stext(d, (W // 2, 1040), "دليل التثبيت والتشغيل", ar_font(AR_BLACK, 66), WHITE, "mm", rtl=True)
    d.text((W // 2, 1120), "Guide d'installation et de mise en route", font=lat_font(38, True),
           fill=(203, 213, 225), anchor="mm")
    d.text((W // 2, 1185), "Setup & getting-started guide", font=lat_font(38), fill=(148, 163, 184),
           anchor="mm")

    chips = [("Windows 10 / 11", "64-bit"), ("Node.js 22 LTS", "nodejs.org"), ("v1.5.3", "2026")]
    cw, ch = 400, 150
    gap = (CW - 3 * cw) // 2
    y0 = 1320
    for i, (a, b) in enumerate(chips):
        x0 = M + i * (cw + gap)
        d.rounded_rectangle([x0, y0, x0 + cw, y0 + ch], radius=26,
                            fill=(26, 44, 40), outline=(62, 96, 84), width=2)
        d.text((x0 + cw // 2, y0 + 56), a, font=lat_font(36, True), fill=WHITE, anchor="mm")
        d.text((x0 + cw // 2, y0 + 108), b, font=lat_font(28), fill=(160, 190, 178), anchor="mm")

    stext(d, (W // 2, 1670), "عربي  ·  Français  ·  English", ar_font(AR_BOLD, 40),
          (134, 239, 172), "mm", rtl=True)

    d.line([M, 1800, W - M, 1800], fill=(58, 86, 76), width=2)
    stext(d, (W // 2, 1880), "الدعم والتواصل", ar_font(AR_BOLD, 34),
          (203, 213, 225), "mm", rtl=True)
    d.text((W // 2, 1960), "aminhadjadj13@gmail.com   ·   +213 558 128 160",
           font=lat_font(40, True), fill=WHITE, anchor="mm")
    d.text((W // 2, 2040), "Amin-Lab -Pro  ·  Gestion des laboratoires scientifiques",
           font=lat_font(26), fill=(148, 163, 184), anchor="mm")

    return page.convert("RGB")


# ---------------- content ----------------
def build_ar():
    g = Guide(True, "Amin-Lab -Pro🔬 · دليل التثبيت", "v1.5.3")

    g.h("قبل البدء", first=True)
    g.bullets([
        "Windows 10 أو Windows 11 بنسخة 64-bit.",
        "لا حاجة لتثبيت Node.js — فهو مضمّن في المثبت (Setup.exe) وفي مجلد runtime.",
        "150 ميغابايت مساحة حرة على القرص.",
        "المنفذ 3000 غير مستعمل من برنامج آخر.",
        "متصفح حديث: Edge أو Chrome أو Firefox.",
        "لا حاجة لاتصال بالإنترنت: التبعيات مضمّنة في المثبت.",
    ])
    g.note("التطبيق يعمل محلياً بالكامل: لا يُرسل أي شيء إلى الإنترنت، وتبقى قاعدة البيانات على جهازك.")

    g.h("التثبيت — الطريقة أ (بدون Setup)")
    g.steps([
        ("فك الضغط",
         "انقر بزر الفأرة الأيمن على الحزمة ثم Extract All. لا تشغّل التطبيق من داخل نافذة ZIP المضغوطة."),
        ("شغّل المشغّل",
         "افتح مجلد Amin-Lab-Pro-Sale ← installer ← انقر مزدوجاً على launch.cmd. إن ظهرت نافذة SmartScreen اختر More info ثم Run anyway."),
        ("انتظر قليلاً",
         "في أول تشغيل تُثبَّت التبعيات تلقائياً (حوالي دقيقة)، ثم يفتح المتصفح على http://localhost:3000."),
    ], )
    g.note("إن كان Node.js غير مثبت فسيفتح المشغّل صفحة التنزيل ويعرض رسالة واضحة بدل أن يفشل بصمت.", "warn")

    g.h("التثبيت — الطريقة ب (Setup.exe)")
    g.p("أنشئ مثبتاً واحداً بامتداد .exe توزّعه على الزبائن، مع اختصار على سطح المكتب وإلغاء تثبيت في لوحة التحكم.")
    g.steps([
        ("ثبّت Inno Setup 6",
         "حمّله مجاناً من jrsoftware.org/isdl.php وثبّته بالإعدادات الافتراضية."),
        ("ابنِ المثبت",
         "انقر مزدوجاً على installer\\build-setup.cmd. السكربت يثبّت التبعيات، يبني TypeScript، ثم ينشئ الملف."),
        ("وزّع الملف",
         "ستجد المثبت في installer\\output\\Amin-Lab-Genie-Setup-1.5.3.exe. انقله إلى أي جهاز Windows 10/11 وشغّله."),
    ])
    g.note("المثبت يطلب صلاحيات المدير، ويستبقي مجلد data عند إلغاء التثبيت حتى لا تفقد سجلاتك. الجهاز الهدف لا يحتاج Node.js — فهو مضمّن.")

    g.h("أول تشغيل وتسجيل الدخول")
    g.p("عند أول تشغيل تُنشأ قاعدة البيانات، وتُولَّد كلمتا مرور قويتان عشوائياً لحسابَي admin و teacher، وتُكتبان في هذا الملف:")
    g.code(r"data\first-run-credentials.txt")
    g.p("افتح الملف، انسخ كلمة مرور admin، ثم سجّل الدخول. انقل الكلمتين إلى مدير كلمات المرور واحذف الملف بعد ذلك.")
    g.p("لتغيير كلمة المرور لاحقاً، افتح موجّهاً (CMD) داخل مجلد التطبيق ونفّذ:")
    g.code("npm run set-password -- admin")
    g.p("تُحفظ الكلمة الجديدة في data\\credentials.txt ولا تُطبع على الشاشة. الحساب admin يملك كل الصلاحيات، والحساب teacher مخصّص للأساتذة (الجرد، الإعارة، استعمال الزمن).")

    g.h("النسخ الاحتياطي والبيانات")
    g.bullets([
        "كل شيء في مجلد data: قاعدة SQLite والنسخ الاحتياطية. انسخ هذا المجلد دورياً إلى قرص خارجي.",
        "نسخة تلقائية كل 24 ساعة داخل data\\backups، مع الاحتفاظ بآخر 14 نسخة.",
        "نسخة يدوية فورية: npm run backup",
        "لنقل التطبيق إلى جهاز آخر: انسخ المجلد كاملاً بما فيه data.",
        "إلغاء التثبيت لا يحذف data عمداً — احذفه يدوياً إن أردت البدء من جديد.",
    ])

    g.h("الإعدادات والترخيص")
    g.bullets([
        "انسخ .env.example إلى .env لتغيير المنفذ (PORT) أو مسار البيانات أو مدة الجلسة.",
        "اضبط APP_SECRET في الإنتاج: يوقّع جلسات الدخول ويُشتق منه مفتاح الترخيص.",
        "الفترة التجريبية 30 يوماً تبدأ من أول تشغيل (TRIAL_DAYS).",
        "توليد مفتاح ترخيص: npm run license ثم الإعدادات > الترخيص > تفعيل.",
        "تغيير اللغة من زر الترجمة أعلى الشاشة: عربي، فرنسي، إنجليزي.",
    ])

    g.h("حل المشاكل الشائعة")
    g.bullets([
        "«لم يُعثر على Node.js»: أعد تثبيت التطبيق من Setup.exe لأن مجلد runtime مفقود من الحزمة.",
        "المنفذ 3000 مشغول: نفّذ netstat -ano | findstr :3000 وأغلق البرنامج المعني، أو غيّر PORT في .env.",
        "صفحة بيضاء أو واجهة قديمة: اضغط Ctrl+F5، أو أوقف النافذة السوداء وأعد التشغيل.",
        "«npm غير معروف»: ثبّت Node.js ثم أعد فتح موجّه الأوامر.",
        "تحذير SmartScreen أو مضاد الفيروسات: اسمح بالتشغيل — الملفات نصوص مفتوحة وليست برنامجاً مجمّعاً.",
        "نسيت كلمة المرور: نفّذ npm run set-password -- admin من مجلد التطبيق.",
    ])

    g.h("محتوى الحزمة")
    g.bullets([
        "launch.cmd — مشغّل Windows بنقرة واحدة (تثبيت التبعيات ثم التشغيل).",
        "installer\\ — سكربت Inno Setup وأدوات بناء مثبت Setup.exe.",
        "client\\ و server\\ — واجهة التطبيق وخادمه.",
        "data\\ — قاعدة البيانات والنسخ الاحتياطية، تُنشأ عند أول تشغيل.",
        "docs\\ — التوثيق وسجل التغييرات ودليل الأمان.",
        "Amin-Lab-Pro-Promo.mp4 — الفيديو الترويجي مع صورة الغلاف.",
    ])

    g.h("أسئلة شائعة")
    g.bullets([
        "هل أحتاج اتصالاً بالإنترنت بعد التثبيت؟ لا، التطبيق يعمل محلياً بالكامل.",
        "هل يعمل على Mac أو Linux؟ الخادم مبني على Node.js فيعمل، لكن هذا الدليل والحزمة موجّهان لـ Windows.",
        "كم حساباً يمكن إنشاؤه؟ حساب مدير وحساب أستاذ، مع صلاحيات مختلفة لكل منهما.",
        "هل أستطيع استعماله على عدة أجهزة؟ نعم، لكل جهاز قاعدة بيانات مستقلة تُنسخ عبر مجلد data.",
    ])

    g.h("الدعم")
    g.p("البريد: aminhadjadj13@gmail.com   ·   الهاتف وواتساب: +213 558 128 160")
    g.p("الإصدار 1.5.3 · شروط الترخيص في LICENSE.txt · سجل التغييرات في docs/CHANGELOG.md", color=MUTED, size=26)
    return g.pages


def build_fr():
    g = Guide(False, "Amin-Lab -Pro🔬 · Guide d'installation", "v1.5.3")

    g.h("Avant de commencer", first=True)
    g.bullets([
        "Windows 10 ou Windows 11 en 64 bits.",
        "Aucun besoin d'installer Node.js — il est fourni avec l'installateur (Setup.exe) et le dossier runtime.",
        "150 Mo d'espace libre sur le disque.",
        "Le port 3000 doit être libre.",
        "Un navigateur récent : Edge, Chrome ou Firefox.",
        "Une connexion Internet, une seule fois, pour installer les dépendances.",
    ])
    g.note("L'application fonctionne entièrement en local : rien n'est envoyé sur Internet et la base de données reste sur votre poste.")

    g.h("Installation — méthode A (sans Setup)")
    g.steps([
        ("Décompresser",
         "Clic droit sur l'archive puis Extraire tout. Ne lancez pas l'application depuis la fenêtre du ZIP."),
        ("Lancer le démarrage",
         "Ouvrez le dossier Amin-Lab-Pro-Sale puis installer, et double-cliquez sur launch.cmd. Si SmartScreen apparaît : Informations complémentaires puis Exécuter quand même."),
        ("Patienter quelques secondes",
         "Au premier lancement, les dépendances s'installent automatiquement (environ une minute), puis le navigateur s'ouvre sur http://localhost:3000."),
    ])
    g.note("Si Node.js est absent, le lanceur ouvre la page de téléchargement et affiche un message clair au lieu d'échouer sans explication.", "warn")

    g.h("Installation — méthode B (Setup.exe)")
    g.p("Créez un installateur .exe unique à distribuer à vos clients, avec raccourci sur le bureau et désinstallation dans le Panneau de configuration.")
    g.steps([
        ("Installer Inno Setup 6",
         "Téléchargement gratuit sur jrsoftware.org/isdl.php, installation par défaut."),
        ("Compiler l'installateur",
         "Double-cliquez sur installer\\build-setup.cmd : le script installe les dépendances, compile TypeScript puis génère le fichier."),
        ("Distribuer",
         "Le fichier apparaît dans installer\\output\\Amin-Lab-Genie-Setup-1.5.3.exe. Copiez-le sur tout poste Windows 10/11 et exécutez-le."),
    ])
    g.note("L'installateur demande les droits administrateur et conserve le dossier data lors d'une désinstallation. Le poste cible n'a pas besoin de Node.js : il est fourni.")

    g.h("Premier lancement et connexion")
    g.p("Au premier démarrage, la base de données est créée et deux mots de passe forts sont générés aléatoirement pour les comptes admin et teacher, puis écrits dans ce fichier :")
    g.code(r"data\first-run-credentials.txt")
    g.p("Ouvrez le fichier, copiez le mot de passe admin puis connectez-vous. Transférez les deux mots de passe dans un gestionnaire de mots de passe et supprimez le fichier.")
    g.p("Pour changer un mot de passe plus tard, ouvrez une invite de commandes dans le dossier de l'application et lancez :")
    g.code("npm run set-password -- admin")
    g.p("Le nouveau mot de passe est enregistré dans data\\credentials.txt et n'est jamais affiché à l'écran. Le compte admin dispose de tous les droits ; teacher est destiné aux enseignants (inventaire, prêts, emploi du temps).")

    g.h("Sauvegardes et données")
    g.bullets([
        "Tout se trouve dans le dossier data : base SQLite et sauvegardes. Copiez ce dossier régulièrement sur un disque externe.",
        "Sauvegarde automatique toutes les 24 heures dans data\\backups, avec conservation des 14 dernières.",
        "Sauvegarde manuelle immédiate : npm run backup",
        "Pour déplacer l'application : copiez le dossier complet, data inclus.",
        "La désinstallation ne supprime volontairement pas data — supprimez-le à la main pour repartir de zéro.",
    ])

    g.h("Réglages et licence")
    g.bullets([
        "Copiez .env.example vers .env pour changer le port (PORT), le dossier de données ou la durée de session.",
        "Définissez APP_SECRET en production : il signe les sessions et sert à dériver la clé de licence.",
        "La période d'essai est de 30 jours à partir du premier lancement (TRIAL_DAYS).",
        "Générer une clé de licence : npm run license, puis Réglages > Licence > Activer.",
        "Changement de langue via le bouton de traduction en haut : arabe, français, anglais.",
    ])

    g.h("Dépannage")
    g.bullets([
        "« Node.js introuvable » : réinstallez l'application depuis Setup.exe, le dossier runtime manque.",
        "Port 3000 occupé : netstat -ano | findstr :3000 puis fermez le programme concerné, ou changez PORT dans .env.",
        "Page blanche ou interface obsolète : Ctrl+F5, ou arrêtez la fenêtre noire et relancez.",
        "« npm n'est pas reconnu » : après l'installation de Node.js, rouvrez l'invite de commandes.",
        "Alerte SmartScreen ou antivirus : autorisez l'exécution — les fichiers sont des scripts en clair, pas un exécutable packagé.",
        "Mot de passe oublié : lancez npm run set-password -- admin dans le dossier de l'application.",
    ])

    g.h("Contenu du package")
    g.bullets([
        "launch.cmd — lanceur Windows en un clic (dépendances puis démarrage).",
        "installer\\ — script Inno Setup et outils de compilation du Setup.exe.",
        "client\\ et server\\ — interface et serveur de l'application.",
        "data\\ — base de données et sauvegardes, créées au premier lancement.",
        "docs\\ — documentation, journal des modifications et guide de sécurité.",
        "Amin-Lab-Pro-Promo.mp4 — vidéo de présentation avec son visuel de couverture.",
    ])

    g.h("Questions fréquentes")
    g.bullets([
        "Faut-il Internet après l'installation ? Non, l'application fonctionne entièrement en local.",
        "Fonctionne-t-elle sur Mac ou Linux ? Le serveur est en Node.js, mais ce guide et ce package visent Windows.",
        "Combien de comptes ? Un compte administrateur et un compte enseignant, avec des droits distincts.",
        "Puis-je l'utiliser sur plusieurs postes ? Oui, chaque poste garde sa propre base, copiable via le dossier data.",
    ])

    g.h("Support")
    g.p("E-mail : aminhadjadj13@gmail.com   ·   Téléphone et WhatsApp : +213 558 128 160")
    g.p("Version 1.5.3 · Licence dans LICENSE.txt · Journal des modifications dans docs/CHANGELOG.md", color=MUTED, size=26)
    return g.pages


def build_en():
    g = Guide(False, "Amin-Lab -Pro🔬 · Setup guide", "v1.5.3")

    g.h("Before you start", first=True)
    g.bullets([
        "Windows 10 or Windows 11, 64-bit.",
        "No need to install Node.js — it ships with the installer (Setup.exe) and the runtime folder.",
        "150 MB of free disk space.",
        "Port 3000 must not be in use.",
        "A modern browser: Edge, Chrome or Firefox.",
        "An Internet connection once, to install dependencies.",
    ])
    g.note("The app runs fully offline: nothing is sent to the Internet and the database stays on your computer.")

    g.h("Install — option A (no Setup.exe)")
    g.steps([
        ("Extract the archive",
         "Right-click the ZIP and choose Extract All. Do not run the app from inside the compressed archive."),
        ("Start it",
         "Open the Amin-Lab-Pro-Sale folder, then installer, and double-click launch.cmd. If SmartScreen appears, click More info then Run anyway."),
        ("Wait a few seconds",
         "On first run the dependencies install automatically (about a minute), then your browser opens http://localhost:3000."),
    ])
    g.note("If Node.js is missing, the launcher opens the download page and prints a clear message instead of failing silently.", "warn")

    g.h("Install — option B (Setup.exe)")
    g.p("Build a single .exe installer to hand to customers, with a desktop shortcut and an entry in Add or Remove Programs.")
    g.steps([
        ("Install Inno Setup 6",
         "Free download from jrsoftware.org/isdl.php, default options."),
        ("Build the installer",
         "Double-click installer\\build-setup.cmd. The script installs dependencies, compiles TypeScript and produces the installer."),
        ("Ship it",
         "The file appears in installer\\output\\Amin-Lab-Genie-Setup-1.5.3.exe. Copy it to any Windows 10/11 machine and run it."),
    ])
    g.note("The installer requires administrator rights and keeps the data folder on uninstall. The target machine does not need Node.js — it is bundled.")

    g.h("First run and sign-in")
    g.p("On first start the database is created and two strong random passwords are generated for the admin and teacher accounts, then written to this file:")
    g.code(r"data\first-run-credentials.txt")
    g.p("Open the file, copy the admin password and sign in. Move both passwords into a password manager and delete the file afterwards.")
    g.p("To change a password later, open a command prompt in the app folder and run:")
    g.code("npm run set-password -- admin")
    g.p("The new password is stored in data\\credentials.txt and never printed on screen. admin has full rights; teacher is meant for teachers (inventory, loans, timetable).")

    g.h("Backups and data")
    g.bullets([
        "Everything lives in the data folder: SQLite database and backups. Copy it to an external drive regularly.",
        "Automatic backup every 24 hours in data\\backups, keeping the last 14 copies.",
        "Manual backup right away: npm run backup",
        "To move the app to another computer, copy the whole folder including data.",
        "Uninstalling deliberately keeps data — delete it by hand if you want a clean start.",
    ])

    g.h("Settings and licensing")
    g.bullets([
        "Copy .env.example to .env to change the port (PORT), the data folder or the session length.",
        "Set APP_SECRET in production: it signs sessions and derives your licence key.",
        "The trial lasts 30 days from the first launch (TRIAL_DAYS).",
        "Generate a licence key: npm run license, then Settings > Licence > Activate.",
        "Switch language with the translate button at the top: Arabic, French, English.",
    ])

    g.h("Troubleshooting")
    g.bullets([
        "\"Node.js not found\": reinstall the app from Setup.exe — the runtime folder is missing from the package.",
        "Port 3000 busy: run netstat -ano | findstr :3000 and close that program, or change PORT in .env.",
        "Blank page or stale UI: press Ctrl+F5, or stop the black window and start again.",
        "\"npm is not recognized\": reopen the command prompt after installing Node.js.",
        "SmartScreen or antivirus alert: allow it — these are plain-text scripts, not a packed executable.",
        "Forgotten password: run npm run set-password -- admin inside the app folder.",
    ])

    g.h("What's in the package")
    g.bullets([
        "launch.cmd — one-click Windows launcher (dependencies, then start).",
        "installer\\ — Inno Setup script and Setup.exe build tools.",
        "client\\ and server\\ — the app interface and its server.",
        "data\\ — database and backups, created on first run.",
        "docs\\ — documentation, changelog and security guide.",
        "Amin-Lab-Pro-Promo.mp4 — the promo video with its cover image.",
    ])

    g.h("FAQ")
    g.bullets([
        "Do I need Internet after installation? No, the app runs fully offline.",
        "Does it run on Mac or Linux? The Node.js server does, but this guide and package target Windows.",
        "How many accounts? An admin account and a teacher account, with different rights.",
        "Can I use it on several computers? Yes, each keeps its own database, portable through the data folder.",
    ])

    g.h("Support")
    g.p("Email: aminhadjadj13@gmail.com   ·   Phone and WhatsApp: +213 558 128 160")
    g.p("Version 1.5.3 · Licence in LICENSE.txt · Changelog in docs/CHANGELOG.md", color=MUTED, size=26)
    return g.pages


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    pages = [make_cover()]
    pages += build_ar()
    pages += build_fr()
    pages += build_en()

    pages[0].save(OUT, "PDF", resolution=200.0, save_all=True, append_images=pages[1:])
    for i, page in enumerate(pages, start=1):
        page.resize((page.width // 2, page.height // 2), Image.LANCZOS).save(
            os.path.join(PREVIEW_DIR, f"p{i:02d}.png"))
    print("DONE", OUT, "pages:", len(pages), "size:", os.path.getsize(OUT))


if __name__ == "__main__":
    main()
