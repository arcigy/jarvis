import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { handleJarvisVoiceEvent, type JarvisVoiceSession } from "./jarvis-voice.ts";
import {
  buildContractGenerationCommand,
  getColdOutreachMcpAnswer,
  identifyEmailMcpAnswer,
} from "./mcp-tools.ts";
import type { ClientNeedSignal, LocalPerson } from "./types.ts";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export function createJarvisMcpServer(): McpServer {
  const server = new McpServer({
    name: "arcigy-jarvis-local",
    version: "0.1.0",
  });

  server.registerTool(
    "arcigy.generate_contract_documents",
    {
      title: "Generate Arcigy contracts",
      description: "Generate framework agreement and project appendix DOCX files from a filled JSON intake form.",
      inputSchema: {
        inputJsonPath: z.string().min(1).optional(),
        intake: z.record(z.string(), z.unknown()).optional(),
        outputDir: z.string().min(1).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ inputJsonPath, intake, outputDir }) => {
      if (!inputJsonPath && !intake) {
        throw new Error("Provide either inputJsonPath or inline intake payload.");
      }

      const args = inputJsonPath
        ? buildContractGenerationCommand(inputJsonPath, outputDir).args
        : [
            "scripts/generate_contract_documents.py",
            "--payload",
            JSON.stringify(intake),
            "--output-dir",
            outputDir ?? "generated/contracts",
          ];
      const result = runPython(args);
      return textResult(result.stdout.trim() || "Contract documents generated.");
    }
  );

  server.registerTool(
    "arcigy.get_cold_outreach_brief",
    {
      title: "Cold outreach brief",
      description: "Return a concise Slovak cold outreach activity briefing.",
      inputSchema: {
        periodLabel: z.string().min(1),
        contacted: z.number().int().nonnegative(),
        opened: z.number().int().nonnegative(),
        replied: z.number().int().nonnegative(),
        positiveReplies: z.number().int().nonnegative(),
        preparedPositiveReplyCount: z.number().int().nonnegative(),
        pendingApprovalCount: z.number().int().nonnegative(),
        notableSignals: z.array(z.string()).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (metrics) => textResult(getColdOutreachMcpAnswer(metrics))
  );

  server.registerTool(
    "arcigy.add_cold_outreach_event",
    {
      title: "Add cold outreach event",
      description: "Store a local cold outreach event for period summaries.",
      inputSchema: {
        dbPath: z.string().optional(),
        id: z.string().optional(),
        leadEmail: z.string().email(),
        campaignId: z.string().optional(),
        campaignName: z.string().optional(),
        eventType: z.enum(["sent", "opened", "replied", "positive_reply", "prepared_reply", "approved_reply_sent"]),
        occurredAt: z.string().optional(),
        data: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ dbPath, ...payload }) => jsonDbTool("add-cold-event", payload, dbPath)
  );

  server.registerTool(
    "arcigy.get_cold_outreach_brief_from_db",
    {
      title: "Cold outreach brief from DB",
      description: "Calculate a concise Slovak cold outreach brief from local SQLite events.",
      inputSchema: {
        dbPath: z.string().optional(),
        since: z.string().min(1),
        until: z.string().optional(),
        periodLabel: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ dbPath, ...payload }) => jsonDbTool("cold-brief", payload, dbPath)
  );

  server.registerTool(
    "arcigy.upsert_local_person",
    {
      title: "Upsert local person",
      description: "Create or update a local client, lead, or contact in SQLite.",
      inputSchema: {
        dbPath: z.string().optional(),
        id: z.string().optional(),
        kind: z.enum(["client", "lead", "contact"]).default("lead"),
        primaryEmail: z.string().email(),
        displayName: z.string().optional(),
        companyName: z.string().optional(),
        status: z.string().default("active"),
        data: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ dbPath, ...payload }) => jsonDbTool("upsert-person", payload, dbPath)
  );

  server.registerTool(
    "arcigy.add_client_need_signal",
    {
      title: "Add client need signal",
      description: "Store a local signal that a client needs or requested something.",
      inputSchema: {
        dbPath: z.string().optional(),
        id: z.string().optional(),
        personId: z.string().min(1),
        source: z.string().default("mcp"),
        signalType: z.string().default("request"),
        summary: z.string().min(1),
        status: z.enum(["new", "seen", "resolved", "ignored"]).default("new"),
        confidence: z.number().min(0).max(1).default(0.7),
        occurredAt: z.string().optional(),
        data: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ dbPath, ...payload }) => jsonDbTool("add-need-signal", payload, dbPath)
  );

  server.registerTool(
    "arcigy.identify_email",
    {
      title: "Identify email",
      description: "Identify a local client or lead by email and return open need signals.",
      inputSchema: {
        email: z.string().email(),
        dbPath: z.string().optional(),
        people: z
          .array(
            z.object({
              id: z.string(),
              kind: z.enum(["client", "lead", "contact"]),
              primaryEmail: z.string().email(),
              displayName: z.string().optional(),
              companyName: z.string().optional(),
              status: z.string(),
              data: z.record(z.string(), z.unknown()).optional(),
            })
          )
          .optional(),
        needSignals: z
          .array(
            z.object({
              id: z.string(),
              personId: z.string(),
              source: z.string(),
              signalType: z.string(),
              summary: z.string(),
              status: z.enum(["new", "seen", "resolved", "ignored"]),
              confidence: z.number(),
              occurredAt: z.string(),
              data: z.record(z.string(), z.unknown()).optional(),
            })
          )
          .optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ email, dbPath, people, needSignals }) => {
      if (dbPath) {
        const result = runPython(["scripts/jarvis_local_db.py", "identify", "--db", dbPath, "--email", email]);
        return jsonResult(JSON.parse(result.stdout));
      }

      return textResult(identifyEmailMcpAnswer(email, (people ?? []) as LocalPerson[], (needSignals ?? []) as ClientNeedSignal[]));
    }
  );

  server.registerTool(
    "arcigy.jarvis_voice_event",
    {
      title: "Jarvis voice event",
      description: "Process a Jarvis transcript event and return recording/speech instructions.",
      inputSchema: {
        session: z
          .object({
            state: z.enum(["idle", "awake", "processing"]),
            wakeWord: z.string(),
            lastTranscript: z.string().optional(),
            lastResponse: z.string().optional(),
          })
          .optional(),
        text: z.string().min(1),
        kind: z.enum(["transcript"]).default("transcript"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ session, text }) => {
      const result = handleJarvisVoiceEvent((session ?? { state: "idle", wakeWord: "jarvis" }) as JarvisVoiceSession, {
        type: "transcript",
        text,
      });
      return jsonResult(result);
    }
  );

  return server;
}

export async function runJarvisMcpServer(): Promise<void> {
  const server = createJarvisMcpServer();
  await server.connect(new StdioServerTransport());
}

function runPython(args: string[]): { stdout: string; stderr: string } {
  const python = process.env.JARVIS_PYTHON || "python";
  const result = spawnSync(python, args, {
    cwd: repoRoot,
    encoding: "utf-8",
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
    },
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr || `Python command failed with status ${result.status}`);
  }
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function jsonDbTool(
  command: "upsert-person" | "add-need-signal" | "add-cold-event" | "cold-brief",
  payload: Record<string, unknown>,
  dbPath?: string
) {
  const args = ["scripts/jarvis_local_db.py", command, "--payload", JSON.stringify(payload)];
  if (dbPath) {
    args.push("--db", dbPath);
  }
  const result = runPython(args);
  return jsonResult(JSON.parse(result.stdout));
}

function textResult(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

function jsonResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: { result: value },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runJarvisMcpServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
