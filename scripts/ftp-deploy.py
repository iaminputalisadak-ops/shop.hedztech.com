"""Upload a local staging folder to shop.hedztech.com over FTP_TLS."""
from __future__ import annotations

import json
import os
import sys
import time
import ftplib

RETRIES = 4
# Code files can change without changing size, so always upload them.
ALWAYS_UPLOAD = (".php", ".html", ".js", ".css", ".json", ".xml", ".txt", ".htaccess")

SKIP_NAMES = {".git", "node_modules"}
SKIP_SUFFIXES = (
    "/config/database.php",
    "\\config\\database.php",
    "config/database.php",
)


def should_skip(rel: str) -> bool:
    norm = rel.replace("\\", "/").lstrip("./")
    if norm.endswith(".zip") or norm.endswith(".sql"):
        return True
    if any(norm.endswith(s.replace("\\", "/")) for s in SKIP_SUFFIXES):
        return True
    if norm == "config/database.php":
        return True
    return False


def ensure_dir(ftp: ftplib.FTP, remote_dir: str) -> None:
    parts = [p for p in remote_dir.replace("\\", "/").split("/") if p]
    path = ""
    for part in parts:
        path += "/" + part
        try:
            ftp.mkd(path)
        except ftplib.error_perm:
            pass


def connect(cfg: dict) -> ftplib.FTP:
    host = cfg["host"]
    port = int(cfg.get("port") or 21)
    user = cfg["username"]
    password = cfg["password"]
    ftp = ftplib.FTP_TLS()
    ftp.connect(host, port, timeout=45)
    ftp.auth()
    ftp.prot_p()
    ftp.login(user, password)
    ftp.set_pasv(True)
    ftp.encoding = "utf-8"
    return ftp


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: ftp-deploy.py <staging_dir> <ftp-config.json>", file=sys.stderr)
        return 2

    staging = os.path.abspath(sys.argv[1])
    config_path = os.path.abspath(sys.argv[2])
    if not os.path.isdir(staging):
        print("Staging folder missing:", staging, file=sys.stderr)
        return 1
    if not os.path.isfile(config_path):
        print("Missing FTP config:", config_path, file=sys.stderr)
        print("Copy deploy/ftp-config.example.json to deploy/ftp-config.json", file=sys.stderr)
        return 1

    with open(config_path, encoding="utf-8") as fh:
        cfg = json.load(fh)

    remote_root = (cfg.get("remotePath") or "/").rstrip("/") or ""
    site = cfg.get("siteUrl") or ""

    uploaded = 0
    skipped = 0
    unchanged = 0
    state = {"ftp": connect(cfg)}
    print("Connected to", cfg["host"], "as", cfg["username"], flush=True)
    if site:
        print("Site", site)

    def with_retry(label: str, action):
        for attempt in range(1, RETRIES + 1):
            try:
                return action(state["ftp"])
            except ftplib.error_perm:
                raise
            except (EOFError, OSError, ftplib.Error) as exc:
                if attempt == RETRIES:
                    raise
                print(f"  connection dropped on {label} ({type(exc).__name__}); reconnecting...", flush=True)
                try:
                    state["ftp"].close()
                except Exception:
                    pass
                time.sleep(2 * attempt)
                state["ftp"] = connect(cfg)

    def same_size(ftp: ftplib.FTP, remote: str, local: str) -> bool:
        try:
            return ftp.size(remote) == os.path.getsize(local)
        except ftplib.error_perm:
            return False

    def store(ftp: ftplib.FTP, remote: str, local: str) -> None:
        with open(local, "rb") as fh:
            ftp.storbinary("STOR " + remote, fh)

    try:
        for dirpath, dirnames, filenames in os.walk(staging):
            dirnames[:] = [d for d in dirnames if d not in SKIP_NAMES]
            rel_dir = os.path.relpath(dirpath, staging)
            if rel_dir == ".":
                remote_dir = remote_root + "/" if remote_root else "/"
            else:
                remote_dir = (remote_root + "/" + rel_dir.replace("\\", "/")).replace("//", "/")
            with_retry(remote_dir, lambda f: ensure_dir(f, remote_dir))

            for name in filenames:
                local = os.path.join(dirpath, name)
                rel = os.path.relpath(local, staging).replace("\\", "/")
                if should_skip(rel):
                    skipped += 1
                    continue
                remote = (remote_root + "/" + rel).replace("//", "/")
                if not remote.startswith("/"):
                    remote = "/" + remote
                if not name.lower().endswith(ALWAYS_UPLOAD) and with_retry(
                    remote, lambda f: (f.voidcmd("TYPE I"), same_size(f, remote, local))[1]
                ):
                    unchanged += 1
                    continue
                with_retry(remote, lambda f: store(f, remote, local))
                uploaded += 1
                if uploaded % 25 == 0:
                    print("uploaded", uploaded, "files...", flush=True)
    finally:
        try:
            state["ftp"].quit()
        except Exception:
            state["ftp"].close()

    print("Uploaded", uploaded, "files. Unchanged", unchanged, ". Skipped", skipped, "(zip/sql/database.php).")
    print("Did not overwrite config/database.php.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
