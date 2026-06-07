import type { ClientNeedSignal, IdentityMatch, LocalPerson } from "./types.ts";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailDomain(email: string): string | null {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at < 1 || at === normalized.length - 1) return null;
  return normalized.slice(at + 1);
}

export function matchLocalIdentity(
  rawEmail: string,
  people: LocalPerson[],
  needSignals: ClientNeedSignal[] = []
): IdentityMatch {
  const email = normalizeEmail(rawEmail);
  const exact = people.find((person) => normalizeEmail(person.primaryEmail) === email) ?? null;

  if (exact) {
    return {
      email,
      person: exact,
      confidence: 0.99,
      reason: "exact_email_match",
      openNeedSignals: openSignalsForPerson(exact.id, needSignals),
    };
  }

  const domain = emailDomain(email);
  const domainMatch =
    domain == null
      ? null
      : people.find((person) => {
          const personDomain = emailDomain(person.primaryEmail);
          return personDomain != null && personDomain === domain && person.kind === "client";
        }) ?? null;

  if (domainMatch) {
    return {
      email,
      person: domainMatch,
      confidence: 0.72,
      reason: "client_domain_match",
      openNeedSignals: openSignalsForPerson(domainMatch.id, needSignals),
    };
  }

  return {
    email,
    person: null,
    confidence: 0,
    reason: "no_local_identity_match",
    openNeedSignals: [],
  };
}

export function buildClientNeedBrief(match: IdentityMatch): string | null {
  if (!match.person || match.openNeedSignals.length === 0) return null;
  const name = match.person.displayName ?? match.person.companyName ?? match.person.primaryEmail;
  const signals = match.openNeedSignals
    .slice(0, 3)
    .map((signal) => signal.summary)
    .join("; ");
  return `${name} má otvorenú požiadavku: ${signals}.`;
}

function openSignalsForPerson(personId: string, signals: ClientNeedSignal[]): ClientNeedSignal[] {
  return signals
    .filter((signal) => signal.personId === personId && signal.status === "new")
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
