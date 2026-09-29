import { useSyncExternalStore } from "react";
import { formatDuration } from "@/lib/format";
import type { Track } from "@/lib/archive";

export interface PlayerTrack extends Track {
  albumTitle: string;
  albumIdentifier: string;
  creator: string;
  cover?: string;
}

export interface PlayerState {
  current: PlayerTrack | null;
  isPlaying: boolean;
  time: number;
  duration: number;
  queue: PlayerTrack[];
  error: string | null;
}

type Listener = () => void;

let audio: HTMLAudioElement | null = null;

const state: PlayerState = {
  current: null,
  isPlaying: false,
  time: 0,
  duration: 0,
  queue: [],
  error: null,
};

let snapshot: PlayerState = { ...state };

const listeners = new Set<Listener>();

function getSnapshot(): PlayerState {
  return snapshot;
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  snapshot = { ...state };
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Never let one bad subscriber break the store.
    }
  }
}

function ensureAudio(): HTMLAudioElement | null {
  try {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = "auto";
  } catch {
    // Media element unavailable in this runtime — degrade gracefully.
    audio = null;
    return null;
  }

  audio.addEventListener("timeupdate", () => {
    if (!audio) return;
    state.time = audio.currentTime;
    if (Number.isFinite(audio.duration)) state.duration = audio.duration;
    emit();
  });

  audio.addEventListener("loadedmetadata", () => {
    if (!audio || !Number.isFinite(audio.duration)) return;
    state.duration = audio.duration;
    emit();
  });

  audio.addEventListener("ended", () => {
    const idx = state.queue.findIndex(
      (t) => t.url === state.current?.url && t.name === state.current.name,
    );
    const next = idx >= 0 ? state.queue[idx + 1] : undefined;
    if (next) {
      playTrack(next, state.queue);
    } else {
      state.isPlaying = false;
      state.time = 0;
      emit();
    }
  });

  audio.addEventListener("error", () => {
    state.isPlaying = false;
    state.error = "This track could not be played. Try another or download it.";
    emit();
  });

  return audio;
}

export function playTrack(track: PlayerTrack, queue: PlayerTrack[]) {
  state.error = null;
  state.queue = queue;
  state.current = track;
  state.time = 0;
  state.duration = track.length || 0;
  state.isPlaying = true;
  emit();

  const a = ensureAudio();
  if (!a) {
    state.isPlaying = false;
    state.error = "Playback is not supported in this browser.";
    emit();
    return;
  }
  a.src = track.url;
  try {
    a.currentTime = 0;
  } catch {
    // Not seekable before metadata loads; safe to ignore.
  }
  a.play().catch(() => {
    state.isPlaying = false;
    emit();
  });
}

export function toggle() {
  if (!state.current) return;
  const a = ensureAudio();
  if (!a) return;
  if (state.isPlaying) {
    a.pause();
    state.isPlaying = false;
  } else {
    a.play().catch(() => {
      state.isPlaying = false;
      emit();
    });
    state.isPlaying = true;
  }
  emit();
}

export function seek(t: number) {
  if (!audio || !state.current) return;
  try {
    audio.currentTime = t;
    state.time = t;
    emit();
  } catch {
    // Seek before metadata is ready; ignore.
  }
}

export function nextTrack() {
  const idx = state.queue.findIndex((t) => t.url === state.current?.url);
  const next = state.queue[idx + 1];
  if (next) playTrack(next, state.queue);
}

export function prevTrack() {
  const idx = state.queue.findIndex((t) => t.url === state.current?.url);
  if (idx > 0) {
    playTrack(state.queue[idx - 1], state.queue);
  } else if (audio) {
    try {
      audio.currentTime = 0;
      state.time = 0;
      emit();
    } catch {
      // Ignore.
    }
  }
}

export function usePlayer(): PlayerState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export { formatDuration as fmtTime };
