import type { AuthUser } from "./types";

type GoogleIdTokenPayload = {
  iss: string;
  aud: string;
  sub: string;
  email: string;
  email_verified: boolean;
  name: string;
  given_name?: string;
  family_name?: string;
  picture: string;
  exp: number;
};

type GoogleJwtHeader = { alg: string; kid: string; typ?: string };

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ALLOWED_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const JWKS_TTL_MS = 60 * 60 * 1000;

function base64urlToUint8Array(b64url: string): Uint8Array<ArrayBuffer> {
  const normalized = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64urlDecodeToString(b64url: string): string {
  return new TextDecoder().decode(base64urlToUint8Array(b64url));
}

type GoogleJwk = JsonWebKey & { kid: string };

let jwksCache: { at: number; keys: GoogleJwk[] } | null = null;

async function getGoogleJwks(): Promise<GoogleJwk[]> {
  if (jwksCache && Date.now() - jwksCache.at < JWKS_TTL_MS) return jwksCache.keys;
  const res = await fetch(JWKS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch Google JWKS: ${res.status}`);
  const json: { keys: GoogleJwk[] } = await res.json();
  jwksCache = { at: Date.now(), keys: json.keys };
  return json.keys;
}

async function verifySignature(
  headerB64: string,
  payloadB64: string,
  sigB64: string,
  kid: string,
): Promise<boolean> {
  const keys = await getGoogleJwks();
  const jwk = keys.find((k) => k.kid === kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64urlToUint8Array(sigB64);
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, data);
}

/**
 * Verifies a Google Sign-In ID token — RS256 signature against Google's live
 * JWKS plus issuer/audience/expiry checks — before trusting any claims.
 * There is no backend here to do this server-side, so it happens client-side
 * against Google's public keys. Returns null on any failure.
 */
export async function decodeGoogleCredential(
  credential: string,
  expectedAudience?: string,
): Promise<AuthUser | null> {
  try {
    const [headerB64, payloadB64, sigB64] = credential.split(".");
    if (!headerB64 || !payloadB64 || !sigB64) return null;

    const header = JSON.parse(base64urlDecodeToString(headerB64)) as GoogleJwtHeader;
    if (header.alg !== "RS256" || !header.kid) return null;

    const payload = JSON.parse(base64urlDecodeToString(payloadB64)) as GoogleIdTokenPayload;
    if (!payload.sub || !payload.email) return null;
    if (!ALLOWED_ISSUERS.has(payload.iss)) return null;
    if (expectedAudience && payload.aud !== expectedAudience) return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) return null;

    const verified = await verifySignature(headerB64, payloadB64, sigB64, header.kid);
    if (!verified) return null;

    return {
      sub: payload.sub,
      email: payload.email,
      name: payload.name ?? payload.email.split("@")[0],
      picture: payload.picture ?? "",
      givenName: payload.given_name,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}
