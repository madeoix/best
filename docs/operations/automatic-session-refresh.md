# Automatic crawler session renewal

Beacon stores the editable copy of each crawler login in the local Linux Secret
Service (GNOME Keyring). When a VPS login is requested, Beacon provisions that
credential through SSH standard input to a root-only `0600` file on the VPS.
The password is never written to the repository, a `.env` file, the Smallverse
workspace, command-line arguments, or public logs.

## Enrollment flow

Open the desktop session menu and choose **Crawler accounts and automatic
renewal**. Enter the dedicated email and password for `crawler-01` and
`crawler-02`. Beacon sends the credential JSON to `secret-tool store` through
stdin. Two entries named `Smallverse Beacon — crawler-01` and
`Smallverse Beacon — crawler-02` appear in Passwords and Keys.

## Renewal flow

When **Renew session now** is selected, Beacon:

1. Keeps Smallverse running on the VPS with a dedicated Electron
   `--user-data-dir` for that crawler. Personal and crawler browser storage
   never mix.
2. Attaches a loopback-only VNC/noVNC bridge to that existing VPS display and
   forwards it through a private SSH tunnel. Only screen pixels and user input
   cross the tunnel; Smallverse network traffic continues to originate on the
   VPS.
3. Reads the selected login from the root-only VPS credential store and fills
   the form through the VPS Electron DevTools endpoint without submitting it.
4. Waits for the user to solve reCAPTCHA and click Login in the remote screen.
5. Follows Smallverse's real profile → destination → Enter World flow. The web
   login supplies `SWSID`; entering a world supplies the gateway
   `JSESSIONID`.
6. Imports the resulting cookie pair directly into the crawler profile store at
   `/opt/smallverse-staging-dual/workspace`; session cookies never need to come
   back to the desktop.
7. Mirrors only the secret-free generation, readiness, and opaque fingerprint
   metadata so Beacon can display the VPS result.
8. Closes the temporary VNC/SSH bridge while leaving the authenticated VPS
   Smallverse client running for crawler jobs.

The two crawler profiles remain excluded from personal Spin and Zoltar account
selection.

## Dependencies

Linux desktop renewal requires:

- GNOME Keyring / Secret Service
- `secret-tool` from the `libsecret-tools` package
- Node.js
- SSH access through the `casa` host alias

The VPS additionally requires Smallverse, Xvfb, x11vnc, noVNC/websockify, and
the crawler session-profile importer.

The desktop panel reports when `secret-tool` is missing. It never falls back to
plaintext credential files.
