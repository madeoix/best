from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

MODULE_PATH = Path(__file__).with_name("auto_jsessionid.py")
SPEC = importlib.util.spec_from_file_location("auto_jsessionid", MODULE_PATH)
assert SPEC and SPEC.loader
module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = module
SPEC.loader.exec_module(module)


def test_cookie_pair_canonicalization() -> None:
    values = module.cookie_pairs(
        "OTHER=x; SWSID=sw-token; JSESSIONID=java-token; ignored=y"
    )
    assert values == {"SWSID": "sw-token", "JSESSIONID": "java-token"}
    assert module.canonical_cookie(values) == (
        "JSESSIONID=java-token; SWSID=sw-token"
    )


def test_set_cookie_merge_supports_independent_refreshes() -> None:
    assert module.set_cookie_pairs([
        "JSESSIONID=new-java; Path=/; HttpOnly",
        "SWSID=new-sw; Path=/; Secure",
    ]) == {
        "JSESSIONID": "new-java",
        "SWSID": "new-sw",
    }


def test_role_routes_crawler_to_staging_dual(monkeypatch) -> None:
    monkeypatch.delenv("SMALLVERSE_CRAWLER_REMOTE_WORKSPACE", raising=False)
    monkeypatch.delenv("SMALLVERSE_USER_REMOTE_WORKSPACE", raising=False)
    assert module.workspace_for_role("crawler") == (
        "/opt/smallverse-staging-dual/workspace"
    )
    assert module.workspace_for_role("user") == "/opt/smallverse/workspace"


def test_smallverse_host_filter_is_scoped() -> None:
    assert module.host_is_smallverse("smallverse.app")
    assert module.host_is_smallverse("gateway.smallverse.app")
    assert not module.host_is_smallverse("smallverse.app.example.com")
    assert not module.host_is_smallverse("example.com")


def test_first_observation_is_attempted_even_if_local_copy_exists(monkeypatch) -> None:
    module.SUCCESSFUL_FINGERPRINTS.clear()
    module.LAST_ATTEMPT_AT.clear()
    calls = []
    monkeypatch.setattr(module, "remote_import", lambda config, cookie: calls.append(cookie) or {
        "ok": True,
        "profile": {
            "profile_id": "profile-abc",
            "name": "crawler-01",
            "role": "crawler",
            "session_generation": 3,
            "fingerprint": "remote-fingerprint",
        },
    })
    monkeypatch.setattr(module, "write_local_profile", lambda *args, **kwargs: None)
    monkeypatch.setattr(module, "append_public_event", lambda *args, **kwargs: None)
    config = module.SyncConfig(
        profile="crawler-01",
        role="crawler",
        ssh_host="casa",
        remote_workspace="/opt/smallverse-staging-dual/workspace",
        remote_python="python",
        remote_source="source",
    )
    cookie = "JSESSIONID=j; SWSID=s"
    assert module.sync_cookie(config, cookie, source="test") is True
    assert module.sync_cookie(config, cookie, source="test") is False
    assert calls == [cookie]


def test_remote_import_sends_cookie_only_on_stdin(monkeypatch) -> None:
    captured = {}

    class Completed:
        returncode = 0
        stderr = ""
        stdout = (
            '{"ok": true, "profile": {'
            '"profile_id": "profile-abc", '
            '"name": "crawler-01", "role": "crawler", '
            '"session_generation": 4, "fingerprint": "opaque"}}'
        )

    def fake_run(args, **kwargs):
        captured["args"] = args
        captured["input"] = kwargs.get("input")
        return Completed()

    monkeypatch.setattr(module.subprocess, "run", fake_run)
    config = module.SyncConfig(
        profile="crawler-01",
        role="crawler",
        ssh_host="casa",
        remote_workspace="/opt/smallverse-staging-dual/workspace",
        remote_python="/opt/smallverse-universal/.venv/bin/python",
        remote_source="/opt/smallverse-universal/current",
    )
    secret = "JSESSIONID=very-secret-java; SWSID=very-secret-sw"
    result = module.remote_import(config, secret)
    assert result["profile"]["session_generation"] == 4
    assert captured["input"] == secret
    assert all("very-secret" not in value for value in captured["args"])
    assert "bash -c" in captured["args"][-1]


def test_failed_sync_can_retry_after_cooldown(monkeypatch) -> None:
    module.SUCCESSFUL_FINGERPRINTS.clear()
    module.LAST_ATTEMPT_AT.clear()
    clock = iter([10.0, 20.0, 50.0])
    monkeypatch.setattr(module.time, "monotonic", lambda: next(clock))
    attempts = []
    monkeypatch.setattr(
        module,
        "remote_import",
        lambda config, cookie: attempts.append(cookie) or (_ for _ in ()).throw(RuntimeError("offline")),
    )
    monkeypatch.setattr(module, "append_public_event", lambda *args, **kwargs: None)
    config = module.SyncConfig(
        profile="crawler-01",
        role="crawler",
        ssh_host="casa",
        remote_workspace="/opt/smallverse-staging-dual/workspace",
        remote_python="python",
        remote_source="source",
    )
    cookie = "JSESSIONID=j; SWSID=s"
    assert module.sync_cookie(config, cookie, source="test") is False
    assert module.sync_cookie(config, cookie, source="test") is False
    assert module.sync_cookie(config, cookie, source="test") is False
    assert attempts == [cookie, cookie]


def test_mitmproxy_style_loader_without_sys_modules_registration() -> None:
    """The addon must load under mitmproxy's dynamic script loader.

    This deliberately does *not* insert the module into ``sys.modules`` before
    execution. The previous dataclass-based config crashed here on Python 3.12
    with ``NoneType has no attribute __dict__``.
    """
    spec = importlib.util.spec_from_file_location(
        "mitmproxy_dynamic_auto_jsessionid",
        MODULE_PATH,
    )
    assert spec and spec.loader
    dynamically_loaded = importlib.util.module_from_spec(spec)
    sys.modules.pop(spec.name, None)
    spec.loader.exec_module(dynamically_loaded)
    assert dynamically_loaded.addons
    assert dynamically_loaded.SyncConfig(
        profile="crawler-01",
        role="crawler",
        ssh_host="casa",
        remote_workspace="/tmp/workspace",
        remote_python="python",
        remote_source="source",
    ).profile == "crawler-01"
