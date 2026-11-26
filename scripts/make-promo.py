#!/usr/bin/env python3
"""Amin-Lab -Pro — مولّد الفيديو الترويجي (عمودي 1080x1920)."""
import math
import os
import subprocess
import sys
import wave
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1080, 1920
FPS = 30
DUR = 37.0
OUT_DIR = "artifacts"
FONT_DIR = "assets/fonts"
LOGO_PATH = "client/src/assets/icons/logo.png"
SCREENSHOT_DIR = "artifacts/shots"

# ---------- language ----------
LANG = "ar"
_args = sys.argv[1:]
for _i, _a in enumerate(_args):
    if _a == "--lang" and _i + 1 < len(_args):
        LANG = _args[_i + 1]
    elif _a.startswith("--lang="):
        LANG = _a.split("=", 1)[1]
if LANG not in ("ar", "fr", "en"):
    LANG = "ar"
RTL = LANG == "ar"
SCREENSHOT_DIR = {"ar": "artifacts/shots",
                  "fr": "artifacts/shots-fr",
                  "en": "artifacts/shots-en"}[LANG]

TEXTS = {
    "ar": dict(
        subtitle="تسيير مخابر العلوم",
        about="نظام متكامل لإدارة مختبر العلوم",
        hook1="هل ما زلت تسيّر",
        hook2="مخبرك بالورق؟",
        cta="حان وقت الرقمنة",
        features="المميزات",
        feat=[("الجرد", "أجهزة · زجاجيات · مواد كيميائية"),
              ("الإعارة", "عتاد ومواد في عملية واحدة"),
              ("استعمال الزمن", "جدول أسبوعي وكشف التعارض"),
              ("فحص الجودة", "نتائج ومزامنة تلقائية للمخزون"),
              ("التقارير", "يومي · أسبوعي · PDF و Excel")],
        why="لماذا Amin-Lab -Pro؟",
        rows=["واجهة عربية · فرنسية · إنجليزية",
              "تثبيت كتطبيق ويعمل محلياً",
              "نسخة تجريبية 30 يوماً"],
        local="بياناتك تبقى على جهازك",
        contact="تواصل معنا",
        badge="متوفر الآن  ·  نسخة تجريبية 30 يوماً",
        shots={"dashboard": "لوحة التحكم", "inventory": "الجرد",
               "qc": "فحص الجودة", "reports": "التقارير"},
    ),
    "fr": dict(
        subtitle="Gestion des laboratoires",
        about="Une solution complète pour votre laboratoire",
        hook1="Vous gérez encore",
        hook2="votre labo sur papier ?",
        cta="Passez au numérique",
        features="FONCTIONNALITÉS",
        feat=[("Inventaire", "Matériel · verrerie · produits"),
              ("Prêts", "Matériel et consommables en un flux"),
              ("Emploi du temps", "Planning hebdo · détection des conflits"),
              ("Contrôle qualité", "Résultats · synchro auto du stock"),
              ("Rapports", "Journalier · hebdo · PDF et Excel")],
        why="Pourquoi Amin-Lab -Pro ?",
        rows=["Interface AR · FR · EN",
              "Installable et 100 % local",
              "Essai gratuit de 30 jours"],
        local="Vos données restent sur votre appareil",
        contact="Contactez-nous",
        badge="Disponible  ·  essai de 30 jours",
        shots={"dashboard": "Tableau de bord", "inventory": "Inventaire",
               "qc": "Contrôle qualité", "reports": "Rapports"},
    ),
    "en": dict(
        subtitle="Science lab management",
        about="A complete system for your laboratory",
        hook1="Still running",
        hook2="your lab on paper?",
        cta="Time to go digital",
        features="FEATURES",
        feat=[("Inventory", "Equipment · glassware · chemicals"),
              ("Loans", "Gear and supplies in one flow"),
              ("Timetable", "Weekly schedule · clash detection"),
              ("Quality checks", "Results · automatic stock sync"),
              ("Reports", "Daily · weekly · PDF and Excel")],
        why="Why Amin-Lab -Pro?",
        rows=["Arabic · French · English UI",
              "Installs as an app, fully local",
              "30-day free trial"],
        local="Your data stays on your device",
        contact="Get in touch",
        badge="Available now  ·  30-day trial",
        shots={"dashboard": "Dashboard", "inventory": "Inventory",
               "qc": "Quality checks", "reports": "Reports"},
    ),
}

