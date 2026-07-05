#!/usr/bin/env python3
"""
G1Oeil VPS Agent - Windows v2.0
Metriques: CPU / RAM / Disques / Reseau / Processus / Taille des disques
Aucune dependance externe (stdlib + ctypes uniquement).

Usage:
  python3 vps-agent-windows.py [PORT]      (defaut: 9099)

Demarrage automatique (Task Scheduler) :
  schtasks /create /sc onstart /tn "G1OeilAgent" /tr "python3 C:\\G1Oeil\\vps-agent-windows.py" /ru SYSTEM

Ou via NSSM (Non-Sucking Service Manager) pour un vrai service Windows.
Securite: Windows Firewall -> Nouvelle regle entree -> Port 9099 -> Autoriser pour l'IP G1Oeil uniquement
"""

import ctypes
import ctypes.wintypes
import http.server
import json
import os
import platform
import socket
import subprocess
import sys
import threading
import time

# ── Configuration ────────────────────────────────────────────────────────────

PORT          = int(sys.argv[1]) if len(sys.argv) > 1 else 9099
CACHE_TTL     = 10    # secondes (métriques système)
DIR_CACHE_TTL = 300   # secondes (scan répertoires, lent)
TOP_PROC      = 5
TOP_DIRS      = 10    # top N sous-dossiers par racine
DIR_MAX_DEPTH = 2

def _init_dirs():
    """Répertoires à surveiller : args CLI ou toutes les partitions fixes."""
    if len(sys.argv) > 2:
        return [p for p in sys.argv[2:] if os.path.isdir(p)]
    dirs = []
    bitmask = ctypes.windll.kernel32.GetLogicalDrives()
    for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        if bitmask & 1:
            path = f"{letter}:\\"
            try:
                if ctypes.windll.kernel32.GetDriveTypeW(path) in (3, 4):
                    dirs.append(path)
            except Exception:
                pass
        bitmask >>= 1
    return dirs

DIRS_TO_SCAN = _init_dirs()

# ── Cache ─────────────────────────────────────────────────────────────────────

_cache_lock   = threading.Lock()
_last_metrics = None
_last_ts      = 0.0
_net_prev     = {}   # { iface: (rx, tx, ts) }

_dirs_lock    = threading.Lock()
_dirs_cache   = []
_dirs_ts      = 0.0
_dirs_running = False

def _scan_dirs_bg():
    """Scan des répertoires en arrière-plan (peut être lent)."""
    global _dirs_cache, _dirs_ts, _dirs_running
    try:
        result = _do_scan_dirs()
        with _dirs_lock:
            _dirs_cache = result
            _dirs_ts    = time.monotonic()
    except Exception:
        pass
    finally:
        _dirs_running = False

def get_dirs_cached():
    """Retourne le cache répertoires ; lance un scan bg si périmé."""
    global _dirs_running
    with _dirs_lock:
        age = time.monotonic() - _dirs_ts
        if age < DIR_CACHE_TTL:
            return _dirs_cache
        if not _dirs_running:
            _dirs_running = True
            threading.Thread(target=_scan_dirs_bg, daemon=True).start()
        return _dirs_cache   # retourner l'ancien pendant le scan


# ── CPU (deux appels GetSystemTimes avec delta) ────────────────────────────────

class _FILETIME(ctypes.Structure):
    _fields_ = [("dwLowDateTime", ctypes.wintypes.DWORD),
                ("dwHighDateTime", ctypes.wintypes.DWORD)]

def _filetime_to_int(ft):
    return (ft.dwHighDateTime << 32) | ft.dwLowDateTime

_cpu_prev_times = {}

def _get_system_times():
    idle = _FILETIME(); kernel = _FILETIME(); user = _FILETIME()
    ctypes.windll.kernel32.GetSystemTimes(
        ctypes.byref(idle), ctypes.byref(kernel), ctypes.byref(user))
    return _filetime_to_int(idle), _filetime_to_int(kernel), _filetime_to_int(user)

def get_cpu_percent():
    idle2, kernel2, user2 = _get_system_times()
    prev = _cpu_prev_times.get("t")
    result = 0.0
    if prev:
        idle1, kernel1, user1 = prev
        idle_delta   = idle2   - idle1
        kernel_delta = kernel2 - kernel1
        user_delta   = user2   - user1
        total_delta  = kernel_delta + user_delta
        if total_delta > 0:
            result = round(100.0 * (1.0 - idle_delta / total_delta), 1)
    _cpu_prev_times["t"] = (idle2, kernel2, user2)
    return result


def get_cpu_count():
    return os.cpu_count() or 1


