# Smallverse Lab VPS deployment

This directory contains files that define how the application runs on the VPS.

## Tracked deployment configuration

- `systemd/`: application service definitions
- `nginx/`: reverse-proxy configuration
- `.env.example`: required environment-variable names without secret values
- `scripts/`: release and deployment automation

## Runtime release

For a SvelteKit adapter-node deployment, a release contains:

- `build/`
- `package.json`
- `package-lock.json`
- production dependencies installed with `npm ci --omit=dev`
- the Git commit identifier
- a SHA-256 file manifest

Generated releases belong under `releases/` and are not committed.
