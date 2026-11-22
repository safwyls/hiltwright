// The Hiltwright mark, drawn in the page so its blade can take the theme's colour (--blade). The same drawing as
// assets/hiltwright-icon.svg, which stays the file for places that need an image (the window icon, the site).
// Hiltwright's credit on its own styles uses this too (credits.tsx), so it follows the theme everywhere in the app.

import { useId } from 'react';

export function Logo({ size = 28, className = 'logo', label }: { size?: number; className?: string; /** Read out, where the mark stands for Hiltwright rather than decorating. */ label?: string }) {
  const blade = 'var(--blade)';
  // Each copy has its own gradient ids: one copy hidden (the brand mark on macOS) must not blank the others.
  const id = `hwl${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width={size} height={size} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8a8274" /><stop offset=".45" stopColor="#d6cdb9" /><stop offset="1" stopColor="#8a8274" /></linearGradient>
        <linearGradient id={`${id}-grip`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#1e1a15" /><stop offset=".5" stopColor="#3d362c" /><stop offset="1" stopColor="#1e1a15" /></linearGradient>
        <linearGradient id={`${id}-tile`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1c1813" /><stop offset="1" stopColor="#13100c" /></linearGradient>
        <radialGradient id={`${id}-halo`} cx=".62" cy=".38" r=".6"><stop offset="0" style={{ stopColor: blade }} stopOpacity=".22" /><stop offset="1" style={{ stopColor: blade }} stopOpacity="0" /></radialGradient>
        <clipPath id={`${id}-inside`}><path d="M52.46 6H250V203.54L203.54 250H6V52.46Z" /></clipPath>
      </defs>
      <path d="M44 0H256V212L212 256H0V44Z" fill="#5e5240" />
      <path d="M52.46 6H250V203.54L203.54 250H6V52.46Z" fill={`url(#${id}-tile)`} />
      <path d="M52.46 6H250V203.54L203.54 250H6V52.46Z" fill={`url(#${id}-halo)`} />
      <g clipPath={`url(#${id}-inside)`}>
        <g transform="translate(128 128) rotate(45) scale(1.12) translate(-128 -109.5)" fill="none">
          <path d="M128 104V-4" style={{ stroke: blade }} strokeOpacity=".14" strokeWidth="46" strokeLinecap="round" />
          <path d="M128 104V-4" style={{ stroke: blade }} strokeOpacity=".28" strokeWidth="31" strokeLinecap="round" />
          <path d="M128 104V-4" style={{ stroke: blade }} strokeWidth="18" strokeLinecap="round" />
          <path d="M128 100V0" stroke="#fff6e2" strokeWidth="7" strokeLinecap="round" />
          <path d="M110 102h36v8l-4 12h-28l-4-12z" fill={`url(#${id}-steel)`} />
          <rect x="117" y="122" width="22" height="10" fill="#30291f" />
          <rect x="113" y="132" width="30" height="68" fill={`url(#${id}-grip)`} />
          <rect x="113" y="142" width="30" height="4" fill="#8a8274" /><rect x="113" y="154" width="30" height="4" fill="#8a8274" /><rect x="113" y="166" width="30" height="4" fill="#8a8274" /><rect x="113" y="178" width="30" height="4" fill="#8a8274" /><rect x="113" y="190" width="30" height="4" fill="#8a8274" />
          <rect x="143" y="146" width="7" height="14" fill="#e2b84a" />
          <path d="M111 200h34v22l-8 10h-18l-8-10z" fill={`url(#${id}-steel)`} />
        </g>
      </g>
      <path d="M44 0L0 44M256 212L212 256" style={{ stroke: blade }} strokeWidth="7" strokeLinecap="square" />
    </svg>
  );
}
