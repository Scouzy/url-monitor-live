#!/usr/bin/env python3
"""
G1Oeil VPS Agent - Linux v2.0
Metriques: CPU / RAM / Swap / Disk / Reseau / Processus / Repertoires
Aucune dependance externe (stdlib uniquement).

Usage:
  python3 vps-agent-linux.py [PORT]          (defaut: 9099)
  python3 vps-agent-linux.py 9099 /var/log /home /opt

Installation systemd rapide:
  sudo mkdir -p /opt/g1oeil
  sudo cp vps-agent-linux.py /opt/g1oeil/
  sudo cp vps-agent.service  /etc/systemd/system/
  sudo systemctl daemon-reload && sudo systemctl enable --now g1oeil-agent

Securite:
  ufw allow from <IP_G1OEIL> to any port 9099
"""

import http.server
import json
import os
import re
import socket
import sys
import threading
import time

# ── Configuration ────────────────────────────────────────────────────────────

PORT       = int(sys.argv[1]) if len(sys.argv) > 1 else 9099
WATCH_DIRS = sys.argv[2:] if len(sys.argv) > 2 else ["/var/log", "/home", "/tmp", "/opt", "/var/www"]
CACHE_TTL  = 10   # secondes : on ne recalcule les metriques que si le cache est expire
DIR_MAX_DEPTH = 2  # profondeur max pour le calcul de taille (performance)
TOP_PROC   = 5     # nombre de processus a lister


# ── Etat interne (cache + deltas reseau) ─────────────────────────────────────

_cache_lock   = threading.Lock()
_last_metrics = None
_last_ts      = 0.0
_net_prev     = {}   # { iface: (rx_bytes, tx_bytes, ts) }
_cpu_prev     = {}   # { "total": (total, idle) }


# ── Lectures /proc ────────────────────────────────────────────────────────────

def _readlines(path):
    with open(path, "r", errors="replace") as f:
        return f.readlines()

def _readline(path):
    with open(path, "r", errors="replace") as f:
        return f.readline()


def read_cpu():
    """Retourne (total_jiffies, idle_jiffies) pour le CPU global."""
    parts = _readline("/proc/stat").split()
    vals  = list(map(int, parts[1:8]))
    idle  = vals[3] + vals[4]
    return sum(vals), idle


def get_cpu_percent():
    global _cpu_prev
    t2, i2 = read_cpu()
    result  = 0.0
    prev    = _cpu_prev.get("total")
    if prev:
        t1, i1 = prev
        dt = t2 - t1
        result = round(100.0 * (1.0 - (i2 - i1) / dt), 1) if dt > 0 else 0.0
    _cpu_prev["total"] = (t2, i2)
    return result


def get_load():
    parts = _readline("/proc/loadavg").split()
    return float(parts[0]), float(parts[1]), float(parts[2])


def get_cpu_count():
    count = 0
    for line in _readlines("/proc/cpuinfo"):
        if line.startswith("processor"):
            count += 1
    return count or 1


def get_ram():
    info = {}
    for line in _readlines("/proc/meminfo"):
        k, _, v = line.partition(":")
        try:
            info[k.strip()] = int(v.strip().split()[0])
        except Exception:
            pass
    total   = info.get("MemTotal", 1)
    avail   = info.get("MemAvailable", info.get("MemFree", 0))
    cached  = info.get("Cached", 0) + info.get("Buffers", 0)
    used    = total - avail
    sw_tot  = info.get("SwapTotal", 0)
    sw_free = info.get("SwapFree", 0)
    return {
        "percent":  round(100.0 * used / total, 1),
        "totalGb":  round(total       / 1_048_576, 2),
        "usedGb":   round(used        / 1_048_576, 2),
        "freeGb":   round(avail       / 1_048_576, 2),
        "cachedGb": round(cached      / 1_048_576, 2),
        "swapTotalGb": round(sw_tot   / 1_048_576, 2),
        "swapUsedGb":  round((sw_tot - sw_free) / 1_048_576, 2),
        "swapPercent": round(100.0 * (sw_tot - sw_free) / sw_tot, 1) if sw_tot else 0.0,
    }


