/**
 * Tracks the last successful data sync timestamp for offline UI labels.
 */

type Listener = (at: number | null) => void;

let lastSyncedAt: number | null = null;
const listeners = new Set<Listener>();

export function getLastSyncedAt(): number | null {
  return lastSyncedAt;
}

export function markDataSynced(at: number = Date.now()): void {
  lastSyncedAt = at;
  listeners.forEach((listener) => {
    listener(lastSyncedAt);
  });
}

export function subscribeLastSynced(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
