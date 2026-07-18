"""Narrow compatibility guard for the externally packaged crawler core.

Smallverse session-sync v9 through v9.2 shipped an
``_extract_avatar_equipped_records`` branch that reads ``decoded_config``
without assigning it.  A capture containing ``Avatar.<id>`` therefore raises a
NameError before any session evidence is committed.  The authoritative package
is provisioned outside this application repository, so this adapter makes the
known defect explicit and keeps the relationship evidence available until that
package is upgraded.

The guard supplies ``None`` only for the missing optional decoded item-config
field. It does not invent an owner, slot, body snapshot, item UID, or item XML;
the parser still has to recover those fields itself. The compatibility status is
returned to the import report so the fallback can never be silent.
"""
from __future__ import annotations

from types import ModuleType
from typing import Any


KNOWN_BROKEN_PACKAGES = (
    "smallverse-session-sync-v9",
    "smallverse-session-sync-v9.1",
    "smallverse-session-sync-v9.2",
)


def prepare_observatory_parser(module: ModuleType) -> dict[str, Any]:
    extractor = getattr(module, "_extract_avatar_equipped_records", None)
    code = getattr(extractor, "__code__", None)
    unresolved = bool(
        code is not None
        and "decoded_config" in code.co_names
        and "decoded_config" not in code.co_varnames
    )
    if not unresolved:
        return {
            "status": "native",
            "known_defect": None,
            "decoded_item_config_available": True,
        }

    # Python resolves the accidentally unbound name in module globals. Supplying
    # None preserves the explicit Avatar↔UID↔XML relationship while truthfully
    # marking the optional decoded item config unavailable.
    setattr(module, "decoded_config", None)
    return {
        "status": "guarded-external-parser",
        "known_defect": "unbound-decoded-config-in-avatar-equipped-branch",
        "decoded_item_config_available": False,
        "upgrade_required": list(KNOWN_BROKEN_PACKAGES),
    }


def extract_observatory_records(
    module: ModuleType,
    data: bytes,
    session_name: str,
    *,
    origin: str,
):
    compatibility = prepare_observatory_parser(module)
    records = module.extract_observatory_records_from_bytes(
        data,
        session_name,
        origin=origin,
    )
    return (*records, compatibility)
