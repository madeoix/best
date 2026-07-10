#!/usr/bin/env python3

import hashlib
import json
import re
import struct
import zlib
from pathlib import Path


CACHE = Path.home() / ".config/SmallVerse/Cache"
OUTPUT = Path.home() / "smallverse-lab/recovered-swfs"

OUTPUT.mkdir(parents=True, exist_ok=True)

PRINTABLE_RE = re.compile(rb"[\x20-\x7e]{4,}")
URL_RE = re.compile(rb"https?://[^\x00-\x20\"'<>]+", re.I)

TERM_RE = re.compile(
    rb"ColorTransform|colorTransform|"
    rb"redMultiplier|greenMultiplier|blueMultiplier|alphaMultiplier|"
    rb"redOffset|greenOffset|blueOffset|alphaOffset|"
    rb"brightness|contrast|setTint|applyTint|"
    rb"HairBase|SkinBase|MakeupLeft|LeftPupil|RightPupil|"
    rb"avatar_design|saveAvatarSnapshot|"
    rb"AvatarRenderer|AvatarDesign|"
    rb"\bsId\b|\blId\b",
    re.I,
)


def valid_header(data, offset):
    if offset + 8 > len(data):
        return None

    signature = data[offset:offset + 3]

    if signature not in (b"FWS", b"CWS", b"ZWS"):
        return None

    version = data[offset + 3]
    declared = struct.unpack_from("<I", data, offset + 4)[0]

    if not 1 <= version <= 50:
        return None

    if not 8 <= declared <= 512 * 1024 * 1024:
        return None

    return {
        "signature": signature.decode(),
        "version": version,
        "declared_length": declared,
    }


def find_payload(data):
    candidates = []

    for signature in (b"CWS", b"FWS", b"ZWS"):
        start = 0

        while True:
            offset = data.find(signature, start)

            if offset == -1:
                break

            header = valid_header(data, offset)

            if header:
                candidates.append((offset, header))

            start = offset + 1

    return min(candidates, default=None, key=lambda item: item[0])


def decompress_payload(data, offset, header):
    signature = header["signature"]
    declared = header["declared_length"]

    if signature == "FWS":
        return data[offset:offset + declared]

    if signature == "ZWS":
        raise RuntimeError("ZWS/LZMA payload not supported by this extractor")

    decompressor = zlib.decompressobj()
    body = decompressor.decompress(data[offset + 8:])
    body += decompressor.flush()

    return (
        b"FWS"
        + data[offset + 3:offset + 8]
        + body
    )


def printable_values(data):
    return [
        value.decode("utf-8", errors="replace")
        for value in PRINTABLE_RE.findall(data)
    ]


manifest = []

for cache_file in sorted(CACHE.iterdir()):
    if not cache_file.is_file():
        continue

    try:
        raw = cache_file.read_bytes()
    except OSError:
        continue

    found = find_payload(raw)

    if not found:
        continue

    offset, header = found

    try:
        swf = decompress_payload(
            raw,
            offset,
            header,
        )
    except Exception as exc:
        print(f"\n===== {cache_file.name} =====")
        print("extraction error:", exc)
        continue

    declared = header["declared_length"]

    # The Chrome cache key normally lives immediately before the body.
    preamble = raw[:offset]
    preamble_strings = printable_values(preamble)

    urls = sorted({
        match.decode("utf-8", errors="replace")
        for match in URL_RE.findall(raw[:offset + 4096])
    })

    all_strings = printable_values(swf)

    term_hits = sorted({
        value
        for value in all_strings
        if TERM_RE.search(
            value.encode("utf-8", errors="ignore")
        )
    })

    swf_urls = sorted({
        match.decode("utf-8", errors="replace")
        for match in URL_RE.findall(swf)
    })

    digest = hashlib.sha256(swf).hexdigest()

    output_name = (
        f"{cache_file.name}"
        f"-v{header['version']}"
        f"-{declared}"
        f".swf"
    )

    output_path = OUTPUT / output_name
    output_path.write_bytes(swf)

    record = {
        "cache_file": str(cache_file),
        "cache_file_size": len(raw),
        "cache_payload_offset": offset,
        "original_signature": header["signature"],
        "version": header["version"],
        "declared_length": declared,
        "extracted_length": len(swf),
        "length_matches": len(swf) == declared,
        "sha256": digest,
        "output": str(output_path),
        "cache_urls": urls,
        "cache_preamble_strings": preamble_strings[-12:],
        "embedded_swf_urls": swf_urls[:40],
        "term_hits": term_hits[:100],
    }

    manifest.append(record)

    print("\n" + "=" * 80)
    print(output_name)
    print("signature:", header["signature"])
    print("version:", header["version"])
    print("declared:", declared)
    print("extracted:", len(swf))
    print("length matches:", len(swf) == declared)
    print("sha256:", digest)

    print("\ncache URLs:")
    for value in urls:
        print(" ", value)

    print("\ncache preamble:")
    for value in preamble_strings[-12:]:
        print(" ", value)

    print("\nrelevant strings:")
    for value in term_hits[:40]:
        print(" ", value[:500])

    print("\nembedded SWF URLs:")
    for value in swf_urls[:20]:
        print(" ", value)

manifest_path = OUTPUT / "manifest.json"
manifest_path.write_text(
    json.dumps(manifest, indent=2)
)

print("\n" + "=" * 80)
print("extracted:", len(manifest))
print("manifest:", manifest_path)
