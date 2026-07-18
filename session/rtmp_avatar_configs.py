from __future__ import annotations

import base64
import hashlib
import json
import math
import re
import struct
import zlib
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator
from xml.etree import ElementTree


AVATAR_OBJECT_PREFIX = "Avatar."
DEFAULT_RTMP_CHUNK_SIZE = 128
MAX_RTMP_MESSAGE_SIZE = 16 * 1024 * 1024
MAX_AMF_DEPTH = 50


class RtmpDecodeError(ValueError):
    """Raised when a complete RTMP/AMF value cannot be decoded safely."""


@dataclass(frozen=True)
class RtmpHeader:
    timestamp: int
    timestamp_delta: int
    message_length: int
    type_id: int
    stream_id: int
    extended_timestamp: bool = False
    last_fmt: int = 0


@dataclass
class _Assembly:
    header: RtmpHeader
    data: bytearray = field(default_factory=bytearray)


@dataclass(frozen=True)
class RtmpMessage:
    header: RtmpHeader
    body: bytes


@dataclass(frozen=True)
class AvatarConfigObservation:
    avatar_id: str
    shared_object: str
    rtmp_version: int
    rtmp_timestamp: int
    space_id: str
    owner_id: str | None
    display_name: str
    first_name: str
    last_name: str
    gender: str | None
    model: str | None
    head_postfix: str | None
    thumb_postfix: str | None
    snapshot_postfix: str | None
    compressed_config: str
    compressed_sha256: str
    config_xml: str
    config_sha256: str
    state: dict[str, Any]

    def to_dict(self, *, include_payloads: bool = True) -> dict[str, Any]:
        value = asdict(self)
        if not include_payloads:
            value.pop("compressed_config", None)
            value.pop("config_xml", None)
            value.pop("state", None)
        return value


@dataclass(frozen=True)
class AvatarConfigDecodeReport:
    ok: bool
    observations: tuple[AvatarConfigObservation, ...]
    rtmp_message_count: int
    shared_object_message_count: int
    avatar_shared_object_count: int
    error: str | None = None

    @property
    def avatar_config_count(self) -> int:
        return len(self.observations)

    def to_dict(self, *, include_payloads: bool = True) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "avatar_config_count": self.avatar_config_count,
            "rtmp_message_count": self.rtmp_message_count,
            "shared_object_message_count": self.shared_object_message_count,
            "avatar_shared_object_count": self.avatar_shared_object_count,
            "error": self.error,
            "observations": [
                row.to_dict(include_payloads=include_payloads)
                for row in self.observations
            ],
        }


def _u24(data: bytes, offset: int) -> int:
    if offset < 0 or offset + 3 > len(data):
        raise RtmpDecodeError("truncated unsigned 24-bit integer")
    return (data[offset] << 16) | (data[offset + 1] << 8) | data[offset + 2]


def _read_u32_be(data: bytes, offset: int) -> tuple[int, int]:
    if offset + 4 > len(data):
        raise RtmpDecodeError("truncated unsigned 32-bit integer")
    return struct.unpack_from(">I", data, offset)[0], offset + 4


def _basic_header(data: bytes, offset: int) -> tuple[int, int, int]:
    if offset >= len(data):
        raise RtmpDecodeError("missing RTMP basic header")

    value = data[offset]
    offset += 1
    fmt = value >> 6
    csid = value & 0x3F

    if csid == 0:
        if offset >= len(data):
            raise RtmpDecodeError("truncated two-byte RTMP basic header")
        csid = 64 + data[offset]
        offset += 1
    elif csid == 1:
        if offset + 2 > len(data):
            raise RtmpDecodeError("truncated three-byte RTMP basic header")
        csid = 64 + data[offset] + 256 * data[offset + 1]
        offset += 2

    return fmt, csid, offset


