#!/usr/bin/env python3
"""Minimal, dependency-free AMF0/AMF3 decoder for SmallVerse gateway requests.

It intentionally implements only decoding. The supported AMF3 surface includes
ByteArray, strings, arrays, and ordinary objects because avatar save requests
carry PNG payloads as AMF3 ByteArrays inside an AMF0 remoting envelope.
"""

from __future__ import annotations

import io
import struct
from dataclasses import dataclass
from typing import Any


class AMFDecodeError(ValueError):
    pass


@dataclass(frozen=True)
class RemotingMessage:
    target: str
    response: str
    body: Any


class Reader:
    def __init__(self, data: bytes):
        self.stream = io.BytesIO(data)

    def tell(self) -> int:
        return self.stream.tell()

    def read(self, count: int) -> bytes:
        data = self.stream.read(count)
        if len(data) != count:
            raise AMFDecodeError(
                f"Unexpected end of AMF data at offset {self.tell()}; "
                f"wanted {count} bytes, received {len(data)}"
            )
        return data

    def u8(self) -> int:
        return self.read(1)[0]

    def u16(self) -> int:
        return struct.unpack(">H", self.read(2))[0]

    def u32(self) -> int:
        return struct.unpack(">I", self.read(4))[0]

    def double(self) -> float:
        return struct.unpack(">d", self.read(8))[0]

    def utf16(self) -> str:
        return self.read(self.u16()).decode("utf-8", "replace")

    def utf32(self) -> str:
        return self.read(self.u32()).decode("utf-8", "replace")


class AMF3Decoder:
    def __init__(self, reader: Reader):
        self.reader = reader
        self.string_refs: list[str] = []
        self.object_refs: list[Any] = []
        self.trait_refs: list[tuple[str, bool, bool, list[str]]] = []

    def u29(self) -> int:
        value = 0
        for index in range(4):
            byte = self.reader.u8()
            if index < 3:
                value = (value << 7) | (byte & 0x7F)
                if not (byte & 0x80):
                    return value
            else:
                return (value << 8) | byte
        raise AMFDecodeError("Invalid AMF3 U29 value")

    def string(self) -> str:
        header = self.u29()
        if not (header & 1):
            index = header >> 1
            try:
                return self.string_refs[index]
            except IndexError as exc:
                raise AMFDecodeError(f"Invalid AMF3 string reference {index}") from exc

        length = header >> 1
        if length == 0:
            return ""
        value = self.reader.read(length).decode("utf-8", "replace")
        self.string_refs.append(value)
        return value

    def value(self) -> Any:
        marker = self.reader.u8()

        if marker in (0x00, 0x01):  # undefined, null
            return None
        if marker == 0x02:
            return False
        if marker == 0x03:
            return True
        if marker == 0x04:
            value = self.u29()
            return value - (1 << 29) if value & (1 << 28) else value
        if marker == 0x05:
            return self.reader.double()
        if marker == 0x06:
            return self.string()
        if marker in (0x07, 0x0B):  # XML / XML document
            return self._xml()
        if marker == 0x08:
            return self._date()
        if marker == 0x09:
            return self._array()
        if marker == 0x0A:
            return self._object()
        if marker == 0x0C:
            return self._bytearray()

        raise AMFDecodeError(f"Unsupported AMF3 marker 0x{marker:02x}")

    def _object_reference(self, header: int) -> Any | None:
        if header & 1:
            return None
        index = header >> 1
        try:
            return self.object_refs[index]
        except IndexError as exc:
            raise AMFDecodeError(f"Invalid AMF3 object reference {index}") from exc

    def _bytearray(self) -> bytes:
        header = self.u29()
        reference = self._object_reference(header)
        if reference is not None:
            if not isinstance(reference, bytes):
                raise AMFDecodeError("AMF3 ByteArray reference is not bytes")
            return reference
        value = self.reader.read(header >> 1)
        self.object_refs.append(value)
        return value

    def _xml(self) -> str:
        header = self.u29()
        reference = self._object_reference(header)
        if reference is not None:
            return str(reference)
        value = self.reader.read(header >> 1).decode("utf-8", "replace")
        self.object_refs.append(value)
        return value

    def _date(self) -> float:
        header = self.u29()
        reference = self._object_reference(header)
        if reference is not None:
            return float(reference)
        value = self.reader.double()
        self.object_refs.append(value)
        return value

    def _array(self) -> Any:
        header = self.u29()
        reference = self._object_reference(header)
        if reference is not None:
            return reference

        dense_count = header >> 1
        associative: dict[str, Any] = {}
        dense: list[Any] = []
        placeholder: dict[str, Any] = {"associative": associative, "dense": dense}
        self.object_refs.append(placeholder)

        while True:
            key = self.string()
            if not key:
                break
            associative[key] = self.value()
        for _ in range(dense_count):
            dense.append(self.value())

        if not associative:
            self.object_refs[-1] = dense
            return dense
        return placeholder

    def _object(self) -> Any:
        header = self.u29()
        reference = self._object_reference(header)
        if reference is not None:
            return reference

        trait_header = header >> 1
        if not (trait_header & 1):
            trait_index = trait_header >> 1
            try:
                class_name, dynamic, externalizable, sealed_names = self.trait_refs[trait_index]
            except IndexError as exc:
                raise AMFDecodeError(f"Invalid AMF3 trait reference {trait_index}") from exc
        else:
            externalizable = bool(trait_header & 2)
            dynamic = bool(trait_header & 4)
            sealed_count = trait_header >> 3
            class_name = self.string()
            sealed_names = [self.string() for _ in range(sealed_count)]
            self.trait_refs.append((class_name, dynamic, externalizable, sealed_names))

        if externalizable:
            raise AMFDecodeError(
                f"Externalizable AMF3 object is unsupported: {class_name or '<anonymous>'}"
            )

        result: dict[str, Any] = {}
        if class_name:
            result["__class__"] = class_name
        self.object_refs.append(result)

        for name in sealed_names:
            result[name] = self.value()
        if dynamic:
            while True:
                name = self.string()
                if not name:
                    break
                result[name] = self.value()
        return result


