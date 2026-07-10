import { json } from '@sveltejs/kit';
import { ssh, extractJson } from '$lib/server/beaconRemote.js';

function walkPrices(value, out = []) {
  if (Array.isArray(value)) {
    for (const x of value) walkPrices(x, out);
    return out;
  }

  if (value && typeof value === 'object') {
    if (
      Object.prototype.hasOwnProperty.call(value, 'spins') &&
      Object.prototype.hasOwnProperty.call(value, 'price')
    ) {
      const spins = Number(value.spins);
      const price = Number(value.price);
      if (Number.isFinite(spins) && Number.isFinite(price)) {
        out.push({ spins, price });
      }
    }

    for (const x of Object.values(value)) walkPrices(x, out);
  }

  return out;
}

export async function GET() {
  const script = `
cd /opt/smallverse &&
source /opt/smallverse/.venv/bin/activate &&
python -m smallverse_core.active_probe_lab_cli \
  spintowin-prices \
  --token-file /opt/smallverse/probe-lab-connect/svsid.txt \
  --cookie-file /opt/smallverse/probe-lab-connect/cookie.txt
`;

  const result = await ssh(script, 30000);
  const raw = extractJson(result.stdout);
  const prices = raw ? walkPrices(raw.decoded_preview || raw) : [];

  return json({
    ok: result.ok && prices.length > 0,
    source: 'gateway.spintowin.getSpinPrices',
    generated_at: new Date().toISOString(),
    prices,
    http_status: raw?.http_status ?? null,
    response_bytes: raw?.response_bytes ?? null,
    error: result.ok ? null : result.stderr || result.error,
    raw_available: !!raw
  });
}
