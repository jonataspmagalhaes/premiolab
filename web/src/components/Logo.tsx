// Logo PremioLab — P outline branco em quadrado laranja arredondado.
// Logo oficial do site.

export function LogoMark({ size }: { size?: number }) {
  var s = size || 28;
  return (
    <svg width={s} height={s} viewBox="0 0 28 28" fill="none">
      <defs>
        <linearGradient id="lm-bg" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F97316" />
          <stop offset="1" stopColor="#EA580C" />
        </linearGradient>
      </defs>
      <rect width="28" height="28" rx="7" fill="url(#lm-bg)" />
      <path d="M10 21V7h4c3 0 5 2 5 4.5S17 16 14 16h-4" stroke="#F5F5F7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
