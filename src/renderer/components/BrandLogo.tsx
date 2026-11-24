import React from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 34, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="auraLogoBg" x1="8" y1="5" x2="56" y2="59" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#26201C" />
          <stop offset="55%" stopColor="#171514" />
          <stop offset="100%" stopColor="#101114" />
        </linearGradient>
        <linearGradient id="auraLogoRing" x1="18" y1="14" x2="46" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F59E6C" />
          <stop offset="50%" stopColor="#D96B34" />
          <stop offset="100%" stopColor="#9A3F17" />
        </linearGradient>
        <linearGradient id="auraLogoCore" x1="25" y1="20" x2="39" y2="36" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF7F0" />
          <stop offset="100%" stopColor="#F6B98E" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="58" height="58" rx="14" fill="url(#auraLogoBg)" />
      <rect
        x="3.5"
        y="3.5"
        width="57"
        height="57"
        rx="13.5"
        stroke="#FFFFFF"
        strokeOpacity="0.14"
      />
      <circle cx="32" cy="28.5" r="14.5" stroke="url(#auraLogoRing)" strokeWidth="3.4" />
      <circle cx="32" cy="28.5" r="8.4" fill="url(#auraLogoCore)" />
      <rect x="14.5" y="41.5" width="35" height="8" rx="4" fill="#F7F3EE" />
      <rect x="22" y="44.2" width="20" height="2.4" rx="1.2" fill="#B8501E" fillOpacity="0.65" />
    </svg>
  );
};
