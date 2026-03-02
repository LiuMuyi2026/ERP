'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Coordinate lookup for ~40 major trade countries
const COUNTRY_COORDS: Record<string, { lat: number; lng: number }> = {
  'China': { lat: 35.86, lng: 104.20 },
  '中国': { lat: 35.86, lng: 104.20 },
  'United States': { lat: 37.09, lng: -95.71 },
  'USA': { lat: 37.09, lng: -95.71 },
  '美国': { lat: 37.09, lng: -95.71 },
  'India': { lat: 20.59, lng: 78.96 },
  '印度': { lat: 20.59, lng: 78.96 },
  'Turkey': { lat: 38.96, lng: 35.24 },
  'Türkiye': { lat: 38.96, lng: 35.24 },
  '土耳其': { lat: 38.96, lng: 35.24 },
  'Vietnam': { lat: 14.06, lng: 108.28 },
  '越南': { lat: 14.06, lng: 108.28 },
  'Brazil': { lat: -14.24, lng: -51.93 },
  '巴西': { lat: -14.24, lng: -51.93 },
  'Russia': { lat: 61.52, lng: 105.32 },
  '俄罗斯': { lat: 61.52, lng: 105.32 },
  'Germany': { lat: 51.17, lng: 10.45 },
  '德国': { lat: 51.17, lng: 10.45 },
  'Japan': { lat: 36.20, lng: 138.25 },
  '日本': { lat: 36.20, lng: 138.25 },
  'South Korea': { lat: 35.91, lng: 127.77 },
  'Korea': { lat: 35.91, lng: 127.77 },
  '韩国': { lat: 35.91, lng: 127.77 },
  'United Kingdom': { lat: 55.38, lng: -3.44 },
  'UK': { lat: 55.38, lng: -3.44 },
  '英国': { lat: 55.38, lng: -3.44 },
  'France': { lat: 46.23, lng: 2.21 },
  '法国': { lat: 46.23, lng: 2.21 },
  'Italy': { lat: 41.87, lng: 12.57 },
  '意大利': { lat: 41.87, lng: 12.57 },
  'Spain': { lat: 40.46, lng: -3.75 },
  '西班牙': { lat: 40.46, lng: -3.75 },
  'Mexico': { lat: 23.63, lng: -102.55 },
  '墨西哥': { lat: 23.63, lng: -102.55 },
  'Canada': { lat: 56.13, lng: -106.35 },
  '加拿大': { lat: 56.13, lng: -106.35 },
  'Australia': { lat: -25.27, lng: 133.78 },
  '澳大利亚': { lat: -25.27, lng: 133.78 },
  'Indonesia': { lat: -0.79, lng: 113.92 },
  '印度尼西亚': { lat: -0.79, lng: 113.92 },
  'Thailand': { lat: 15.87, lng: 100.99 },
  '泰国': { lat: 15.87, lng: 100.99 },
  'Saudi Arabia': { lat: 23.89, lng: 45.08 },
  '沙特阿拉伯': { lat: 23.89, lng: 45.08 },
  'UAE': { lat: 23.42, lng: 53.85 },
  '阿联酋': { lat: 23.42, lng: 53.85 },
  'Egypt': { lat: 26.82, lng: 30.80 },
  '埃及': { lat: 26.82, lng: 30.80 },
  'Nigeria': { lat: 9.08, lng: 8.68 },
  '尼日利亚': { lat: 9.08, lng: 8.68 },
  'South Africa': { lat: -30.56, lng: 22.94 },
  '南非': { lat: -30.56, lng: 22.94 },
  'Pakistan': { lat: 30.38, lng: 69.35 },
  '巴基斯坦': { lat: 30.38, lng: 69.35 },
  'Bangladesh': { lat: 23.68, lng: 90.36 },
  '孟加拉': { lat: 23.68, lng: 90.36 },
  'Poland': { lat: 51.92, lng: 19.15 },
  '波兰': { lat: 51.92, lng: 19.15 },
  'Netherlands': { lat: 52.13, lng: 5.29 },
  '荷兰': { lat: 52.13, lng: 5.29 },
  'Argentina': { lat: -38.42, lng: -63.62 },
  '阿根廷': { lat: -38.42, lng: -63.62 },
  'Colombia': { lat: 4.57, lng: -74.30 },
  '哥伦比亚': { lat: 4.57, lng: -74.30 },
  'Malaysia': { lat: 4.21, lng: 101.98 },
  '马来西亚': { lat: 4.21, lng: 101.98 },
  'Philippines': { lat: 12.88, lng: 121.77 },
  '菲律宾': { lat: 12.88, lng: 121.77 },
  'Singapore': { lat: 1.35, lng: 103.82 },
  '新加坡': { lat: 1.35, lng: 103.82 },
  'Iran': { lat: 32.43, lng: 53.69 },
  '伊朗': { lat: 32.43, lng: 53.69 },
  'Iraq': { lat: 33.22, lng: 43.68 },
  '伊拉克': { lat: 33.22, lng: 43.68 },
  'Chile': { lat: -35.68, lng: -71.54 },
  '智利': { lat: -35.68, lng: -71.54 },
  'Peru': { lat: -9.19, lng: -75.02 },
  '秘鲁': { lat: -9.19, lng: -75.02 },
  'Taiwan': { lat: 23.70, lng: 120.96 },
  '台湾': { lat: 23.70, lng: 120.96 },
  'Israel': { lat: 31.05, lng: 34.85 },
  '以色列': { lat: 31.05, lng: 34.85 },
  'Sweden': { lat: 60.13, lng: 18.64 },
  '瑞典': { lat: 60.13, lng: 18.64 },
  'Switzerland': { lat: 46.82, lng: 8.23 },
  '瑞士': { lat: 46.82, lng: 8.23 },
  'Belgium': { lat: 50.50, lng: 4.47 },
  '比利时': { lat: 50.50, lng: 4.47 },
  'Portugal': { lat: 39.40, lng: -8.22 },
  '葡萄牙': { lat: 39.40, lng: -8.22 },
  'Greece': { lat: 39.07, lng: 21.82 },
  '希腊': { lat: 39.07, lng: 21.82 },
  'New Zealand': { lat: -40.90, lng: 174.89 },
  '新西兰': { lat: -40.90, lng: 174.89 },
  'Kenya': { lat: -0.02, lng: 37.91 },
  '肯尼亚': { lat: -0.02, lng: 37.91 },
  'Morocco': { lat: 31.79, lng: -7.09 },
  '摩洛哥': { lat: 31.79, lng: -7.09 },
};