def iter_rtmp_messages(
    data: bytes,
    *,
    start: int = 0,
    initial_chunk_size: int = DEFAULT_RTMP_CHUNK_SIZE,
    allow_truncated_tail: bool = True,
) -> Iterator[RtmpMessage]:
    """Yield complete RTMP messages from one directional byte stream.

    ``data`` must preserve server-to-client byte order. For a full server TCP
    stream that includes S0/S1/S2, pass ``start=3073``. The headless crawler
    already strips the handshake, so its decoder uses the default ``start=0``.
    """

    if start < 0 or start > len(data):
        raise RtmpDecodeError("RTMP start offset is outside the byte stream")

    offset = start
    chunk_size = max(1, int(initial_chunk_size))
    previous: dict[int, RtmpHeader] = {}
    assemblies: dict[int, _Assembly] = {}

    while offset < len(data):
        chunk_start = offset
        try:
            fmt, csid, offset = _basic_header(data, offset)

            continuation = (
                fmt == 3
                and csid in assemblies
                and len(assemblies[csid].data)
                < assemblies[csid].header.message_length
            )

            if fmt == 0:
                if offset + 11 > len(data):
                    raise RtmpDecodeError("truncated RTMP type-0 message header")
                timestamp_field = _u24(data, offset)
                message_length = _u24(data, offset + 3)
                type_id = data[offset + 6]
                stream_id = struct.unpack_from("<I", data, offset + 7)[0]
                offset += 11

                if message_length > MAX_RTMP_MESSAGE_SIZE:
                    raise RtmpDecodeError(
                        f"RTMP message is too large: {message_length} bytes"
                    )

                extended = timestamp_field == 0xFFFFFF
                if extended:
                    timestamp, offset = _read_u32_be(data, offset)
                else:
                    timestamp = timestamp_field

                header = RtmpHeader(
                    timestamp=timestamp,
                    timestamp_delta=0,
                    message_length=message_length,
                    type_id=type_id,
                    stream_id=stream_id,
                    extended_timestamp=extended,
                    last_fmt=fmt,
                )
                previous[csid] = header
                assemblies[csid] = _Assembly(header)

            elif fmt == 1:
                old = previous.get(csid)
                if old is None:
                    raise RtmpDecodeError(
                        f"RTMP type-1 header has no previous header for csid={csid}"
                    )
                if offset + 7 > len(data):
                    raise RtmpDecodeError("truncated RTMP type-1 message header")

                delta_field = _u24(data, offset)
                message_length = _u24(data, offset + 3)
                type_id = data[offset + 6]
                offset += 7

                if message_length > MAX_RTMP_MESSAGE_SIZE:
                    raise RtmpDecodeError(
                        f"RTMP message is too large: {message_length} bytes"
                    )

                extended = delta_field == 0xFFFFFF
                if extended:
                    delta, offset = _read_u32_be(data, offset)
                else:
                    delta = delta_field

                header = RtmpHeader(
                    timestamp=old.timestamp + delta,
                    timestamp_delta=delta,
                    message_length=message_length,
                    type_id=type_id,
                    stream_id=old.stream_id,
                    extended_timestamp=extended,
                    last_fmt=fmt,
                )
                previous[csid] = header
                assemblies[csid] = _Assembly(header)

            elif fmt == 2:
                old = previous.get(csid)
                if old is None:
                    raise RtmpDecodeError(
                        f"RTMP type-2 header has no previous header for csid={csid}"
                    )
                if offset + 3 > len(data):
                    raise RtmpDecodeError("truncated RTMP type-2 message header")

                delta_field = _u24(data, offset)
                offset += 3
                extended = delta_field == 0xFFFFFF
                if extended:
                    delta, offset = _read_u32_be(data, offset)
                else:
                    delta = delta_field

                header = RtmpHeader(
                    timestamp=old.timestamp + delta,
                    timestamp_delta=delta,
                    message_length=old.message_length,
                    type_id=old.type_id,
                    stream_id=old.stream_id,
                    extended_timestamp=extended,
                    last_fmt=fmt,
                )
                previous[csid] = header
                assemblies[csid] = _Assembly(header)

            else:
                old = previous.get(csid)
                if old is None:
                    raise RtmpDecodeError(
                        f"RTMP type-3 header has no previous header for csid={csid}"
                    )

                if continuation:
                    header = assemblies[csid].header
                    if header.extended_timestamp:
                        _, offset = _read_u32_be(data, offset)
                else:
                    timestamp = old.timestamp
                    delta = old.timestamp_delta
                    if old.last_fmt in (1, 2, 3):
                        timestamp += delta

                    header = RtmpHeader(
                        timestamp=timestamp,
                        timestamp_delta=delta,
                        message_length=old.message_length,
                        type_id=old.type_id,
                        stream_id=old.stream_id,
                        extended_timestamp=old.extended_timestamp,
                        last_fmt=fmt,
                    )

                    if header.extended_timestamp:
                        extended_value, offset = _read_u32_be(data, offset)
                        if old.last_fmt == 0:
                            header = RtmpHeader(
                                timestamp=extended_value,
                                timestamp_delta=header.timestamp_delta,
                                message_length=header.message_length,
                                type_id=header.type_id,
                                stream_id=header.stream_id,
                                extended_timestamp=True,
                                last_fmt=fmt,
                            )
                        else:
                            header = RtmpHeader(
                                timestamp=old.timestamp + extended_value,
                                timestamp_delta=extended_value,
                                message_length=header.message_length,
                                type_id=header.type_id,
                                stream_id=header.stream_id,
                                extended_timestamp=True,
                                last_fmt=fmt,
                            )

                    previous[csid] = header
                    assemblies[csid] = _Assembly(header)

            assembly = assemblies[csid]
            remaining = assembly.header.message_length - len(assembly.data)
            take = min(chunk_size, remaining)

            if offset + take > len(data):
                raise RtmpDecodeError(
                    f"truncated RTMP chunk body at byte {chunk_start}"
                )

            assembly.data.extend(data[offset : offset + take])
            offset += take

            if len(assembly.data) == assembly.header.message_length:
                message = RtmpMessage(
                    header=assembly.header,
                    body=bytes(assembly.data),
                )
                del assemblies[csid]

                if message.header.type_id == 1 and len(message.body) >= 4:
                    next_size = struct.unpack_from(">I", message.body, 0)[0]
                    chunk_size = max(1, next_size & 0x7FFFFFFF)

                yield message

        except (IndexError, KeyError, struct.error, RtmpDecodeError):
            if allow_truncated_tail:
                break
            raise