def get_disks():
    """Tous les points de montage non virtuels."""
    skip_types = {"tmpfs", "devtmpfs", "sysfs", "proc", "cgroup", "cgroup2",
                  "pstore", "devpts", "mqueue", "hugetlbfs", "securityfs",
                  "configfs", "debugfs", "tracefs", "fusectl"}
    mounts = []
    try:
        for line in _readlines("/proc/mounts"):
            parts = line.split()
            if len(parts) < 3:
                continue
            dev, mount, fstype = parts[0], parts[1], parts[2]
            if fstype in skip_types or mount.startswith("/sys") or mount.startswith("/proc"):
                continue
            try:
                st     = os.statvfs(mount)
                total  = st.f_blocks * st.f_frsize
                free   = st.f_bfree  * st.f_frsize
                used   = total - free
                if total == 0:
                    continue
                mounts.append({
                    "mount":    mount,
                    "device":   dev,
                    "fstype":   fstype,
                    "totalGb":  round(total / 1_073_741_824, 2),
                    "usedGb":   round(used  / 1_073_741_824, 2),
                    "freeGb":   round(free  / 1_073_741_824, 2),
                    "percent":  round(100.0 * used / total, 1),
                })
            except Exception:
                pass
    except Exception:
        pass
    # Deduplication par device (garder le premier montage)
    seen = set()
    result = []
    for m in mounts:
        key = (m["device"], m["totalGb"])
        if key not in seen:
            seen.add(key)
            result.append(m)
    return result


def get_network():
    """Delta octets/s depuis le dernier appel."""
    global _net_prev
    now   = time.monotonic()
    ifaces = {}
    try:
        for line in _readlines("/proc/net/dev"):
            line = line.strip()
            if ":" not in line:
                continue
            iface, _, data = line.partition(":")
            iface = iface.strip()
            if iface in ("lo",):
                continue
            cols = data.split()
            rx = int(cols[0])
            tx = int(cols[8])
            prev = _net_prev.get(iface)
            if prev:
                dt = now - prev[2]
                rx_s = round((rx - prev[0]) / dt / 1024, 1) if dt > 0 else 0.0  # KB/s
                tx_s = round((tx - prev[1]) / dt / 1024, 1) if dt > 0 else 0.0
            else:
                rx_s = tx_s = 0.0
            _net_prev[iface] = (rx, tx, now)
            ifaces[iface] = {
                "rxKbps": max(0.0, rx_s),
                "txKbps": max(0.0, tx_s),
                "rxTotalMb": round(rx / 1_048_576, 1),
                "txTotalMb": round(tx / 1_048_576, 1),
            }
    except Exception:
        pass
    return ifaces


def get_processes():
    """Top N processus par usage CPU (lecture /proc/<pid>/stat)."""
    procs = []
    try:
        for pid in os.listdir("/proc"):
            if not pid.isdigit():
                continue
            try:
                with open(f"/proc/{pid}/stat") as f:
                    stat = f.read().split()
                name = stat[1].strip("()")
                utime, stime = int(stat[13]), int(stat[14])
                cpu_ticks = utime + stime

                with open(f"/proc/{pid}/status") as f:
                    status = {}
                    for line in f:
                        k, _, v = line.partition(":")
                        status[k.strip()] = v.strip()
                vmrss_kb = int(status.get("VmRSS", "0 kB").split()[0])
                procs.append({
                    "pid":    int(pid),
                    "name":   name,
                    "cpuT":   cpu_ticks,
                    "memMb":  round(vmrss_kb / 1024, 1),
                })
            except Exception:
                pass
        procs.sort(key=lambda p: p["cpuT"], reverse=True)
        for p in procs:
            del p["cpuT"]
    except Exception:
        pass
    return procs[:TOP_PROC]


