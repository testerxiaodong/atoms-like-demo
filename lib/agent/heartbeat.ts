// Blank NDJSON lines keep idle proxy connections active without inventing agent progress.
export function startHeartbeat(
  write: () => void,
  disconnected: () => void,
  intervalMs = 10_000,
) {
  const timer = setInterval(() => {
    try {
      write();
    } catch {
      clearInterval(timer);
      disconnected();
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