def read_utf(
    data: bytes,
    offset: int,
    *,
    long: bool = False,
) -> tuple[str, int]:
    if long:
        if offset + 4 > len(data):
            raise RtmpDecodeError("truncated AMF long-string length")
        length = struct.unpack_from(">I", data, offset)[0]
        offset += 4
    else:
        if offset + 2 > len(data):
            raise RtmpDecodeError("truncated AMF string length")
        length = struct.unpack_from(">H", data, offset)[0]
        offset += 2

    end = offset + length
    if end > len(data):
        raise RtmpDecodeError("truncated AMF string")

    return data[offset:end].decode("utf-8", "replace"), end


def parse_amf0(
    data: bytes,
    offset: int = 0,
    depth: int = 0,
) -> tuple[Any, int]:
    if depth > MAX_AMF_DEPTH:
        raise RtmpDecodeError("AMF nesting depth exceeded")
    if offset >= len(data):
        raise RtmpDecodeError("missing AMF0 marker")

    marker = data[offset]
    offset += 1

    if marker == 0:
        if offset + 8 > len(data):
            raise RtmpDecodeError("truncated AMF0 number")
        value = struct.unpack_from(">d", data, offset)[0]
        if math.isnan(value):
            value = "NaN"
        elif math.isinf(value):
            value = "Infinity" if value > 0 else "-Infinity"
        return value, offset + 8

    if marker == 1:
        if offset >= len(data):
            raise RtmpDecodeError("truncated AMF0 boolean")
        return bool(data[offset]), offset + 1

    if marker == 2:
        return read_utf(data, offset)

    if marker == 3:
        result: dict[str, Any] = {}
        while True:
            if offset + 3 > len(data):
                raise RtmpDecodeError("truncated AMF0 object")
            if data[offset : offset + 3] == b"\x00\x00\x09":
                return result, offset + 3
            key, offset = read_utf(data, offset)
            result[key], offset = parse_amf0(data, offset, depth + 1)

    if marker in (5, 6):
        return None, offset

    if marker == 7:
        if offset + 2 > len(data):
            raise RtmpDecodeError("truncated AMF0 reference")
        return {"$reference": struct.unpack_from(">H", data, offset)[0]}, offset + 2

    if marker == 8:
        if offset + 4 > len(data):
            raise RtmpDecodeError("truncated AMF0 ECMA array")
        declared_count = struct.unpack_from(">I", data, offset)[0]
        offset += 4
        result: dict[str, Any] = {"$declared_count": declared_count}
        while True:
            if offset + 3 > len(data):
                raise RtmpDecodeError("truncated AMF0 ECMA array")
            if data[offset : offset + 3] == b"\x00\x00\x09":
                return result, offset + 3
            key, offset = read_utf(data, offset)
            result[key], offset = parse_amf0(data, offset, depth + 1)

    if marker == 10:
        if offset + 4 > len(data):
            raise RtmpDecodeError("truncated AMF0 strict array")
        count = struct.unpack_from(">I", data, offset)[0]
        offset += 4
        result = []
        for _ in range(count):
            value, offset = parse_amf0(data, offset, depth + 1)
            result.append(value)
        return result, offset

    if marker == 11:
        if offset + 10 > len(data):
            raise RtmpDecodeError("truncated AMF0 date")
        milliseconds = struct.unpack_from(">d", data, offset)[0]
        timezone_minutes = struct.unpack_from(">h", data, offset + 8)[0]
        return {
            "$date_ms": milliseconds,
            "timezone_minutes": timezone_minutes,
        }, offset + 10

    if marker == 12:
        return read_utf(data, offset, long=True)

    if marker == 15:
        value, offset = read_utf(data, offset, long=True)
        return {"$xml": value}, offset

    if marker == 16:
        class_name, offset = read_utf(data, offset)
        result = {"$class": class_name}
        while True:
            if offset + 3 > len(data):
                raise RtmpDecodeError("truncated AMF0 typed object")
            if data[offset : offset + 3] == b"\x00\x00\x09":
                return result, offset + 3
            key, offset = read_utf(data, offset)
            result[key], offset = parse_amf0(data, offset, depth + 1)

    raise RtmpDecodeError(f"unsupported AMF0 marker 0x{marker:02x}")