def _dir_size(path, depth=0):
    """Taille totale d'un repertoire (rapide, pas de subprocess)."""
    total = 0
    try:
        with os.scandir(path) as it:
            for entry in it:
                try:
                    if entry.is_file(follow_symlinks=False):
                        total += entry.stat(follow_symlinks=False).st_size
                    elif entry.is_dir(follow_symlinks=False) and depth < DIR_MAX_DEPTH:
                        total += _dir_size(entry.path, depth + 1)
                except Exception:
                    pass
    except Exception:
        pass
    return total


def get_directory_sizes():
    result = []
    for path in WATCH_DIRS:
        if not os.path.isdir(path):
            continue
        size_bytes = _dir_size(path)
        result.append({
            "path":  path,
            "sizeMb": round(size_bytes / 1_048_576, 1),
            "sizeGb": round(size_bytes / 1_073_741_824, 3),
        })
    return result


def get_os_info():
    info = {}
    try:
        for line in _readlines("/etc/os-release"):
            k, _, v = line.partition("=")
            info[k.strip()] = v.strip().strip('"')
    except Exception:
        pass
    return {
        "name":    info.get("PRETTY_NAME", info.get("NAME", "Linux")),
        "version": info.get("VERSION_ID", ""),
        "id":      info.get("ID", "linux"),
    }


def get_uptime_days():
    return round(float(_readline("/proc/uptime").split()[0]) / 86400, 2)


# ── Collecte principale (avec cache) ─────────────────────────────────────────

def collect():
    global _last_metrics, _last_ts
    now = time.monotonic()
    with _cache_lock:
        if _last_metrics and (now - _last_ts) < CACHE_TTL:
            return _last_metrics
    # Lecture hors lock pour ne pas bloquer longtemps
    try:
        cpu     = get_cpu_percent()
        load    = get_load()
        ram     = get_ram()
        disks   = get_disks()
        network = get_network()
        procs   = get_processes()
        dirs    = get_directory_sizes()
        os_info = get_os_info()
        uptime  = get_uptime_days()
        cores   = get_cpu_count()

        # Metrique "disk" principale = partition racine
        root = next((d for d in disks if d["mount"] == "/"), disks[0] if disks else {})

        data = {
            "hostname":   socket.gethostname(),
            "os":         os_info,
            "agentType":  "linux",
            "cpu":        cpu,
            "cpuCores":   cores,
            "load1":      load[0],
            "load5":      load[1],
            "load15":     load[2],
            "ram":        ram["percent"],
            "disk":       root.get("percent", 0),
            "ramGb":      ram["totalGb"],
            "ramUsedGb":  ram["usedGb"],
            "diskGb":     root.get("totalGb", 0),
            "diskUsedGb": root.get("usedGb", 0),
            "uptimeDays": uptime,
            "disks":      disks,
            "network":    network,
            "processes":  procs,
            "directories": dirs,
            "ram_detail": ram,
            "ts":         int(time.time() * 1000),
        }
    except Exception as exc:
        data = {"error": str(exc), "ts": int(time.time() * 1000)}

    with _cache_lock:
        _last_metrics = data
        _last_ts      = time.monotonic()
    return data


# ── Serveur HTTP ─────────────────────────────────────────────────────────────

class Handler(http.server.BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self._headers(200)
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0].rstrip("/")
        if path not in ("/metrics", ""):
            self.send_error(404)
            return
        try:
            body = json.dumps(collect(), ensure_ascii=False).encode("utf-8")
            self._headers(200)
            self.send_header("Content-Type",   "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            self.send_error(500, str(exc))

    def _headers(self, code):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")

    def log_message(self, *_):
        pass   # silencieux — retirer pour deboguer


# ── Point d'entree ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Premier appel pour initialiser les deltas reseau/CPU
    collect()

    server = http.server.HTTPServer(("0.0.0.0", PORT), Handler)
    server.timeout = 5
    print(f"[G1Oeil Linux] {socket.gethostname()} -> http://0.0.0.0:{PORT}/metrics")
    print(f"[G1Oeil Linux] Repertoires surveilles : {', '.join(WATCH_DIRS)}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[G1Oeil Linux] Arret.")
        server.server_close()
