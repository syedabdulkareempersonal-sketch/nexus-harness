import React from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 30, className = '' }) => {
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
        <linearGradient id="win12Bg" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0F2547" />
          <stop offset="52%" stopColor="#0B1930" />
          <stop offset="100%" stopColor="#08101E" />
        </linearGradient>
        <linearGradient id="win12Ring" x1="16" y1="12" x2="48" y2="46" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60D5FF" />
          <stop offset="50%" stopColor="#2589F5" />
          <stop offset="100%" stopColor="#005FB8" />
        </linearGradient>
        <linearGradient id="win12Core" x1="24" y1="20" x2="40" y2="37" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F0FAFF" />
          <stop offset="100%" stopColor="#7DD3FC" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="58" height="58" rx="15" fill="url(#win12Bg)" />
      <rect
        x="3.5"
        y="3.5"
        width="57"
        height="57"
        rx="14.5"
        stroke="#7DD3FC"
        strokeOpacity="0.24"
      />
      {/* Fluent 4-quadrant subtle glass grid nod + luminous aperture */}
      <circle cx="32" cy="28" r="14.2" stroke="url(#win12Ring)" strokeWidth="3.5" />
      <circle cx="32" cy="28" r="7.8" fill="url(#win12Core)" />
      <rect x="14.5" y="42.5" width="35" height="7.5" rx="3.75" fill="#E2EEFF" />
      <rect x="22.5" y="45" width="19" height="2.4" rx="1.2" fill="#005FB8" />
    </svg>
  );
};
