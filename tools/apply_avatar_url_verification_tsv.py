import json
from pathlib import Path

INDEX = Path("avatar-url-index.json")
TSV = Path("avatar-url-verification.tsv")

data = json.loads(INDEX.read_text(errors="replace"))
records = data.get("by_avatar_id") or {}

for rec in records.values():
    rec["head_verified_url"] = ""
    rec["thumb_verified_url"] = ""
    rec["snapshot_verified_url"] = ""
    rec["has_verified_portrait"] = False
    rec.setdefault("url_checks", {})

for line in TSV.read_text(errors="replace").splitlines():
    parts = line.split(" ", 4)
    if len(parts) < 5:
        continue

    avatar_id, kind, status, content_type, url = parts
    rec = records.get(avatar_id)
    if not rec:
        continue

    ok = status == "200" and content_type.startswith("image/")

    rec.setdefault("url_checks", {})[kind] = {
        "url": url,
        "status": int(status) if status.isdigit() else 0,
        "content_type": content_type,
        "ok": ok,
    }

    if ok:
        if kind == "head":
            rec["head_verified_url"] = url
        elif kind == "thumb":
            rec["thumb_verified_url"] = url
        elif kind == "snap":
            rec["snapshot_verified_url"] = url

    rec["has_verified_portrait"] = bool(
        rec.get("head_verified_url")
        or rec.get("thumb_verified_url")
        or rec.get("snapshot_verified_url")
    )

data["verified_avatar_count"] = sum(1 for r in records.values() if r.get("has_verified_portrait"))
data["verification_rule"] = "Verified from avatar-url-verification.tsv: HTTP 200 and image/* only."

INDEX.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

print(json.dumps({
    "avatar_count": len(records),
    "verified_avatar_count": data["verified_avatar_count"],
}, indent=2))
