# Arcigy Jarvis MCP server

Run:

```powershell
npm run mcp
```

Claude, ChatGPT, or another MCP client can connect over stdio with:

```json
{
  "command": "npm",
  "args": ["run", "mcp"],
  "cwd": "C:\\Users\\laube\\Documents\\JARVIS"
}
```

For browser or remote-agent use, set `JARVIS_WEB_TOKEN` in `.env.local` and run:

```powershell
npm run readiness
npm run web:tunnel
```

If you do not want to store a persistent web token yet, run:

```powershell
npm run web:tunnel:secure
```

That command generates a one-time bearer token, starts the protected local bridge when needed, verifies the external manifest, and prints the token once for the remote MCP client. If another `npm run web` process is already running without that token, stop it first so the secure tunnel runner can own the protected bridge.

After the tunnel is ready, the runner writes `generated/remote-mcp-handoff/latest.json`. That artifact is safe to inspect locally: it stores the public action manifest, OpenAPI schema, connection pack, smoke URL, MCP tool pattern, tool counts, ready gate list, and first agent steps, but it never stores the bearer token value.

Run the same smoke proof from CLI when checking a local or external bridge:

```powershell
npm run remote:mcp:smoke
npm run remote:mcp:smoke -- --url https://your-ngrok-url.ngrok-free.app --token-env JARVIS_WEB_TOKEN
```

For release verification against a real public tunnel, set `JARVIS_VERIFY_REMOTE_MCP_URL` or `JARVIS_REMOTE_MCP_URL` to the current ngrok URL before `npm run verify:production`. The verifier runs the same remote smoke proof against that external URL and stores only redacted readiness evidence.

`npm run readiness` prints the same secret-safe blockers and fix guide exposed by `arcigy.get_production_readiness`. Status `ready` means there are no findings, `attention` means only non-blocking advisories remain, and `blocked` means an operator must fix production gates before exposing workflows. The tunnel runner starts the local web bridge if needed, checks `/api/web-bridge-preflight`, starts ngrok, finds the public HTTPS URL, and verifies the protected manifest before printing remote MCP URLs.

Redis is currently treated as a non-blocking infrastructure advisory because no shipped Jarvis workflow depends on Redis for state. Local memory, cold outreach, client requests, and approvals use SQLite; live API work uses the configured Google, Gemini, Smartlead, Serper, and Google Maps credentials. If a Redis-backed queue/cache is added later, move Redis back into the blocking production gate before enabling that feature.

The web bridge publishes its protected manifest at:

- `GET /api/mcp`
- `GET /.well-known/arcigy-jarvis.json`
- `GET /.well-known/ai-plugin.json`
- `GET /api/openapi.json`
- `GET /api/secure-tunnel-status`
- `POST /api/start-secure-tunnel`
- `POST /api/stop-secure-tunnel`
- `GET /api/remote-mcp-pack`
- `GET /api/remote-mcp-smoke`

External hosts require `Authorization: Bearer <JARVIS_WEB_TOKEN>`. Browser-based clients can run CORS `OPTIONS` preflight without a token, but every real external `GET` or `POST` remains bearer-protected. Failed external auth attempts are throttled after `JARVIS_AUTH_FAILURE_LIMIT` attempts per `JARVIS_AUTH_FAILURE_WINDOW_MS` window; defaults are 20 attempts per 60 seconds. The Jarvis manifest returns concrete `tools[].url` values for POST calls. `/.well-known/ai-plugin.json` returns a bearer-protected action manifest for agents that expect plugin/action metadata. `/api/openapi.json` returns an importable OpenAPI 3.1 action schema for ChatGPT custom actions, Grok-compatible OpenAPI setup, or generic HTTP agents. The remote MCP pack returns the action manifest URL, Jarvis manifest URL, OpenAPI schema URL, smoke test URL, tool-call pattern, approval rules, tunnel command, tool count, quick-start calls, and readiness summary without returning the bearer token value. The smoke test verifies all 37 required remote MCP smoke gates, including the action manifest, OpenAPI schema, CORS preflight, external auth gate, auth throttle policy, Jarvis manifest, connection pack, completion score quick-start, production evidence direct and voice quick-starts, production evidence tool call, read-only tool call, approval-gate rejection, approval-shape-gate rejection, and token redaction. Before any remote agent proposes work, require `arcigy.get_jarvis_capability_audit` and `arcigy.get_production_completion_score`, then cite coverage, completion percent, MCP counts, evidence status, release proof, `dirty=false`, `freshness.fresh=true`, and completion score quick-start coverage.

