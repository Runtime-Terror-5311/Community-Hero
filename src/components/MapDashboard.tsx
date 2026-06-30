/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { ZoomIn, ZoomOut, Info, Pin, Loader2, Navigation } from 'lucide-react';
import { Issue } from '../types';
import * as L_raw from 'leaflet';
const L = (L_raw as any).default || L_raw;

interface MapDashboardProps {
  issues: Issue[];
  selectedIssue: Issue | null;
  onSelectIssue: (issue: Issue | null) => void;
  dropPinCoords: [number, number] | null; // [longitude, latitude]
  onDropPin: (coords: [number, number] | null) => void;
  isLoading: boolean;
  userCoords: [number, number] | null;
  onCaptureCoords: () => void;
}

// Fix Leaflet default icon issues by overriding with inline SVG data URLs
const defaultIconHtml = `
  <svg viewBox="0 0 24 24" width="24" height="24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" fill="#3b82f6" stroke="#ffffff" stroke-width="2"/>
    <circle cx="12" cy="12" r="3" fill="#ffffff"/>
  </svg>
`;

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: `data:image/svg+xml;utf8,${encodeURIComponent(defaultIconHtml)}`,
  iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(defaultIconHtml)}`,
  shadowUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', // blank 1px gif
});

// Custom Marker Creators to bypass broken asset URLs in Leaflet + Vite
const createLargeCustomMarker = (color: string, letter: string) => {
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="position: relative; width: 28px; height: 35px; margin-left: -14px; margin-top: -35px;">
        <!-- Pin / Pointer SVG -->
        <svg viewBox="0 0 28 35" width="28" height="35" style="display: block;">
          <path d="M 14 0 C 6.27 0 0 6.27 0 14 C 0 24.5 14 35 14 35 C 14 35 28 24.5 28 14 C 28 6.27 21.73 0 14 0 Z" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>
          <circle cx="14" cy="14" r="9" fill="#ffffff" />
        </svg>
        <!-- Letter Tag -->
        <span style="
          position: absolute;
          top: 6px;
          left: 0;
          right: 0;
          text-align: center;
          font-family: monospace;
          font-size: 11px;
          font-weight: bold;
          color: ${color};
          line-height: 14px;
        ">${letter}</span>
      </div>
    `,
    iconSize: [28, 35],
    iconAnchor: [0, 0] // Adjusted offset natively inside HTML wrapper
  });
};

