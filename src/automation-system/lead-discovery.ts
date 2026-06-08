import { getEnv, requireEnv, type RuntimeEnv } from "./env.ts";
import { listConfiguredGmailAccounts, refreshGoogleAccessToken } from "./gmail.ts";
import type { FetchLike } from "./gemini.ts";

export type SerperSearchInput = {
  query: string;
  num?: number;
  gl?: string;
  hl?: string;
};

export type GooglePlacesSearchInput = {
  query: string;
  maxResultCount?: number;
  languageCode?: string;
  regionCode?: string;
};

export type SheetAppendInput = {
  spreadsheetId?: string;
  range?: string;
  rows: Array<Array<string | number | boolean | null>>;
  accountEnvKey?: string;
};

export type LeadDiscoveryInput = {
  query: string;
  placesQuery?: string;
  maxResults?: number;
};

export type LeadDiscoveryProviderStatus = {
  source: "serper" | "google_places";
  status: "ready" | "missing" | "failed";
  message: string;
};

export type NormalizedLead = {
  name: string;
  website?: string;
  source: "serper" | "google_places";
  url?: string;
  address?: string;
  phone?: string;
  data: Record<string, unknown>;
};

export async function searchSerper(
  input: SerperSearchInput,
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<unknown> {
  const apiKeys = getSerperApiKeys(env);
  let lastError = "";
  for (const [index, apiKey] of apiKeys.entries()) {
    const response = await fetchImpl("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        q: input.query,
        num: input.num ?? 10,
        gl: input.gl ?? "sk",
        hl: input.hl ?? "sk",
      }),
    });
    if (response.ok) {
      return response.json();
    }
    const body = await response.text().catch(() => "");
    lastError = body
      ? `Serper request failed after key ${index + 1}/${apiKeys.length}: ${response.status} - ${body}`
      : `Serper request failed after key ${index + 1}/${apiKeys.length}: ${response.status}`;
    const retryable = response.status === 401 || response.status === 403 || response.status === 429 || /not enough credits/i.test(body);
    if (!retryable) {
      throw new Error(lastError);
    }
  }
  throw new Error(lastError || "Serper request failed.");
}

export async function searchGooglePlaces(
  input: GooglePlacesSearchInput,
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<unknown> {
  const apiKeys = getGoogleMapsApiKeys(env);
  if (!apiKeys.length) requireEnv(env, "GOOGLE_MAPS_API_KEY");
  let lastError = "";
  for (const [index, apiKey] of apiKeys.entries()) {
    const response = await fetchImpl("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        "x-goog-fieldmask":
          "places.id,places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri",
      },
      body: JSON.stringify({
        textQuery: input.query,
        maxResultCount: input.maxResultCount ?? 10,
        languageCode: input.languageCode ?? "sk",
        regionCode: input.regionCode ?? "SK",
      }),
    });
    if (response.ok) {
      return response.json();
    }
    lastError = `Google Places request failed after key ${index + 1}/${apiKeys.length}: ${response.status}`;
    if (![401, 403, 429].includes(response.status)) {
      throw new Error(lastError);
    }
  }
  throw new Error(lastError || "Google Places request failed.");
}