TX = TEXTS[LANG]

# ---------- helpers ----------
def clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))

def smoothstep(e0, e1, x):
    if e1 == e0:
        return 0.0 if x < e0 else 1.0
    t = clamp((x - e0) / (e1 - e0))
    return t * t * (3 - 2 * t)

def ease_out_cubic(x):
    return 1 - (1 - x) ** 3

def ease_out_back(x):
    c1 = 1.70158
    c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2

_font_cache = {}
def font(name, size):
    key = (name, size)
    if key not in _font_cache:
        _font_cache[key] = ImageFont.truetype(os.path.join(FONT_DIR, name), size)
    return _font_cache[key]

AR_BLACK = "Tajawal-Black.ttf"
AR_BOLD = "Tajawal-Bold.ttf"
AR_REG = "Tajawal-Regular.ttf"
LAT = "Cairo-Variable.ttf"

LATIN_SCALE = 0.86

def tf(kind, size):
    """خط النص حسب اللغة (عربي أو لاتيني) مع تصغير مناسب للاتينية."""
    if RTL:
        name = {"black": AR_BLACK, "bold": AR_BOLD, "reg": AR_REG}[kind]
        return font(name, size)
    return font(LAT, int(size * LATIN_SCALE))

WHITE = (255, 255, 255, 255)
MUTED = (203, 213, 225, 255)
SOFT = (148, 163, 184, 255)
GREEN = (34, 197, 94, 255)
LIGHT_GREEN = (134, 239, 172, 255)

def load_logo(size, radius_ratio=0.17):
    im = Image.open(LOGO_PATH).convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255
    )
    im.putalpha(mask)
    return im

def new_layer():
    return Image.new("RGBA", (W, H), (0, 0, 0, 0))

def draw_text(layer, xy, text, fnt, fill, anchor="mm", rtl=None,
              glow=None, glow_r=18, spacing=12, stroke=0, stroke_fill=None):
    if rtl is None:
        rtl = RTL
    d = ImageDraw.Draw(layer)
    direction = "rtl" if rtl else None
    language = "ar" if rtl else None
    if glow is not None:
        g = Image.new("RGBA", layer.size, (0, 0, 0, 0))
        ImageDraw.Draw(g).text(
            xy, text, font=fnt, fill=glow, anchor=anchor, align="center",
            spacing=spacing, direction=direction, language=language,
        )
        g = g.filter(ImageFilter.GaussianBlur(glow_r))
        layer.alpha_composite(g)
    d.text(xy, text, font=fnt, fill=fill, anchor=anchor, align="center",
           spacing=spacing, direction=direction, language=language,
           stroke_width=stroke, stroke_fill=stroke_fill)

def finish(layer, cx, cy):
    bbox = layer.getbbox()
    if not bbox:
        return Layer(Image.new("RGBA", (2, 2), (0, 0, 0, 0)), cx, cy)
    return Layer(layer.crop(bbox), cx, cy)

class Layer:
    def __init__(self, img, cx, cy):
        self.img = img
        self.cx = cx
        self.cy = cy

# ---------- background ----------
def make_base():
    top = np.array([6, 26, 20], dtype=float)
    bot = np.array([7, 18, 34], dtype=float)
    col = np.linspace(0, 1, H).reshape(H, 1, 1)
    grad = top.reshape(1, 1, 3) * (1 - col) + bot.reshape(1, 1, 3) * col
    arr = np.repeat(grad, W, axis=1).astype(np.uint8)
    im = Image.fromarray(arr, "RGB").convert("RGBA")

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W * 0.5 - 520, -460, W * 0.5 + 520, 620], fill=(34, 197, 94, 70))
    gd.ellipse([-420, H * 0.58 - 420, 520, H * 0.58 + 620], fill=(56, 189, 248, 40))
    gd.ellipse([W - 500, H * 0.82 - 400, W + 420, H * 0.82 + 520], fill=(167, 139, 250, 34))
    glow = glow.filter(ImageFilter.GaussianBlur(170))
    im.alpha_composite(glow)

    # vignette
    v = Image.new("L", (W, H), 0)
    vd = ImageDraw.Draw(v)
    vd.ellipse([-W * 0.35, -H * 0.2, W * 1.35, H * 1.2], fill=110)
    v = v.filter(ImageFilter.GaussianBlur(220))
    dark = Image.new("RGBA", (W, H), (0, 0, 0, 150))
    dark.putalpha(Image.eval(v, lambda p: 150 - p))
    im.alpha_composite(dark)
    return im

