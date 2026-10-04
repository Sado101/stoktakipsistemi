#!/usr/bin/env python3
"""
One-off data migration from the existing Render PostgreSQL database to Supabase
PostgREST.

Usage is intentionally environment-variable based so credentials do not need to
be pasted into chat or committed to the repository.

Required env vars:
  RENDER_DATABASE_URL
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Safe first run:
  python3 scripts/migrate_render_to_supabase.py --dry-run

Apply migration:
  python3 scripts/migrate_render_to_supabase.py --apply --clear-target
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from decimal import Decimal
from typing import Any

try:
    import certifi
except ModuleNotFoundError:
    certifi = None

try:
    import psycopg
    from psycopg.rows import dict_row
except ModuleNotFoundError:
    psycopg = None
    dict_row = None

try:
    import psycopg2
    import psycopg2.extras
except ModuleNotFoundError:
    psycopg2 = None


TABLES: list[dict[str, Any]] = [
    {
        "name": "admin_ayar",
        "required": True,
        "columns": ["id", "username", "password_hash", "olusturma", "guncelleme"],
    },
    {
        "name": "subeler",
        "required": True,
        "columns": [
            "id",
            "kod",
            "isim",
            "sifre",
            "adres",
            "telefon",
            "olusturma",
            "aktif",
            "bloke_bitis",
            "stok_islem_izin",
            "rapor_izin",
        ],
    },
    {
        "name": "calisanlar",
        "required": True,
        "columns": ["id", "sube_id", "ad", "pin_hash", "aktif", "olusturma"],
    },
    {
        "name": "urunler",
        "required": True,
        "columns": [
            "id",
            "urun_id",
            "ad",
            "fiyat",
            "kategori",
            "sube_id",
            "devreden_stok",
            "devreden_birim_fiyat",
        ],
    },
    {
        "name": "stok_hareketleri",
        "required": True,
        # fifo_detay is deliberately not copied. The current Supabase/Worker
        # schema does not rely on it and older deployments may not have it.
        "columns": [
            "id",
            "urun_id",
            "hareket_turu",
            "miktar",
            "birim_fiyat",
            "tarih",
            "aciklama",
            "islemi_yapan",
            "islem_kaynagi",
            "olusturma",
        ],
    },
    {
        "name": "islem_kayitlari",
        "required": False,
        "columns": ["id", "sube_id", "islemi_yapan", "islem", "varlik", "detay", "olusturma"],
    },
    {
        "name": "aylik_arsiv",
        "required": False,
        "columns": ["id", "ay", "yil", "sube_id", "ad", "veri", "olusturma", "guncelleme"],
    },
    {
        "name": "aylik_ciro",
        "required": False,
        "columns": ["id", "ay", "yil", "sube_id", "ciro", "adisyon", "guncelleme"],
    },
]


def env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required env var: {name}")
    return value


def normalize_postgres_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://") :]
    return url


def json_default(value: Any) -> Any:
    if isinstance(value, (dt.datetime, dt.date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def connect_render():
    url = normalize_postgres_url(env("RENDER_DATABASE_URL"))
    if psycopg is not None:
        return psycopg.connect(url, row_factory=dict_row, sslmode="require")
    if psycopg2 is not None:
        return psycopg2.connect(
            url,
            cursor_factory=psycopg2.extras.RealDictCursor,
            sslmode="require",
        )
    raise SystemExit("Missing Postgres driver. Run: pip install 'psycopg[binary]'")


def table_exists(conn, table: str) -> bool:
    with conn.cursor() as cur:
        cur.execute("select to_regclass(%s) is not null as exists", (table,))
        row = cur.fetchone()
    return bool(row and row["exists"])


def existing_columns(conn, table: str) -> set[str]:
    with conn.cursor() as cur:
        cur.execute(
            """
            select column_name
            from information_schema.columns
            where table_schema = 'public' and table_name = %s
            """,
            (table,),
        )
        return {row["column_name"] for row in cur.fetchall()}


def fetch_rows(conn, table_cfg: dict[str, Any]) -> list[dict[str, Any]]:
    table = table_cfg["name"]
    if not table_exists(conn, table):
        if table_cfg.get("required"):
            raise RuntimeError(f"Required source table does not exist: {table}")
        return []

    available = existing_columns(conn, table)
    columns = [column for column in table_cfg["columns"] if column in available]
    if not columns:
        return []

    quoted_columns = ", ".join(f'"{column}"' for column in columns)
    with conn.cursor() as cur:
        cur.execute(f'select {quoted_columns} from "{table}" order by id asc')
        return [dict(row) for row in cur.fetchall()]


class SupabaseRest:
    def __init__(self, url: str, key: str):
        self.base_url = url.rstrip("/") + "/rest/v1"
        self.key = key
        self.context = ssl.create_default_context(cafile=certifi.where() if certifi else None)

    def request(self, method: str, path: str, body: Any | None = None, prefer: str | None = None) -> tuple[int, str]:
        headers = {
            "apikey": self.key,
            "authorization": f"Bearer {self.key}",
            "content-type": "application/json",
        }
        if prefer:
            headers["prefer"] = prefer
        data = None
        if body is not None:
            data = json.dumps(body, default=json_default, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            self.base_url + path,
            method=method,
            data=data,
            headers=headers,
        )
        try:
            with urllib.request.urlopen(request, context=self.context, timeout=60) as response:
                return response.status, response.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as error:
            text = error.read().decode("utf-8", "replace")
            raise RuntimeError(f"Supabase {method} {path} failed: HTTP {error.code}: {text}") from error

    def count(self, table: str) -> int | None:
        quoted = urllib.parse.quote(table)
        try:
            status, text = self.request("GET", f"/{quoted}?select=id&limit=1")
            if status == 200:
                parsed = json.loads(text)
                return len(parsed)
        except Exception:
            return None
        return None

    def delete_all(self, table: str) -> None:
        quoted = urllib.parse.quote(table)
        self.request("DELETE", f"/{quoted}?id=not.is.null")

    def insert(self, table: str, rows: list[dict[str, Any]], batch_size: int = 500) -> None:
        if not rows:
            return
        quoted = urllib.parse.quote(table)
        for start in range(0, len(rows), batch_size):
            batch = rows[start : start + batch_size]
            self.request("POST", f"/{quoted}", body=batch, prefer="resolution=merge-duplicates")

    def reset_sequence(self, table: str) -> None:
        # PostgREST cannot execute arbitrary SQL. Keeping IDs explicit is enough
        # for migrated data. New inserts may require a manual sequence reset if
        # the target schema was created with sequences that lag behind.
        _ = table


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Read source and print counts only.")
    parser.add_argument("--apply", action="store_true", help="Write source data to Supabase.")
    parser.add_argument("--clear-target", action="store_true", help="Delete target rows before inserting.")
    args = parser.parse_args()

    if args.apply == args.dry_run:
        parser.error("Choose exactly one: --dry-run or --apply")
    if args.clear_target and not args.apply:
        parser.error("--clear-target can only be used with --apply")

    source: dict[str, list[dict[str, Any]]] = {}
    with connect_render() as conn:
        for table_cfg in TABLES:
            rows = fetch_rows(conn, table_cfg)
            source[table_cfg["name"]] = rows
            print(f"source {table_cfg['name']}: {len(rows)} row(s)")

    if args.dry_run:
        print("Dry run complete. No Supabase data changed.")
        return 0

    supabase = SupabaseRest(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"))

    if args.clear_target:
        print("Clearing target tables in dependency-safe order...")
        for table_cfg in reversed(TABLES):
            table = table_cfg["name"]
            try:
                supabase.delete_all(table)
                print(f"cleared {table}")
            except Exception as exc:
                if table_cfg.get("required"):
                    raise
                print(f"skipped clearing optional table {table}: {exc}")

    print("Inserting rows into Supabase...")
    for table_cfg in TABLES:
        table = table_cfg["name"]
        rows = source[table]
        try:
            supabase.insert(table, rows)
            print(f"inserted {table}: {len(rows)} row(s)")
        except Exception as exc:
            if table_cfg.get("required"):
                raise
            print(f"skipped optional table {table}: {exc}")

    print("Migration complete.")
    print("If later inserts fail with duplicate key/sequence errors, reset Supabase table sequences manually.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
