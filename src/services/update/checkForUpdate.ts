export interface UpdateManifest {
  versionName: string;
  versionCode: number;
  sha256: string;
  url: string;
  notes: string;
}

export const MANIFEST_URL =
  'https://raw.githubusercontent.com/DenysYakubets/FocusKid/main/update-manifest.json';

export function isNewerVersion(manifestCode: number, currentCode: number): boolean {
  return manifestCode > currentCode;
}

export function parseUpdateManifest(raw: string): UpdateManifest | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    if (
      typeof value.versionName !== 'string' ||
      typeof value.versionCode !== 'number' ||
      !Number.isInteger(value.versionCode) ||
      value.versionCode <= 0 ||
      typeof value.sha256 !== 'string' ||
      !/^[a-fA-F0-9]{64}$/.test(value.sha256) ||
      typeof value.url !== 'string' ||
      typeof value.notes !== 'string'
    ) return null;
    return {
      versionName: value.versionName,
      versionCode: value.versionCode,
      sha256: value.sha256,
      url: value.url,
      notes: value.notes,
    };
  } catch {
    return null;
  }
}