SPRITES = {}
def bubble_sprite(r):
    if r in SPRITES:
        return SPRITES[r]
    d = int(r * 2.8)
    sp = Image.new("RGBA", (d, d), (0, 0, 0, 0))
    ImageDraw.Draw(sp).ellipse([d * 0.5 - r, d * 0.5 - r, d * 0.5 + r, d * 0.5 + r],
                               fill=(150, 240, 190, 120))
    sp = sp.filter(ImageFilter.GaussianBlur(max(1, r * 0.35)))
    SPRITES[r] = sp
    return sp

random.seed(7)
BUBBLES = [dict(x=random.uniform(0, W), y0=random.uniform(0, H),
                r=random.choice([5, 8, 12, 18]), speed=random.uniform(14, 42))
           for _ in range(24)]

def render_background(base, t):
    frame = base.copy()
    for b in BUBBLES:
        y = (b["y0"] - b["speed"] * t) % (H + 160) - 80
        sp = bubble_sprite(b["r"])
        frame.alpha_composite(sp, (int(b["x"] - sp.width / 2), int(y - sp.height / 2)))
    return frame

# ---------- icons ----------
def draw_icon(kind, s, color=(255, 255, 255, 255)):
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    lw = max(7, int(s * 0.052))
    if kind == "inventory":
        for yy in (0.28, 0.47, 0.66):
            d.rounded_rectangle([s * 0.17, s * yy, s * 0.83, s * (yy + 0.15)],
                                radius=s * 0.035, outline=color, width=lw)
            d.line([s * 0.5, s * yy + lw, s * 0.5, s * (yy + 0.15) - lw], fill=color, width=lw)
    elif kind == "borrow":
        d.arc([s * 0.20, s * 0.20, s * 0.80, s * 0.80], start=35, end=205, fill=color, width=lw)
        d.arc([s * 0.20, s * 0.20, s * 0.80, s * 0.80], start=215, end=385, fill=color, width=lw)
        d.polygon([(s * 0.80, s * 0.24), (s * 0.66, s * 0.30), (s * 0.78, s * 0.42)], fill=color)
        d.polygon([(s * 0.20, s * 0.76), (s * 0.34, s * 0.70), (s * 0.22, s * 0.58)], fill=color)
    elif kind == "schedule":
        d.rounded_rectangle([s * 0.17, s * 0.24, s * 0.83, s * 0.80],
                            radius=s * 0.06, outline=color, width=lw)
        d.line([s * 0.17, s * 0.40, s * 0.83, s * 0.40], fill=color, width=lw)
        d.line([s * 0.34, s * 0.17, s * 0.34, s * 0.30], fill=color, width=lw)
        d.line([s * 0.66, s * 0.17, s * 0.66, s * 0.30], fill=color, width=lw)
        for gx in (0.31, 0.50, 0.69):
            for gy in (0.50, 0.62, 0.74):
                d.ellipse([s * gx - lw * 0.45, s * gy - lw * 0.45,
                           s * gx + lw * 0.45, s * gy + lw * 0.45], fill=color)
    elif kind == "qc":
        d.ellipse([s * 0.18, s * 0.18, s * 0.82, s * 0.82], outline=color, width=lw)
        d.line([s * 0.33, s * 0.51, s * 0.46, s * 0.64], fill=color, width=lw, joint="curve")
        d.line([s * 0.46, s * 0.64, s * 0.69, s * 0.37], fill=color, width=lw, joint="curve")
    elif kind == "reports":
        d.line([s * 0.18, s * 0.79, s * 0.82, s * 0.79], fill=color, width=lw)
        for x, hgt in ((0.28, 0.30), (0.47, 0.46), (0.66, 0.22)):
            d.rounded_rectangle([s * x, s * (0.79 - hgt), s * (x + 0.12), s * 0.79],
                                radius=s * 0.02, fill=color)
    return im

