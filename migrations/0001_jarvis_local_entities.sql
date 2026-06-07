CREATE TABLE IF NOT EXISTS local_people (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('client', 'lead', 'contact')),
  primary_email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  company_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS local_email_activity (
  id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES local_people(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  source TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_local_people_email ON local_people(primary_email);
CREATE INDEX IF NOT EXISTS idx_local_email_activity_email ON local_email_activity(email);
CREATE INDEX IF NOT EXISTS idx_local_email_activity_event_time ON local_email_activity(event_type, occurred_at);

CREATE TABLE IF NOT EXISTS cold_outreach_events (
  id TEXT PRIMARY KEY,
  lead_email TEXT NOT NULL,
  campaign_id TEXT,
  campaign_name TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'opened', 'replied', 'positive_reply', 'prepared_reply', 'approved_reply_sent')),
  occurred_at TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cold_outreach_events_type_time ON cold_outreach_events(event_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_cold_outreach_events_lead_time ON cold_outreach_events(lead_email, occurred_at);

CREATE TABLE IF NOT EXISTS client_need_signals (
  id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES local_people(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'resolved', 'ignored')),
  confidence REAL NOT NULL DEFAULT 0.7,
  data_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_client_need_signals_person_status ON client_need_signals(person_id, status);
CREATE INDEX IF NOT EXISTS idx_client_need_signals_time ON client_need_signals(occurred_at);

CREATE TABLE IF NOT EXISTS client_contract_records (
  id TEXT PRIMARY KEY,
  client_person_id TEXT REFERENCES local_people(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  form_data_json TEXT NOT NULL,
  generated_files_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jarvis_automation_events (
  id TEXT PRIMARY KEY,
  automation_key TEXT NOT NULL,
  status TEXT NOT NULL,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT '{}',
  requires_approval INTEGER NOT NULL DEFAULT 0,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
