import { redactSensitiveText } from "./ai-safety.ts";

type RuntimeEnv = Record<string, string | undefined>;
type FetchLike = typeof fetch;

export type SlackSendInput = {
  channel?: string;
  text: string;
  blocks?: unknown[];
};

export type SlackSendResult = {
  mode: "slack-message-send";
  status: "sent";
  provider: "bot-token" | "webhook";
  channel?: string;
  textLength: number;
  blockCount: number;
  summary: string;
};

export async function sendSlackMessage(
  input: SlackSendInput,
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<SlackSendResult> {
  const text = sanitizeSlackText(input.text);
  if (!text) throw new Error("Slack text is required.");
  const blocks = Array.isArray(input.blocks) ? input.blocks : undefined;
  const channel = sanitizeSlackChannel(input.channel) || "#leadgen";
  const botToken = env.SLACK_BOT_TOKEN?.trim();
  const webhookUrl = env.SLACK_WEBHOOK_URL?.trim();

  if (botToken) {
    try {
      const response = await fetchImpl("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { authorization: `Bearer ${botToken}`, "content-type": "application/json" },
        body: JSON.stringify({ channel, text, blocks }),
      });
      if (!response.ok) throw new Error(`Slack Bot API failed: ${response.status}`);
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (body.ok !== true) throw new Error(`Slack Bot API failed: ${body.error ?? "unknown_error"}`);
      return {
        mode: "slack-message-send",
        status: "sent",
        provider: "bot-token",
        channel,
        textLength: text.length,
        blockCount: blocks?.length ?? 0,
        summary: `Slack sprava odoslana do ${channel}.`,
      };
    } catch (error) {
      if (!webhookUrl) throw new Error(redactSensitiveText(error instanceof Error ? error.message : String(error)));
    }
  }

  if (!webhookUrl) throw new Error("Slack is not configured. Set SLACK_BOT_TOKEN or SLACK_WEBHOOK_URL.");
  const response = await fetchImpl(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, blocks }),
  });
  if (!response.ok) throw new Error(`Slack webhook failed: ${response.status}`);
  return {
    mode: "slack-message-send",
    status: "sent",
    provider: "webhook",
    textLength: text.length,
    blockCount: blocks?.length ?? 0,
    summary: "Slack sprava odoslana cez webhook.",
  };
}

function sanitizeSlackText(value: string): string {
  return String(value ?? "").replace(/\0/g, "").trim().slice(0, 4000);
}

function sanitizeSlackChannel(value: string | undefined): string | undefined {
  const cleaned = String(value ?? "").replace(/[\r\n\0]+/g, "").trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, 80);
}
