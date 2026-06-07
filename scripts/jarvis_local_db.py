from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "0001_jarvis_local_entities.sql"


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Path) -> dict[str, Any]:
    conn = connect(db_path)
    conn.executescript(MIGRATION.read_text(encoding="utf-8"))
    conn.commit()
    tables = [
        row["name"]
        for row in conn.execute("select name from sqlite_master where type='table' order by name")
    ]
    return {"dbPath": str(db_path), "tables": tables}


def normalize_email(email: str) -> str:
    return email.strip().lower()


def upsert_person(db_path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    init_db(db_path)
    email = normalize_email(required(payload, "primaryEmail"))
    person_id = payload.get("id") or f"person_{uuid.uuid4().hex}"
    data = json.dumps(payload.get("data") or {}, ensure_ascii=False)
    conn = connect(db_path)
    conn.execute(
        """
        insert into local_people (id, kind, primary_email, display_name, company_name, status, data_json, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        on conflict(primary_email) do update set
          kind=excluded.kind,
          display_name=excluded.display_name,
          company_name=excluded.company_name,
          status=excluded.status,
          data_json=excluded.data_json,
          updated_at=CURRENT_TIMESTAMP
        """,
        (
            person_id,
            payload.get("kind", "lead"),
            email,
            payload.get("displayName"),
            payload.get("companyName"),
            payload.get("status", "active"),
            data,
        ),
    )
    conn.commit()
    row = conn.execute("select * from local_people where primary_email = ?", (email,)).fetchone()
    return row_to_person(row)


def add_need_signal(db_path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    init_db(db_path)
    signal_id = payload.get("id") or f"need_{uuid.uuid4().hex}"
    person_id = required(payload, "personId")
    conn = connect(db_path)
    conn.execute(
        """
        insert into client_need_signals
          (id, person_id, source, signal_type, summary, status, confidence, data_json, occurred_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            signal_id,
            person_id,
            payload.get("source", "mcp"),
            payload.get("signalType", "request"),
            required(payload, "summary"),
            payload.get("status", "new"),
            float(payload.get("confidence", 0.7)),
            json.dumps(payload.get("data") or {}, ensure_ascii=False),
            payload.get("occurredAt") or payload.get("occurred_at") or datetime.now(timezone.utc).isoformat(),
        ),
    )
    conn.commit()
    row = conn.execute("select * from client_need_signals where id = ?", (signal_id,)).fetchone()
    return row_to_need_signal(row)


def identify(db_path: Path, email: str) -> dict[str, Any]:
    init_db(db_path)
    normalized = normalize_email(email)
    domain = normalized.split("@", 1)[1] if "@" in normalized else None
    conn = connect(db_path)
    row = conn.execute("select * from local_people where primary_email = ?", (normalized,)).fetchone()
    reason = "exact_email_match"
    confidence = 0.99

    if row is None and domain:
        row = conn.execute(
            """
            select * from local_people
            where kind = 'client' and lower(substr(primary_email, instr(primary_email, '@') + 1)) = ?
            order by updated_at desc
            limit 1
            """,
            (domain,),
        ).fetchone()
        reason = "client_domain_match"
        confidence = 0.72

    if row is None:
        return {
            "email": normalized,
            "person": None,
            "confidence": 0,
            "reason": "no_local_identity_match",
            "openNeedSignals": [],
        }

    signals = [
        row_to_need_signal(signal)
        for signal in conn.execute(
            """
            select * from client_need_signals
            where person_id = ? and status = 'new'
            order by occurred_at desc
            limit 10
            """,
            (row["id"],),
        )
    ]
    return {
        "email": normalized,
        "person": row_to_person(row),
        "confidence": confidence,
        "reason": reason,
        "openNeedSignals": signals,
    }


def row_to_person(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "kind": row["kind"],
        "primaryEmail": row["primary_email"],
        "displayName": row["display_name"],
        "companyName": row["company_name"],
        "status": row["status"],
        "data": json.loads(row["data_json"] or "{}"),
    }


def row_to_need_signal(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "personId": row["person_id"],
        "source": row["source"],
        "signalType": row["signal_type"],
        "summary": row["summary"],
        "status": row["status"],
        "confidence": row["confidence"],
        "occurredAt": row["occurred_at"],
        "data": json.loads(row["data_json"] or "{}"),
    }


def required(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if value in (None, ""):
        raise ValueError(f"Missing required field: {key}")
    return str(value)


def load_payload(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    path = Path(raw)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return json.loads(raw)


def main() -> None:
    parser = argparse.ArgumentParser(description="Jarvis local SQLite DB helper.")
    parser.add_argument("command", choices=["init", "upsert-person", "add-need-signal", "identify"])
    parser.add_argument("--db", type=Path, default=ROOT / "data" / "jarvis-local.db")
    parser.add_argument("--payload")
    parser.add_argument("--email")
    args = parser.parse_args()

    try:
        if args.command == "init":
            result = init_db(args.db)
        elif args.command == "upsert-person":
            result = upsert_person(args.db, load_payload(args.payload))
        elif args.command == "add-need-signal":
            result = add_need_signal(args.db, load_payload(args.payload))
        else:
            if not args.email:
                raise ValueError("--email is required for identify")
            result = identify(args.db, args.email)
    except Exception as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