def parse_shared_object(
    body: bytes,
) -> tuple[str, int, bytes, list[tuple[int, bytes]]]:
    name, offset = read_utf(body, 0)

    if offset + 12 > len(body):
        raise RtmpDecodeError("truncated SharedObject header")

    version = struct.unpack_from(">I", body, offset)[0]
    offset += 4
    flags = body[offset : offset + 8]
    offset += 8

    events: list[tuple[int, bytes]] = []
    while offset < len(body):
        if offset + 5 > len(body):
            raise RtmpDecodeError("truncated SharedObject event header")

        event_type = body[offset]
        event_length = struct.unpack_from(">I", body, offset + 1)[0]
        offset += 5
        end = offset + event_length

        if end > len(body):
            raise RtmpDecodeError("truncated SharedObject event data")

        events.append((event_type, body[offset:end]))
        offset = end

    return name, version, flags, events


def _iter_change_values(event_data: bytes) -> Iterator[tuple[str, Any]]:
    offset = 0
    while offset < len(event_data):
        key, value_offset = read_utf(event_data, offset)
        value, next_offset = parse_amf0(event_data, value_offset)
        if next_offset <= offset:
            raise RtmpDecodeError("AMF parser did not advance")
        yield key, value
        offset = next_offset


def _safe_state(value: Any) -> Any:
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        if math.isnan(value):
            return "NaN"
        if math.isinf(value):
            return "Infinity" if value > 0 else "-Infinity"
        return value
    if isinstance(value, list):
        return [_safe_state(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _safe_state(item) for key, item in value.items()}
    return str(value)


def _decompress_avatar_config(value: str) -> str:
    encoded = value.strip()
    if not encoded:
        raise RtmpDecodeError("avatar config is empty")

    try:
        compressed = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError) as exc:
        raise RtmpDecodeError(f"avatar config is not valid Base64: {exc}") from exc

    try:
        raw = zlib.decompress(compressed)
    except zlib.error as exc:
        raise RtmpDecodeError(f"avatar config is not valid zlib data: {exc}") from exc

    try:
        xml = raw.decode("utf-8")
    except UnicodeDecodeError:
        xml = raw.decode("utf-8", "replace")

    try:
        root = ElementTree.fromstring(xml)
    except ElementTree.ParseError as exc:
        raise RtmpDecodeError(f"avatar config is not valid XML: {exc}") from exc

    if root.tag.lower().split("}")[-1] != "avatar":
        raise RtmpDecodeError(f"unexpected avatar config root: {root.tag}")

    return xml


