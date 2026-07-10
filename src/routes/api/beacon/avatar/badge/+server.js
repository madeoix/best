export async function GET({ url }) {
  const rawLabel = (url.searchParams.get('label') || '?').slice(0, 2).toUpperCase();
  const status = url.searchParams.get('status') || 'missing';

  const label = rawLabel.replace(/[^\w?]/g, '') || '?';

  const stroke =
    status === 'captured_reference_unverified'
      ? '#b88746'
      : status === 'missing'
        ? '#4b5563'
        : '#5b6ee1';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
    <defs>
      <radialGradient id="g" cx="35%" cy="25%" r="75%">
        <stop offset="0%" stop-color="#2b3244"/>
        <stop offset="100%" stop-color="#0b0f17"/>
      </radialGradient>
    </defs>
    <rect width="96" height="96" rx="22" fill="url(#g)"/>
    <rect x="3" y="3" width="90" height="90" rx="20" fill="none" stroke="${stroke}" stroke-width="3" opacity="0.85"/>
    <circle cx="48" cy="35" r="16" fill="#d6deff" opacity="0.18"/>
    <path d="M22 80c4-18 17-28 26-28s22 10 26 28" fill="#d6deff" opacity="0.14"/>
    <text x="48" y="57" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="26" font-weight="800" fill="#eef2ff">${label}</text>
  </svg>`;

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=86400'
    }
  });
}
