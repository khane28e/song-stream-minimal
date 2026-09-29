const SEARCH_URL = "https://archive.org/advancedsearch.php";

export interface ArchiveDoc {
  identifier: string;
  title: string;
  creator?: string | string[];
  year?: number;
  date?: string;
  licenseurl?: string | string[];
}

export interface Track {
  name: string; // file name (url-encoded when used in a download url)
  title: string;
  track: number;
  length: number; // seconds, 0 if unknown
  format: string;
  url: string;
}

export interface Album {
  identifier: string;
  title: string;
  creator: string;
  year?: number;
  licenseurl?: string;
  tracks: Track[];
}

const firstOf = (v: unknown): string | undefined => {
  if (Array.isArray(v)) return v[0] as string | undefined;
  return (v as string | undefined) ?? undefined;
};

export const encodeArchivePath = (path: string) =>
  path
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");

const AUDIO_EXT_RE = /\.(mp3|flac|ogg|oga|m4a|wav|aiff?|wma|mp4|64kb\.mp3|vbr\.mp3)$/i;
const EXCLUDE_RE = /(_sample|_chapters|preview|_metadata)/i;

export async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  try {
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } catch (e) {
    if (signal?.aborted) throw e;
    // Network/CORS fallback via r.jina.ai text proxy
    const proxied = `https://r.jina.ai/${url}`;
    const r2 = await fetch(proxied, { signal });
    if (!r2.ok) throw e instanceof Error ? e : new Error(String(r2.status));
    const text = await r2.text();
    return JSON.parse(text);
    // unreachable: JSON.parse throws on failure
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

export interface SearchResponse {
  numFound: number;
  start: number;
  docs: ArchiveDoc[];
}

export async function searchArchive(
  query: string,
  page = 1,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const params = new URLSearchParams();
  params.set("q", `${query} AND mediatype:(audio) AND format:(MP3)`);
  params.append("fl[]", "identifier");
  params.append("fl[]", "title");
  params.append("fl[]", "creator");
  params.append("fl[]", "year");
  params.append("fl[]", "date");
  params.append("fl[]", "licenseurl");
  params.set("sort[]", "downloads desc");
  params.set("page", String(page));
  params.set("rows", "50");
  params.set("output", "json");

  const url = `${SEARCH_URL}?${params.toString()}`;
  const data = await fetchJson(url, signal);
  if (!isRecord(data) || !isRecord(data.response)) {
    throw new Error("Unexpected search response");
  }
  const response = data.response as {
    numFound: number;
    start: number;
    docs: Record<string, unknown>[];
  };
  return {
    numFound: response.numFound,
    start: response.start,
    docs: (response.docs || []).map((d) => ({
      identifier: String(d.identifier ?? ""),
      title: String(d.title ?? "Untitled"),
      creator: firstOf(d.creator) ?? "",
      year: typeof d.year === "number" ? d.year : undefined,
      date: firstOf(d.date),
      licenseurl: firstOf(d.licenseurl),
    })),
  };
}

export function pickTracks(files: Array<Record<string, unknown>>): Track[] {
  const audio = files
    .filter(
      (f) =>
        typeof f.name === "string" &&
        AUDIO_EXT_RE.test(f.name) &&
        !EXCLUDE_RE.test(f.name),
    )
    .map((f) => {
      const name = f.name as string;
      const lengthSec = parseLength(f.length);
      return {
        name,
        title: prettifyTitle(name),
        track: parseTrackNum(f.track),
        length: lengthSec,
        format: String(f.format ?? "MP3"),
        url: "",
      };
    });

  // Prefer original/unique files: dedupe by derived track number when present
  const origOnly = audio.filter((f) => !VBR_RE.test(f.name));
  const use = origOnly.length ? origOnly : audio;
  const seen = new Map<string, Track>();
  const out: Track[] = [];
  for (const t of use) {
    const key = t.track > 0 ? `t${t.track}` : `n:${t.title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.set(key, t);
    out.push(t);
  }
  return out.sort((a, b) =>
    a.track && b.track ? a.track - b.track : a.title.localeCompare(b.title),
  );
}

const VBR_RE = /vbr|64kb|128kb/i;

function parseLength(v: unknown): number {
  // "3:42" or "231.35" or "231"
  if (typeof v === "string" && v.includes(":")) {
    const parts = v.split(":").map((p) => parseInt(p, 10));
    if (parts.some((p) => Number.isNaN(p))) return 0;
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }
  const n = parseFloat(String(v ?? ""));
  return Number.isNaN(n) ? 0 : Math.round(n);
}

function parseTrackNum(v: unknown): number {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isNaN(n) ? 0 : n;
}

function prettifyTitle(name: string): string {
  let t = name.replace(/\.[^.]+$/, ""); // strip extension
  t = t.replace(/^\d{1,3}\s*[-–._]+\s*/, ""); // strip leading track numbers
  t = t.replace(/_/g, " ").trim();
  return t || name;
}

export async function fetchAlbum(
  identifier: string,
  signal?: AbortSignal,
): Promise<Album> {
  const meta = await fetchJson(
    `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
    signal,
  );
  if (!isRecord(meta) || !isRecord(meta.metadata) || !Array.isArray(meta.files)) {
    throw new Error("Unexpected metadata response");
  }
  const m = meta.metadata as Record<string, unknown>;
  const base = `https://archive.org/download/${encodeArchivePath(identifier)}`;
  const tracks = pickTracks(meta.files as Array<Record<string, unknown>>).map(
    (t) => ({ ...t, url: `${base}/${encodeArchivePath(t.name)}` }),
  );
  return {
    identifier,
    title: String(m.title ?? "Untitled"),
    creator: firstOf(m.creator) ?? "",
    year: typeof m.year === "number" ? m.year : undefined,
    licenseurl: firstOf(m.licenseurl),
    tracks,
  };
}
