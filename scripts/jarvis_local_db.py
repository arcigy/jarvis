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


def add_cold_event(db_path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    init_db(db_path)
    event_id = payload.get("id") or f"cold_{uuid.uuid4().hex}"
    lead_email = normalize_email(required(payload, "leadEmail"))
    occurred_at = payload.get("occurredAt") or payload.get("occurred_at") or datetime.now(timezone.utc).isoformat()
    conn = connect(db_path)
    conn.execute(
        """
        insert into cold_outreach_events
          (id, lead_email, campaign_id, campaign_name, event_type, occurred_at, data_json)
        values (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            event_id,
            lead_email,
            payload.get("campaignId"),
            payload.get("campaignName"),
            required(payload, "eventType"),
            occurred_at,
            json.dumps(payload.get("data") or {}, ensure_ascii=False),
        ),
    )
    conn.commit()
    row = conn.execute("select * from cold_outreach_events where id = ?", (event_id,)).fetchone()
    return row_to_cold_event(row)


def cold_brief(db_path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    init_db(db_path)
    since = required(payload, "since")
    until = payload.get("until") or datetime.now(timezone.utc).isoformat()
    period_label = payload.get("periodLabel") or f"{since} - {until}"
    conn = connect(db_path)
    params = (since, until)

    counts = {
        event_type: conn.execute(
            """
            select count(distinct lead_email) as count
            from cold_outreach_events
            where event_type = ? and occurred_at >= ? and occurred_at <= ?
            """,
            (event_type, *params),
        ).fetchone()["count"]
        for event_type in ["sent", "opened", "replied", "positive_reply", "prepared_reply"]
    }

    pending_approval = conn.execute(
        """
        select count(distinct p.lead_email) as count
        from cold_outreach_events p
        where p.event_type = 'prepared_reply'
          and p.occurred_at >= ? and p.occurred_at <= ?
          and not exists (
            select 1 from cold_outreach_events a
            where a.lead_email = p.lead_email
              and a.event_type = 'approved_reply_sent'
              and a.occurred_at >= p.occurred_at
          )
        """,
        params,
    ).fetchone()["count"]

    metrics = {
        "periodLabel": period_label,
        "contacted": counts["sent"],
        "opened": counts["opened"],
        "replied": counts["replied"],
        "positiveReplies": counts["positive_reply"],
        "preparedPositiveReplyCount": counts["prepared_reply"],
        "pendingApprovalCount": pending_approval,
    }
    return {
        "metrics": metrics,
        "summary": build_cold_outreach_summary(metrics),
    }


def list_prepared_replies(db_path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    init_db(db_path)
    limit = max(1, min(int(payload.get("limit", 10)), 50))
    status = payload.get("status", "pending")
    since = payload.get("since")
    until = payload.get("until") or datetime.now(timezone.utc).isoformat()
    params: list[Any] = []
    filters = ["p.event_type = 'prepared_reply'"]
    if since:
        filters.append("p.occurred_at >= ?")
        params.append(since)
    if until:
        filters.append("p.occurred_at <= ?")
        params.append(until)
    if status == "pending":
        filters.append(
            """
            not exists (
              select 1 from cold_outreach_events a
              where a.lead_email = p.lead_email
                and a.event_type = 'approved_reply_sent'
                and a.occurred_at >= p.occurred_at
            )
            """
        )
    elif status == "approved":
        filters.append(
            """
            exists (
              select 1 from cold_outreach_events a
              where a.lead_email = p.lead_email
                and a.event_type = 'approved_reply_sent'
                and a.occurred_at >= p.occurred_at
            )
            """
        )
    elif status != "all":
        raise ValueError("status must be pending, approved, or all")

    conn = connect(db_path)
    rows = [
        row
        for row in conn.execute(
            f"""
            select p.*
            from cold_outreach_events p
            where {" and ".join(filters)}
            order by p.occurred_at desc
            limit ?
            """,
            (*params, limit),
        )
    ]
    replies = [prepared_reply_from_row(row) for row in rows]
    return {
        "status": status,
        "count": len(replies),
        "replies": replies,
        "summary": build_prepared_replies_summary(replies),
    }


def approve_prepared_reply(db_path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    init_db(db_path)
    prepared_id = required(payload, "preparedEventId")
    conn = connect(db_path)
    row = conn.execute(
        "select * from cold_outreach_events where id = ? and event_type = 'prepared_reply'",
        (prepared_id,),
    ).fetchone()
    if row is None:
        raise ValueError("Prepared reply was not found.")

    existing = conn.execute(
        """
        select * from cold_outreach_events
        where lead_email = ?
          and event_type = 'approved_reply_sent'
          and occurred_at >= ?
        order by occurred_at desc
        limit 1
        """,
        (row["lead_email"], row["occurred_at"]),
    ).fetchone()
    if existing is not None:
        return {
            "status": "already_approved",
            "preparedReply": prepared_reply_from_row(row),
            "approvedEvent": row_to_cold_event(existing),
            "summary": "Jarvis: Tato odpoved uz bola schvalena.",
        }

    prepared_data = json.loads(row["data_json"] or "{}")
    approved_event = add_cold_event(
        db_path,
        {
            "leadEmail": row["lead_email"],
            "campaignId": row["campaign_id"],
            "campaignName": row["campaign_name"],
            "eventType": "approved_reply_sent",
            "occurredAt": payload.get("occurredAt") or datetime.now(timezone.utc).isoformat(),
            "data": {
                **prepared_data,
                "preparedEventId": prepared_id,
                "approvalNote": payload.get("approvalNote"),
                "approvedBy": payload.get("approvedBy", "operator"),
                "readyToSend": True,
            },
        },
    )
    return {
        "status": "approved",
        "preparedReply": prepared_reply_from_row(row),
        "approvedEvent": approved_event,
        "summary": f"Jarvis: Odpoved pre {row['lead_email']} je schvalena a oznacena ako pripravena na odoslanie.",
    }


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


def list_open_needs(db_path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    init_db(db_path)
    limit = int(payload.get("limit", 10))
    status = payload.get("status", "new")
    conn = connect(db_path)
    rows = [
        row
        for row in conn.execute(
            """
            select
              s.*,
              p.primary_email,
              p.display_name,
              p.company_name,
              p.kind
            from client_need_signals s
            join local_people p on p.id = s.person_id
            where s.status = ?
            order by s.occurred_at desc
            limit ?
            """,
            (status, max(1, min(limit, 50))),
        )
    ]
    alerts = []
    for row in rows:
        person = {
            "id": row["person_id"],
            "kind": row["kind"],
            "primaryEmail": row["primary_email"],
            "displayName": row["display_name"],
            "companyName": row["company_name"],
        }
        need = row_to_need_signal(row)
        name = person.get("displayName") or person.get("companyName") or person.get("primaryEmail")
        alerts.append(
            {
                "person": person,
                "needSignal": need,
                "jarvisAlert": f"Jarvis: {name} ma otvorenu poziadavku: {need['summary']}.",
            }
        )
    return {
        "status": status,
        "count": len(alerts),
        "alerts": alerts,
        "summary": build_open_needs_summary(alerts),
    }


def ingest_message(db_path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    init_db(db_path)
    email = normalize_email(payload.get("email") or payload.get("fromEmail") or required(payload, "fromEmail"))
    text = payload.get("text") or payload.get("body") or payload.get("message") or ""
    if not str(text).strip():
        raise ValueError("Missing required field: text")

    identity = identify(db_path, email)
    person = identity.get("person")
    if person is None and payload.get("createIfUnknown", True):
        person = upsert_person(
            db_path,
            {
                "kind": payload.get("kind", "lead"),
                "primaryEmail": email,
                "displayName": payload.get("displayName"),
                "companyName": payload.get("companyName"),
                "status": payload.get("status", "active"),
                "data": {
                    "source": payload.get("source", "message"),
                    "firstSeenFromIngest": True,
                    **(payload.get("personData") or {}),
                },
            },
        )
        identity = identify(db_path, email)

    person_id = identity["person"]["id"] if identity.get("person") else None
    occurred_at = payload.get("occurredAt") or payload.get("occurred_at") or datetime.now(timezone.utc).isoformat()
    activity_id = payload.get("id") or f"email_{uuid.uuid4().hex}"
    source = payload.get("source", "message")
    external_id = payload.get("externalId")
    conn = connect(db_path)
    existing_activity = find_existing_email_activity(conn, source, external_id)
    if existing_activity is not None:
        activity = row_to_email_activity(existing_activity)
        need_signal = find_need_signal_for_activity(conn, activity["id"])
        return {
            "status": "duplicate",
            "identity": identity,
            "messageActivity": activity,
            "needSignal": need_signal,
            "jarvisAlert": build_jarvis_need_alert(identity, need_signal),
        }

    conn.execute(
        """
        insert into local_email_activity
          (id, person_id, email, source, event_type, occurred_at, data_json)
        values (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            activity_id,
            person_id,
            email,
            source,
            payload.get("eventType", "message_received"),
            occurred_at,
            json.dumps(
                {
                    "subject": payload.get("subject"),
                    "text": text,
                    "threadId": payload.get("threadId"),
                    "externalId": external_id,
                    **(payload.get("data") or {}),
                },
                ensure_ascii=False,
            ),
        ),
    )
    conn.commit()
    activity = row_to_email_activity(
        conn.execute("select * from local_email_activity where id = ?", (activity_id,)).fetchone()
    )

    detected = resolve_need_signal_payload(payload, str(text))
    need_signal = None
    if detected and person_id:
        need_signal = add_need_signal(
            db_path,
            {
                "personId": person_id,
                "source": payload.get("source", "message"),
                "signalType": detected.get("signalType", "request"),
                "summary": detected["summary"],
                "status": detected.get("status", "new"),
                "confidence": detected.get("confidence", 0.74),
                "occurredAt": occurred_at,
                "data": {
                    "activityId": activity_id,
                    "email": email,
                    "subject": payload.get("subject"),
                    "textPreview": compact_text(str(text), 240),
                    **(detected.get("data") or {}),
                },
            },
        )
        identity = identify(db_path, email)

    return {
        "status": "created",
        "identity": identity,
        "messageActivity": activity,
        "needSignal": need_signal,
        "jarvisAlert": build_jarvis_need_alert(identity, need_signal),
    }


def resolve_need_signal_payload(payload: dict[str, Any], text: str) -> dict[str, Any] | None:
    explicit = payload.get("needSignal")
    if explicit is False:
        return None
    if isinstance(explicit, dict):
        if "summary" not in explicit:
            raise ValueError("needSignal.summary is required when needSignal is provided")
        return explicit
    return infer_need_signal(text)


def infer_need_signal(text: str) -> dict[str, Any] | None:
    normalized = compact_text(text, 220)
    lowered = normalized.lower()
    strong_keywords = [
        "potrebujem",
        "potrebujeme",
        "chcem",
        "chcel by som",
        "chceli by sme",
        "prosím",
        "treba",
        "vieš mi",
        "viete mi",
        "môžeš",
        "mohli by ste",
        "need",
        "want",
        "can you",
        "could you",
        "please",
    ]
    if not any(keyword in lowered for keyword in strong_keywords):
        return None
    return {
        "signalType": "request",
        "summary": normalized,
        "confidence": 0.84 if any(keyword in lowered for keyword in strong_keywords[:8]) else 0.7,
    }


def compact_text(text: str, limit: int) -> str:
    value = " ".join(text.split())
    return value if len(value) <= limit else f"{value[: limit - 1].rstrip()}…"


def build_jarvis_need_alert(identity: dict[str, Any], need_signal: dict[str, Any] | None) -> str | None:
    if not need_signal:
        return None
    person = identity.get("person") or {}
    name = person.get("displayName") or person.get("companyName") or identity.get("email")
    summary = str(need_signal["summary"]).rstrip(".!?")
    return f"Jarvis: {name} chce alebo potrebuje: {summary}. Mám ti pripraviť odpoveď?"


def build_open_needs_summary(alerts: list[dict[str, Any]]) -> str:
    if not alerts:
        return "Jarvis: Nemam ziadne otvorene klientske poziadavky."
    first = alerts[0]
    person = first["person"]
    name = person.get("displayName") or person.get("companyName") or person.get("primaryEmail")
    return f"Jarvis: Mas {len(alerts)} otvorenych klientskych poziadaviek. Najnovsia: {name} - {first['needSignal']['summary']}."


def build_prepared_replies_summary(replies: list[dict[str, Any]]) -> str:
    if not replies:
        return "Jarvis: Necaka ziadna pripravena cold outreach odpoved na schvalenie."
    first = replies[0]
    return f"Jarvis: Caka {prepared_reply_label(len(replies))} na schvalenie. Najnovsia je pre {first['leadEmail']}."


def build_cold_outreach_summary(metrics: dict[str, Any]) -> str:
    contacted = int(metrics["contacted"])
    opened = int(metrics["opened"])
    replied = int(metrics["replied"])
    positive = int(metrics["positiveReplies"])
    prepared = int(metrics["preparedPositiveReplyCount"])
    pending = int(metrics["pendingApprovalCount"])
    open_rate = round((opened / contacted) * 100, 1) if contacted else 0
    parts = [
        f"Za {metrics['periodLabel']} sme napísali {people_label(contacted)}.",
        f"{open_rate}% si email otvorilo, {reply_label(replied)}, z toho {positive} pozitívne.",
    ]
    if prepared:
        parts.append(f"Pripravil som ti {prepared_reply_label(prepared)} na pozitívne reakcie a pošlem ich až na tvoje potvrdenie.")
    if pending:
        parts.append(f"Čaká {prepared_reply_label(pending)} na schválenie.")
    return " ".join(parts)


def people_label(count: int) -> str:
    if count == 1:
        return "1 človeku"
    return f"{count} ľuďom"


def reply_label(count: int) -> str:
    if count == 1:
        return "1 človek odpísal"
    return f"{count} ľudí odpísalo"


def prepared_reply_label(count: int) -> str:
    if count == 1:
        return "1 odpoveď"
    if 1 < count < 5:
        return f"{count} odpovede"
    return f"{count} odpovedí"


def find_existing_email_activity(conn: sqlite3.Connection, source: str, external_id: Any) -> sqlite3.Row | None:
    if not external_id:
        return None
    return conn.execute(
        """
        select * from local_email_activity
        where source = ?
          and json_extract(data_json, '$.externalId') = ?
        order by created_at desc
        limit 1
        """,
        (source, str(external_id)),
    ).fetchone()


def find_need_signal_for_activity(conn: sqlite3.Connection, activity_id: str) -> dict[str, Any] | None:
    row = conn.execute(
        """
        select * from client_need_signals
        where json_extract(data_json, '$.activityId') = ?
        order by created_at desc
        limit 1
        """,
        (activity_id,),
    ).fetchone()
    return row_to_need_signal(row) if row is not None else None


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


def row_to_cold_event(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "leadEmail": row["lead_email"],
        "campaignId": row["campaign_id"],
        "campaignName": row["campaign_name"],
        "eventType": row["event_type"],
        "occurredAt": row["occurred_at"],
        "data": json.loads(row["data_json"] or "{}"),
    }


def prepared_reply_from_row(row: sqlite3.Row) -> dict[str, Any]:
    data = json.loads(row["data_json"] or "{}")
    return {
        "id": row["id"],
        "leadEmail": row["lead_email"],
        "campaignId": row["campaign_id"],
        "campaignName": row["campaign_name"],
        "occurredAt": row["occurred_at"],
        "subject": data.get("subject"),
        "replyText": data.get("replyText") or data.get("text") or data.get("draft"),
        "positiveSignal": data.get("positiveSignal") or data.get("signal"),
        "data": data,
    }


def row_to_email_activity(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "personId": row["person_id"],
        "email": row["email"],
        "source": row["source"],
        "eventType": row["event_type"],
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
        return json.loads(path.read_text(encoding="utf-8-sig"))
    return json.loads(raw)


def main() -> None:
    parser = argparse.ArgumentParser(description="Jarvis local SQLite DB helper.")
    parser.add_argument(
        "command",
        choices=[
            "init",
            "upsert-person",
            "add-need-signal",
            "add-cold-event",
            "cold-brief",
            "list-prepared-replies",
            "approve-prepared-reply",
            "identify",
            "ingest-message",
            "list-open-needs",
        ],
    )
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
        elif args.command == "add-cold-event":
            result = add_cold_event(args.db, load_payload(args.payload))
        elif args.command == "cold-brief":
            result = cold_brief(args.db, load_payload(args.payload))
        elif args.command == "list-prepared-replies":
            result = list_prepared_replies(args.db, load_payload(args.payload))
        elif args.command == "approve-prepared-reply":
            result = approve_prepared_reply(args.db, load_payload(args.payload))
        elif args.command == "ingest-message":
            result = ingest_message(args.db, load_payload(args.payload))
        elif args.command == "list-open-needs":
            result = list_open_needs(args.db, load_payload(args.payload))
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