The MCP panel now runs an automatic preflight watch every two minutes. It shows tunnel readiness, token/auth state, manifest availability, MCP tool count, and the exact remote tool-call pattern before you expose the bridge through ngrok. In Electron, `Start tunnel` can generate a one-time tunnel token. In browser/web mode, `Start tunnel` launches `npm run web:tunnel` only after a strong `JARVIS_WEB_TOKEN` is already configured. `Tunnel status` reads the private secure-tunnel log, extracts the public manifest, connection pack, smoke, and MCP tool-call URLs, and redacts the bearer token from the UI. The remote connection pack includes `tunnel.statusUrl`, `tunnel.startUrl`, and `tunnel.stopUrl` so Claude, ChatGPT, Grok, or a generic HTTP agent can cite the correct handoff URLs without receiving token values.

## Tools

- `arcigy.generate_contract_documents`: JSON intake form -> framework agreement + project appendix DOCX. Accepts either `inputJsonPath` or inline `intake`.
- `arcigy.draft_contract_intake`: uses Gemini to draft contract intake JSON from a short business brief without generating documents.
- `arcigy.draft_price_offer_intake`: uses Gemini to draft a price-offer JSON intake from a client/project brief without generating a document.
- `arcigy.build_pricing_proposal_preview`: read-only pricing calculator for offer line items, bulk/VIP/manual discounts, VAT, margin validation, and the next approved price-offer DOCX call.
- `arcigy.build_service_capacity_preview`: read-only service capacity check before a quote, with low/missing capacity flags and a pricing-preview next call.
- `arcigy.generate_price_offer_document`: approval-gated DOCX price offer generation from a filled `offer` JSON payload or `inputJsonPath`.
- `arcigy.get_cold_outreach_brief`: Slovak cold outreach summary.
- `/api/cold-outreach-brief` with `live=true` prefers live Smartlead statistics and falls back to local SQLite.
- `arcigy.add_cold_outreach_event`: stores local cold outreach activity.
- `arcigy.get_cold_outreach_brief_from_db`: computes Slovak cold outreach summary from SQLite events.
- `arcigy.prepare_positive_outreach_reply`: uses Gemini to draft a reply for a positive cold outreach lead and stores it as a local `prepared_reply` waiting for approval.
- `arcigy.get_prepared_outreach_replies`: returns prepared cold outreach replies waiting for approval.
- `arcigy.get_approval_queue`: returns one read-only Jarvis approval inbox with prepared replies and client decisions waiting for operator confirmation.
- `arcigy.approve_prepared_outreach_reply`: marks one prepared outreach reply as approved after explicit confirmation.
- `arcigy.send_approved_outreach_reply`: sends an already-approved prepared outreach reply through Gmail after explicit confirmation and records `approved_reply_sent`.
- `arcigy.upsert_local_person`: local client/lead/contact upsert into SQLite.
- `arcigy.add_client_need_signal`: stores that a client needs something.
- `arcigy.ingest_client_message`: stores a received email/message, identifies the sender, and returns a Jarvis alert when the message contains a request.
- `arcigy.get_client_need_alerts`: returns the persistent inbox of open client requests Jarvis should proactively mention.
- `arcigy.update_client_need_status`: marks a client request as `seen`, `resolved`, or `ignored` after explicit confirmation.
- `arcigy.identify_email`: exact email/domain identity lookup with open need signals.
- `arcigy.get_local_memory_snapshot`: returns a secret-safe read-only snapshot of local people, email activity, client needs, and audit events.
- `arcigy.export_local_memory_snapshot`: writes a redacted local memory snapshot JSON file inside the repository after explicit confirmation.
- `arcigy.upsert_local_niche`: approval-required local SQLite write that creates or updates a leadgen niche with keywords, regions, target, and optional Smartlead campaign id.
- `arcigy.get_local_niche_queue`: read-only local leadgen queue that returns the active niche/region and safe next MCP calls.
- `arcigy.record_local_niche_run`: approval-required local SQLite write that records daily niche stats, advances the region index, and can mark exhausted niches completed.
- `arcigy.get_system_health`: checks runtime configuration without exposing secrets.
- `arcigy.run_integration_diagnostics`: runs configured checks or explicit live read-only probes, including Postgres TCP and Redis PING.
- `arcigy.get_production_readiness`: summarizes production readiness, blockers, next actions, MCP tool count, approval locks, and optional live diagnostics.
- `arcigy.get_production_verification_evidence`: returns the latest secret-safe `npm run verify:production` evidence artifact.
- `arcigy.get_production_completion_score`: returns the secret-safe production completion percent with evidence components and next actions.
- `arcigy.get_remote_mcp_pack`: returns a secret-safe connection pack for Claude, ChatGPT, Grok, or another remote MCP agent.
- `arcigy.run_remote_mcp_smoke`: verifies remote web MCP manifest, action manifest, OpenAPI schema, CORS preflight, external auth gate, connection pack, production evidence quick-starts, completion score quick-start coverage, read-only tool call, production evidence tool call, approval gate, approval-shape-gate, and token redaction.
- `arcigy.get_operator_briefing`: combines readiness, cold outreach, open client requests, and prepared reply approvals into one Jarvis briefing; with `live=true`, it syncs recent Gmail messages, cold outreach prefers live Smartlead statistics, and both fall back safely.
- `arcigy.get_leadgen_daily_report`: builds a daily leadgen report from campaign stats, stuck/manual-review leads, and system settings without sending Slack.
- `arcigy.get_leadgen_evening_summary`: builds an evening outreach summary from sent, reply, positive-reply counts, and recent reply signals.
- `arcigy.build_leadgen_slack_report_preview`: prepares a Slack Block Kit daily leadgen report and control buttons without sending to Slack.
- `arcigy.send_slack_message`: approval-required Slack write that sends a text or Block Kit payload through the configured Slack bot token or webhook.
- `arcigy.build_leadgen_ops_digest`: combines daily/evening reports, niche rotation, stuck leads, and safe next MCP calls for leadgen operations.
- `arcigy.select_next_niche`: previews the next niche-manager niche/region selection without advancing the database index.
- `arcigy.generate_ai_reply`: uses Gemini to draft a client reply without sending it.
- `arcigy.sync_gmail_recent_messages`: fetches Gmail messages and ingests client requests into SQLite.
- `arcigy.get_gmail_lead_context`: read-only Gmail lookup for one lead email across configured accounts, returning display name, sorted message context, latest lead reply, and safe next reply-preview calls without writing.
- `arcigy.lookup_public_email_profile`: read-only public Gravatar lookup for a lead email, returning name/avatar hints and an identity-repair next call without writing.
- `arcigy.get_gmail_unread_triage`: read-only unread primary inbox triage across configured Gmail accounts, separating likely lead replies from automated/internal mail and preparing context/reply-preview next calls without labels, writes, or sends.
- `arcigy.label_gmail_thread`: approval-required Gmail write that creates or finds a label, applies it to a thread, and can mark it read after the operator confirms the exact payload.
- `arcigy.get_smartlead_campaign_status`: reads Smartlead campaigns or campaign statistics.
- `arcigy.get_smartlead_outreach_brief`: normalizes one Smartlead campaign, or aggregates recent campaign statistics when `campaignId` is omitted, into one Jarvis cold outreach briefing.
- `arcigy.get_smartlead_campaign_leads`: read-only fetch of campaign leads with offset/limit for audit and import checks.
- `arcigy.get_smartlead_email_accounts`: read-only fetch of Smartlead sender accounts, warmup statuses, limits, and a sender-capacity preview payload.
- `arcigy.preview_smartlead_lead_sync`: read-only Smartlead status sync preview that returns local update candidates without writing to the database.
- `arcigy.get_smartlead_campaign_webhooks`: read-only Smartlead webhook audit for a campaign before enabling AI replies or launch automation.
- `arcigy.upsert_smartlead_campaign_webhook`: approval-required Smartlead write that adds or updates campaign webhook events such as `EMAIL_REPLY` and `LEAD_CATEGORY_UPDATED`.
- `arcigy.get_smartlead_message_history`: read-only fetch of one lead's Smartlead message history plus latest sent-email reply metadata.
- `arcigy.classify_outreach_reply`: classifies lead replies as `POSITIVE`, `NEGATIVE`, `ALREADY_SENT`, or `NEUTRAL` before any draft or send action.
- `arcigy.build_outreach_reply_triage_preview`: read-only batch triage for Smartlead/Gmail replies with safe draft next-step payloads and no sending.
- `arcigy.build_smartlead_reply_followup_queue_preview`: read-only queue builder from raw Smartlead webhooks or reply exports into message-history fetches, AI reply previews, and draft next steps without sending.
- `arcigy.build_showcase_reply_preview`: read-only prepares the deterministic Slovak showcase-link reply for clear positive interest, with approval payload and no sending.
- `arcigy.preview_smartlead_ai_reply`: previews the Smartlead AI reply webhook decision, including event/body guards, duplicate/human-in-loop checks, and safe next payloads.
- `arcigy.preview_gmail_ai_reply`: previews Gmail AI reply decisions for known leads and cold outreach threads without sending.
- `arcigy.draft_smartlead_thread_reply`: drafts a Smartlead thread reply from message history without sending.
- `arcigy.send_smartlead_thread_reply`: approval-gated send into an existing Smartlead thread through `reply-email-thread`.
- `arcigy.create_smartlead_campaign`: approval-gated Smartlead campaign creation with optional sequences, email accounts, schedule, settings, webhook, and leads.
- `arcigy.configure_smartlead_campaign`: approval-gated configuration of an existing Smartlead campaign.
- `arcigy.search_serper`: read-only Serper web search for lead discovery.
- `arcigy.search_google_places`: read-only Google Places Text Search for company discovery.
- `arcigy.discover_leads`: combines Serper and Google Places into normalized lead candidates.
- `arcigy.fetch_url_preview`: safe read-only public URL/API fetch preview with private-host blocking and secret redaction.
- `arcigy.batch_fetch_url_previews`: safe read-only batch fetch preview for multiple public URLs/API endpoints with per-URL errors and no writes.
- `arcigy.build_url_intelligence_queue_preview`: turns raw URLs and partial leads into fetch, contact scrape, AI intro, repair, and Smartlead import queue next steps without writes.
- `arcigy.scrape_website_contacts`: read-only website/contact-page fetcher for emails, phones, links, title, description, and text preview.
- `arcigy.batch_scrape_website_contacts`: read-only batch website/contact-page scraping with per-site success/error reporting.
- `arcigy.build_website_scrape_quality_audit_preview`: audits supplied scrape results, selects preferred emails/phones/context, flags weak scrapes, and prepares rescrape, AI intro, and enrichment merge next steps without fetching or writing.
- `arcigy.build_failed_scrape_recovery_queue_preview`: turns failed or weak scrape results into retry scrape URLs, safe fetch previews, fallback contact searches, and contact-selection/repair next steps without fetching or writing.
- `arcigy.build_outreach_contact_selection_preview`: ranks scraped emails/phones for outreach, selects the best contact, and prepares fallback search, rescrape, intro, and repair next steps without fetching or writing.
- `arcigy.enrich_slovak_company_register`: read-only ORSR lookup by ICO or company name for company, address, executives, and source URL.
- `arcigy.build_local_lead_register_update_preview`: read-only ORSR enrichment for one local lead/person that prepares the exact JSON `data` patch and approval payload without writing.
- `arcigy.apply_local_lead_register_update`: approval-required local SQLite write that stores reviewed ORSR enrichment in the existing local person JSON `data` payload.
- `arcigy.build_slovak_register_batch_preview`: builds a batch ORSR/register enrichment queue for leads with ICO/name lookups, repair checks, and merge next steps without writes.
- `arcigy.build_slovak_salutation_preview`: builds Slovak `pan`/`pani` Smartlead custom fields like `last_name_with_salutation` and `greeting` for a lead batch without writes.
- `arcigy.build_gmail_name_enrichment_queue_preview`: plans batch decision-maker name recovery from Gmail display-name history, public email hints, and personal email patterns before salutation, intro, and Smartlead prep.
- `arcigy.build_lead_identity_repair_preview`: infers decision-maker names from personal emails, cleans `company_name_short`, and prepares Smartlead-safe identity fields without writes.
- `arcigy.score_lead_quality`: scores lead candidates 0-100 using email type, website, `.sk` domain, decision maker, register verification, AI intro, and validation status.
- `arcigy.build_lead_validation_scorecard_preview`: builds a validate/inject-style batch scorecard with score buckets, min-score filtering, sent-lead exclusions, and Smartlead injection next steps without writes.
- `arcigy.dedupe_lead_candidates`: deduplicates lead candidates by email, website, phone, or company name before import.
- `arcigy.build_suppression_list_preview`: builds a read-only suppression/blacklist filter from bounces, unsubscribes, negative replies, and manual rules.
- `arcigy.build_niche_leadgen_plan`: returns niche-specific Google Maps and Serper query plans with blacklist keywords.
- `arcigy.build_batch_niche_discovery_plan`: plans read-only discovery, scraping, AI intros, runbooks, and Smartlead prep across multiple niches/regions without executing.
- `arcigy.build_lead_discovery_matrix_preview`: builds a keyword-region Google Maps/Serper discovery matrix with blacklist, dedupe context, and next MCP calls before scraping or import.
- `arcigy.build_leadgen_execution_queue_preview`: prioritizes today's leadgen work across niches, regions, quotas, discovery, enrichment, and Smartlead handoff without executing.
- `arcigy.build_sticky_niche_leadgen_decision_preview`: read-only decides whether to continue the last worked niche/region or move to the next active niche, then prepares runbook and closure next calls.
- `arcigy.build_daily_leadgen_run_closure_preview`: prepares a daily post-run ledger with discovered/enriched/qualified/sent/failed stats, region advance, exhaustion decision, and `record_local_niche_run` approval payload without writing.
- `arcigy.build_leadgen_run_resume_preview`: resumes interrupted leadgen runs by detecting the checkpoint and returning next calls for discovery, scrape, contact selection, AI intro, repair, Smartlead upload, or closure.
- `arcigy.build_region_expansion_queue_preview`: expands niches across capital/all-Slovakia/custom regions, skips visited regions, and prepares discovery/execution queues without executing.
- `arcigy.draft_smartlead_campaign_sequence`: drafts a Smartlead-compatible email sequence with variants and empty-subject follow-up without writing to Smartlead.
- `arcigy.build_smartlead_sequence_work_packet_preview`: prepares an AI work packet for Smartlead sequences, validates returned JSON, and proposes QA/render/repair/configure steps without writing.
- `arcigy.preview_smartlead_email_rendering`: renders Smartlead sequence variants for selected leads, substitutes variables, and reports unresolved placeholders without sending.
- `arcigy.build_smartlead_sequence_variable_repair_preview`: rewrites Smartlead sequence subjects from `company_name` to `company_name_short` and prepares an approval-gated configure payload without writing.
- `arcigy.build_company_short_name_preview`: normalizes official company names into `custom_fields.company_name_short` before AI intro cleanup, QA, and Smartlead import without writing.
- `arcigy.build_lead_batch_qa_preview`: runs a pre-Smartlead lead batch QA pass for blocked source domains, low-quality emails, company short names, cleaned AI intros, and repair next steps without DB writes.
- `arcigy.preview_manual_review_pickup`: previews manual-review-pickup by filtering reviewed unsent leads, qualifying them, grouping by niche, and preparing injection plans without writes.
- `arcigy.build_smartlead_injection_plan`: prepares Smartlead `lead_list` batches and the approval payload for `arcigy.add_leads_to_smartlead_campaign` without uploading.
- `arcigy.build_bulk_smartlead_upload_queue_preview`: plans approval-gated Smartlead uploads across multiple campaigns with priorities, daily limits, prepared lead validation, and campaign setup fallbacks without uploading.
- `arcigy.build_smartlead_send_readiness_queue_preview`: combines batch QA, validation scorecard, daily limits, and bulk upload planning across campaigns to show what can be sent today and what blocks the rest without uploading.
- `arcigy.build_smartlead_import_audit_preview`: compares prepared Smartlead leads against existing campaign leads, separates new/duplicate/already-imported records, and prepares a safe approval payload without uploading.
- `arcigy.build_smartlead_campaign_sync_plan_preview`: compares local prepared leads with remote Smartlead campaign leads, separates missing uploads, existing updates, and unchanged leads, and prepares approval payloads without writing.
- `arcigy.build_smartlead_local_reconciliation_preview`: compares local lead sent/reply fields with Smartlead remote leads or sync updates and prepares a local patch plan without DB writes.
- `arcigy.build_smartlead_safe_sync_runbook_preview`: wraps Smartlead campaign sync in a safe runbook with remote lead fetch, backup, pause/resume checklist, approval payloads, and re-check steps without writing.
- `arcigy.build_smartlead_history_suppression_preview`: filters CSV/manual leads already sent, replied, blocked, or matched in Smartlead before leadgen autopilot or upload steps.
- `arcigy.build_smartlead_nonreply_call_list_preview`: prepares a read-only call/follow-up list from Smartlead or CSV leads that were sent but did not reply, including phone scrape and approval-gated CSV export next steps.
- `arcigy.build_smartlead_sender_capacity_preview`: checks sender accounts, warmup/reputation/limits, calculates safe daily capacity, and prepares a campaign configure payload without writing.
- `arcigy.build_smartlead_deliverability_guard_preview`: checks campaign delivery metrics plus sender capacity and recommends continue, reduced daily limit, or pause before more uploads.
- `arcigy.build_smartlead_campaign_backup_plan`: prepares a read-only Smartlead backup manifest, protected campaign classification, fetch endpoints, and delete safety gates before risky campaign changes.
- `arcigy.build_smartlead_campaign_restore_plan`: normalizes Smartlead backup JSON into approval-gated create/configure/add-leads restore payloads without writing to Smartlead.
- `arcigy.draft_niche_smartlead_campaign_setup`: prepares a niche campaign setup payload with sequences, schedule, settings, and AI reply webhook without creating the campaign.
- `arcigy.build_smartlead_campaign_launch_preview`: prepares a complete Smartlead launch plan with create/configure campaign payloads, sequence/schedule/webhook, and add-leads approval payloads without writing.
- `arcigy.build_smartlead_campaign_qa_preview`: validates Smartlead campaign launch payloads, leads, sequences, schedule limits, variables, and approval next steps without writing.
- `arcigy.build_smartlead_campaign_handoff_package_preview`: combines Smartlead launch, QA, sender capacity, approvals, and operator checklist into one read-only handoff package.
- `arcigy.preview_lead_enrichment_batch`: merges scraped website, register, and AI fields for a batch, then dedupes, scores, queues manual review, and prepares Smartlead upload plans without writing.
- `arcigy.build_lead_enrichment_merge_preview`: merges separate scrape results and AI intro drafts back into original leads by domain/company before review and Smartlead next steps.
- `arcigy.build_leadgen_gap_report`: audits a lead batch before Smartlead, reports missing email/website/AI intro/decision-maker gaps, and proposes safe next MCP calls without writing.
- `arcigy.build_leadgen_status_board_preview`: builds a read-only leadgen status board from CSV/leads, grouped by niche/campaign/source, with counts for ready, missing email, missing intro, missing phone, sent, verified, failed, and exact repair/import next steps.
- `arcigy.build_leadgen_db_status_preview`: builds a read-only DB-level leadgen status from CSV/leads or aggregated niche stats, including enriched, Smartlead, verified, pending enrichment, blacklist, resume state, and next MCP calls.
- `arcigy.build_google_sheet_sync_preview`: prepares a read-only Google Sheets sync plan from CSV/leads with headers, rows, clear/update ranges, and the approval payload for replacing a sheet.
- `arcigy.build_leadgen_campaign_pipeline_preview`: chains a raw lead batch into website scrape needs, AI intro needs, enrichment scoring, manual review, and Smartlead next-step payloads without writing or uploading.
- `arcigy.build_leadgen_to_smartlead_dispatch_preview`: coordinates multiple leadgen groups into one scrape/fetch, AI intro, validation, and Smartlead readiness dispatch without writing or uploading.
- `arcigy.build_company_research_queue_preview`: turns company-name-only or partial leads into Google Places/Serper research, safe URL fetch, contact scrape, AI intro, and Smartlead dispatch next steps without executing.
- `arcigy.build_research_results_import_preview`: normalizes Google Places and Serper result rows into lead candidates, filters blacklist/duplicate domains, and prepares company research plus lead import queues without writing.
- `arcigy.build_lead_source_import_queue_preview`: turns Google Maps, CSV, Serper, or manual lead source rows into niche/campaign import queues with scrape, intro, review, and Smartlead audit next steps without writing or uploading.
- `arcigy.build_lead_source_bundle_preview`: merges multiple CSV, JSON, and manual lead exports into one read-only leadgen runbook with scrape, AI intro, review, and Smartlead next steps.
- `arcigy.build_lead_source_bundle_campaign_launch_preview`: turns a multi-source lead bundle into Smartlead campaign launch and handoff packages with approval-gated next steps, without writing or uploading.
- `arcigy.build_leadgen_autopilot_batch_preview`: creates one read-only runbook from CSV/manual leads through scrape, fetch, AI intro audit, Smartlead import audit, and approval-gated upload steps.
- `arcigy.build_lead_repair_queue_preview`: detects broken leads, bad AI intros, missing emails, missing decision-makers, failed verification, and proposes exact repair MCP calls without writing.
- `arcigy.build_phone_enrichment_queue_preview`: prepares a read-only phone enrichment queue from CSV/leads, filters by country, skips existing phones, plans website/contact scraping, and prepares an approval-gated CSV export without writing.
- `arcigy.build_phone_enrichment_writeback_preview`: merges scraped/CSV phone results back into leads, flags conflicts, and prepares call-list/export next steps without writing.
- `arcigy.build_orphan_lead_assignment_preview`: analyzes orphan leads without niche assignment, infers likely niche/campaign matches, and prepares repair/import next steps without DB writes.
- `arcigy.build_niche_ops_dashboard_preview`: summarizes niche/campaign health, daily targets, stuck/failed/ready leads, and proposes next MCP calls without writing.
- `arcigy.build_cold_outreach_csv_import_preview`: parses pasted/exported lead CSV, applies blacklist filters, then builds leadgen pipeline and Smartlead launch previews without writing or uploading.
- `arcigy.build_daily_leadgen_runbook`: returns the exact daily leadgen MCP call sequence from discovery through enrichment to approval-gated Smartlead upload.
- `arcigy.build_full_leadgen_pipeline_runbook_preview`: composes a full niche runbook across discovery, fetch/scrape, scrape audit, AI intro work packet, merge, QA, and Smartlead handoff without writing.
- `arcigy.build_lead_csv_mapping_preview`: previews how Google Maps, Smartlead-enriched, or generic CSV columns map into lead fields before scrape, AI intro, and Smartlead autopilot steps.
- `arcigy.parse_leads_csv`: parses pasted CSV lead data into normalized lead candidates.
- `arcigy.filter_blacklisted_leads`: filters lead candidates by blacklisted domains or keywords before import.
- `arcigy.build_manual_review_queue`: splits leads into ready, manual review, and rejected groups.
- `arcigy.export_leads_csv`: approval-gated CSV export into the repository for manual review.
- `arcigy.draft_lead_intro`: Gemini draft of one short personalized cold outreach intro for a lead.
- `arcigy.batch_draft_lead_intros`: Gemini batch draft of personalized cold outreach intros for multiple leads without sending or writing.
- `arcigy.build_ai_intro_quality_audit_preview`: checks AI intros before Smartlead for missing, generic, short, placeholder, greeting, or weakly grounded text and prepares safe redraft calls.
- `arcigy.build_flagged_lead_review_preview`: turns flagged AI intro CSV/leads into a read-only review queue for rescrape, redraft, identity repair, reject, or writeback preview.
- `arcigy.build_ai_intro_work_packet_preview`: prepares a read-only Markdown/JSON work packet for ChatGPT or Claude to fill missing icebreakers, validates returned intros, and prepares cleanup/audit/export next steps without DB writes.
- `arcigy.build_bulk_ai_intro_work_queue_preview`: splits many leads from multiple CSV/source/niche groups into AI intro work-packet batches and prepares import/audit next steps without calling AI, writing, or uploading.
- `arcigy.build_ai_intro_import_preview`: parses ChatGPT/Claude JSON or CSV icebreaker results, matches them to work-packet leads, validates them, and prepares cleanup/audit/export/Smartlead next steps without DB writes.
- `arcigy.build_ai_icebreaker_writeback_preview`: validates AI icebreaker JSON by lead ID, detects duplicates/placeholders/unknown leads, merges valid intros back onto leads, and prepares cleanup/QA/Smartlead steps without DB writes.
- `arcigy.build_ai_intro_cleanup_preview`: deterministically removes greetings, decision-maker names, and salutation text from AI intros, then prepares redraft or Smartlead audit steps without writes.
- `arcigy.enrich_website_leads_preview`: live read-only batch enrichment that scrapes lead websites, drafts AI intros, and prepares pipeline/Smartlead launch previews without writing.
- `arcigy.prepare_smartlead_leads`: normalizes selected leads into Smartlead `lead_list` payload without writing.
- `arcigy.run_leadgen_research_pipeline`: read-only discovery + optional website scraping + optional Gemini intro drafts for Smartlead-ready research.
- `arcigy.add_leads_to_smartlead_campaign`: approval-gated upload of prepared `lead_list` batches to a Smartlead campaign.
- `arcigy.append_leads_to_google_sheet`: explicit Google Sheets append for prepared lead rows.
- `arcigy.replace_google_sheet_rows`: approval-gated Google Sheets clear+update for replacing a prepared lead overview sheet.
- `arcigy.jarvis_voice_event`: wake-word state handling for the desktop voice layer.

Use `JARVIS_PYTHON` if the MCP runtime needs a specific Python executable.

Store live keys in `.env.local`, not in committed files.
