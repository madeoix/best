import argparse
import gzip
import io
import json
import re
import tarfile
import zipfile
from pathlib import Path

NEEDLES = [
    b"/api/avatar",
    b"/api/avatars",
    b"api.smallverse.app",
    b"uploads/avatars",
]

SENSITIVE = re.compile(rb"^(cookie|authorization|x-api-key|x-auth-token):", re.I)


def read_bytes_from_container(path):
    path = Path(path)

    if tarfile.is_tarfile(path):
        with tarfile.open(path, "r:*") as tar:
            for member in tar.getmembers():
                if not member.isfile():
                    continue
                f = tar.extractfile(member)
                if not f:
                    continue
                data = f.read()
                yield member.name, data

                if member.name.lower().endswith(".saz") or zipfile.is_zipfile(io.BytesIO(data)):
                    yield from read_zip_bytes(member.name, data)
        return

    data = path.read_bytes()
    yield path.name, data

    if zipfile.is_zipfile(path):
        yield from read_zip_path(path)


def read_zip_path(path):
    with zipfile.ZipFile(path) as z:
        for name in z.namelist():
            if name.endswith("/"):
                continue
            data = z.read(name)
            yield name, data


def read_zip_bytes(prefix, data):
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for name in z.namelist():
                if name.endswith("/"):
                    continue
                yield f"{prefix}!{name}", z.read(name)
    except Exception:
        return


def maybe_text(data):
    # Fiddler raw bodies are usually plain text. Some are gzipped.
    if data[:2] == b"\x1f\x8b":
        try:
            data = gzip.decompress(data)
        except Exception:
            pass

    try:
        return data.decode("utf-8", errors="replace")
    except Exception:
        return ""


def redact_header(line):
    raw = line.encode("utf-8", errors="replace")
    if SENSITIVE.search(raw):
        key = line.split(":", 1)[0]
        return f"{key}: <redacted>"
    return line


def print_request_block(name, text):
    lines = text.splitlines()

    for i, line in enumerate(lines):
        low = line.lower()

        if (
            (line.startswith(("GET ", "POST ", "PUT ", "PATCH ", "OPTIONS ")))
            and ("avatar" in low or "smallverse" in low)
        ):
            block = lines[i:i + 40]
            joined = "\n".join(block).lower()

            if "/api/avatar" not in joined and "/api/avatars" not in joined and "uploads/avatars" not in joined:
                continue

            print("\n" + "=" * 100)
            print(name)
            print("-" * 100)

            for out in block:
                if out.strip() == "":
                    break
                print(redact_header(out))

        # Also catch absolute URLs embedded in JSON/browser logs.
        if "https://api.smallverse.app" in line and "avatar" in low:
            print("\n" + "=" * 100)
            print(name)
            print("-" * 100)
            print(line[:1200])


def print_response_json_near_avatar(name, text):
    if "thumbUrl" not in text and "snapUrl" not in text and "uploads/avatars" not in text:
        return

    for m in re.finditer(r'\{[^{}]*(?:thumbUrl|snapUrl|uploads/avatars)[\s\S]{0,2500}', text):
        snippet = m.group(0)
        print("\n" + "=" * 100)
        print(name)
        print("JSON/avatar snippet")
        print("-" * 100)
        print(snippet[:2000])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    args = ap.parse_args()

    hits = 0

    for name, data in read_bytes_from_container(args.path):
        if not any(n in data for n in NEEDLES):
            continue

        text = maybe_text(data)
        if not text:
            continue

        before = hits
        print_request_block(name, text)
        print_response_json_near_avatar(name, text)

        if before != hits:
            pass

    print("\nDone. Look for the exact request line above, e.g. GET /api/avatar?... or POST /api/avatar")


if __name__ == "__main__":
    main()
