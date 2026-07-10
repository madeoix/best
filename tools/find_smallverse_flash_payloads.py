#!/usr/bin/env python3

import json
import re
import struct
from pathlib import Path


PROFILE = Path.home() / ".config/SmallVerse"

SCAN_ROOTS = [
    PROFILE / "gateway-captures",
    PROFILE / "Cache",
    PROFILE / "Code Cache",
    PROFILE / "GPUCache",
    PROFILE / "Service Worker",
    PROFILE,
]

URL_PATTERN = re.compile(
    r'https?://[^"\'\s<>]+',
    re.I,
)

FLASH_PATTERN = re.compile(
    r'\.swf(?:[?#][^"\'\s<>]*)?$|'
    r'application/x-shockwave-flash|'
    r'shockwave|'
    r'pepperflash',
    re.I,
)


def walk_strings(value):
    if isinstance(value, str):
        yield value

    elif isinstance(value, dict):
        for key, child in value.items():
            yield str(key)
            yield from walk_strings(child)

    elif isinstance(value, list):
        for child in value:
            yield from walk_strings(child)


def valid_swf_header(data, offset):
    if offset + 8 > len(data):
        return None

    signature = data[offset:offset + 3]

    if signature not in (b"FWS", b"CWS", b"ZWS"):
        return None

    version = data[offset + 3]

    if not 1 <= version <= 50:
        return None

    declared_length = struct.unpack_from(
        "<I",
        data,
        offset + 4,
    )[0]

    if not 8 <= declared_length <= 512 * 1024 * 1024:
        return None

    # An uncompressed FWS must fit entirely inside the containing file.
    if (
        signature == b"FWS"
        and offset + declared_length > len(data)
    ):
        return None

    return {
        "signature": signature.decode(),
        "version": version,
        "declared_length": declared_length,
    }


print("===== FLASH URLS IN GATEWAY CAPTURES =====")

capture_urls = set()
capture_root = PROFILE / "gateway-captures"

if capture_root.exists():
    for path in capture_root.rglob("*.json"):
        try:
            document = json.loads(
                path.read_text(errors="ignore")
            )
        except Exception:
            continue

        for value in walk_strings(document):
            for match in URL_PATTERN.findall(value):
                if FLASH_PATTERN.search(match):
                    capture_urls.add(
                        (match, str(path))
                    )

if capture_urls:
    for url, path in sorted(capture_urls):
        print(url)
        print("  capture:", path)
else:
    print("none")


print("\n===== VALID SWF PAYLOADS IN SMALLVERSE PROFILE =====")

seen_files = set()
payload_hits = []

for root in SCAN_ROOTS:
    if not root.exists():
        continue

    for path in root.rglob("*"):
        if not path.is_file():
            continue

        try:
            resolved = path.resolve()
        except OSError:
            continue

        if resolved in seen_files:
            continue

        seen_files.add(resolved)

        try:
            size = path.stat().st_size
        except OSError:
            continue

        if size < 8 or size > 512 * 1024 * 1024:
            continue

        try:
            data = path.read_bytes()
        except OSError:
            continue

        for signature in (b"FWS", b"CWS", b"ZWS"):
            start = 0

            while True:
                offset = data.find(signature, start)

                if offset == -1:
                    break

                header = valid_swf_header(
                    data,
                    offset,
                )

                if header:
                    payload_hits.append({
                        "path": str(path),
                        "file_size": size,
                        "offset": offset,
                        **header,
                    })

                start = offset + 1

if payload_hits:
    for hit in payload_hits:
        print(
            f'{hit["signature"]} '
            f'version={hit["version"]} '
            f'declared={hit["declared_length"]} '
            f'offset={hit["offset"]} '
            f'file_size={hit["file_size"]}'
        )
        print(" ", hit["path"])
else:
    print("none")


print("\n===== FLASH-LIKE URL STRINGS IN PROFILE FILES =====")

string_hits = set()

for path in seen_files:
    try:
        size = path.stat().st_size
    except OSError:
        continue

    if size <= 0 or size > 64 * 1024 * 1024:
        continue

    try:
        data = path.read_bytes()
    except OSError:
        continue

    text = data.decode(
        "latin-1",
        errors="ignore",
    )

    for url in URL_PATTERN.findall(text):
        if FLASH_PATTERN.search(url):
            string_hits.add(
                (url, str(path))
            )

if string_hits:
    for url, path in sorted(string_hits):
        print(url)
        print("  file:", path)
else:
    print("none")
