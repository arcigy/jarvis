import { requireEnv, type RuntimeEnv } from "./env.ts";
import type { FetchLike } from "./gemini.ts";

const smartleadBaseUrl = "https://server.smartlead.ai/api/v1";

export type SmartleadCampaign = {
  id: number | string;
  name?: string;
  status?: string;
  [key: string]: unknown;
};

export type SmartleadCampaignStatus = {
  campaignId?: string;
  campaigns?: SmartleadCampaign[];
  statistics?: unknown;
};

export async function getSmartleadCampaignStatus(
  input: { campaignId?: string } = {},
  env: RuntimeEnv = process.env,
  fetchImpl: FetchLike = fetch
): Promise<SmartleadCampaignStatus> {
  const apiKey = requireEnv(env, "SMARTLEAD_API_KEY");
  if (!input.campaignId) {
    const campaigns = await smartleadFetch<SmartleadCampaign[]>("/campaigns/", apiKey, fetchImpl);
    return { campaigns };
  }

  const statistics = await smartleadFetch<unknown>(
    `/campaigns/${encodeURIComponent(input.campaignId)}/statistics`,
    apiKey,
    fetchImpl
  );
  return {
    campaignId: input.campaignId,
    statistics,
  };
}

async function smartleadFetch<T>(path: string, apiKey: string, fetchImpl: FetchLike): Promise<T> {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetchImpl(`${smartleadBaseUrl}${path}${separator}api_key=${encodeURIComponent(apiKey)}`);
  if (!response.ok) {
    throw new Error(`Smartlead request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}
