export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString();
}

export function formatDateTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString();
}

export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString();
}
