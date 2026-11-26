#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Compare inventory-mokhtabar.csv with the Amin-Lab SQLite database.

Usage:
    python scripts/compare_inventory.py --csv imports/inventory-mokhtabar.csv
    python scripts/compare_inventory.py --csv imports/inventory-mokhtabar.csv --mode aggregate --dry-run
    python scripts/compare_inventory.py --csv imports/inventory-mokhtabar.csv --mode import --dry-run

Modes:
    compare   (default) read-only report: CSV vs DB diff + quantity vs repetition count.
    aggregate update DB quantity = number of CSV rows for that name (requires --apply).
    import    insert each CSV row as a new inventory item (requires --apply).
"""
import argparse
import csv
import io
import os
import sqlite3
import sys
from collections import Counter, defaultdict

DEFAULT_DB = r"C:\Program Files\Amin-Lab Genie\data\amin-lab-genie.sqlite"
DEFAULT_CSV = "imports/inventory-mokhtabar.csv"
ENCODINGS = ("utf-8-sig", "utf-8", "cp1256", "latin-1")


def read_csv(path):
    """Read CSV trying several encodings and delimiters; return (header, rows)."""
    raw = None
    used_enc = None
    for enc in ENCODINGS:
        try:
            with open(path, "r", encoding=enc, newline="") as f:
                raw = f.read()
            used_enc = enc
            break
        except UnicodeDecodeError:
            continue
    if raw is None:
        raise RuntimeError("Could not decode CSV with any known encoding")

    # Detect delimiter: prefer tab, then semicolon, then comma
    first_line = raw.splitlines()[0] if raw.splitlines() else ""
    if "\t" in first_line:
        delim = "\t"
    elif ";" in first_line:
        delim = ";"
    else:
        delim = ","
    reader = csv.reader(io.StringIO(raw), delimiter=delim)
    rows = [r for r in reader if any(c.strip() for c in r)]
    if not rows:
        raise RuntimeError("CSV is empty")
    header = [h.strip() for h in rows[0]]
    data = rows[1:]
    label = {chr(9): 'TAB', ';': 'SEMICOLON', ',': 'COMMA'}[delim]
    print(f"[info] encoding={used_enc} delimiter={label} rows={len(data)} cols={len(header)}")
    print(f"[info] header={header}")
    return header, data, used_enc


def detect_columns(header):
    """Return indices for code, name, name_ar, quantity based on header or position."""
    def find(keys):
        for i, h in enumerate(header):
            hl = h.lower()
            for k in keys:
                if k in hl:
                    return i
        return None

    code_i = find(["code", "كود", "رقم", "id"])
    name_i = find(["name", "اسم", "designation", "désignation"])
    name_ar_i = find(["name_ar", "arabic", "عربي", "اسم_ar"])
    qty_i = find(["quantity", "quantite", "quantité", "كمية", "qty", "quant"])
    # Fallbacks by position only when the header carries no usable labels.
    # Guessing on a labelled file would mistake `category` for `name_ar`.
    labelled = name_i is not None and qty_i is not None
    if code_i is None:
        code_i = 0
    if name_i is None:
        name_i = 1
    if name_ar_i is None and not labelled and len(header) > 2:
        name_ar_i = 2
    if qty_i is None and not labelled:
        # quantity is the 6th column (index 5) in the observed file
        qty_i = 5 if len(header) > 5 else None
    return code_i, name_i, name_ar_i, qty_i


def load_db(path):
    conn = sqlite3.connect(path, timeout=15)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(
        "SELECT id, code, name, name_ar, category, quantity, available_quantity, unit, deleted_at "
        "FROM inventory"
    )
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


def norm(s):
    return (s or "").strip()


def main():
    # Arabic item names must stay readable on Windows consoles (cp1252/cp437).
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass
    ap = argparse.ArgumentParser(description="Compare inventory CSV with Amin-Lab DB")
    ap.add_argument("--csv", default=DEFAULT_CSV, help="Path to inventory-mokhtabar.csv")
    ap.add_argument("--db", default=DEFAULT_DB, help="Path to amin-lab-genie.sqlite")
    ap.add_argument("--mode", choices=["compare", "aggregate", "import"], default="compare")
    ap.add_argument("--apply", action="store_true", help="Apply changes (aggregate/import). Default dry-run.")
    ap.add_argument("--dry-run", action="store_true", help="Explicitly avoid writes (default when --apply is absent).")
    ap.add_argument("--limit", type=int, default=40, help="Max rows to print per section")
    args = ap.parse_args()

    if args.dry_run:
        args.apply = False

    if not os.path.exists(args.csv):
        print(f"[error] CSV not found: {args.csv}")
        print("Save the attached file as imports/inventory-mokhtabar.csv (or pass --csv).")
        sys.exit(1)
    if not os.path.exists(args.db):
        print(f"[error] DB not found: {args.db}")
        sys.exit(1)

    header, data, _ = read_csv(args.csv)
    code_i, name_i, name_ar_i, qty_i = detect_columns(header)
    print(f"[info] columns: code={code_i} name={name_i} name_ar={name_ar_i} quantity={qty_i}")

    # Parse CSV rows
    csv_items = []
    for r in data:
        if len(r) <= max(code_i, name_i):
            continue
        code = norm(r[code_i])
        name = norm(r[name_i])
        name_ar = norm(r[name_ar_i]) if (name_ar_i is not None and name_ar_i < len(r)) else ""
        qty_raw = norm(r[qty_i]) if (qty_i is not None and qty_i < len(r)) else "1"
        try:
            qty = int(float(qty_raw)) if qty_raw else 1
        except ValueError:
            qty = 1
        csv_items.append({"code": code, "name": name, "name_ar": name_ar, "quantity": qty})

    db_rows = load_db(args.db)
    db_active = [r for r in db_rows if r["deleted_at"] is None]
    db_by_code = {norm(r["code"]): r for r in db_active}
    db_by_name = {norm(r["name"]): r for r in db_active}

    csv_codes = {c["code"] for c in csv_items if c["code"]}
    db_codes = set(db_by_code.keys())

    # 1) Codes in CSV not in DB
    only_csv_codes = sorted(csv_codes - db_codes)
    # 2) Codes in DB not in CSV
    only_db_codes = sorted(db_codes - csv_codes)

    print("\n=== CODES IN CSV BUT NOT IN DB ===")
    print(f"count: {len(only_csv_codes)}")
    for c in only_csv_codes[: args.limit]:
        sample = next((x for x in csv_items if x["code"] == c), None)
        print(f"  {c}  {sample['name'] if sample else ''}")

    print("\n=== CODES IN DB BUT NOT IN CSV ===")
    print(f"count: {len(only_db_codes)}")
    for c in only_db_codes[: args.limit]:
        r = db_by_code[c]
        print(f"  {c}  {r['name']}")

    # 3) Names present in CSV but not in DB (by name)
    csv_names = {c["name"] for c in csv_items if c["name"]}
    db_names = set(db_by_name.keys())
    only_csv_names = sorted(csv_names - db_names)
    only_db_names = sorted(db_names - csv_names)
    print("\n=== NAMES IN CSV BUT NOT IN DB ===")
    print(f"count: {len(only_csv_names)}")
    for n in only_csv_names[: args.limit]:
        print(f"  {n}")
    print("\n=== NAMES IN DB BUT NOT IN CSV ===")
    print(f"count: {len(only_db_names)}")
    for n in only_db_names[: args.limit]:
        print(f"  {n}")

    # 4) Quantity (DB) vs repetition count (CSV)
    # Count rows per name in CSV (and sum of their quantity fields)
    csv_count_by_name = Counter()
    csv_qty_sum_by_name = Counter()
    for c in csv_items:
        if c["name"]:
            csv_count_by_name[c["name"]] += 1
            csv_qty_sum_by_name[c["name"]] += c["quantity"]

    print("\n=== QUANTITY (DB) vs REPETITIONS (CSV) ===")
    mismatches = []
    for name, cnt in sorted(csv_count_by_name.items()):
        db_row = db_by_name.get(name)
        if db_row is None:
            continue
        db_qty = db_row["quantity"] or 0
        # Consistent if DB quantity == number of CSV rows (each row = 1 unit) OR DB quantity == sum of CSV quantities
        ok_rows = (db_qty == cnt)
        ok_sum = (db_qty == csv_qty_sum_by_name[name])
        if not (ok_rows or ok_sum):
            mismatches.append((name, db_qty, cnt, csv_qty_sum_by_name[name]))
    print(f"matched names: {sum(1 for n in csv_count_by_name if n in db_names)}")
    print(f"mismatches (DB qty != csv rows AND != csv qty-sum): {len(mismatches)}")
    for name, dbq, cnt, qsum in mismatches[: args.limit]:
        print(f"  {name!r}: DB_qty={dbq} csv_rows={cnt} csv_qty_sum={qsum}")

    # Also: names where DB quantity differs from row count even if sum matches
    print("\n=== DB quantity vs CSV row count (all matched) ===")
    diff_rows = []
    for name in sorted(csv_count_by_name):
        if name in db_names:
            dbq = db_by_name[name]["quantity"] or 0
            if dbq != csv_count_by_name[name]:
                diff_rows.append((name, dbq, csv_count_by_name[name]))
    print(f"names where DB_qty != csv_row_count: {len(diff_rows)}")
    for name, dbq, cnt in diff_rows[: args.limit]:
        print(f"  {name!r}: DB_qty={dbq} csv_rows={cnt}")

    # Duplicate codes within CSV
    code_counts = Counter(c["code"] for c in csv_items if c["code"])
    dup_codes = {k: v for k, v in code_counts.items() if v > 1}
    if dup_codes:
        print("\n=== DUPLICATE CODES IN CSV ===")
        for k, v in dup_codes.items():
            print(f"  {k}: {v} rows")

    # Duplicate names within CSV
    name_counts = Counter(c["name"] for c in csv_items if c["name"])
    dup_names = {k: v for k, v in name_counts.items() if v > 1}
    if dup_names:
        print(f"\n=== DUPLICATE NAMES IN CSV ({len(dup_names)}) ===")
        for k, v in list(dup_names.items())[: args.limit]:
            print(f"  {k!r}: {v} rows")

    # Optional modes
    if args.mode == "compare":
        return

    if args.mode == "aggregate":
        print("\n=== AGGREGATE MODE: set DB quantity = CSV row count ===")
        updates = []
        for name, cnt in csv_count_by_name.items():
            if name in db_names:
                dbq = db_by_name[name]["quantity"] or 0
                if dbq != cnt:
                    updates.append((cnt, db_by_name[name]["id"], name, dbq))
        print(f"would update {len(updates)} items")
        for cnt, _id, name, dbq in updates[: args.limit]:
            print(f"  id={_id} {name!r}: {dbq} -> {cnt}")
        if args.apply:
            conn = sqlite3.connect(args.db, timeout=15)
            cur = conn.cursor()
            for cnt, _id, name, dbq in updates:
                cur.execute("UPDATE inventory SET quantity=? WHERE id=?", (cnt, _id))
            conn.commit()
            conn.close()
            print(f"[done] updated {len(updates)} rows")
        else:
            print("[dry-run] pass --apply to write changes")

    if args.mode == "import":
        print("\n=== IMPORT MODE: insert each CSV row as new inventory item ===")
        print(f"would insert {len(csv_items)} rows")
        if args.apply:
            conn = sqlite3.connect(args.db, timeout=15)
            cur = conn.cursor()
            inserted = 0
            for c in csv_items:
                try:
                    cur.execute(
                        "INSERT INTO inventory (code, name, name_ar, category, quantity, available_quantity, unit) "
                        "VALUES (?,?,?,?,?,?,?)",
                        (c["code"], c["name"], c["name_ar"] or None, "apparatus", c["quantity"], c["quantity"], "pièce"),
                    )
                    inserted += 1
                except sqlite3.IntegrityError as e:
                    print(f"  skip {c['code']}: {e}")
            conn.commit()
            conn.close()
            print(f"[done] inserted {inserted} rows")
        else:
            print("[dry-run] pass --apply to write changes")


if __name__ == "__main__":
    main()
