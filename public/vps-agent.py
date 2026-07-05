#!/usr/bin/env python3
"""
G1Oeil VPS Metrics Agent v1.0
Expose les metriques CPU / RAM / Disque via HTTP JSON.

Usage:
  python3 vps-agent.py [PORT]      (defaut : 9099)

Installation systemd (demarrage automatique) :
  sudo mkdir -p /opt/g1oeil
  sudo cp vps-agent.py /opt/g1oeil/vps-agent.py
  sudo cp vps-agent.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now vps-agent

Securite (facultatif) :
  - Restreindre l'acces par IP dans le pare-feu : ufw allow from <IP_G1OEIL> to any port 9099
  - Ou lier uniquement a une interface : modifier ("0.0.0.0", PORT) -> ("10.0.0.1", PORT)
"""

import http.server
import json
import os
import socket
import sys
import time

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9099


# ── Mesures systeme ──────────────────────────────────────────────────────────

def _read_cpu_stat():
    with open("/proc/stat") as f:
        parts = f.readline().split()
    # user nice system idle iowait irq softirq
    vals  = list(map(int, parts[1:8]))
    idle  = vals[3] + vals[4]   # idle + iowait
    total = sum(vals)
    return total, idle


def get_cpu(sample_interval=0.5):
    """Pourcentage CPU moyen sur sample_interval secondes."""
    t1, i1 = _read_cpu_stat()
    time.sleep(sample_interval)
    t2, i2 = _read_cpu_stat()
    dt = t2 - t1
    if dt == 0:
        return 0.0
    return round(100.0 * (1.0 - (i2 - i1) / dt), 1)


def get_ram():
    """Utilisation RAM depuis /proc/meminfo."""
    info = {}
    with open("/proc/meminfo") as f:
        for line in f:
            k, _, rest = line.partition(":")
            info[k.strip()] = int(rest.strip().split()[0])   # en kB
    total = info["MemTotal"]
    avail = info.get("MemAvailable", info.get("MemFree", 0))
    used  = total - avail
    return {
        "percent":  round(100.0 * used / total, 1) if total else 0.0,
        "totalGb":  round(total / 1_048_576, 2),
        "usedGb":   round(used  / 1_048_576, 2),
    }


def get_disk(path="/"):
    """Utilisation disque du systeme de fichiers racine."""
    st    = os.statvfs(path)
    total = st.f_blocks * st.f_frsize
    free  = st.f_bfree  * st.f_frsize
    used  = total - free
    return {
        "percent":  round(100.0 * used / total, 1) if total else 0.0,
        "totalGb":  round(total / 1_073_741_824, 2),
        "usedGb":   round(used  / 1_073_741_824, 2),
    }


def get_uptime_days():
    with open("/proc/uptime") as f:
        secs = float(f.read().split()[0])
    return round(secs / 86400, 1)


def get_load1():
    with open("/proc/loadavg") as f:
        return float(f.read().split()[0])


# ── Serveur HTTP ─────────────────────────────────────────────────────────────

class MetricsHandler(http.server.BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0].rstrip("/")
        if path not in ("/metrics", ""):
            self.send_error(404, "Not found — seul /metrics est expose")
            return
        try:
            ram  = get_ram()
            disk = get_disk()
            data = {
                "hostname":   socket.gethostname(),
                "cpu":        get_cpu(),
                "ram":        ram["percent"],
                "disk":       disk["percent"],
                "ramGb":      ram["totalGb"],
                "ramUsedGb":  ram["usedGb"],
                "diskGb":     disk["totalGb"],
                "diskUsedGb": disk["usedGb"],
                "uptimeDays": get_uptime_days(),
                "load1":      get_load1(),
                "ts":         int(time.time() * 1000),
            }
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            self._send_cors_headers()
            self.send_header("Content-Type",   "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            self.send_error(500, str(exc))

    def _send_cors_headers(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, fmt, *args):
        # Desactiver le log HTTP verbeux — commenter pour deboguer
        pass


# ── Point d'entree ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", PORT), MetricsHandler)
    host   = socket.gethostname()
    print(f"[G1Oeil Agent] {host}  ->  http://0.0.0.0:{PORT}/metrics")
    print(f"[G1Oeil Agent] Ctrl+C pour arreter")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[G1Oeil Agent] Arret propre.")
        server.server_close()
