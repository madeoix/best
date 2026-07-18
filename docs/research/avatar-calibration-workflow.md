# Avatar calibration workflow

Beacon treats captured SmallVerse render output as the production source of truth.
The O3D renderer is an experimental reconstruction lab until it matches the captured output.

## Capture a male calibration state

1. Start the watcher before opening or saving the avatar editor:

   ```bash
   cd ~/smallverse-lab
   ./tools/capture_avatar_calibration.sh
   ```

2. In SmallVerse, use a male avatar you control. Open the avatar editor, make one visible harmless change, and save.
3. Leave the game open for about 20 seconds so any snapshot request can also be collected.
4. The watcher writes a sanitized archive and SHA-256 file to `~/Downloads`.

The archive contains only decoded configuration XML and PNG render outputs. It excludes gateway URLs, cookies, headers, raw AMF bodies, and session identifiers.

## Install a sanitized pack into the local renderer lab

```bash
cd ~/smallverse-lab
python3 tools/import_avatar_calibration_pack.py ~/Downloads/avatar-calibration-male-*.tar.gz
```

Then open `/avatar-render/<avatar-id>` locally. The production render stays authoritative; the calibration states and experimental reconstruction are separate.

## Build a selected renderer contract from an installed pack

After importing a sanitized calibration pack, build the exact selected O3D and
head-sprite contract with:

```bash
cd ~/smallverse-lab
./tools/bootstrap_avatar_calibration_contract.sh <avatar-id>
```

The bootstrap downloads the public `avatar_design.xml`, hydrates only assets
referenced by the selected configuration, and writes the v4 contract under
`static/avatar-renders/<avatar-id>/`. It does not inspect gateway captures or
session data.

The O3D stage remains a head-only reconstruction lab. It is framed at avatar
scale beside the captured 128×256 body oracle; it is not promoted to the
production render until the body compositor and head attachment match the
captured output.
