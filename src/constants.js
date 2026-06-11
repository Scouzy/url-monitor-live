import { Clock, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

export const STATUS = {
  PENDING: "pending",
  ONLINE: "online",
  OFFLINE: "offline",
  SLOW: "slow",
};

export const SLOW_THRESHOLD = 2000;
export const MAX_HISTORY = 500;
export const DEFAULT_INTERVAL = 30;
export const STORAGE_KEY = "url-monitor-urls";

export const DEFAULT_URLS = [
  "https://www.google.com",
  "https://www.github.com",
  "https://httpstat.us/200",
  "https://httpstat.us/500",
];

export const STATUS_CONFIG = {
  [STATUS.PENDING]: {
    color: "#6B7280",
    bg: "rgba(107,114,128,0.12)",
    label: "En attente",
    icon: Clock,
  },
  [STATUS.ONLINE]: {
    color: "#34D399",
    bg: "rgba(52,211,153,0.12)",
    label: "En ligne",
    icon: CheckCircle,
  },
  [STATUS.OFFLINE]: {
    color: "#F87171",
    bg: "rgba(248,113,113,0.12)",
    label: "Hors ligne",
    icon: XCircle,
  },
  [STATUS.SLOW]: {
    color: "#FBBF24",
    bg: "rgba(251,191,36,0.12)",
    label: "Lent",
    icon: AlertTriangle,
  },
};

export function getStatus(entry) {
  if (!entry.lastCheck) return STATUS.PENDING;
  if (!entry.isUp) return STATUS.OFFLINE;
  if (entry.responseTime > SLOW_THRESHOLD) return STATUS.SLOW;
  return STATUS.ONLINE;
}

export function formatTime(date) {
  if (!date) return "—";
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
