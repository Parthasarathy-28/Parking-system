// Admin Geofence Configuration Page
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  MapPin, Save, Loader2, AlertTriangle, CheckCircle,
  RefreshCw, Info, Target, Navigation
} from 'lucide-react';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import AdminLayout from '../../components/AdminLayout';
import { adminApi } from '../../lib/api';
import { useToast } from '../../contexts/ToastContext';

// Fix leaflet default markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Create custom pin icons
function createIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;background:${color};border:3px solid white;
      border-radius:50% 50% 50% 0;transform:rotate(-45deg);
      box-shadow:0 2px 8px rgba(0,0,0,0.25)
    "></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

const campusIcon = createIcon('#10b981');
const entryIcon = createIcon('#0ea5e9');

// Map click handler
function MapClickHandler({ activePin, onCampusClick, onEntryClick }) {
  useMapEvents({
    click(e) {
      const { lat, lng } = e.latlng;
      if (activePin === 'campus') onCampusClick(lat, lng);
      if (activePin === 'entry') onEntryClick(lat, lng);
    },
  });
  return null;
}

// Recenter map helper
function MapRecenter({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) map.setView([lat, lng], map.getZoom());
  }, [lat, lng, map]);
  return null;
}

// Number input with label
function NumInput({ label, value, onChange, min, max, step = 'any', unit, hint }) {
  return (
    <div>
      <label className="text-sm font-semibold text-slate-600 block mb-1">
        {label} {unit && <span className="text-slate-400 font-normal">({unit})</span>}
      </label>
      <input
        type="number" min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full border border-surface-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-300 tabular-nums"
      />
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export default function AdminGeofence() {
  const toast = useToast();

  const defaultCenter = [11.0168, 76.9558]; // PSG Tech

  const [settings, setSettings] = useState({
    campusLat: defaultCenter[0],
    campusLng: defaultCenter[1],
    campusRadiusM: 500,
    parkingEntryLat: defaultCenter[0] - 0.001,
    parkingEntryLng: defaultCenter[1] + 0.001,
    parkingEntryRadiusM: 80,
    minAccuracyM: 50,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activePin, setActivePin] = useState(null); // 'campus' | 'entry' | null

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.geofence();
      if (res.data.settings) {
        const s = res.data.settings;
        setSettings({
          campusLat: s.campus_lat,
          campusLng: s.campus_lng,
          campusRadiusM: s.campus_radius_m,
          parkingEntryLat: s.parking_entry_lat,
          parkingEntryLng: s.parking_entry_lng,
          parkingEntryRadiusM: s.parking_entry_radius_m,
          minAccuracyM: s.min_accuracy_m,
        });
      }
    } catch (e) {
      toast.info('Using defaults', 'No geofence configured yet.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    // Validate
    if (settings.campusLat < -90 || settings.campusLat > 90) return toast.error('Invalid', 'Campus latitude must be -90..90');
    if (settings.campusLng < -180 || settings.campusLng > 180) return toast.error('Invalid', 'Campus longitude must be -180..180');
    if (settings.campusRadiusM <= 0 || settings.campusRadiusM > 5000) return toast.error('Invalid', 'Campus radius must be 0–5000 m');
    if (settings.parkingEntryRadiusM <= 0 || settings.parkingEntryRadiusM > 500) return toast.error('Invalid', 'Entry radius must be 0–500 m');

    setSaving(true);
    try {
      await adminApi.updateGeofence(settings);
      toast.success('Geofence Saved', 'Location settings updated successfully.');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      toast.error('Save Failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  const set = (key) => (val) => setSettings(s => ({ ...s, [key]: val }));

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 rounded-full border-4 border-primary-200 border-t-primary-500 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  const mapCenter = [settings.campusLat, settings.campusLng];

  return (
    <AdminLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Geofence Configuration</h2>
            <p className="text-sm text-slate-400">Set campus boundaries and parking entry zone for location verification.</p>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              saved
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-300'
                : 'bg-primary-500 hover:bg-primary-600 text-white'
            } disabled:opacity-60`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Geofence'}
          </button>
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 bg-sky-50 border border-sky-200 rounded-2xl px-4 py-3">
          <Info className="w-5 h-5 text-sky-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-sky-700">
            <p className="font-semibold mb-0.5">How geofencing works</p>
            <p>Students must be inside the <strong>Parking Entry</strong> circle to request a slot. The larger <strong>Campus</strong> circle shows they're on campus. Click on the map after selecting a pin type to reposition it.</p>
          </div>
        </div>

        {/* Map + Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Map */}
          <div className="lg:col-span-3 bg-white rounded-2xl border border-surface-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-200 flex items-center justify-between">
              <span className="font-semibold text-slate-700 text-sm">Map Preview</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActivePin(activePin === 'campus' ? null : 'campus')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    activePin === 'campus'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  <Target className="w-3.5 h-3.5" />
                  {activePin === 'campus' ? 'Click map to place' : 'Place Campus'}
                </button>
                <button
                  onClick={() => setActivePin(activePin === 'entry' ? null : 'entry')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    activePin === 'entry'
                      ? 'bg-sky-500 text-white'
                      : 'bg-sky-50 text-sky-700 hover:bg-sky-100'
                  }`}
                >
                  <Navigation className="w-3.5 h-3.5" />
                  {activePin === 'entry' ? 'Click map to place' : 'Place Entry'}
                </button>
              </div>
            </div>

            <div className="h-[420px]">
              <MapContainer
                center={mapCenter}
                zoom={16}
                style={{ height: '100%', width: '100%' }}
                className="rounded-b-2xl"
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                />

                <MapRecenter lat={settings.campusLat} lng={settings.campusLng} />

                <MapClickHandler
                  activePin={activePin}
                  onCampusClick={(lat, lng) => {
                    setSettings(s => ({ ...s, campusLat: lat, campusLng: lng }));
                    setActivePin(null);
                  }}
                  onEntryClick={(lat, lng) => {
                    setSettings(s => ({ ...s, parkingEntryLat: lat, parkingEntryLng: lng }));
                    setActivePin(null);
                  }}
                />

                {/* Campus circle */}
                <Circle
                  center={[settings.campusLat, settings.campusLng]}
                  radius={settings.campusRadiusM}
                  pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.08, weight: 2, dashArray: '6 4' }}
                />
                <Marker position={[settings.campusLat, settings.campusLng]} icon={campusIcon}>
                  <Popup>Campus Center<br />Radius: {settings.campusRadiusM}m</Popup>
                </Marker>

                {/* Parking entry circle */}
                <Circle
                  center={[settings.parkingEntryLat, settings.parkingEntryLng]}
                  radius={settings.parkingEntryRadiusM}
                  pathOptions={{ color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.15, weight: 2.5 }}
                />
                <Marker position={[settings.parkingEntryLat, settings.parkingEntryLng]} icon={entryIcon}>
                  <Popup>Parking Entry<br />Radius: {settings.parkingEntryRadiusM}m</Popup>
                </Marker>
              </MapContainer>
            </div>

            {/* Legend */}
            <div className="px-4 py-3 border-t border-surface-200 flex gap-5">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="w-4 h-1.5 rounded-full bg-emerald-500" />
                Campus boundary
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="w-4 h-1.5 rounded-full bg-sky-500" />
                Parking entry zone
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="lg:col-span-2 space-y-4">
            {/* Campus */}
            <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                </div>
                <h3 className="font-bold text-slate-700">Campus Boundary</h3>
              </div>
              <div className="space-y-3">
                <NumInput label="Latitude" value={settings.campusLat} onChange={set('campusLat')} min={-90} max={90} step={0.000001} />
                <NumInput label="Longitude" value={settings.campusLng} onChange={set('campusLng')} min={-180} max={180} step={0.000001} />
                <div>
                  <NumInput label="Radius" value={settings.campusRadiusM} onChange={set('campusRadiusM')} min={50} max={5000} step={10} unit="meters"
                    hint="Students outside this zone see campus info only." />
                  <input type="range" min={50} max={2000} step={10} value={settings.campusRadiusM}
                    onChange={e => set('campusRadiusM')(+e.target.value)}
                    className="w-full mt-2 accent-emerald-500" />
                </div>
              </div>
            </div>

            {/* Parking Entry */}
            <div className="bg-white rounded-2xl border border-sky-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-sky-100 flex items-center justify-center">
                  <Navigation className="w-4 h-4 text-sky-600" />
                </div>
                <h3 className="font-bold text-slate-700">Parking Entry Zone</h3>
              </div>
              <div className="space-y-3">
                <NumInput label="Latitude" value={settings.parkingEntryLat} onChange={set('parkingEntryLat')} min={-90} max={90} step={0.000001} />
                <NumInput label="Longitude" value={settings.parkingEntryLng} onChange={set('parkingEntryLng')} min={-180} max={180} step={0.000001} />
                <div>
                  <NumInput label="Radius" value={settings.parkingEntryRadiusM} onChange={set('parkingEntryRadiusM')} min={10} max={500} step={5} unit="meters"
                    hint="Students must be inside this zone to request a slot." />
                  <input type="range" min={20} max={300} step={5} value={settings.parkingEntryRadiusM}
                    onChange={e => set('parkingEntryRadiusM')(+e.target.value)}
                    className="w-full mt-2 accent-sky-500" />
                </div>
              </div>
            </div>

            {/* Accuracy */}
            <div className="bg-white rounded-2xl border border-surface-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Target className="w-4 h-4 text-amber-600" />
                </div>
                <h3 className="font-bold text-slate-700">GPS Accuracy Threshold</h3>
              </div>
              <NumInput
                label="Minimum Accuracy"
                value={settings.minAccuracyM}
                onChange={set('minAccuracyM')}
                min={5} max={200} step={5} unit="meters"
                hint="GPS readings worse than this are rejected. Lower = stricter."
              />
              <input type="range" min={10} max={150} step={5} value={settings.minAccuracyM}
                onChange={e => set('minAccuracyM')(+e.target.value)}
                className="w-full mt-2 accent-amber-500" />
            </div>

            {/* Warning */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                GPS coordinates can be spoofed by determined users. This system is a deterrent and convenience tool, not a security perimeter. See README for limitations.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
