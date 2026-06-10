import { redactSensitiveText } from "./ai-safety.ts";
import type { FetchLike } from "./gemini.ts";

export type PublicUrlFetchInput = {
  url: string;
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  parseJson?: boolean;
};

export type PublicUrlFetchPreview = {
  mode: "public-url-fetch-preview";
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  contentType?: string;
  headers: Record<string, string>;
  bytesRead: number;
  truncated: boolean;
  textPreview?: string;
  jsonPreview?: unknown;
  fetchedAt: string;
};

export type PublicUrlBatchFetchPreview = {
  mode: "public-url-batch-fetch-preview";
  summary: string;
  totals: { requested: number; fetched: number; failed: number; truncated: number };
  results: Array<{ url: string; result?: PublicUrlFetchPreview; error?: string }>;
};

const blockedHeaderNames = new Set(["authorization", "cookie", "set-cookie", "x-api-key", "proxy-authorization"]);

export async function fetchPublicUrlPreview(
  input: PublicUrlFetchInput,
  fetchImpl: FetchLike = fetch
): Promise<PublicUrlFetchPreview> {
  const url = normalizePublicFetchUrl(input.url);
  const maxBytes = Math.min(Math.max(Math.trunc(input.maxBytes ?? 20_000), 1_000), 100_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(Math.max(input.timeoutMs ?? 10_000, 1_000), 30_000));
  try {
    const response = await fetchImpl(url, {
      method: input.method ?? "GET",
      headers: sanitizeFetchHeaders(input.headers),
      redirect: "follow",
      signal: controller.signal,
    });
    const headers = publicResponseHeaders(response.headers);
    const contentType = response.headers.get("content-type") ?? undefined;
    const rawText = input.method === "HEAD" ? "" : await response.text();
    const truncated = rawText.length > maxBytes;
    const previewText = redactSensitiveText(rawText.slice(0, maxBytes));
    const shouldParseJson = input.parseJson === true || /(^|[/+])json\b/i.test(contentType ?? "");
    const jsonPreview = shouldParseJson && previewText ? parseJsonPreview(previewText) : undefined;
    return {
      mode: "public-url-fetch-preview",
      url,
      finalUrl: response.url || url,
      status: response.status,
      ok: response.ok,
      contentType,
      headers,
      bytesRead: Math.min(rawText.length, maxBytes),
      truncated,
      textPreview: previewText || undefined,
      jsonPreview,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function batchFetchPublicUrlPreviews(
  input: {
    urls: string[];
    method?: "GET" | "HEAD";
    headers?: Record<string, string>;
    timeoutMs?: number;
    maxBytes?: number;
    parseJson?: boolean;
    maxUrls?: number;
  },
  fetchImpl: FetchLike = fetch
): Promise<PublicUrlBatchFetchPreview> {
  const maxUrls = Math.min(Math.max(Math.trunc(input.maxUrls ?? 20), 1), 50);
  const urls = input.urls.slice(0, maxUrls);
  const results: PublicUrlBatchFetchPreview["results"] = [];
  for (const url of urls) {
    try {
      results.push({
        url,
        result: await fetchPublicUrlPreview(
          {
            url,
            method: input.method,
            headers: input.headers,
            timeoutMs: input.timeoutMs,
            maxBytes: input.maxBytes,
            parseJson: input.parseJson,
          },
          fetchImpl
        ),
      });
    } catch (error) {
      results.push({ url, error: redactSensitiveText(error instanceof Error ? error.message : String(error)) });
    }
  }
  const fetched = results.filter((item) => item.result).length;
  const failed = results.length - fetched;
  const truncated = results.filter((item) => item.result?.truncated).length;
  return {
    mode: "public-url-batch-fetch-preview",
    summary: `Batch fetch preview: ${fetched}/${results.length} URL fetched, ${failed} failed, ${truncated} truncated. No data was written.`,
    totals: { requested: results.length, fetched, failed, truncated },
    results,
  };
}

function normalizePublicFetchUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("URL is required.");
  const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only http/https URLs are supported.");
  if (isBlockedHost(parsed.hostname)) throw new Error("Private, localhost, and link-local hosts are blocked for MCP fetch.");
  parsed.hash = "";
  return parsed.toString();
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host)) return true;
  const match = /^172\.(\d{1,3})\./.exec(host);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  if (/^0\./.test(host)) return true;
  return false;
}

function sanitizeFetchHeaders(headers?: Record<string, string>): Record<string, string> {
  const output: Record<string, string> = {
    "user-agent": "Arcigy-Jarvis/1.0 (+https://arcigy.group)",
    accept: "application/json,text/plain,text/html;q=0.8,*/*;q=0.5",
  };
  for (const [key, value] of Object.entries(headers ?? {})) {
    const normalized = key.trim().toLowerCase();
    if (!normalized || blockedHeaderNames.has(normalized)) continue;
    if (!/^[a-z0-9-]+$/.test(normalized)) continue;
    output[normalized] = String(value).slice(0, 500);
  }
  return output;
}

function publicResponseHeaders(headers: Headers): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    const normalized = key.toLowerCase();
    if (blockedHeaderNames.has(normalized)) continue;
    if (["content-type", "content-length", "cache-control", "etag", "last-modified"].includes(normalized)) {
      output[normalized] = redactSensitiveText(value);
    }
  }
  return output;
}

function parseJsonPreview(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
