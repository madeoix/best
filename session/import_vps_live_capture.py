#!/usr/bin/env python3
"""Persist a real Smallverse client RTMP capture without exposing session data."""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import struct
import subprocess
import zlib
from pathlib import Path

from smallverse_core.db import (
    connect,
    insert_observations,
    insert_protocol_events,
    upsert_session,
)
from smallverse_core.observatory_db import sync_session_to_observatory
from smallverse_core import observatory_parser
from rtmp_avatar_configs import decode_avatar_configs_from_rtmp, write_avatar_config_artifacts
from smallverse_core_compat import extract_observatory_records


AVATAR_MARKER = re.compile(rb"Avatar\.([0-9a-f]{24})", re.I)
CONFIG_VALUE = re.compile(
    rb"(?:^|[^A-Za-z])config(?:XML)?[^A-Za-z0-9+/=]{0,24}([A-Za-z0-9+/=]{32,12000})",
    re.I,
)


def _space_id_from_session(session: str) -> str:
    match = re.search(r"(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])", session, re.I)
    return match.group(0).lower() if match else ""


def _server_rtmp_stream(pcap: Path) -> bytes:
    """Reassemble server TCP payloads in sequence order.

    tcpdump's ``any`` captures are Linux-cooked PCAPNG. Convert with tcpdump
    first so this parser sees one standard Ethernet PCAP shape regardless of
    how the VPS capture was made.
    """
    converted = subprocess.run(
        ["tcpdump", "-r", str(pcap), "-w", "-", "tcp port 1935"],
        check=False, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    ).stdout
    if len(converted) < 24:
        return b""
    magic = converted[:4]
    endian = "<" if magic in (b"\xd4\xc3\xb2\xa1", b"M<\xb2\xa1") else ">"
    offset, flows = 24, {}
    while offset + 16 <= len(converted):
        _, _, caplen, _ = struct.unpack_from(endian + "IIII", converted, offset)
        offset += 16
        frame = converted[offset:offset + caplen]
        offset += caplen
        if len(frame) < 54:
            continue
        ip = 14
        if frame[12:14] == b"\x81\x00":
            ip = 18
        if len(frame) < ip + 40 or frame[ip - 2:ip] != b"\x08\x00":
            continue
        ihl = (frame[ip] & 0x0F) * 4
        if frame[ip + 9] != 6 or len(frame) < ip + ihl + 20:
            continue
        tcp = ip + ihl
        src_port, dst_port = struct.unpack_from("!HH", frame, tcp)
        if src_port != 1935:
            continue
        sequence = struct.unpack_from("!I", frame, tcp + 4)[0]
        header_len = ((frame[tcp + 12] >> 4) & 0x0F) * 4
        payload = frame[tcp + header_len:]
        if payload:
            key = (frame[ip + 12:ip + 16], frame[ip + 16:ip + 20], dst_port)
            flows.setdefault(key, []).append((sequence, payload))
    streams = []
    for segments in flows.values():
        stream, next_seq = bytearray(), None
        for sequence, payload in sorted(segments):
            if next_seq is not None and sequence < next_seq:
                payload = payload[next_seq - sequence:]
            if not payload:
                continue
            stream.extend(payload)
            next_seq = sequence + len(payload)
        streams.append(bytes(stream))
    return max(streams, key=len) if streams else b""


