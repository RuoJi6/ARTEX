#!/usr/bin/env python3
"""Download React Bits Pro registry items into the project as owned source files.

Registry protocol: shadcn-compatible JSON served at
https://pro.reactbits.dev/api/r/pro/<name>.json, gated by a Bearer license key
(REACTBITS_LICENSE_KEY). Each item's files are copied verbatim into
src/components/react-bits/ and a small manifest JSON is kept beside them.
"""
import json
import os
import sys
import urllib.request

KEY = os.environ.get("REACTBITS_LICENSE_KEY", "RBPP-76C140FB-FE1B-459F-8B94-D02ECF51390C")
BASE = "https://pro.reactbits.dev/api/r"
DEST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "src", "components", "react-bits")

ITEMS = [
    "app-shell-1",
    "app-sidebar-1",
    "navbar-6",
    "command-menu-1",
    "authentication-1",
    "onboarding-1",
    "dashboard-1",
    "dashboard-3",
    "ai-chat-1",
    "prompt-input-1",
    "data-table-1",
    "card-6",
    "analytics-1",
    "monitoring-1",
    "agent-activity-1",
    "tool-calls-1",
    "empty-state-1",
    "list-1",
    "filtering-1",
    "forms-1",
    "settings-form-1",
    "app-dialog-1",
    "notifications-1",
    "app-ui-theme",
]


def fetch(item: str) -> dict:
    req = urllib.request.Request(
        f"{BASE}/pro/{item}.json",
        headers={"Authorization": f"Bearer {KEY}"},
    )
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.load(res)


def main() -> int:
    os.makedirs(DEST, exist_ok=True)
    failed = []
    for item in ITEMS:
        try:
            data = fetch(item)
        except Exception as exc:  # noqa: BLE001
            print(f"FAILED {item}: {exc}")
            failed.append(item)
            continue
        files = {}
        for f in data.get("files", []):
            name = os.path.basename(f["path"])
            path = os.path.join(DEST, name)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as out:
                out.write(f["content"])
            files[name] = f["path"]
        entry = {"name": data["name"], "type": data["type"], "files": files}
        if data.get("cssVars"):
            entry["cssVars"] = data["cssVars"]
        if data.get("css"):
            entry["css"] = data["css"]
        with open(os.path.join(DEST, f"{item}.json"), "w", encoding="utf-8") as out:
            json.dump(entry, out, indent=2, ensure_ascii=False)
        print(f"OK {item}: {list(files.values())}")
    if failed:
        print(f"failed items: {failed}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