def icon_tile(accent, kind, size=260):
    S = size + 56
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    gl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(gl).ellipse([28, 28, S - 28, S - 28], fill=(accent[0], accent[1], accent[2], 120))
    gl = gl.filter(ImageFilter.GaussianBlur(30))
    im.alpha_composite(gl)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([28, 28, S - 28, S - 28], radius=int(size * 0.30),
                        fill=(accent[0], accent[1], accent[2], 255))
    hi = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(hi).rounded_rectangle([28, 28, S - 28, S - 28], radius=int(size * 0.30),
                                         fill=(255, 255, 255, 38))
    im.alpha_composite(hi)
    im.alpha_composite(draw_icon(kind, size), (28, 28))
    return im

def pill(text, fnt, accent, pad_x=38, pad_y=18, rtl=None):
    if rtl is None:
        rtl = RTL
    direction = "rtl" if rtl else None
    language = "ar" if rtl else None
    tmp = Image.new("RGBA", (10, 10))
    d = ImageDraw.Draw(tmp)
    box = d.textbbox((0, 0), text, font=fnt, direction=direction, language=language)
    tw, th = box[2] - box[0], box[3] - box[1]
    w, h = tw + pad_x * 2, th + pad_y * 2
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dd = ImageDraw.Draw(im)
    dd.rounded_rectangle([0, 0, w - 1, h - 1], radius=h // 2,
                         fill=(accent[0], accent[1], accent[2], 36),
                         outline=(accent[0], accent[1], accent[2], 160), width=2)
    dd.text((w / 2, h / 2 - box[1] + (box[3] - box[2]) * 0), text, font=fnt,
            fill=(accent[0], accent[1], accent[2], 255), anchor="mm",
            direction=direction, language=language)
    return im

# ---------- scene building ----------
ABOUT = TX["about"]
SUBTITLE = TX["subtitle"]

