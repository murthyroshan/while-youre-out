// A QR code drawn as one SVG path: crisp at any size, no canvas, no network.
import { useMemo } from 'react';
import { encode } from 'uqr';

export function Qr(props: { text: string; size?: number; label: string }) {
  const { path, n } = useMemo(() => {
    const qr = encode(props.text, { ecc: 'L', border: 0 });
    let d = '';
    qr.data.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x} ${y}h1v1h-1z`)));
    return { path: d, n: qr.size };
  }, [props.text]);
  return (
    <svg className="qr" viewBox={`-2 -2 ${n + 4} ${n + 4}`} width={props.size} height={props.size} role="img" aria-label={props.label} shapeRendering="crispEdges">
      <rect x="-2" y="-2" width={n + 4} height={n + 4} rx="1.5" fill="#fff" />
      <path d={path} fill="#0b1220" />
    </svg>
  );
}