def _state_text(state: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = state.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""


def _observation_from_state(
    *,
    avatar_id: str,
    shared_object: str,
    version: int,
    timestamp: int,
    space_id: str,
    state: dict[str, Any],
    compressed_config: str,
) -> AvatarConfigObservation:
    xml = _decompress_avatar_config(compressed_config)
    root = ElementTree.fromstring(xml)

    first_name = _state_text(state, "firstName", "first_name")
    last_name = _state_text(state, "lastName", "last_name")
    display_name = _state_text(state, "name", "displayName", "display_name")
    if not display_name:
        display_name = " ".join(
            part for part in (first_name, last_name) if part
        ).strip()

    owner_id = _state_text(
        state,
        "ownerId",
        "owner_id",
        "userId",
        "user_id",
    ) or None

    return AvatarConfigObservation(
        avatar_id=avatar_id,
        shared_object=shared_object,
        rtmp_version=version,
        rtmp_timestamp=timestamp,
        space_id=space_id,
        owner_id=owner_id,
        display_name=display_name,
        first_name=first_name,
        last_name=last_name,
        gender=(root.attrib.get("gender") or None),
        model=_state_text(state, "model") or None,
        head_postfix=_state_text(state, "headPostfix", "head_postfix") or None,
        thumb_postfix=_state_text(state, "thumbPostfix", "thumb_postfix") or None,
        snapshot_postfix=_state_text(
            state,
            "snapshotPostfix",
            "snapshot_postfix",
        ) or None,
        compressed_config=compressed_config,
        compressed_sha256=hashlib.sha256(
            compressed_config.encode("utf-8")
        ).hexdigest(),
        config_xml=xml,
        config_sha256=hashlib.sha256(xml.encode("utf-8")).hexdigest(),
        state=_safe_state(state),
    )


def decode_avatar_configs_from_rtmp(
    data: bytes,
    *,
    space_id: str = "",
    start: int = 0,
    allow_truncated_tail: bool = True,
) -> AvatarConfigDecodeReport:
    """Decode all distinct ``Avatar.<id>.config`` values in an RTMP stream."""

    states: dict[str, dict[str, Any]] = {}
    latest_versions: dict[str, int] = {}
    captures: dict[tuple[str, str], AvatarConfigObservation] = {}

    rtmp_message_count = 0
    shared_object_message_count = 0
    avatar_shared_object_names: set[str] = set()
    first_error: str | None = None

    try:
        messages = iter_rtmp_messages(
            data,
            start=start,
            allow_truncated_tail=allow_truncated_tail,
        )

        for message in messages:
            rtmp_message_count += 1
            if message.header.type_id not in (19,):
                continue

            shared_object_message_count += 1

            try:
                name, version, _, events = parse_shared_object(message.body)
            except RtmpDecodeError as exc:
                if first_error is None:
                    first_error = f"shared_object_decode_failed: {exc}"
                continue

            if not name.startswith(AVATAR_OBJECT_PREFIX):
                continue

            avatar_shared_object_names.add(name)
            avatar_id = name[len(AVATAR_OBJECT_PREFIX) :].strip()
            if not avatar_id:
                continue

            state = states.setdefault(avatar_id, {})
            latest_versions[avatar_id] = version

            for event_type, event_data in events:
                if event_type == 4:  # SERVER_SET_ATTRIBUTE / change
                    try:
                        changes = list(_iter_change_values(event_data))
                    except RtmpDecodeError as exc:
                        if first_error is None:
                            first_error = (
                                f"{name}: change_event_decode_failed: {exc}"
                            )
                        continue

                    for key, value in changes:
                        state[key] = value

                        if key != "config" or not isinstance(value, str):
                            continue

                        try:
                            observation = _observation_from_state(
                                avatar_id=avatar_id,
                                shared_object=name,
                                version=version,
                                timestamp=message.header.timestamp,
                                space_id=space_id,
                                state=dict(state),
                                compressed_config=value,
                            )
                        except RtmpDecodeError as exc:
                            if first_error is None:
                                first_error = f"{name}: {exc}"
                            continue

                        captures[
                            (avatar_id, observation.config_sha256)
                        ] = observation

                elif event_type == 9:  # SERVER_DELETE_ATTRIBUTE / remove
                    try:
                        key, _ = read_utf(event_data, 0)
                    except RtmpDecodeError:
                        continue
                    state.pop(key, None)

    except RtmpDecodeError as exc:
        first_error = first_error or str(exc)

    observations = tuple(
        sorted(
            captures.values(),
            key=lambda row: (
                row.avatar_id,
                row.rtmp_timestamp,
                row.config_sha256,
            ),
        )
    )

    return AvatarConfigDecodeReport(
        ok=bool(observations) or first_error is None,
        observations=observations,
        rtmp_message_count=rtmp_message_count,
        shared_object_message_count=shared_object_message_count,
        avatar_shared_object_count=len(avatar_shared_object_names),
        error=first_error,
    )


def _safe_component(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("._")
    return cleaned or "avatar"


def write_avatar_config_artifacts(
    report: AvatarConfigDecodeReport,
    out_dir: Path | str,
    *,
    observed_at: str | None = None,
) -> dict[str, Any]:
    """Persist decoded avatar config payloads before raw RTMP bytes are deleted."""

    root = Path(out_dir)
    root.mkdir(parents=True, exist_ok=True)
    observed = observed_at or datetime.now(timezone.utc).replace(
        microsecond=0
    ).isoformat()

    rows: list[dict[str, Any]] = []

    for observation in report.observations:
        avatar_dir = root / _safe_component(observation.avatar_id)
        avatar_dir.mkdir(parents=True, exist_ok=True)

        stem = observation.config_sha256
        xml_path = avatar_dir / f"{stem}.xml"
        compressed_path = avatar_dir / f"{stem}.config.txt"
        state_path = avatar_dir / f"{stem}.state.json"

        xml_path.write_text(
            observation.config_xml
            + ("" if observation.config_xml.endswith("\n") else "\n"),
            encoding="utf-8",
        )
        compressed_path.write_text(
            observation.compressed_config + "\n",
            encoding="utf-8",
        )
        state_path.write_text(
            json.dumps(
                observation.state,
                indent=2,
                ensure_ascii=False,
                sort_keys=True,
            )
            + "\n",
            encoding="utf-8",
        )

        row = observation.to_dict(include_payloads=False)
        row.update(
            {
                "observed_at": observed,
                "config_xml_path": str(xml_path),
                "compressed_config_path": str(compressed_path),
                "state_path": str(state_path),
            }
        )
        rows.append(row)

    manifest = {
        "schema": "smallverse-avatar-config-manifest/v1",
        "ok": report.ok,
        "generated_at": observed,
        "avatar_config_count": len(rows),
        "rtmp_message_count": report.rtmp_message_count,
        "shared_object_message_count": report.shared_object_message_count,
        "avatar_shared_object_count": report.avatar_shared_object_count,
        "decode_error": report.error,
        "avatar_configs": rows,
    }

    manifest_path = root / "manifest.json"
    temp_path = manifest_path.with_suffix(".json.tmp")
    temp_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temp_path.replace(manifest_path)

    return {
        **manifest,
        "manifest_path": str(manifest_path),
    }
