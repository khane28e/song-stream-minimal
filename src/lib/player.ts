import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/format";
import type { Track } from "@/lib/archive";

export interface PlayerTrack extends Track {
  albumTitle: string;
  albumIdentifier: string;
  creator: string;
  cover?: string;
}

interface PlayerState {
  current: PlayerTrack | null;
  isPlaying: boolean;
  time: number;
  duration: number;
  queue: PlayerTrack[];
  error: string | null;
}

type Listener = (s: PlayerState) => void;

let audio: HTMLAudioElement | null = null;

const state: PlayerState = {
  current: null,
  isPlaying: false,
  time: 0,
  duration: 0,
  queue: [],
  error: null,
};

const listeners = new Set<Listener>();

function emit() {
  const snapshot = { ...state };
  listeners.forEach((l) => l(snapshot));
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";

  audio.addEventListener("timeupdate", () => {
    state.time = audio!.currentTime;
    state.duration = Number.isFinite(audio!.duration)
      ? audio!.duration
      : state.duration;
    emit();
  });

  audio.addEventListener("loadedmetadata", () => {
    state.duration = audio!.duration;
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
  const a = ensureAudio();
  state.error = null;
  state.queue = queue;
  state.current = track;
  state.time = 0;
  state.duration = track.length || 0;
  state.isPlaying = true;
  a.src = track.url;
  a.currentTime = 0;
  a.play().catch(() => {
    state.isPlaying = false;
    emit();
  });
  emit();
}

export function toggle() {
  const a = ensureAudio();
  if (!state.current) return;
  if (state.isPlaying) {
    a.pause();
    state.isPlaying = false;
  } else {
    a.play().catch(() => {
      state.isPlaying = false;
    });
    state.isPlaying = true;
  }
  emit();
}

export function seek(t: number) {
  if (audio && state.current) {
    audio.currentTime = t;
    state.time = t;
    emit();
  }
}

export function nextTrack() {
  const idx = state.queue.findIndex((t) => t.url === state.current?.url);
  const next = state.queue[idx + 1];
  if (next) playTrack(next, state.queue);
}

export function prevTrack() {
  const idx = state.queue.findIndex((t) => t.url === state.current?.url);
  if (idx > 0) playTrack(state.queue[idx - 1], state.queue);
  else if (audio) {
    audio.currentTime = 0;
    state.time = 0;
    emit();
  }
}

export function usePlayer(): PlayerState {
  const [s, setS] = useState<PlayerState>(state);
  useEffect(() => {
    listeners.add(setS);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

export { formatDuration as fmtTime };
