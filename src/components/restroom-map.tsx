"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { DEFAULT_CENTER, DEFAULT_ZOOM } from "@/lib/geo";
import type { Confidence, Coords, Restroom } from "@/lib/types";

/** Matches the confidence tokens in globals.css so pins and chips agree. */
const PIN_COLORS: Record<Confidence, string> = {
  confirmed: "#16a34a",
  unverified: "#f59e0b",
  likely_gone: "#9ca3af",
};

/**
 * Leaflet's bundled marker images resolve relative to its CSS and 404 under
 * every modern bundler. Rather than patching the icon paths, every pin is an
 * inline-SVG divIcon: no assets to resolve, and colouring by confidence is free.
 */
const iconCache = new Map<string, L.DivIcon>();

function pinIcon(confidence: Confidence, selected: boolean): L.DivIcon {
  const key = `${confidence}:${selected ? "on" : "off"}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const color = PIN_COLORS[confidence];
  const w = selected ? 38 : 30;
  const h = selected ? 49 : 39;
  const opacity = confidence === "likely_gone" ? 0.75 : 1;

  const html = `
    <svg width="${w}" height="${h}" viewBox="0 0 30 39" xmlns="http://www.w3.org/2000/svg"
         style="opacity:${opacity};filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 13.4 23 14 23.6a1.4 1.4 0 0 0 2 0C16.6 38 30 25.5 30 15 30 6.7 23.3 0 15 0z"
            fill="${color}" stroke="#fff" stroke-width="2"/>
      <circle cx="15" cy="15" r="5.5" fill="#fff"/>
    </svg>`;

  const icon = L.divIcon({
    className: "wtp-pin",
    html,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
  });
  iconCache.set(key, icon);
  return icon;
}

/** The pulsing "you are here" dot. */
const meIcon = L.divIcon({
  className: "wtp-pin",
  html: `<div style="width:18px;height:18px;border-radius:9999px;background:#2563eb;
            border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.15),0 2px 6px rgba(0,0,0,.3)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/** The big draggable pin used by the add-a-restroom flow. */
const pickerIcon = L.divIcon({
  className: "wtp-pin",
  html: `
    <svg width="44" height="57" viewBox="0 0 30 39" xmlns="http://www.w3.org/2000/svg"
         style="filter:drop-shadow(0 3px 5px rgba(0,0,0,.4))">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 13.4 23 14 23.6a1.4 1.4 0 0 0 2 0C16.6 38 30 25.5 30 15 30 6.7 23.3 0 15 0z"
            fill="#0d9488" stroke="#fff" stroke-width="2"/>
      <circle cx="15" cy="15" r="5.5" fill="#fff"/>
    </svg>`,
  iconSize: [44, 57],
  iconAnchor: [22, 57],
});

/** Reports the viewport after every pan/zoom so the parent can refetch. */
function ViewportReporter({
  onMoved,
}: {
  onMoved: (center: Coords, northEast: Coords) => void;
}) {
  const map = useMapEvents({
    moveend: () => {
      const c = map.getCenter();
      const ne = map.getBounds().getNorthEast();
      onMoved({ lat: c.lat, lng: c.lng }, { lat: ne.lat, lng: ne.lng });
    },
  });
  return null;
}

/**
 * Flies the map when `token` changes. A counter rather than the coordinates
 * themselves, so "locate me" still recentres when you haven't moved.
 */
function FlyTo({ target, token }: { target: Coords | null; token: number }) {
  const map = useMap();
  const lastToken = useRef(-1);

  useEffect(() => {
    if (!target || token === lastToken.current) return;
    lastToken.current = token;
    map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 16), {
      duration: 0.8,
    });
  }, [target, token, map]);

  return null;
}

/** Keeps Leaflet's internal size in sync when the sheet resizes the map. */
function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [map]);
  return null;
}

export interface RestroomMapProps {
  restrooms: Restroom[];
  selectedId: string | null;
  onSelect: (restroom: Restroom) => void;
  me: Coords | null;
  accuracyM: number | null;
  flyTarget: Coords | null;
  flyToken: number;
  onViewportChange: (center: Coords, northEast: Coords) => void;
  initialCenter?: Coords;
  /** Add-a-restroom mode: shows one big draggable pin instead of results. */
  pickerMode?: boolean;
  pickerPosition?: Coords | null;
  onPickerMove?: (coords: Coords) => void;
}

export default function RestroomMap({
  restrooms,
  selectedId,
  onSelect,
  me,
  accuracyM,
  flyTarget,
  flyToken,
  onViewportChange,
  initialCenter,
  pickerMode = false,
  pickerPosition = null,
  onPickerMove,
}: RestroomMapProps) {
  const center = initialCenter ?? DEFAULT_CENTER;

  const pickerHandlers = useMemo(
    () => ({
      dragend(event: L.DragEndEvent) {
        const { lat, lng } = (event.target as L.Marker).getLatLng();
        onPickerMove?.({ lat, lng });
      },
    }),
    [onPickerMove],
  );

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={DEFAULT_ZOOM}
      zoomControl={false}
      // The whole point is one-handed phone use.
      attributionControl
      className="h-full w-full"
    >
      <TileLayer
        // OpenStreetMap's public tiles: free, no API key, no account.
        // Their usage policy covers development and light use — see README
        // before promoting the app widely.
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={19}
      />

      <ViewportReporter onMoved={onViewportChange} />
      <FlyTo target={flyTarget} token={flyToken} />
      <InvalidateOnResize />

      {me && (
        <>
          {accuracyM !== null && accuracyM > 25 && (
            <Circle
              center={[me.lat, me.lng]}
              radius={accuracyM}
              pathOptions={{
                color: "#2563eb",
                weight: 1,
                fillColor: "#2563eb",
                fillOpacity: 0.1,
              }}
            />
          )}
          <Marker position={[me.lat, me.lng]} icon={meIcon} interactive={false} />
        </>
      )}

      {pickerMode
        ? pickerPosition && (
            <Marker
              position={[pickerPosition.lat, pickerPosition.lng]}
              icon={pickerIcon}
              draggable
              eventHandlers={pickerHandlers}
              autoPan
            />
          )
        : restrooms.map((restroom) => (
            <Marker
              key={restroom.id}
              position={[restroom.lat, restroom.lng]}
              icon={pinIcon(restroom.confidence, restroom.id === selectedId)}
              eventHandlers={{ click: () => onSelect(restroom) }}
              zIndexOffset={restroom.id === selectedId ? 1000 : 0}
            />
          ))}
    </MapContainer>
  );
}
