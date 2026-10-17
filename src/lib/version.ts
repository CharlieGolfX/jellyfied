function parse(version: string | null | undefined): { parts: number[]; pre: boolean } | null {
  const match = /^v?(\d+(?:\.\d+)*)(-.+)?$/i.exec((version ?? '').trim());
  if (!match) return null;
  return { parts: match[1].split('.').map(Number), pre: Boolean(match[2]) };
}

/** Whether `candidate` is a later release than `current`: "v12.2" > "10.11.11", "1.5.0-rc1" < "1.5.0". */
export function isNewerVersion(candidate: string | null | undefined, current: string | null | undefined): boolean {
  const a = parse(candidate);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.parts.length, b.parts.length); i++) {
    const diff = (a.parts[i] ?? 0) - (b.parts[i] ?? 0);
    if (diff) return diff > 0;
  }
  // Same numbers: only a release is newer than its own pre-release.
  return b.pre && !a.pre;
}