const userIcon = L.divIcon({
  className: 'custom-leaflet-user-icon',
  html: `
    <div style="position: relative; width: 24px; height: 24px; margin-left: -12px; margin-top: -12px;">
      <div style="
        position: absolute;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background-color: #3b82f6;
        animation: pulse 2s infinite;
      "></div>
      <div style="
        position: absolute;
        top: 6px;
        left: 6px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background-color: #3b82f6;
        border: 2px solid white;
        box-shadow: 0 0 3px rgba(0,0,0,0.3);
      "></div>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [0, 0]
});

const dropPinIcon = L.divIcon({
  className: 'custom-leaflet-droppin-icon',
  html: `
    <div style="position: relative; width: 30px; height: 40px; margin-left: -15px; margin-top: -40px; animation: bounce 1s infinite alternate;">
      <svg viewBox="0 0 30 40" width="30" height="40" style="display: block;">
        <path d="M 15 0 C 6.7 0 0 6.7 0 15 C 0 26.2 15 40 15 40 C 15 40 30 26.2 30 15 C 30 6.7 23.3 0 15 0 Z" fill="#3b82f6" stroke="#2563eb" stroke-width="1.5" />
        <circle cx="15" cy="15" r="5" fill="#ffffff" />
      </svg>
    </div>
  `,
  iconSize: [30, 40],
  iconAnchor: [0, 0]
});

export const MapDashboard: React.FC<MapDashboardProps> = ({
  issues,
  selectedIssue,
  onSelectIssue,
  dropPinCoords,
  onDropPin,
  isLoading,
  userCoords,
  onCaptureCoords
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.LayerGroup | null>(null);
  const isMountedRef = useRef<boolean>(true);
  
  const userMarkerRef = useRef<L.Marker | null>(null);
  const dropMarkerRef = useRef<L.Marker | null>(null);

  const [mapReady, setMapReady] = useState(false);

  // Sync callbacks to avoid recreation of primary map instantiation hook
  const onSelectIssueRef = useRef(onSelectIssue);
  useEffect(() => {
    onSelectIssueRef.current = onSelectIssue;
  }, [onSelectIssue]);

  const onDropPinRef = useRef(onDropPin);
  useEffect(() => {
    onDropPinRef.current = onDropPin;
  }, [onDropPin]);

  // Keep track of mounted status
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 1. Initialize map exactly once
  useEffect(() => {
    if (!mapContainerRef.current) return;

    let initialCenter: [number, number] = [37.7775, -122.4150]; // Fallback SOMA San Francisco
    if (userCoords && userCoords.length >= 2) {
      initialCenter = [userCoords[1], userCoords[0]];
    } else if (issues && issues.length > 0) {
      const firstWithCoords = issues.find(i => i.location?.coordinates && i.location.coordinates.length >= 2);
      if (firstWithCoords && firstWithCoords.location?.coordinates) {
        initialCenter = [firstWithCoords.location.coordinates[1], firstWithCoords.location.coordinates[0]];
      }
    }

    let map: L.Map | null = null;
    try {
      map = L.map(mapContainerRef.current, {
        center: initialCenter,
        zoom: 15,
        zoomControl: false,
        attributionControl: true
      });

      // Add OpenStreetMap tile layers
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      // Add layer group for markers
      const markersGroup = L.layerGroup().addTo(map);
      markersGroupRef.current = markersGroup;

      mapInstanceRef.current = map;
      setMapReady(true);

      // Listen for map clicks to drop validation pin
      map.on('click', (e: L.LeafletMouseEvent) => {
        if (onDropPinRef.current) {
          onDropPinRef.current([e.latlng.lng, e.latlng.lat]);
        }
      });
    } catch (e) {
      console.error("Leaflet map initialization failed:", e);
    }

    return () => {
      setMapReady(false);
      if (map) {
        try {
          map.remove();
        } catch (e) {
          console.warn("Error removing map instance:", e);
        }
      }
      mapInstanceRef.current = null;
    };
  }, []);

  // 2. Invalidate Map size on parent container resize
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!mapReady || !map || !mapContainerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      try {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      } catch (e) {
        console.warn("Resize observer map invalidateSize failed:", e);
      }
    });
    
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [mapReady]);

  // 3. Keep issue markers synchronized with state
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersGroup = markersGroupRef.current;
    if (!mapReady || !map || !markersGroup) return;

    try {
      markersGroup.clearLayers();

      issues.forEach((issue) => {
        if (!issue.location?.coordinates || issue.location.coordinates.length < 2) return;
        const [lng, lat] = issue.location.coordinates;

        const isSelected = selectedIssue?.id === issue.id;
        const isUrgent = issue.status === 'urgent';
        const isResolved = issue.status === 'resolved';

        const pinColor = isResolved ? '#10b981' : isUrgent ? '#f43f5e' : '#3b82f6';

        let categoryLetter = 'O';
        if (issue.category === 'pothole') categoryLetter = 'P';
        else if (issue.category === 'broken-streetlight') categoryLetter = 'S';
        else if (issue.category === 'water-leak') categoryLetter = 'W';
        else if (issue.category === 'trash') categoryLetter = 'T';

        const icon = createLargeCustomMarker(pinColor, categoryLetter);
        const marker = L.marker([lat, lng], { icon });

        // Clean popups styled for modern aesthetic
        const popupContent = `
          <div style="font-family: inherit; font-size: 12px; line-height: 1.4; color: #1e293b; min-width: 140px;">
            <div style="font-weight: bold; margin-bottom: 2px; color: ${pinColor}; text-transform: uppercase; letter-spacing: 0.5px;">
              ${issue.category.replace('-', ' ')}
            </div>
            <div style="font-size: 10px; margin-bottom: 4px; color: #64748b; font-family: monospace;">
              Status: <span style="font-weight: bold; color: ${pinColor}; text-transform: uppercase;">${issue.status}</span>
            </div>
            <div style="font-size: 11px; font-weight: 500; text-overflow: ellipsis; overflow: hidden; max-height: 48px; margin-bottom: 4px;">
              ${issue.description || 'No description provided.'}
            </div>
            ${issue.resolvedImageUrl ? `
            <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0; display: flex; gap: 6px; align-items: center;">
              <img src="${issue.resolvedImageUrl}" style="width: 24px; height: 24px; object-fit: cover; border-radius: 4px; border: 1px solid #059669;" />
              <div style="font-size: 9px; color: #047857; font-weight: bold; line-height: 1.1;">Repaired by @${issue.resolvedByUsername || 'citizen'}</div>
            </div>
            ` : ''}
          </div>
        `;

        marker.bindPopup(popupContent, {
          closeButton: false,
          offset: [0, -15]
        });

        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          if (onSelectIssueRef.current) {
            onSelectIssueRef.current(isSelected ? null : issue);
          }
        });

        if (isSelected) {
          setTimeout(() => {
            try {
              if (isMountedRef.current && mapInstanceRef.current && marker.getElement()) {
                marker.openPopup();
              }
            } catch (popupErr) {
              console.warn("Delayed popup opening failed:", popupErr);
            }
          }, 50);
        }

        marker.addTo(markersGroup);
      });
    } catch (err) {
      console.warn("Error synchronizing map markers:", err);
    }
  }, [issues, selectedIssue, mapReady]);

  // 4. Center map when selected issue changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!mapReady || !map || !selectedIssue) return;

    try {
      if (selectedIssue.location?.coordinates && selectedIssue.location.coordinates.length >= 2) {
        const [lng, lat] = selectedIssue.location.coordinates;
        map.setView([lat, lng], 17, { animate: true });
      }
    } catch (err) {
      console.warn("Error centering map to selected issue:", err);
    }
  }, [selectedIssue, mapReady]);

  // 5. Update and pan user location marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!mapReady || !map) return;

    try {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }

      if (userCoords && userCoords.length >= 2) {
        const [lng, lat] = userCoords;
        const marker = L.marker([lat, lng], { icon: userIcon }).addTo(map);
        userMarkerRef.current = marker;

        map.setView([lat, lng], 16, { animate: true });
      }
    } catch (err) {
      console.warn("Error updating user location marker:", err);
    }
  }, [userCoords, mapReady]);

  // 6. Update and highlight custom pin drop placement
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!mapReady || !map) return;

    try {
      if (dropMarkerRef.current) {
        dropMarkerRef.current.remove();
        dropMarkerRef.current = null;
      }

      if (dropPinCoords && dropPinCoords.length >= 2) {
        const [lng, lat] = dropPinCoords;
        const marker = L.marker([lat, lng], { icon: dropPinIcon }).addTo(map);
        dropMarkerRef.current = marker;

        map.setView([lat, lng], map.getZoom(), { animate: true });
      }
    } catch (err) {
      console.warn("Error updating custom pin marker:", err);
    }
  }, [dropPinCoords, mapReady]);

  const handleZoom = (direction: 'in' | 'out') => {
    const map = mapInstanceRef.current;
    if (!map) return;
    try {
      if (direction === 'in') {
        map.zoomIn();
      } else {
        map.zoomOut();
      }
    } catch (err) {
      console.warn("Error performing map zoom:", err);
    }
  };

  return (
    <div className="relative w-full h-[320px] md:h-full bg-slate-50 rounded-xl overflow-hidden border border-slate-200 group shadow-sm" id="street-simulation-map">
      {/* Real Map Leaflet Container element */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[320px] md:min-h-full z-0" />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-20 text-slate-850 gap-2">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
          <p className="text-xs font-mono tracking-tight select-none">Syncing municipal coordinates...</p>
        </div>
      )}

      {/* Floating map console actions */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2">
        <button
          onClick={() => handleZoom('in')}
          className="bg-white border border-slate-200 p-2.5 rounded-lg text-slate-650 hover:text-slate-900 hover:bg-slate-50 shadow-sm flex items-center justify-center transition-colors cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="h-4.5 w-4.5" />
        </button>
        <button
          onClick={() => handleZoom('out')}
          className="bg-white border border-slate-200 p-2.5 rounded-lg text-slate-650 hover:text-slate-900 hover:bg-slate-50 shadow-sm flex items-center justify-center transition-colors cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="h-4.5 w-4.5" />
        </button>
        <button
          onClick={onCaptureCoords}
          className={`p-2.5 rounded-lg border shadow-sm flex items-center justify-center transition-colors cursor-pointer ${
            userCoords 
              ? 'bg-blue-50 border-blue-200 text-blue-650 font-semibold' 
              : 'bg-white border-slate-200 text-slate-655 hover:text-slate-900 hover:bg-slate-50'
          }`}
          title="Detect My Location (GPS)"
        >
          <Navigation className={`h-4.5 w-4.5 ${userCoords && 'animate-pulse'}`} />
        </button>
      </div>

      <div className="absolute bottom-3 left-3 z-10 bg-white/95 border border-slate-200 p-2.5 rounded-xl hidden md:block max-w-[200px] shadow-sm select-none">
        <div className="flex gap-1.5 items-center mb-1 text-[11px] font-bold text-slate-800">
          <Info className="h-3.5 w-3.5 text-blue-600" />
          <span>Interactive Map Navigation</span>
        </div>
        <p className="text-[10px] text-slate-500 leading-tight font-medium">
          Click any spot on the OpenStreetMap below to drop a pin and start a validation reporting form.
        </p>
      </div>

      {/* Dynamic Instruction Info Overlay */}
      {dropPinCoords && (
        <div className="absolute top-3 right-3 z-10 bg-blue-50/95 border border-blue-200 px-3 py-1.5 rounded-lg flex gap-2 items-center text-xs text-blue-700 shadow-sm animate-bounce">
          <Pin className="h-4 w-4 text-blue-500 rotate-45 shrink-0" />
          <span className="font-mono text-[10px] font-bold">Location Pin Dropped</span>
          <button 
            onClick={() => onDropPin(null)} 
            className="hover:bg-blue-100 p-0.5 rounded text-blue-600 ml-1 font-bold text-[11px] cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
};
