#!/usr/bin/env python3
"""التقاط لقطات حقيقية من التطبيق العامل (يقرأ بيانات الدخول من الملف دون طباعتها)."""
import os
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:3002"
CREDS = "data/credentials.txt"
OUT = "artifacts/shots"

USERNAME = "admin"

def read_password(path, username):
    for line in open(path, encoding="utf-8"):
        toks = line.split()
        if username in toks:
            idx = toks.index(username)
            if idx + 1 < len(toks):
                return toks[idx + 1]
    raise SystemExit("password not found")

PAGES = [
    ("dashboard", "/dashboard.html"),
    ("inventory", "/inventory/inventory.html?category=glassware"),
    ("borrowing", "/borrowing/borrowing.html"),
    ("schedule", "/schedule/calendar.html"),
    ("qc", "/qc/qc-dashboard.html"),
    ("reports", "/reports/index.html"),
]

def main():
    os.makedirs(OUT, exist_ok=True)
    password = read_password(CREDS, USERNAME)
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=2,
            locale="ar",
        )
        context.add_init_script("try{localStorage.setItem('amin_lang','ar')}catch(e){}")
        page = context.new_page()

        page.goto(BASE + "/", wait_until="networkidle", timeout=30000)
        page.fill("#username", USERNAME)
        page.fill("#password", password)
        page.click("#submitBtn")
        page.wait_for_url("**/dashboard.html", timeout=20000)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1200)

        for name, path in PAGES:
            print("capture", name, path)
            page.goto(BASE + path, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(1400)
            # close any open menu
            page.keyboard.press("Escape")
            page.wait_for_timeout(200)
            out = os.path.join(OUT, name + ".png")
            page.screenshot(path=out, full_page=False)
            print("  saved", out)

        browser.close()

if __name__ == "__main__":
    main()
