/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Frictionless Citizen Submission Form featuring base64 image capture,
// HTML5 Geolocation capture, realistic template presets, and live Gemini auto-triage status feedback.

import React, { useState, useEffect } from 'react';
import { Camera, MapPin, Navigation, Send, X, ShieldAlert, Loader2 } from 'lucide-react';
import { useToast } from './NotificationToast';

interface SubmissionFormProps {
  dropPinCoords: [number, number] | null; // [longitude, latitude]
  onClearDropPin: () => void;
  onSuccessSubmit: () => void;
  authToken: string;
  onProfileRefresh?: () => void;
  userCoords: [number, number] | null; // [longitude, latitude]
}

// Haversine distance helper (calculates distance in km between two coordinates)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Radius of the earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // distance in KM
};

export const SubmissionForm: React.FC<SubmissionFormProps> = ({
  dropPinCoords,
  onClearDropPin,
  onSuccessSubmit,
  authToken,
  onProfileRefresh,
  userCoords
}) => {
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'pothole' | 'broken-streetlight' | 'water-leak' | 'trash' | 'other'>('pothole');
  const [latitude, setLatitude] = useState<string>('');
  const [longitude, setLongitude] = useState<string>('');
  
  const [image, setImage] = useState<string>(''); // Base64 representation
  const [imageName, setImageName] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);

  const { showToast } = useToast();

  // Dynamically calculate and update distance from user's actual location to reported coordinates
  useEffect(() => {
    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    if (!isNaN(latNum) && !isNaN(lngNum) && userCoords) {
      const dist = calculateDistance(userCoords[1], userCoords[0], latNum, lngNum);
      setDistanceKm(dist);
    } else {
      setDistanceKm(null);
    }
  }, [latitude, longitude, userCoords]);

  // Update form values if pin is dropped on the map or if userCoords is available (pre-fill)
  useEffect(() => {
    if (dropPinCoords) {
      setLongitude(dropPinCoords[0].toString());
      setLatitude(dropPinCoords[1].toString());
      showToast(`Latitude & Longitude captured via Street Grid drop!`, 'info');
    } else if (userCoords) {
      setLongitude(userCoords[0].toString());
      setLatitude(userCoords[1].toString());
    } else {
      setLongitude('');
      setLatitude('');
    }
  }, [dropPinCoords, userCoords]);

  // Convert uploaded files to base64
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 8 * 1024 * 1024) {
        showToast("Maximum image upload size is 8MB.", "error");
        return;
      }
      setImageName(file.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!authToken) {
      showToast("Authorization required. Please Login or Register first.", 'error');
      return;
    }

    if (!description || !category || !latitude || !longitude || !image) {
      showToast("All fields are required. Please upload a photo and capture coordinates.", 'error');
      return;
    }

    // Verify user actual coordinates are locked to validate the 5km restriction
    if (!userCoords) {
      showToast("Location validation failed. Please click 'GPS Active' or allow location services first to verify the 5km reporting range.", "error");
      return;
    }

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    if (isNaN(latNum) || isNaN(lngNum)) {
      showToast("Invalid report coordinates.", "error");
      return;
    }

    const dist = calculateDistance(userCoords[1], userCoords[0], latNum, lngNum);
    if (dist > 5.0) {
      showToast(`Submission blocked! You can only report hazards within 5 km of your physical location. (Reported location is ${dist.toFixed(2)} km away)`, "error");
      return;
    }

    setSubmitting(true);
    // Open a persistent triage toast while backend speaks to Gemini AI model
    showToast("Gatekeeper analyzing incident photo. Validating with Gemini AI...", 'ai-triage');

    try {
      // Build FormData payload for multipart/form-data upload
      const formData = new FormData();
      formData.append('description', description);
      formData.append('category', category);
      formData.append('latitude', latitude);
      formData.append('longitude', longitude);
      formData.append('userLatitude', userCoords[1].toString());
      formData.append('userLongitude', userCoords[0].toString());

      // Convert image (which can be a base64 Data URL or remote URL) into a real Blob/File
      if (image.startsWith('data:')) {
        const fetchRes = await fetch(image);
        const blob = await fetchRes.blob();
        formData.append('image', blob, imageName || 'upload.jpg');
      } else if (image.startsWith('http')) {
        const fetchRes = await fetch(image);
        const blob = await fetchRes.blob();
        formData.append('image', blob, imageName || 'preset.jpg');
      } else {
        // Fallback if image is raw base64 without data prefix
        formData.append('image', image);
      }

      const response = await fetch('/api/issues', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
          // NOTE: Do not set Content-Type header manually. The browser will automatically
          // set it to multipart/form-data with the correct boundary.
        },
        body: formData
      });

      let data: any = {};
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        try {
          data = await response.json();
        } catch (jsonErr) {
          console.error("Failed to parse response JSON:", jsonErr);
          data = { error: "Received invalid JSON from server." };
        }
      } else {
        try {
          const rawText = await response.text();
          console.warn("Server returned non-JSON payload:", rawText.slice(0, 300));
        } catch (textErr) {
          console.error("Failed to read server response body:", textErr);
        }
        data = { error: "Failed to catalog civic infrastructure card. Server encountered an unexpected error." };
      }

      if (response.ok) {
        showToast("Issue reported", 'success');
        
        // Reset states
        onClearDropPin();
        setDescription('');
        setImage('');
        setImageName('');
        
        if (userCoords) {
          setLongitude(userCoords[0].toString());
          setLatitude(userCoords[1].toString());
        } else {
          setLatitude('');
          setLongitude('');
        }
        
        onSuccessSubmit(); // Trigger feed list refresh
      } else {
        // Handle Gemini Triage rejection or validation flags with civic penalties
        if (data.civicPenalty) {
          onProfileRefresh?.(); // Instant update of user stats in other parts of the app
        }
        showToast("Issue rejected due to wrong Image or Wrong details", 'error');
      }
    } catch (err) {
      console.error(err);
      showToast("Issue rejected due to wrong Image or Wrong details", 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 text-slate-800 shadow-sm animate-fade-in" id="citizen-reporter-workflow">
      <div className="flex items-center gap-2 pb-4 mb-4 border-b border-slate-100">
        <Camera className="h-5 w-5 text-blue-600" />
        <div>
          <h2 className="text-base font-bold font-sans tracking-tight text-slate-900">Post Hyperlocal Verification</h2>
          <p className="text-[11px] text-slate-500 leading-none mt-0.5 font-medium">Automated image-EXIF triage via Gemini Gatekeeper</p>
        </div>
      </div>

      <form onSubmit={handleFormSubmit} className="space-y-4">
        {/* Category sector */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Infrastructure Malfunction Tag</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as any)}
            className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500/50 rounded-xl py-2.5 px-3 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-blue-500/2 transition-colors font-medium"
          >
            <option value="pothole">Roadway Pothole / Asphalt Tear</option>
            <option value="broken-streetlight">Broken Streetlamp / Dark Lane</option>
            <option value="water-leak">Storm Leakage / Pipe Burst</option>
            <option value="trash">Bulk Waste Dumping / Garbage Pile</option>
            <option value="other">Other Hazards (Signs, Cracks)</option>
          </select>
        </div>

        {/* Text Description */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Incident Details</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Suggest specific street bounds, cause of danger, or approximate measurements to assist municipal cleanup workers..."
            className="w-full h-20 bg-slate-50 border border-slate-200 focus:border-blue-500/50 rounded-xl py-2.5 px-3 text-xs text-slate-800 placeholder-slate-400 outline-none focus:ring-1 focus:ring-blue-500/2 transition-colors resize-none leading-relaxed"
            maxLength={600}
            required
          />
        </div>

        {/* Geolocation Section */}
        <div className="grid grid-cols-2 gap-3.5">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-500">Longitude Coords</label>
            <div className="relative">
              <MapPin className="absolute left-2.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="number"
                step="0.00001"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="-122.4194"
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500/50 rounded-xl py-2.5 pl-8 pr-2 text-xs text-mono text-slate-800 outline-none focus:ring-1 focus:ring-blue-500/2 transition-all"
                required
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-slate-500">Latitude Coords</label>
            <div className="relative">
              <MapPin className="absolute left-2.5 top-3 h-4 w-4 text-slate-400" />
              <input
                type="number"
                step="0.00001"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="37.7749"
                className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500/50 rounded-xl py-2.5 pl-8 pr-2 text-xs text-mono text-slate-800 outline-none focus:ring-1 focus:ring-blue-500/2 transition-all"
                required
              />
            </div>
          </div>
        </div>

        {/* Real-time Distance Enforcer UI Feedback */}
        {distanceKm !== null && (
          <div className={`p-2.5 rounded-xl border text-[11px] font-semibold flex items-center gap-2 transition-all ${
            distanceKm <= 5.0
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}>
            <ShieldAlert className="h-4.5 w-4.5 shrink-0" />
            <div className="flex-1">
              <span className="block font-bold">
                {distanceKm <= 5.0 ? '✓ Within Safe Reporting Range' : '✗ Out of Range Limit'} ({distanceKm.toFixed(2)} km)
              </span>
              <span className="text-[10px] opacity-90 block leading-tight font-medium mt-0.5">
                {distanceKm <= 5.0
                  ? 'This incident location is valid and within your allowed 5 km local sector.'
                  : 'You can only report issues located within 5 km of your physical location.'}
              </span>
            </div>
          </div>
        )}

        {!userCoords && (
          <div className="p-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-[11px] font-semibold flex items-center gap-2">
            <ShieldAlert className="h-4.5 w-4.5 shrink-0 text-amber-600" />
            <span>Please active your GPS/Location services first so we can verify you are within 5km of the reported issue.</span>
          </div>
        )}



        {/* Dynamic Image Attachment Loader */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-600">Hazard Photo Attachment</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="citizen-image-file-input"
                key={image ? 'loaded' : 'empty'}
              />
              <label
                htmlFor="citizen-image-file-input"
                className="w-full bg-slate-50 border border-dashed border-slate-200 hover:border-blue-500/50 text-slate-400 hover:text-blue-600 rounded-xl py-3 px-3 flex flex-col items-center justify-center gap-1 cursor-pointer transition-all text-xs"
              >
                <Camera className="h-5 w-5 opacity-70" />
                <span className="font-semibold text-[11px] truncate max-w-[200px] text-slate-700">
                  {imageName ? imageName : 'Choose photo (Camera / File)'}
                </span>
                <span className="text-[10px] text-slate-400">Supports JPEG/PNG up to 8MB</span>
              </label>
            </div>
            
            {image && (
              <div className="relative w-16 h-16 rounded-xl border border-slate-200 overflow-hidden shrink-0 group/img">
                <img referrerPolicy="no-referrer" src={image} alt="Attachment preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => { setImage(''); setImageName(''); }}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 flex items-center justify-center text-rose-400 transition-opacity"
                  title="Remove Image"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Submit action */}
        <button
          type="submit"
          disabled={submitting || !authToken}
          className="w-full relative group bg-blue-600 hover:bg-blue-700 text-xs font-bold rounded-xl py-3 flex items-center justify-center gap-1.5 shadow-lg shadow-blue-100 active:scale-[0.99] disabled:bg-slate-100 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed cursor-pointer overflow-hidden transition-all text-white"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4.5 w-4.5 animate-spin text-white" />
              Validating Image Triage...
            </>
          ) : !authToken ? (
            "Authenticate profile to report issues"
          ) : (
            <>
              <Send className="h-4 w-4" />
              Publish Incident to Street Grid (+10 Civic Points)
            </>
          )}
        </button>

        {/* Security / Triage reminder footer */}
        <div className="flex gap-2 items-start text-[10px] text-slate-400 leading-tight">
          <ShieldAlert className="h-4.5 w-4.5 shrink-0 text-slate-400" />
          <p>
            The Community Hero AI Gatekeeper rejects non-infrastructure photos, selfies, memes, or graphics automatically. Submitting false reports reduces your Trust Score.
          </p>
        </div>
      </form>
    </div>
  );
};