interface CountryStat {
  country: string;
  count: number;
}

interface Props {
  countryStats: CountryStat[];
  selectedCountry: string;
  onSelectCountry: (country: string) => void;
}

function getRadius(count: number, maxCount: number): number {
  const min = 6;
  const max = 28;
  if (maxCount <= 1) return min;
  return min + ((count - 1) / (maxCount - 1)) * (max - min);
}

function getColor(count: number): string {
  if (count <= 2) return '#60a5fa';
  if (count <= 5) return '#3b82f6';
  return '#2563eb';
}

// Sub-component to fit bounds when data changes
function FitBounds({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 0) {
      const L = require('leaflet');
      const bounds = L.latLngBounds(coords.map(([lat, lng]) => [lat, lng]));
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 5 });
    }
  }, [coords, map]);
  return null;
}

export default function CustomerMapInner({ countryStats, selectedCountry, onSelectCountry }: Props) {
  const maxCount = Math.max(...countryStats.map(s => s.count), 1);

  const markers = countryStats
    .map(cs => {
      const coord = COUNTRY_COORDS[cs.country];
      if (!coord) return null;
      return { ...cs, ...coord };
    })
    .filter(Boolean) as (CountryStat & { lat: number; lng: number })[];

  const fitCoords: [number, number][] = markers.map(m => [m.lat, m.lng]);

  return (
    <MapContainer
      center={[20, 10]}
      zoom={2}
      style={{ width: '100%', height: '100%', minHeight: 350, background: '#f8fafc' }}
      scrollWheelZoom={true}
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {fitCoords.length > 0 && <FitBounds coords={fitCoords} />}
      {markers.map(m => {
        const isSelected = selectedCountry === m.country;
        return (
          <CircleMarker
            key={m.country}
            center={[m.lat, m.lng]}
            radius={getRadius(m.count, maxCount)}
            pathOptions={{
              fillColor: isSelected ? '#7c3aed' : getColor(m.count),
              color: isSelected ? '#5b21b6' : '#1e40af',
              weight: isSelected ? 3 : 1.5,
              opacity: 1,
              fillOpacity: isSelected ? 0.85 : 0.65,
            }}
            eventHandlers={{
              click: () => onSelectCountry(selectedCountry === m.country ? '' : m.country),
            }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
              <span style={{ fontWeight: 600 }}>{m.country}</span> — {m.count} 位客户
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