export async function appendRowsToGoogleSheet(
  input: SheetAppendInput,
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<unknown> {
  if (!input.rows.length) {
    throw new Error("At least one row is required.");
  }
  const spreadsheetId = input.spreadsheetId || requireEnv(env, "GOOGLE_SHEET_ID");
  const range = input.range ?? "Leads!A1";
  const account = listConfiguredGmailAccounts(env).find((item) => !input.accountEnvKey || item.envKey === input.accountEnvKey);
  if (!account) {
    throw new Error(input.accountEnvKey ? `Google account not configured: ${input.accountEnvKey}` : "No configured Google OAuth account found.");
  }
  const accessToken = await refreshGoogleAccessToken(account.refreshToken, env, fetchImpl);
  const params = new URLSearchParams({
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
  });
  const response = await fetchImpl(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?${params.toString()}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        majorDimension: "ROWS",
        values: input.rows,
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Google Sheets append failed: ${response.status}`);
  }
  return response.json();
}

export async function discoverLeads(
  input: LeadDiscoveryInput,
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<{ leads: NormalizedLead[]; sources: string[]; providerStatus: LeadDiscoveryProviderStatus[] }> {
  const maxResults = input.maxResults ?? 10;
  const hasSerper = getSerperApiKeys(env).length > 0;
  const hasGooglePlaces = getGoogleMapsApiKeys(env).length > 0;
  const [serper, places] = await Promise.allSettled([
    hasSerper ? searchSerper({ query: input.query, num: maxResults }, env, fetchImpl) : null,
    hasGooglePlaces
      ? searchGooglePlaces({ query: input.placesQuery ?? input.query, maxResultCount: Math.min(maxResults, 20) }, env, fetchImpl)
      : null,
  ]);
  const leads = [
    ...normalizeSerperLeads(serper.status === "fulfilled" ? serper.value : null),
    ...normalizePlacesLeads(places.status === "fulfilled" ? places.value : null),
  ];
  return {
    leads: dedupeLeads(leads).slice(0, maxResults),
    sources: [serper.status === "fulfilled" && serper.value ? "serper" : null, places.status === "fulfilled" && places.value ? "google_places" : null].filter(
      (source): source is string => source !== null
    ),
    providerStatus: [
      providerStatus("serper", hasSerper, serper),
      providerStatus("google_places", hasGooglePlaces, places),
    ],
  };
}

function providerStatus(
  source: LeadDiscoveryProviderStatus["source"],
  configured: boolean,
  result: PromiseSettledResult<unknown>
): LeadDiscoveryProviderStatus {
  if (!configured) {
    return { source, status: "missing", message: `${source} is not configured.` };
  }
  if (result.status === "fulfilled") {
    return { source, status: result.value ? "ready" : "missing", message: result.value ? `${source} responded.` : `${source} is not configured.` };
  }
  const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
  return { source, status: "failed", message };
}

function getSerperApiKeys(env: RuntimeEnv): string[] {
  return [getEnv(env, "SERPER_API_KEY"), getEnv(env, "SERPER_API_KEY_2")].filter((key, index, keys): key is string => Boolean(key) && keys.indexOf(key) === index);
}

function getGoogleMapsApiKeys(env: RuntimeEnv): string[] {
  return [
    getEnv(env, "GOOGLE_MAPS_API_KEY"),
    ...(getEnv(env, "GOOGLE_MAPS_API_KEYS") ?? "")
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean),
  ].filter((key, index, keys): key is string => Boolean(key) && keys.indexOf(key) === index);
}

function normalizeSerperLeads(value: unknown): NormalizedLead[] {
  const organic = (value as { organic?: Array<Record<string, unknown>> } | null)?.organic ?? [];
  return organic
    .map((item) => ({
      name: String(item.title ?? "").trim(),
      website: typeof item.link === "string" ? item.link : undefined,
      source: "serper" as const,
      url: typeof item.link === "string" ? item.link : undefined,
      data: item,
    }))
    .filter((lead) => lead.name);
}

function normalizePlacesLeads(value: unknown): NormalizedLead[] {
  const places = (value as { places?: Array<Record<string, unknown>> } | null)?.places ?? [];
  return places
    .map((place) => {
      const displayName = place.displayName as { text?: string } | undefined;
      return {
        name: String(displayName?.text ?? "").trim(),
        website: typeof place.websiteUri === "string" ? place.websiteUri : undefined,
        source: "google_places" as const,
        url: typeof place.googleMapsUri === "string" ? place.googleMapsUri : undefined,
        address: typeof place.formattedAddress === "string" ? place.formattedAddress : undefined,
        phone: typeof place.nationalPhoneNumber === "string" ? place.nationalPhoneNumber : undefined,
        data: place,
      };
    })
    .filter((lead) => lead.name);
}

function dedupeLeads(leads: NormalizedLead[]): NormalizedLead[] {
  const seen = new Set<string>();
  return leads.filter((lead) => {
    const key = (lead.website || lead.name).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
