import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** A crisp SVG QR code (scales on any screen, prints cleanly). */
export function Qr({ text, label }: { text: string; label: string }) {
  const path = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    const n = q.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { d, n };
  }, [text]);
  return (
    <svg viewBox={`-2 -2 ${path.n + 4} ${path.n + 4}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect x="-2" y="-2" width={path.n + 4} height={path.n + 4} fill="#fff" />
      <path d={path.d} fill="#111" />
    </svg>
  );
}