class AMF0Decoder:
    def __init__(self, reader: Reader):
        self.reader = reader
        self.object_refs: list[Any] = []
        self.amf3 = AMF3Decoder(reader)

    def value(self) -> Any:
        marker = self.reader.u8()

        if marker == 0x00:
            return self.reader.double()
        if marker == 0x01:
            return bool(self.reader.u8())
        if marker == 0x02:
            return self.reader.utf16()
        if marker == 0x03:
            return self._object()
        if marker in (0x05, 0x06):
            return None
        if marker == 0x07:
            index = self.reader.u16()
            try:
                return self.object_refs[index]
            except IndexError as exc:
                raise AMFDecodeError(f"Invalid AMF0 object reference {index}") from exc
        if marker == 0x08:
            self.reader.u32()  # associative count hint
            return self._object()
        if marker == 0x0A:
            count = self.reader.u32()
            result: list[Any] = []
            self.object_refs.append(result)
            result.extend(self.value() for _ in range(count))
            return result
        if marker == 0x0B:
            milliseconds = self.reader.double()
            self.reader.read(2)  # timezone, deprecated
            return milliseconds
        if marker == 0x0C:
            return self.reader.utf32()
        if marker == 0x0F:
            return self.reader.utf32()
        if marker == 0x10:
            class_name = self.reader.utf16()
            result = self._object()
            if isinstance(result, dict) and class_name:
                result["__class__"] = class_name
            return result
        if marker == 0x11:
            return self.amf3.value()

        raise AMFDecodeError(
            f"Unsupported AMF0 marker 0x{marker:02x} at offset {self.reader.tell() - 1}"
        )

    def _object(self) -> dict[str, Any]:
        result: dict[str, Any] = {}
        self.object_refs.append(result)
        while True:
            key_length = self.reader.u16()
            if key_length == 0:
                marker = self.reader.u8()
                if marker == 0x09:
                    break
                raise AMFDecodeError(
                    f"Invalid AMF0 object terminator marker 0x{marker:02x}"
                )
            key = self.reader.read(key_length).decode("utf-8", "replace")
            result[key] = self.value()
        return result


def decode_remoting_envelope(data: bytes) -> list[RemotingMessage]:
    reader = Reader(data)
    version = reader.u16()
    if version not in (0, 3):
        raise AMFDecodeError(f"Unsupported AMF envelope version {version}")

    decoder = AMF0Decoder(reader)
    header_count = reader.u16()
    for _ in range(header_count):
        reader.utf16()  # name
        reader.u8()  # must understand
        reader.u32()  # encoded length hint
        decoder.value()

    message_count = reader.u16()
    messages: list[RemotingMessage] = []
    for _ in range(message_count):
        target = reader.utf16()
        response = reader.utf16()
        reader.u32()  # encoded length hint, often 0xffffffff
        body = decoder.value()
        messages.append(RemotingMessage(target=target, response=response, body=body))
    return messages
