'use client';

import dynamic from 'next/dynamic';

const MapInner = dynamic(() => import('./CustomerMapInner'), { ssr: false });

interface CountryStat {
  country: string;
  count: number;
}

interface CustomerMapProps {
  countryStats: CountryStat[];
  selectedCountry: string;
  onSelectCountry: (country: string) => void;
}

export default function CustomerMap({ countryStats, selectedCountry, onSelectCountry }: CustomerMapProps) {
  return (
    <div style={{ width: '100%', height: '100%', minHeight: 350, borderRadius: 12, overflow: 'hidden' }}>
      <MapInner
        countryStats={countryStats}
        selectedCountry={selectedCountry}
        onSelectCountry={onSelectCountry}
      />
    </div>
  );
}