# ── RAM (GlobalMemoryStatusEx) ────────────────────────────────────────────────

class _MEMORYSTATUSEX(ctypes.Structure):
    _fields_ = [
        ("dwLength",                ctypes.c_ulong),
        ("dwMemoryLoad",            ctypes.c_ulong),
        ("ullTotalPhys",            ctypes.c_ulonglong),
        ("ullAvailPhys",            ctypes.c_ulonglong),
        ("ullTotalPageFile",        ctypes.c_ulonglong),
        ("ullAvailPageFile",        ctypes.c_ulonglong),
        ("ullTotalVirtual",         ctypes.c_ulonglong),
        ("ullAvailVirtual",         ctypes.c_ulonglong),
        ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
    ]

def get_ram():
    stat = _MEMORYSTATUSEX()
    stat.dwLength = ctypes.sizeof(stat)
    ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat))
    total    = stat.ullTotalPhys
    avail    = stat.ullAvailPhys
    used     = total - avail
    sw_tot   = stat.ullTotalPageFile
    sw_used  = sw_tot - stat.ullAvailPageFile
    return {
        "percent":     round(stat.dwMemoryLoad, 1),
        "totalGb":     round(total   / 1_073_741_824, 2),
        "usedGb":      round(used    / 1_073_741_824, 2),
        "freeGb":      round(avail   / 1_073_741_824, 2),
        "cachedGb":    0.0,
        "swapTotalGb": round(sw_tot  / 1_073_741_824, 2),
        "swapUsedGb":  round(sw_used / 1_073_741_824, 2),
        "swapPercent": round(100.0 * sw_used / sw_tot, 1) if sw_tot else 0.0,
    }


# ── Disques (GetDiskFreeSpaceExW + GetLogicalDrives) ─────────────────────────

def get_disks():
    drives  = []
    bitmask = ctypes.windll.kernel32.GetLogicalDrives()
    for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        if not (bitmask & 1):
            bitmask >>= 1
            continue
        bitmask >>= 1
        path = f"{letter}:\\"
        try:
            drive_type = ctypes.windll.kernel32.GetDriveTypeW(path)
            # 3 = Fixed, 4 = Remote, 5 = CD-ROM, 6 = RAM disk
            if drive_type not in (3, 4):
                continue
            total  = ctypes.c_ulonglong(0)
            free   = ctypes.c_ulonglong(0)
            ctypes.windll.kernel32.GetDiskFreeSpaceExW(
                path, None, ctypes.byref(total), ctypes.byref(free))
            t = total.value
            f = free.value
            u = t - f
            if t == 0:
                continue
            # Recuperer le label du volume
            label_buf = ctypes.create_unicode_buffer(261)
            fstype_buf = ctypes.create_unicode_buffer(261)
            ctypes.windll.kernel32.GetVolumeInformationW(
                path, label_buf, 261, None, None, None, fstype_buf, 261)
            drives.append({
                "mount":    path,
                "device":   letter + ":",
                "fstype":   fstype_buf.value or "NTFS",
                "label":    label_buf.value or "",
                "totalGb":  round(t / 1_073_741_824, 2),
                "usedGb":   round(u / 1_073_741_824, 2),
                "freeGb":   round(f / 1_073_741_824, 2),
                "percent":  round(100.0 * u / t, 1),
            })
        except Exception:
            pass
    return drives


# ── Reseau (GetIfTable2 via iphlpapi) ─────────────────────────────────────────

def get_network():
    global _net_prev
    now    = time.monotonic()
    result = {}
    try:
        import ctypes.util
        iphlpapi = ctypes.windll.LoadLibrary("iphlpapi.dll")

        # Utiliser netstat -e (plus simple, pas besoin des structures complexes)
        out = subprocess.run(
            ["netstat", "-e"], capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=3)
        lines = out.stdout.splitlines()
        rx = tx = 0
        for line in lines:
            if "Bytes" in line:
                nums = [int(x.replace(",", "")) for x in line.split() if x.replace(",", "").isdigit()]
                if len(nums) >= 2:
                    rx, tx = nums[0], nums[1]
                break
        prev = _net_prev.get("total")
        if prev:
            dt   = now - prev[2]
            rx_s = round((rx - prev[0]) / dt / 1024, 1) if dt > 0 else 0.0
            tx_s = round((tx - prev[1]) / dt / 1024, 1) if dt > 0 else 0.0
        else:
            rx_s = tx_s = 0.0
        _net_prev["total"] = (rx, tx, now)
        result["total"] = {
            "rxKbps":    max(0.0, rx_s),
            "txKbps":    max(0.0, tx_s),
            "rxTotalMb": round(rx / 1_048_576, 1),
            "txTotalMb": round(tx / 1_048_576, 1),
        }
    except Exception:
        pass
    return result


