import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Download,
  Loader2,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchAlbum,
  searchArchive,
  type Album,
  type ArchiveDoc,
} from "@/lib/archive";
import { formatDuration } from "@/lib/format";
import {
  playTrack,
  toggle,
  seek,
  nextTrack,
  prevTrack,
  usePlayer,
  type PlayerTrack,
} from "@/lib/player";

const SUGGESTIONS = [
  "Miles Davis",
  "beethoven symphony",
  "guitar blues",
  "lofi piano",
  "chopin nocturnes",
  "jazz 1959",
];

interface ResultRowProps {
  doc: ArchiveDoc;
  album: Album | null;
  expanded: boolean;
  loading: boolean;
  failed: boolean;
  onToggle: () => void;
}

function PlayerBar() {
  const player = usePlayer();
  const t = player.current;
  if (!t) return null;
  const progress = player.duration > 0 ? (player.time / player.duration) * 100 : 0;

  return (
    <motion.div
      initial={{ y: 80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-3 sm:gap-6">
        <div className="hidden size-10 shrink-0 overflow-hidden rounded-md border border-border sm:block">
          {t.cover ? (
            <img src={t.cover} alt="" className="size-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <p className="truncate text-sm font-medium">{t.title}</p>
            <p className="hidden truncate text-xs text-muted-foreground sm:block">
              {t.creator}
            </p>
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <span className="w-9 text-right text-[10px] tabular-nums text-muted-foreground">
              {formatDuration(player.time)}
            </span>
            <div className="relative h-1 flex-1 rounded-full bg-muted">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-foreground"
                style={{ width: `${progress}%` }}
              />
              <input
                type="range"
                min={0}
                max={player.duration || 1}
                step={1}
                value={player.time}
                onChange={(e) => seek(parseFloat(e.target.value))}
                aria-label="Seek"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </div>
            <span className="w-9 text-[10px] tabular-nums text-muted-foreground">
              {formatDuration(player.duration)}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous track"
            onClick={prevTrack}
          >
            <SkipBack className="size-4" />
          </Button>
          <Button
            size="icon"
            aria-label={player.isPlaying ? "Pause" : "Play"}
            onClick={toggle}
            className="rounded-full"
          >
            {player.isPlaying ? (
              <Pause className="size-4" />
            ) : (
              <Play className="size-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next track"
            onClick={nextTrack}
          >
            <SkipForward className="size-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function TrackRow({
  track,
  index,
  album,
  queue,
}: {
  track: Album["tracks"][number];
  index: number;
  album: Album;
  queue: PlayerTrack[];
}) {
  const player = usePlayer();
  const active =
    player.current?.albumIdentifier === album.identifier &&
    player.current?.name === track.name;

  const build = (): PlayerTrack => ({
    ...track,
    albumTitle: album.title,
    albumIdentifier: album.identifier,
    creator: album.creator,
    cover: `https://archive.org/services/img/${encodeURIComponent(album.identifier)}`,
  });

  return (
    <div
      className={`group flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
        active ? "bg-muted" : "hover:bg-muted/60"
      }`}
    >
      <button
        type="button"
        onClick={() => playTrack(build(), queue)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {track.track > 0 ? track.track : index + 1}
        </span>
        <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
          {active && player.isPlaying ? (
            <Pause className="size-3.5" />
          ) : (
            <Play className="size-3.5" />
          )}
        </span>
        <span className={`min-w-0 flex-1 truncate ${active ? "font-medium" : ""}`}>
          {track.title}
        </span>
      </button>
      <span className="hidden w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">
        {formatDuration(track.length)}
      </span>
      <a
        href={track.url}
        download
        target="_blank"
        rel="noreferrer"
        aria-label={`Download ${track.title}`}
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        <Download className="size-3.5" />
      </a>
    </div>
  );
}

function ResultRow({ doc, album, expanded, loading, failed, onToggle }: ResultRowProps) {
  const queue: PlayerTrack[] = album
    ? album.tracks.map((track) => ({
        ...track,
        albumTitle: album.title,
        albumIdentifier: album.identifier,
        creator: album.creator,
        cover: `https://archive.org/services/img/${encodeURIComponent(album.identifier)}`,
      }))
    : [];

  return (
    <div className="border-b border-border/60 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full items-center gap-4 px-3 py-4 text-left sm:px-4"
      >
        <div className="relative size-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
          <img
            src={`https://archive.org/services/img/${encodeURIComponent(doc.identifier)}`}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{doc.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[doc.creator, doc.year].filter(Boolean).join(" · ") || "Unknown artist"}
          </p>
        </div>
        <span className="hidden shrink-0 text-xs text-muted-foreground md:block">
          {loading
            ? "loading…"
            : album
              ? `${album.tracks.length} tracks`
              : failed
                ? "unavailable"
                : ""}
        </span>
      </button>

      {expanded && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.25 }}
          className="overflow-hidden"
        >
          <div className="mx-3 mb-4 border border-border/60 rounded-lg sm:mx-4">
            {loading && (
              <div className="flex items-center gap-3 px-4 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Loading tracks…
              </div>
            )}
            {failed && (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                Couldn’t load this item’s tracks. Try another result.
              </div>
            )}
            {album &&
              (album.tracks.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  No downloadable MP3s in this item.
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {album.tracks.map((track, i) => (
                    <TrackRow
                      key={track.name}
                      track={track}
                      index={i}
                      album={album}
                      queue={queue}
                    />
                  ))}
                </div>
              ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default function Landing() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [docs, setDocs] = useState<ArchiveDoc[] | null>(null);
  const [numFound, setNumFound] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [albums, setAlbums] = useState<Record<string, Album>>({});
  const [albumState, setAlbumState] = useState<
    Record<string, "loading" | "ready" | "failed">
  >({});
  const albumCache = useRef<Record<string, Album>>({});
  const resultsRef = useRef<HTMLDivElement>(null);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setSubmitted(trimmed);
    setLoading(true);
    setError(null);
    setDocs(null);
    setExpandedId(null);
    try {
      const res = await searchArchive(trimmed, 1);
      setDocs(res.docs);
      setNumFound(res.numFound);
    } catch {
      setError("Search failed. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAlbum = useCallback(async (identifier: string) => {
    const cached = albumCache.current[identifier];
    if (cached) {
      setAlbums((m) => ({ ...m, [identifier]: cached }));
      setAlbumState((s) => ({ ...s, [identifier]: "ready" }));
      return;
    }
    setAlbumState((s) => ({ ...s, [identifier]: "loading" }));
    try {
      const album = await fetchAlbum(identifier);
      albumCache.current[identifier] = album;
      setAlbums((m) => ({ ...m, [identifier]: album }));
      setAlbumState((s) => ({ ...s, [identifier]: "ready" }));
    } catch {
      setAlbumState((s) => ({ ...s, [identifier]: "failed" }));
    }
  }, []);

  const toggleExpand = (identifier: string) => {
    setExpandedId((cur) => (cur === identifier ? null : identifier));
    if (expandedId !== identifier) void loadAlbum(identifier);
  };

  useEffect(() => {
    if (docs && docs.length > 0 && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [docs]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <a href="/" className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-foreground">
              <Play className="size-3 fill-background text-background" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Song Stream</span>
          </a>
          <span className="text-xs text-muted-foreground">
            Free music · no account needed
          </span>
        </div>
      </header>

      <section className="flex min-h-[62vh] flex-col items-center justify-center px-4 pt-24 pb-16 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-4xl font-semibold tracking-tight sm:text-6xl"
        >
          Search music.
          <br />
          <span className="text-muted-foreground">Download it free.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-5 max-w-md text-sm leading-6 text-muted-foreground"
        >
          A calm, uncluttered way to discover Creative Commons and public-domain
          recordings — preview a track in one click, then keep the MP3 for
          good.
        </motion.p>

        <motion.form
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          onSubmit={(e) => {
            e.preventDefault();
            void runSearch(query);
          }}
          className="mt-10 w-full max-w-xl"
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search songs, artists, albums…"
              className="h-14 rounded-full border-border pl-11 pr-12 text-base shadow-none focus-visible:ring-1 focus-visible:ring-foreground/30"
              aria-label="Search music"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </motion.form>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQuery(s);
                void runSearch(s);
              }}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <main className="mx-auto w-full max-w-3xl px-4 pb-40" ref={resultsRef}>
        {submitted && (
          <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
            {loading
              ? "searching…"
              : error
                ? "—"
                : `${numFound.toLocaleString()} results for “${submitted}”`}
          </p>
        )}

        {loading && (
          <div className="border-t border-border/60">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 border-b border-border/60 px-3 py-4"
              >
                <Skeleton className="size-14 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="rounded-lg border border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {error}
          </div>
        )}

        {!loading && !error && docs && docs.length === 0 && (
          <div className="rounded-lg border border-border px-4 py-12 text-center">
            <p className="text-sm">No results for “{submitted}”.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try a broader term — an artist, genre, or instrument.
            </p>
          </div>
        )}

        {!loading && !error && docs && docs.length > 0 && (
          <div className="border-t border-border/60">
            {docs.map((doc) => (
              <ResultRow
                key={doc.identifier}
                doc={doc}
                album={albums[doc.identifier] ?? null}
                expanded={expandedId === doc.identifier}
                loading={albumState[doc.identifier] === "loading"}
                failed={albumState[doc.identifier] === "failed"}
                onToggle={() => toggleExpand(doc.identifier)}
              />
            ))}
          </div>
        )}

        {!submitted && !loading && (
          <div className="mt-24 grid gap-10 sm:grid-cols-3">
            {[                {
                  n: "01",
                  t: "Search anything",
                  d: "From Beethoven to bedroom blues — query thousands of freely licensed recordings across every genre.",
                },
                {
                  n: "02",
                  t: "Preview before you commit",
                  d: "Click any track to hear it right here. No account, no redirects, no interruptions.",
                },
                {
                  n: "03",
                  t: "Keep it for good",
                  d: "Every song comes with a one-click MP3 download — yours to keep, share, and remix.",
                },
            ].map((f) => (
              <div key={f.n}>
                <p className="text-xs tabular-nums text-muted-foreground">{f.n}</p>
                <p className="mt-2 text-sm font-medium">{f.t}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-2 px-4 py-8 text-xs text-muted-foreground sm:flex-row">
          <span>Song Stream — free music, minus the noise.</span>
          <span>
            Audio from{" "}
            <a
              href="https://archive.org/details/audio"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              archive.org
            </a>{" "}
            under Creative Commons &amp; public-domain licenses.
          </span>
        </div>
      </footer>

      <PlayerBar />
    </div>
  );
}
