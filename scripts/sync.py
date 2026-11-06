#!/usr/bin/env python3
"""Load the uk-law index (index/laws.csv) into the D1 database of the MCP server.

  sync.py --full [--local]   recreate the table from the whole index (first load)
  sync.py [--local]          send only the rows that changed since the last sync
  sync.py --check            check that the API token in the Keychain can reach the database

The last synced copy is kept next to the index's repository, so a failed run is simply redone.
Free D1 plans allow 100,000 written rows a day. A full load writes about 520,000 (the laws plus
the search index): on the free plan the import still finishes, but every other write is blocked
until midnight UTC. Daily syncs write a few hundred rows. Do not run --full again without need.

Known gap: ids are unique without regard to case, so of `aep/Cha2St1/13/4` and `aep/Cha2st1/13/4`
(two Acts of 1661) only one is in the database.
"""
import argparse
import csv
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

DATA = Path(os.environ.get("UKLAW_DATA", Path.home() / "uk-law-data"))
INDEX = DATA / "publish/uk-law/index/laws.csv"
SYNCED = DATA / "publish/mcp-synced.csv"
HERE = Path(__file__).resolve().parents[1]
COLS = ["id", "type", "year", "number", "title", "status", "extent", "topics", "path"]
BATCH = 100
# The Cloudflare API token (D1 Edit on the account) is kept in the macOS Keychain, not in a file:
#   security add-generic-password -s uk-law-cloudflare -a d1 -T /usr/bin/security -w
KEYCHAIN = ("uk-law-cloudflare", "d1")


def use_keychain_token() -> None:
    """Put the token from the Keychain in CLOUDFLARE_API_TOKEN for wrangler, unless one is already set."""
    if os.environ.get("CLOUDFLARE_API_TOKEN") or sys.platform != "darwin":
        return
    r = subprocess.run(["security", "find-generic-password", "-s", KEYCHAIN[0], "-a", KEYCHAIN[1], "-w"],
                       capture_output=True, text=True)
    if r.returncode == 0 and r.stdout.strip():
        os.environ["CLOUDFLARE_API_TOKEN"] = r.stdout.strip()


def rows(path: Path) -> dict[str, dict]:
    if not path.is_file():
        return {}
    with path.open(encoding="utf-8") as f:
        return {r["id"]: r for r in csv.DictReader(f)}


def q(v: str) -> str:
    return "'" + v.replace("'", "''") + "'"


def values(r: dict) -> str:
    return "(" + ",".join(q(r[c]) for c in COLS) + ")"


def statements(new: dict, old: dict, full: bool) -> list[str]:
    out = []
    if full:
        out.append("DELETE FROM laws;")
        changed = list(new.values())
    else:
        for i in old.keys() - new.keys():
            out.append(f"DELETE FROM laws WHERE id = {q(i)};")
        changed = [r for i, r in new.items() if old.get(i) != r]
    upsert = " ON CONFLICT(id) DO UPDATE SET " + ", ".join(f"{c} = excluded.{c}" for c in COLS if c != "id")
    for k in range(0, len(changed), BATCH):
        chunk = changed[k:k + BATCH]
        out.append(f"INSERT INTO laws ({','.join(COLS)}) VALUES " + ",".join(values(r) for r in chunk) + upsert + ";")
    return out


def check() -> int:
    """Read the row count of the deployed database with the stored token: proves the token works."""
    use_keychain_token()
    if not os.environ.get("CLOUDFLARE_API_TOKEN"):
        print("no token in the Keychain (service uk-law-cloudflare, account d1)", file=sys.stderr)
        return 1
    r = subprocess.run(["npx", "wrangler", "d1", "execute", "uk-law", "--remote", "--json",
                        "--command", "SELECT count(*) AS laws FROM laws"], cwd=HERE, capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr.strip()[-800:])
    return r.returncode


def main() -> int:
    if sys.argv[1:] == ["--check"]:
        return check()
    p = argparse.ArgumentParser()
    p.add_argument("--full", action="store_true")
    p.add_argument("--local", action="store_true", help="the local dev database instead of the deployed one")
    a = p.parse_args()
    if not INDEX.is_file():
        print(f"no index at {INDEX}", file=sys.stderr)
        return 1
    new = rows(INDEX)
    old = {} if a.full else rows(SYNCED)
    if not a.full and not old:
        print("no previous sync: run with --full first", file=sys.stderr)
        return 1
    sql = statements(new, old, a.full)
    if not sql:
        print("index unchanged: nothing to send")
        return 0
    target = "--local" if a.local else "--remote"
    if not a.local:
        use_keychain_token()
    schema = ["--file", str(HERE / "schema.sql")]
    subprocess.run(["npx", "wrangler", "d1", "execute", "uk-law", target, "--yes", *schema], cwd=HERE, check=True,
                   stdout=subprocess.DEVNULL)
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as f:
        f.write("\n".join(sql) + "\n")
    try:
        subprocess.run(["npx", "wrangler", "d1", "execute", "uk-law", target, "--yes", "--file", f.name], cwd=HERE, check=True)
    finally:
        os.unlink(f.name)
    if not a.local:
        shutil.copyfile(INDEX, SYNCED)
    print(f"sent {len(sql)} statements ({'full load' if a.full else 'changes only'}) to the {target[2:]} database")
    return 0


if __name__ == "__main__":
    sys.exit(main())