# ── Processus (WMIC ou tasklist) ─────────────────────────────────────────────

def get_processes():
    procs = []
    try:
        out = subprocess.run(
            ["tasklist", "/FO", "CSV", "/NH"],
            capture_output=True, text=True,
            encoding="utf-8", errors="replace", timeout=5)
        for line in out.stdout.splitlines()[:30]:
            parts = [p.strip('"') for p in line.split('","')]
            if len(parts) < 5:
                continue
            try:
                mem_str = parts[4].replace("\xa0", "").replace(",", "").replace(".", "").replace(" K", "").strip()
                mem_kb  = int("".join(c for c in mem_str if c.isdigit()))
                procs.append({"pid": int(parts[1]), "name": parts[0], "memMb": round(mem_kb / 1024, 1)})
            except Exception:
                pass
        procs.sort(key=lambda p: p["memMb"], reverse=True)
    except Exception:
        pass
    return procs[:TOP_PROC]


# ── Repertoires (taille par scandir) ─────────────────────────────────────────

def _dir_size(path, depth=0):
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


def _do_scan_dirs():
    """Pour chaque répertoire surveillé, retourne les N sous-dossiers les plus volumineux."""
    result = []
    for root in DIRS_TO_SCAN:
        if not os.path.isdir(root):
            continue
        children = []
        try:
            with os.scandir(root) as it:
                for entry in it:
                    try:
                        if entry.is_dir(follow_symlinks=False):
                            size_bytes = _dir_size(entry.path, depth=0)
                            if size_bytes > 0:
                                children.append({
                                    "path":   entry.path,
                                    "sizeMb": round(size_bytes / 1_048_576,   1),
                                    "sizeGb": round(size_bytes / 1_073_741_824, 3),
                                })
                    except Exception:
                        pass
        except Exception:
            pass
        children.sort(key=lambda x: x["sizeMb"], reverse=True)
        label = os.path.basename(root.rstrip("/\\")) or root
        result.append({
            "path":  root,
            "label": label,
            "top":   children[:TOP_DIRS],
        })
    return result


def get_uptime_days():
    try:
        ms = ctypes.windll.kernel32.GetTickCount64()
        return round(ms / 86_400_000, 2)
    except Exception:
        return 0.0


# ── Collecte principale ───────────────────────────────────────────────────────

def collect():
    global _last_metrics, _last_ts
    now = time.monotonic()
    with _cache_lock:
        if _last_metrics and (now - _last_ts) < CACHE_TTL:
            return _last_metrics
    try:
        cpu    = get_cpu_percent()
        ram    = get_ram()
        disks  = get_disks()
        net    = get_network()
        procs  = get_processes()
        uptime = get_uptime_days()
        dirs   = get_dirs_cached()
        root   = disks[0] if disks else {}
        win_ver = platform.version()
        win_rel = platform.release()

        data = {
            "hostname":   socket.gethostname(),
            "os":         {"name": f"Windows {win_rel}", "version": win_ver, "id": "windows"},
            "agentType":  "windows",
            "cpu":        cpu,
            "cpuCores":   get_cpu_count(),
            "load1":      0.0,   # non disponible nativement sous Windows
            "load5":      0.0,
            "load15":     0.0,
            "ram":        ram["percent"],
            "disk":       root.get("percent", 0),
            "ramGb":      ram["totalGb"],
            "ramUsedGb":  ram["usedGb"],
            "diskGb":     root.get("totalGb", 0),
            "diskUsedGb": root.get("usedGb", 0),
            "uptimeDays": uptime,
            "disks":      disks,
            "network":    net,
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
        self._hdr(200); self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0].rstrip("/")
        if path not in ("/metrics", ""):
            self.send_error(404); return
        try:
            body = json.dumps(collect(), ensure_ascii=False).encode("utf-8")
            self._hdr(200)
            self.send_header("Content-Type",   "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            self.send_error(500, str(exc))

    def _hdr(self, code):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")

    def log_message(self, *_):
        pass


# ── Point d'entree ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    collect()   # init deltas CPU/net
    # Scan répertoires en background (lent, ne bloque pas le démarrage)
    _dirs_running = True
    threading.Thread(target=_scan_dirs_bg, daemon=True).start()
    server = http.server.HTTPServer(("0.0.0.0", PORT), Handler)
    server.timeout = 5
    print(f"[G1Oeil Windows] {socket.gethostname()} -> http://0.0.0.0:{PORT}/metrics")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[G1Oeil Windows] Arret.")
        server.server_close()