def build_intro():
    layers = []
    logo = load_logo(440)
    tile = Image.new("RGBA", (520, 520), (0, 0, 0, 0))
    gl = Image.new("RGBA", (520, 520), (0, 0, 0, 0))
    ImageDraw.Draw(gl).ellipse([40, 40, 480, 480], fill=(34, 197, 94, 130))
    gl = gl.filter(ImageFilter.GaussianBlur(34))
    tile.alpha_composite(gl)
    tile.alpha_composite(logo, (40, 40))
    layers.append((finish(tile, W // 2, 720), a_pop(0.05, 0.7, 0.62, float_amp=7)))

    l = new_layer()
    draw_text(l, (W // 2, 1095), "Amin-Lab -Pro", font(LAT, 108), WHITE, rtl=False,
              glow=(34, 197, 94, 150), glow_r=26)
    layers.append((finish(l, W // 2, 1095), a_slide(0.35, 0.65, 70)))

    l = new_layer()
    draw_text(l, (W // 2, 1205), SUBTITLE, tf("bold", 62), LIGHT_GREEN,
              glow=(34, 197, 94, 110), glow_r=20)
    layers.append((finish(l, W // 2, 1205), a_slide(0.62, 0.6, 60)))

    l = new_layer()
    draw_text(l, (W // 2, 1300), ABOUT, tf("reg", 44), MUTED)
    layers.append((finish(l, W // 2, 1300), a_fade(0.9, 0.6)))

    return Scene(0.0, 4.0, layers)

def build_hook():
    layers = []
    l = new_layer()
    d = ImageDraw.Draw(l)
    # paper sheet with a red slash
    cx, cy = W // 2, 610
    pw, ph = 300, 380
    d.rounded_rectangle([cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2],
                        radius=26, fill=(248, 250, 252, 235))
    for i in range(5):
        y = cy - ph / 2 + 70 + i * 52
        d.rounded_rectangle([cx - pw / 2 + 40, y, cx + pw / 2 - 40, y + 14],
                            radius=7, fill=(148, 163, 184, 255))
    d.line([cx - 170, cy + 170, cx + 170, cy - 170], fill=(239, 68, 68, 255), width=22)
    d.ellipse([cx - 178, cy - 178, cx - 120, cy - 120], fill=(239, 68, 68, 255))
    d.ellipse([cx + 120, cy + 120, cx + 178, cy + 178], fill=(239, 68, 68, 255))
    layers.append((finish(l, cx, cy), a_pop(0.05, 0.6, 0.7)))

    l = new_layer()
    draw_text(l, (W // 2, 1000), TX["hook1"], tf("black", 100), WHITE,
              glow=(0, 0, 0, 160), glow_r=22)
    layers.append((finish(l, W // 2, 1000), a_slide(0.3, 0.55, 70)))

    l = new_layer()
    draw_text(l, (W // 2, 1125), TX["hook2"], tf("black", 100), (252, 165, 165, 255),
              glow=(239, 68, 68, 120), glow_r=22)
    layers.append((finish(l, W // 2, 1125), a_slide(0.42, 0.55, 70)))

    l = new_layer()
    p = pill(TX["cta"], tf("bold", 46), (56, 189, 248))
    l.alpha_composite(p, (W // 2 - p.width // 2, 1280))
    layers.append((finish(l, W // 2, 1280 + p.height // 2), a_fade(0.75, 0.55)))

    return Scene(3.6, 7.0, layers)

def framed_screenshot(path, max_w=940, radius=26, pad=16):
    im = Image.open(path).convert("RGB")
    ratio = max_w / im.width
    im = im.resize((max_w, int(im.height * ratio)), Image.LANCZOS)
    w, h = im.size
    inner_w, inner_h = w + pad * 2, h + pad * 2
    card = Image.new("RGBA", (inner_w + 80, inner_h + 80), (0, 0, 0, 0))
    sh = Image.new("RGBA", card.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([40, 48, 40 + inner_w, 48 + inner_h],
                                          radius=radius + 6, fill=(0, 0, 0, 190))
    sh = sh.filter(ImageFilter.GaussianBlur(26))
    card.alpha_composite(sh)
    d = ImageDraw.Draw(card)
    d.rounded_rectangle([40, 40, 40 + inner_w, 40 + inner_h], radius=radius,
                        fill=(255, 255, 255, 255))
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=radius - 6, fill=255)
    shot = im.convert("RGBA")
    shot.putalpha(mask)
    card.alpha_composite(shot, (40 + pad, 40 + pad))
    return card

def build_shot_scene(title, image_name, accent, start, end):
    layers = []
    l = new_layer()
    badge = pill(title, tf("bold", 40), accent)
    l.alpha_composite(badge, (W // 2 - badge.width // 2, 350))
    layers.append((finish(l, W // 2, 350 + badge.height // 2), a_fade(0.1, 0.45)))

    card = framed_screenshot(os.path.join(SCREENSHOT_DIR, image_name))
    layers.append((finish(card, W // 2, 1010), a_pop(0.1, 0.7, 0.93, float_amp=3)))

    return Scene(start, end, layers)

FEATURES = [
    ((34, 197, 94), "inventory"),
    ((244, 114, 182), "borrow"),
    ((56, 189, 248), "schedule"),
    ((251, 191, 36), "qc"),
    ((167, 139, 250), "reports"),
]

def build_feature(index, start, end):
    accent, kind = FEATURES[index]
    title, sub = TX["feat"][index]
    layers = []

    l = new_layer()
    badge = pill(f"{TX['features']}  ·  {index + 1} / {len(FEATURES)}", tf("bold", 38), accent)
    l.alpha_composite(badge, (W // 2 - badge.width // 2, 400))
    layers.append((finish(l, W // 2, 400 + badge.height // 2), a_fade(0.12, 0.5)))

    tile = icon_tile(accent, kind, 260)
    layers.append((finish(tile, W // 2, 800), a_pop(0.12, 0.6, 0.55, float_amp=6)))

    l = new_layer()
    draw_text(l, (W // 2, 1110), title, tf("black", 104), WHITE,
              glow=(accent[0], accent[1], accent[2], 130), glow_r=24)
    layers.append((finish(l, W // 2, 1110), a_slide(0.3, 0.55, 70)))

    l = new_layer()
    draw_text(l, (W // 2, 1215), sub, tf("reg", 46), MUTED)
    layers.append((finish(l, W // 2, 1215), a_fade(0.46, 0.55)))

    l = new_layer()
    r = 13
    gap = 40
    total = len(FEATURES) * (2 * r) + (len(FEATURES) - 1) * (gap - 2 * r)
    x0 = W // 2 - total // 2
    cy = 1480
    for i in range(len(FEATURES)):
        cx = x0 + i * gap + r
        if i == index:
            d = ImageDraw.Draw(l)
            d.ellipse([cx - r, cy - r, cx + r, cy + r],
                      fill=(accent[0], accent[1], accent[2], 255))
        else:
            d = ImageDraw.Draw(l)
            d.ellipse([cx - r + 3, cy - r + 3, cx + r - 3, cy + r - 3],
                      fill=(255, 255, 255, 60))
    layers.append((finish(l, W // 2, cy), a_fade(0.55, 0.5)))

    return Scene(start, end, layers)

def build_benefits(start, end):
    layers = []
    l = new_layer()
    draw_text(l, (W // 2, 640), TX["why"], tf("black", 78), WHITE,
              glow=(34, 197, 94, 120), glow_r=22)
    layers.append((finish(l, W // 2, 640), a_slide(0.15, 0.55, 60)))

    rows = [
        (TX["rows"][0], (56, 189, 248)),
        (TX["rows"][1], (34, 197, 94)),
        (TX["rows"][2], (251, 191, 36)),
    ]
    y = 880
    for i, (txt, accent) in enumerate(rows):
        l = new_layer()
        d = ImageDraw.Draw(l)
        box_w, box_h = 820, 150
        x0, y0 = W // 2 - box_w // 2, y - box_h // 2
        d.rounded_rectangle([x0, y0, x0 + box_w, y0 + box_h], radius=36,
                            fill=(255, 255, 255, 16),
                            outline=(accent[0], accent[1], accent[2], 90), width=2)
        # check circle
        ccx, ccy, rr = x0 + 80, y, 40
        d.ellipse([ccx - rr, ccy - rr, ccx + rr, ccy + rr],
                  fill=(accent[0], accent[1], accent[2], 235))
        d.line([ccx - 16, ccy, ccx - 4, ccy + 13], fill=(10, 30, 22, 255), width=8, joint="curve")
        d.line([ccx - 4, ccy + 13, ccx + 19, ccy - 13], fill=(10, 30, 22, 255), width=8, joint="curve")
        draw_text(l, (x0 + 160, y), txt, tf("bold", 46), WHITE, anchor="lm")
        layers.append((finish(l, W // 2, y), a_slide(0.3 + i * 0.18, 0.55, 55)))
        y += 190

    l = new_layer()
    draw_text(l, (W // 2, 1560), TX["local"], tf("reg", 44), SOFT)
    layers.append((finish(l, W // 2, 1560), a_fade(0.95, 0.5)))

    return Scene(start, end, layers)

def build_outro(start, end):
    layers = []
    logo = load_logo(360)
    tile = Image.new("RGBA", (430, 430), (0, 0, 0, 0))
    gl = Image.new("RGBA", (430, 430), (0, 0, 0, 0))
    ImageDraw.Draw(gl).ellipse([30, 30, 400, 400], fill=(34, 197, 94, 120))
    gl = gl.filter(ImageFilter.GaussianBlur(30))
    tile.alpha_composite(gl)
    tile.alpha_composite(logo, (35, 35))
    layers.append((finish(tile, W // 2, 600), a_pop(0.1, 0.6, 0.6, float_amp=5)))

    l = new_layer()
    draw_text(l, (W // 2, 905), "Amin-Lab -Pro", font(LAT, 96), WHITE, rtl=False,
              glow=(34, 197, 94, 140), glow_r=24)
    layers.append((finish(l, W // 2, 905), a_slide(0.3, 0.55, 55)))

    l = new_layer()
    draw_text(l, (W // 2, 1005), SUBTITLE, tf("bold", 52), LIGHT_GREEN)
    layers.append((finish(l, W // 2, 1005), a_fade(0.5, 0.5)))

    l = new_layer()
    draw_text(l, (W // 2, 1150), TX["contact"], tf("bold", 56), WHITE)
    layers.append((finish(l, W // 2, 1150), a_fade(0.65, 0.5)))

    l = new_layer()
    draw_text(l, (W // 2, 1265), "aminhadjadj13@gmail.com", font(LAT, 52), MUTED, rtl=False)
    layers.append((finish(l, W // 2, 1265), a_slide(0.78, 0.5, 40)))

    l = new_layer()
    draw_text(l, (W // 2, 1360), "+213 558 128 160", font(LAT, 52), MUTED, rtl=False)
    layers.append((finish(l, W // 2, 1360), a_slide(0.9, 0.5, 40)))

    l = new_layer()
    draw_text(l, (W // 2, 1500), TX["badge"], tf("reg", 40), SOFT)
    layers.append((finish(l, W // 2, 1500), a_fade(1.05, 0.5)))

    return Scene(start, end, layers)

# ---------- animation ----------
def a_fade(delay=0.0, dur=0.55):
    def f(lt, d):
        k = smoothstep(delay, delay + dur, lt)
        return k, 1.0, 0.0, 0.0
    return f

def a_slide(delay=0.0, dur=0.6, dist=70):
    def f(lt, d):
        k = smoothstep(delay, delay + dur, lt)
        return k, 1.0, 0.0, dist * (1 - ease_out_cubic(k))
    return f

def a_pop(delay=0.0, dur=0.65, scale_from=0.6, float_amp=0.0):
    def f(lt, d):
        k = smoothstep(delay, delay + dur, lt)
        s = scale_from + (1 - scale_from) * ease_out_back(k)
        dy = math.sin(lt * 1.15) * float_amp if float_amp else 0.0
        return clamp(k * 1.15), s, 0.0, dy
    return f

class Scene:
    def __init__(self, start, end, layers):
        self.start = start
        self.end = end
        self.layers = layers

    def envelope(self, t):
        fi = 0.45
        fo = 0.55
        a = smoothstep(self.start, self.start + fi, t) * (1 - smoothstep(self.end - fo, self.end, t))
        return clamp(a)

# ---------- audio ----------
def make_audio(path, dur=30.0, sr=44100):
    n = int(dur * sr)
    t = np.arange(n) / sr
    audio = np.zeros(n, dtype=np.float64)
    chords = [
        (220.00, 261.63, 329.63),   # Am
        (174.61, 220.00, 261.63),   # F
        (261.63, 329.63, 392.00),   # C
        (196.00, 246.94, 293.66),   # G
    ]
    seg = 4.0
    for i in range(int(math.ceil(dur / seg))):
        st = i * seg
        idx0, idx1 = int(st * sr), int(min(dur, st + seg) * sr)
        if idx0 >= n:
            break
        tt = t[idx0:idx1] - st
        env = np.minimum(1, tt / 0.8) * np.minimum(1, np.maximum(0, (seg - tt)) / 0.8)
        chord = chords[i % 4]
        for j, f in enumerate(chord):
            for det in (-0.35, 0.0, 0.35):
                audio[idx0:idx1] += 0.042 * env * np.sin(2 * math.pi * (f + det) * tt + j)
    # sub root
    for i in range(int(math.ceil(dur / seg))):
        st = i * seg
        idx0, idx1 = int(st * sr), int(min(dur, st + seg) * sr)
        if idx0 >= n:
            break
        tt = t[idx0:idx1] - st
        env = np.minimum(1, tt / 0.8) * np.minimum(1, np.maximum(0, (seg - tt)) / 0.8)
        audio[idx0:idx1] += 0.05 * env * np.sin(2 * math.pi * (chords[i % 4][0] / 2) * tt)
    # soft arpeggio bells
    step = 0.5
    for i in range(int(dur / step)):
        st = i * step
        idx = int(st * sr)
        if idx >= n:
            continue
        chord = chords[int(st // seg) % 4]
        f = chord[i % 3] * 2
        ln = int(0.65 * sr)
        tt = np.arange(min(ln, n - idx)) / sr
        env = np.exp(-tt * 6) * 0.045
        audio[idx:idx + len(tt)] += env * np.sin(2 * math.pi * f * tt)
    fade = np.clip(np.minimum(1, t / 1.0) * np.minimum(1, np.maximum(0, (dur - t)) / 2.0), 0, 1)
    audio *= fade
    peak = np.max(np.abs(audio)) or 1
    audio = audio / peak * 0.6
    left = audio
    right = np.roll(audio, int(0.008 * sr))
    stereo = np.stack([left, right], axis=1)
    pcm = (np.clip(stereo, -1, 1) * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())

# ---------- compose ----------
def paste_layer(frame, layer, alpha, scale=1.0, dx=0.0, dy=0.0):
    if alpha <= 0.004:
        return
    img = layer.img
    if abs(scale - 1.0) > 0.003:
        nw = max(1, int(img.width * scale))
        nh = max(1, int(img.height * scale))
        img = img.resize((nw, nh), Image.LANCZOS)
    if alpha < 0.996:
        img = img.copy()
        a = img.getchannel("A").point(lambda v: int(v * alpha))
        img.putalpha(a)
    x = int(layer.cx - img.width / 2 + dx)
    y = int(layer.cy - img.height / 2 + dy)
    frame.alpha_composite(img, (x, y))

def render_frame(base, t, scenes):
    frame = render_background(base, t)
    for scene in scenes:
        if t < scene.start - 0.01 or t > scene.end + 0.01:
            continue
        env = scene.envelope(t)
        if env <= 0.004:
            continue
        lt = t - scene.start
        for layer, anim in scene.layers:
            a, s, dx, dy = anim(lt, scene.end - scene.start)
            paste_layer(frame, layer, env * a, s, dx, dy)
    return frame.convert("RGB")

def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    base = make_base()
    scenes = [
        build_intro(),
        build_hook(),
        build_shot_scene(TX["shots"]["dashboard"], "dashboard.png", (56, 189, 248), 6.6, 9.0),
        build_shot_scene(TX["shots"]["inventory"], "inventory.png", (34, 197, 94), 8.6, 11.0),
        build_shot_scene(TX["shots"]["qc"], "qc.png", (251, 191, 36), 10.6, 13.0),
        build_shot_scene(TX["shots"]["reports"], "reports.png", (167, 139, 250), 12.6, 15.0),
        build_feature(0, 14.6, 17.4),
        build_feature(1, 17.0, 19.8),
        build_feature(2, 19.4, 22.2),
        build_feature(3, 21.8, 24.6),
        build_feature(4, 24.2, 27.0),
        build_benefits(26.6, 31.0),
        build_outro(30.6, 37.0),
    ]

    audio_path = os.path.join(OUT_DIR, "promo_audio.wav")
    make_audio(audio_path, DUR)

    import imageio_ffmpeg
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    suffix = "" if LANG == "ar" else "-" + LANG
    out = os.path.join(OUT_DIR, f"Amin-Lab-Pro-Promo-vertical{suffix}.mp4")
    cmd = [
        ffmpeg, "-y",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
        "-i", audio_path,
        "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
        out,
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    total = int(DUR * FPS)
    try:
        for fi in range(total):
            t = fi / FPS
            frame = render_frame(base, t, scenes)
            proc.stdin.write(frame.tobytes())
            if fi % 60 == 0:
                print(f"frame {fi}/{total} ({t:.1f}s)")
    finally:
        proc.stdin.close()
        err = proc.stderr.read().decode("utf-8", "ignore")
        code = proc.wait()
    if code != 0:
        print("FFMPEG ERROR:\n", err[-4000:])
        raise SystemExit(code)

    # cover image
    cover = render_frame(base, 1.6, scenes)
    cover_path = os.path.join(OUT_DIR, f"Amin-Lab-Pro-Promo-cover{suffix}.png")
    cover.save(cover_path)

    # cleanup intermediate audio
    try:
        os.remove(audio_path)
    except OSError:
        pass
    print("DONE", LANG, out, cover_path)

if __name__ == "__main__":
    main()
