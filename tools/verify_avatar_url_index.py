import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

INDEX = Path("avatar-url-index.json")


def check(url):
    if not url:
        return {"url": "", "status": 0, "content_type": "", "ok": False}

    try:
        proc = subprocess.run(
            [
                "curl",
                "-L",
                "-sS",
                "-o",
                "/dev/null",
                "-w",
                "%{http_code}\t%{content_type}",
                url,
            ],
            text=True,
            capture_output=True,
            timeout=8,
        )
        raw = proc.stdout.strip()
        status_s, content_type = (raw.split("\t", 1) + [""])[:2]
        status = int(status_s or 0)
        ok = status == 200 and content_type.lower().startswith("image/")
        return {
            "url": url,
            "status": status,
            "content_type": content_type,
            "ok": ok,
        }
    except Exception as exc:
        return {
            "url": url,
            "status": 0,
            "content_type": "",
            "ok": False,
            "error": str(exc),
        }


def main():
    data = json.loads(INDEX.read_text(errors="replace"))
    records = data.get("by_avatar_id") or {}

    verified_count = 0

    for avatar_id, rec in records.items():
        checks = {
            "head": check(rec.get("head_url") or ""),
            "thumb": check(rec.get("thumb_url") or ""),
            "snapshot": check(rec.get("snapshot_url") or ""),
        }

        rec["url_checks"] = checks

        rec["head_verified_url"] = checks["head"]["url"] if checks["head"]["ok"] else ""
        rec["thumb_verified_url"] = checks["thumb"]["url"] if checks["thumb"]["ok"] else ""
        rec["snapshot_verified_url"] = checks["snapshot"]["url"] if checks["snapshot"]["ok"] else ""
        rec["has_verified_portrait"] = bool(
            rec["head_verified_url"] or rec["thumb_verified_url"] or rec["snapshot_verified_url"]
        )

        if rec["has_verified_portrait"]:
            verified_count += 1

    data["verified_at"] = datetime.now(timezone.utc).isoformat()
    data["verified_avatar_count"] = verified_count
    data["verification_rule"] = "Renderable avatar portraits require HTTP 200 and content-type image/*."

    INDEX.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    print(json.dumps({
        "avatar_count": len(records),
        "verified_avatar_count": verified_count,
        "unverified_avatar_count": len(records) - verified_count,
    }, indent=2))


if __name__ == "__main__":
    main()