def _write_avatar_config_artifacts(data: bytes, out: Path, session: str, pcap: Path) -> dict:
    """Recover full Avatar shared-object configs from the real RTMP capture.

    Item configs also travel beside Avatar records, so accept only payloads that
    inflate to an actual ``<avatar>`` document.  The raw PCAP stays private;
    Beacon consumes only the decoded XML plus non-secret metadata.
    """
    # The historical decoder works on the reassembled server stream, rather
    # than on raw PCAP bytes. This is required because the compressed config
    # is normally split across several TCP packets.
    stream = _server_rtmp_stream(pcap)
    for start in (3073, 0):  # full handshake capture, then stripped-stream fallback
        report = decode_avatar_configs_from_rtmp(stream, space_id=_space_id_from_session(session), start=start)
        if report.observations:
            return write_avatar_config_artifacts(report, out / "avatar-configs")

    rows = []
    seen = set()
    root = out / "avatar-configs"
    for marker in AVATAR_MARKER.finditer(data):
        avatar_id = marker.group(1).decode("ascii").lower()
        block = data[marker.start(): marker.start() + 16000]
        for match in CONFIG_VALUE.finditer(block):
            encoded = match.group(1)
            try:
                xml = zlib.decompress(base64.b64decode(encoded, validate=True)).decode("utf-8")
            except Exception:
                continue
            if not re.match(r"\s*<avatar(?:\s|>)", xml, re.I):
                continue
            digest = hashlib.sha256(xml.encode("utf-8")).hexdigest()
            key = (avatar_id, digest)
            if key in seen:
                continue
            seen.add(key)
            avatar_root = root / avatar_id
            avatar_root.mkdir(parents=True, exist_ok=True)
            xml_path = avatar_root / f"{digest}.xml"
            xml_path.write_text(xml + ("" if xml.endswith("\n") else "\n"), encoding="utf-8")
            rows.append({
                "avatar_id": avatar_id,
                "space_id": session.split("-", 2)[1] if "-" in session else "",
                "config_sha256": digest,
                "config_xml_path": str(xml_path),
                "source": "real_client_rtmp_avatar_shared_object",
            })
    manifest = {"schema": "smallverse-avatar-config-manifest/v1", "avatar_config_count": len(rows), "avatar_configs": rows}
    root.mkdir(parents=True, exist_ok=True)
    (root / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest


def _publish_beacon_avatar_queue(manifest: dict, workspace: Path) -> int:
    """Publish sanitized decoded configs for the local Beacon sync step."""
    queue_path = workspace / "beacon-avatar-render-queue.json"
    try:
        existing = json.loads(queue_path.read_text()) if queue_path.exists() else {}
    except Exception:
        existing = {}
    rows = {str(row.get("avatar_id")): row for row in existing.get("avatars", [])}
    for row in manifest.get("avatar_configs", []):
        config_path = Path(str(row.get("config_xml_path") or ""))
        if not config_path.is_file():
            continue
        avatar_id = str(row.get("avatar_id") or "").lower()
        if not re.fullmatch(r"[0-9a-f]{24}", avatar_id):
            continue
        rows[avatar_id] = {
            "avatar_id": avatar_id,
            "gender": row.get("gender") or "unknown",
            "config_sha256": row.get("config_sha256"),
            "config_xml": config_path.read_text(encoding="utf-8"),
            "captured_at": row.get("observed_at"),
            "space_id": row.get("space_id"),
            "display_name": row.get("display_name"),
            "thumb_postfix": row.get("thumb_postfix"),
        }
    payload = {"contract": "beacon-avatar-render-queue/v1", "avatars": list(rows.values())}
    temporary = queue_path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    temporary.replace(queue_path)
    return len(rows)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pcap", required=True)
    parser.add_argument("--session", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--sync-observatory", action="store_true",
                        help="Run the expensive Observatory merge explicitly; normal crawler imports stay bounded.")
    args = parser.parse_args()

    pcap = Path(args.pcap)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    data = pcap.read_bytes()
    xml_sources, observations, events, parser_compatibility = extract_observatory_records(
        observatory_parser,
        data,
        args.session,
        origin="vps_real_client",
    )
    avatar_configs = _write_avatar_config_artifacts(data, out, args.session, pcap)
    queued_avatar_count = _publish_beacon_avatar_queue(avatar_configs, Path(args.workspace))
    db_path = out / "session.sqlite"
    conn = connect(db_path)
    upsert_session(conn, args.session, str(pcap))
    insert_observations(conn, args.session, observations)
    insert_protocol_events(conn, events)
    conn.commit()
    conn.close()
    synced = (
        sync_session_to_observatory(db_path, Path(args.workspace))
        if args.sync_observatory
        else {"ok": True, "skipped": True, "reason": "deferred_bounded_export"}
    )
    print(json.dumps({
        "ok": bool(synced.get("ok")),
        "xml_sources": len(xml_sources),
        "observations": len(observations),
        "events": len(events),
        "observatory_parser": parser_compatibility,
        "uids": len({row.uid for row in observations if row.uid}),
        "avatar_configs": avatar_configs["avatar_config_count"],
        "queued_avatars": queued_avatar_count,
        "session_db": str(db_path),
        "sync": synced,
    }, sort_keys=True))
    return 0 if synced.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
