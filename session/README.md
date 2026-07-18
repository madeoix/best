# Smallverse session helper

This directory contains the session capture and VPS crawler-renewal runtime
used by the Tauri desktop application.

- `auto_jsessionid.py` observes refreshed JSESSIONID/SWSID pairs and imports them
  through SSH stdin.
- `grab-session.sh` launches Smallverse through the private proxy.
- `crawler_autologin.mjs` reads an enrolled crawler login from GNOME Keyring and
  fills a login form through a loopback Electron DevTools endpoint. On the VPS
  it also follows the real Enter World flow so Smallverse issues the gateway
  `JSESSIONID` after the website's `SWSID`.
- `crawler-vps-human-login.sh` opens a private SSH tunnel to the VPS display;
  Smallverse itself never runs on the desktop for this flow.
- `vps-crawler-human-login.sh` attaches the loopback-only VNC bridge and imports
  the fresh cookie pair directly into the VPS crawler profile store.
- `crawler-session-renew.sh` renews one isolated crawler account.
- `crawler-session-renew-both.sh` renews both enrolled crawler accounts in
  sequence.

Crawler passwords never appear in process arguments, environment variables,
public logs, the repository, or Smallverse workspaces. They are stored in GNOME
Keyring locally and in a root-only `0600` credential file on the VPS so a
VPS-origin login can be filled without exposing the password. Personal and
crawler application storage remains separate.
