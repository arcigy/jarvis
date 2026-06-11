import { createHash } from "node:crypto";

import type { FetchLike } from "./gemini.ts";

export type PublicEmailProfileLookup = {
  mode: "public-email-profile-lookup";
  email: string;
  hash: string;
  found: boolean;
  profile?: {
    displayName?: string;
    preferredUsername?: string;
    profileUrl?: string;
    thumbnailUrl?: string;
    currentLocation?: string;
    aboutMe?: string;
  };
  sources: Array<{ provider: "gravatar"; status: "found" | "not_found" | "error"; url: string; error?: string }>;
  leadHints: {
    decisionMakerName?: string;
    profileUrl?: string;
    avatarUrl?: string;
    confidence: "high" | "medium" | "low";
  };
  nextToolCalls: Array<{ tool: string; payload: Record<string, unknown>; reason: string; approvalRequired: boolean }>;
  summary: string;
};

export async function lookupPublicEmailProfile(
  input: { email: string; companyName?: string; website?: string; sourceName?: string },
  fetchImpl: FetchLike = fetch
): Promise<PublicEmailProfileLookup> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Valid email is required.");
  const hash = createHash("md5").update(email).digest("hex");
  const gravatarUrl = `https://en.gravatar.com/${hash}.json`;
  const sources: PublicEmailProfileLookup["sources"] = [];
  let profile: PublicEmailProfileLookup["profile"] | undefined;

  try {
    const response = await fetchImpl(gravatarUrl);
    if (response.ok) {
      const data = await response.json() as { entry?: unknown[] };
      const entry = Array.isArray(data.entry) && data.entry[0] && typeof data.entry[0] === "object"
        ? data.entry[0] as Record<string, unknown>
        : undefined;
      profile = entry ? normalizeGravatarProfile(entry) : undefined;
      sources.push({ provider: "gravatar", status: profile ? "found" : "not_found", url: gravatarUrl });
    } else {
      sources.push({ provider: "gravatar", status: response.status === 404 ? "not_found" : "error", url: gravatarUrl, error: `HTTP ${response.status}` });
    }
  } catch (error) {
    sources.push({ provider: "gravatar", status: "error", url: gravatarUrl, error: error instanceof Error ? error.message : String(error) });
  }

  const decisionMakerName = profile?.displayName && looksLikePersonName(profile.displayName) ? profile.displayName : undefined;
  const confidence: PublicEmailProfileLookup["leadHints"]["confidence"] = decisionMakerName ? "high" : profile?.preferredUsername ? "medium" : "low";
  const leadHints = {
    decisionMakerName,
    profileUrl: profile?.profileUrl,
    avatarUrl: profile?.thumbnailUrl ?? `https://www.gravatar.com/avatar/${hash}?s=160&d=404`,
    confidence,
  };
  const nextToolCalls: PublicEmailProfileLookup["nextToolCalls"] = [{
    tool: "arcigy.build_lead_identity_repair_preview",
    payload: {
      sourceName: input.sourceName ?? "public-email-profile",
      leads: [{
        email,
        companyName: input.companyName,
        website: input.website,
        decisionMakerName,
        customFields: {
          public_profile_url: leadHints.profileUrl,
          public_avatar_url: leadHints.avatarUrl,
          public_profile_confidence: confidence,
        },
      }],
    },
    reason: "Pouzi verejne profilove signaly ako doplnok pred Smartlead identity repair a manual review.",
    approvalRequired: false,
  }];

  return {
    mode: "public-email-profile-lookup",
    email,
    hash,
    found: Boolean(profile),
    profile,
    sources,
    leadHints,
    nextToolCalls,
    summary: profile
      ? `Public email profile found for ${email}. Ziadny zapis neprebehol.`
      : `No public email profile found for ${email}. Ziadny zapis neprebehol.`,
  };
}

function normalizeGravatarProfile(entry: Record<string, unknown>): PublicEmailProfileLookup["profile"] {
  return {
    displayName: stringField(entry, "displayName", "name", "formattedName"),
    preferredUsername: stringField(entry, "preferredUsername"),
    profileUrl: stringField(entry, "profileUrl"),
    thumbnailUrl: stringField(entry, "thumbnailUrl"),
    currentLocation: stringField(entry, "currentLocation"),
    aboutMe: stringField(entry, "aboutMe")?.slice(0, 500),
  };
}

function stringField(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function looksLikePersonName(value: string): boolean {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean || clean.length > 80) return false;
  const parts = clean.split(" ").filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;
  return !/(s\.?r\.?o|ltd|studio|team|support|info|office|company|group|marketing|sales)/i.test(clean);
}
