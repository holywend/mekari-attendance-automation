export function extractAuthToken(cookieHeader: string): string | null {
  const marker = "_session_token=";
  const idx = cookieHeader.indexOf(marker);
  if (idx === -1) return null;
  const after = cookieHeader.slice(idx + marker.length);
  const semi = after.indexOf(";");
  const rawValue = semi === -1 ? after : after.slice(0, semi);
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawValue);
  } catch {
    return null;
  }
  const parts = decoded.split('"');
  if (parts.length < 4) return null;
  const token = parts[3];
  if (!token || token.length < 10) return null;
  return token;
}

export function formatCookieHeader(
  cookies: Array<{ name: string; value: string }>,
): string {
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}
