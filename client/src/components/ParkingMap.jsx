// ParkingMap.jsx — Google Maps-Inspired Campus Parking Navigation
// High-fidelity top-down campus map with smooth pan/zoom, realistic architecture,
// separate Student & Staff parking zones, animated route guidance, live simulation,
// and turn-by-turn navigation bottom sheet.

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Navigation, MapPin, ZoomIn, ZoomOut, RotateCcw, LocateFixed,
  Layers, Info, X, ChevronRight, CheckCircle2, AlertTriangle,
  Bike, Car, Play, Pause, RefreshCw, ShieldCheck, Lock,
  ArrowRight, CornerUpRight, CornerUpLeft, ArrowUp, Compass
} from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────────
// Canvas & Graph Constants (matching seed.js slot layout & dijkstra.js)
// ──────────────────────────────────────────────────────────────────────────────
const VIEW_W = 1000;
const VIEW_H = 750;

// Graph lane nodes for routing
const LANE_POSITIONS = {
  'entrance':       { x: 410, y: 680, label: 'Main Campus Entrance' },
  'lane-main-1':    { x: 410, y: 500, label: 'Campus Boulevard South' },
  'lane-a-start':   { x: 150, y: 500, label: 'Student Parking Entry (Zone A)' },
  'lane-b-start':   { x: 600, y: 500, label: 'Student Parking Entry (Zone B)' },
  'lane-main-2':    { x: 410, y: 430, label: 'Campus Boulevard Central' },
  'lane-main-3':    { x: 410, y: 360, label: 'Campus Boulevard North' },
  'lane-c-start':   { x: 150, y: 360, label: 'Staff Reserved Entry (Zone C)' },
  'exit':           { x: 860, y: 360, label: 'Campus Exit Gate' },
  // Zone A rows (Bikes)
  'lane-a-row1':    { x: 150, y: 100, label: 'Zone A — Row 1' },
  'lane-a-row2':    { x: 150, y: 170, label: 'Zone A — Row 2' },
  'lane-a-row3':    { x: 150, y: 240, label: 'Zone A — Row 3' },
  'lane-a-row4':    { x: 150, y: 310, label: 'Zone A — Row 4' },
  // Zone B rows (Cars)
  'lane-b-row1':    { x: 600, y: 100, label: 'Zone B — Row 1' },
  'lane-b-row2':    { x: 600, y: 190, label: 'Zone B — Row 2' },
  'lane-b-row3':    { x: 600, y: 280, label: 'Zone B — Row 3' },
  'lane-b-row4':    { x: 600, y: 370, label: 'Zone B — Row 4' },
  // Zone C rows (Staff)
  'lane-c-row1':    { x: 150, y: 440, label: 'Zone C — Row 1' },
  'lane-c-row2':    { x: 150, y: 530, label: 'Zone C — Row 2' },
};

// Client-side Dijkstra fallback if backend route is not cached
function solveClientRoute(slots, targetSlotId) {
  if (!slots?.length || !targetSlotId) return null;
  const graph = {};
  const addEdge = (a, b, w = 1) => {
    if (!graph[a]) graph[a] = {};
    if (!graph[b]) graph[b] = {};
    graph[a][b] = w;
    graph[b][a] = w;
  };

  addEdge('entrance', 'lane-main-1', 1);
  addEdge('lane-main-1', 'lane-a-start', 1);
  addEdge('lane-main-1', 'lane-main-2', 1);
  addEdge('lane-main-2', 'lane-b-start', 1);
  addEdge('lane-main-2', 'lane-main-3', 1);
  addEdge('lane-main-3', 'lane-c-start', 1);
  addEdge('lane-main-3', 'exit', 2);

  addEdge('lane-a-start', 'lane-a-row1', 1);
  addEdge('lane-a-row1', 'lane-a-row2', 1);
  addEdge('lane-a-row2', 'lane-a-row3', 1);
  addEdge('lane-a-row3', 'lane-a-row4', 1);

  addEdge('lane-b-start', 'lane-b-row1', 1);
  addEdge('lane-b-row1', 'lane-b-row2', 1);
  addEdge('lane-b-row2', 'lane-b-row3', 1);
  addEdge('lane-b-row3', 'lane-b-row4', 1);

  addEdge('lane-c-start', 'lane-c-row1', 1);
  addEdge('lane-c-row1', 'lane-c-row2', 1);

  for (const s of slots) {
    const num = s.slot_number || '';
    if (num.startsWith('A')) {
      const n = parseInt(num.slice(1)) || 1;
      const row = Math.ceil(n / 4);
      addEdge(`lane-a-row${row}`, s.id, 0.5);
    } else if (num.startsWith('B')) {
      const n = parseInt(num.slice(1)) || 1;
      const row = Math.ceil(n / 3);
      addEdge(`lane-b-row${row}`, s.id, 0.5);
    } else if (num.startsWith('C')) {
      const n = parseInt(num.slice(1)) || 1;
      const row = Math.ceil(n / 4);
      addEdge(`lane-c-row${row}`, s.id, 0.5);
    }
  }

  const dist = {};
  const prev = {};
  const queue = new Set(Object.keys(graph));
  for (const node of queue) {
    dist[node] = Infinity;
    prev[node] = null;
  }
  dist['entrance'] = 0;

  while (queue.size > 0) {
    let u = null;
    let minDist = Infinity;
    for (const node of queue) {
      if (dist[node] < minDist) {
        minDist = dist[node];
        u = node;
      }
    }
    if (u === null || u === targetSlotId) break;
    queue.delete(u);
    const neighbors = graph[u] || {};
    for (const [v, w] of Object.entries(neighbors)) {
      if (!queue.has(v)) continue;
      const alt = dist[u] + w;
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
      }
    }
  }

  if (dist[targetSlotId] === Infinity) return null;
  const path = [];
  let curr = targetSlotId;
  while (curr !== null) {
    path.unshift(curr);
    curr = prev[curr];
  }
  return { path, distance: dist[targetSlotId] };
}

function getSlotPos(slot) {
  if (slot.position_x != null && slot.position_y != null) {
    return { x: Number(slot.position_x), y: Number(slot.position_y) };
  }
  return null;
}

function getSlotCenter(slot) {
  const pos = getSlotPos(slot);
  if (!pos) return null;
  const isBike = slot.vehicle_type === 'bike';
  const w = isBike ? 46 : 64;
  const h = isBike ? 34 : 44;
  return { x: pos.x + w / 2, y: pos.y + h / 2 };
}

// ──────────────────────────────────────────────────────────────────────────────
// Stylized Tree Asset
// ──────────────────────────────────────────────────────────────────────────────
function Tree({ x, y, r = 18, type = 'deciduous' }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Drop shadow */}
      <ellipse cx={2} cy={4} rx={r * 1.1} ry={r * 0.85} fill="rgba(0,0,0,0.12)" />
      {/* Base foliage */}
      <circle cx={0} cy={0} r={r} fill="#2E7D32" />
      {/* Mid canopy highlights */}
      <circle cx={-r * 0.25} cy={-r * 0.2} r={r * 0.72} fill="#388E3C" />
      <circle cx={r * 0.25} cy={r * 0.15} r={r * 0.65} fill="#43A047" />
      {/* Top sun highlight */}
      <circle cx={-r * 0.15} cy={-r * 0.3} r={r * 0.45} fill="#81C784" opacity={0.85} />
      {/* Center trunk crown */}
      <circle cx={0} cy={0} r={r * 0.18} fill="#1B5E20" />
    </g>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Pedestrian Zebra Crosswalk
// ──────────────────────────────────────────────────────────────────────────────
function Crosswalk({ x, y, width, height, vertical = false }) {
  const bars = [];
  const barSize = 6;
  const gap = 6;
  if (!vertical) {
    const count = Math.floor(width / (barSize + gap));
    for (let i = 0; i < count; i++) {
      bars.push(<rect key={i} x={x + i * (barSize + gap)} y={y} width={barSize} height={height} fill="#FFFFFF" rx={1} opacity={0.9} />);
    }
  } else {
    const count = Math.floor(height / (barSize + gap));
    for (let i = 0; i < count; i++) {
      bars.push(<rect key={i} x={x} y={y + i * (barSize + gap)} width={width} height={barSize} fill="#FFFFFF" rx={1} opacity={0.9} />);
    }
  }
  return <g className="crosswalk">{bars}</g>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Slot Cell Component with Google Maps Polish
// ──────────────────────────────────────────────────────────────────────────────
function SlotCell({ slot, isAllocated, isDimmed, onClick }) {
  const isBike = slot.vehicle_type === 'bike';
  const w = isBike ? 46 : 64;
  const h = isBike ? 34 : 44;
  const pos = getSlotPos(slot);
  if (!pos) return null;

  // Status-based color palette
  const status = slot.occupancy_status;
  const isOccupied = status === 'occupied';
  const isHeld = status === 'held';
  const isBlocked = slot.operational_status === 'blocked';
  const isAvailable = !isOccupied && !isHeld && !isBlocked;

  let fill = '#FFFFFF';
  let stroke = '#CBD5E1';
  let textCol = '#475569';
  let statusBadge = '#10B981';

  if (isAllocated) {
    fill = '#EFF6FF';
    stroke = '#2563EB';
    textCol = '#1D4ED8';
    statusBadge = '#2563EB';
  } else if (isOccupied) {
    fill = '#FEF2F2';
    stroke = '#F87171';
    textCol = '#B91C1C';
    statusBadge = '#EF4444';
  } else if (isHeld) {
    fill = '#FFFBEB';
    stroke = '#FBBF24';
    textCol = '#B45309';
    statusBadge = '#F59E0B';
  } else if (isBlocked) {
    fill = '#F1F5F9';
    stroke = '#94A3B8';
    textCol = '#64748B';
    statusBadge = '#94A3B8';
  } else {
    fill = '#F0FDF4';
    stroke = '#4ADE80';
    textCol = '#15803D';
    statusBadge = '#10B981';
  }

  return (
    <g
      onClick={() => onClick?.(slot)}
      className="cursor-pointer transition-transform"
      opacity={isDimmed ? 0.45 : 1}
      style={{ transition: 'opacity 0.2s ease' }}
    >
      {/* Drop shadow */}
      <rect
        x={pos.x + 1}
        y={pos.y + 2}
        width={w}
        height={h}
        rx={5}
        fill="rgba(0,0,0,0.06)"
      />

      {/* Pulsing glow ring for allocated slot */}
      {isAllocated && (
        <motion.rect
          x={pos.x - 4}
          y={pos.y - 4}
          width={w + 8}
          height={h + 8}
          rx={8}
          fill="none"
          stroke="#3B82F6"
          strokeWidth="2.5"
          initial={{ opacity: 0.3, scale: 0.98 }}
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.98, 1.02, 0.98] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Main parking slot box */}
      <rect
        x={pos.x}
        y={pos.y}
        width={w}
        height={h}
        rx={5}
        fill={fill}
        stroke={stroke}
        strokeWidth={isAllocated ? 2.5 : 1.5}
      />

      {/* Concrete wheel stop bumper at back of slot */}
      <rect
        x={pos.x + 4}
        y={pos.y + 3}
        width={w - 8}
        height={3}
        rx={1.5}
        fill="#94A3B8"
        opacity={0.65}
      />

      {/* Slot number */}
      <text
        x={pos.x + w / 2}
        y={pos.y + h / 2 + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={isBike ? 10 : 11}
        fontWeight="800"
        fontFamily="sans-serif"
        fill={textCol}
      >
        {slot.slot_number}
      </text>

      {/* Vehicle type micro icon */}
      <g transform={`translate(${pos.x + 5}, ${pos.y + h - 11})`}>
        {isBike ? (
          <path d="M1 5 C2 2, 4 2, 5 5 M7 5 C8 2, 10 2, 11 5 M3 4 L8 4" stroke={textCol} strokeWidth="1" fill="none" opacity={0.6} />
        ) : (
          <path d="M1 5 L3 2 L8 2 L10 5 Z" stroke={textCol} strokeWidth="0.8" fill="none" opacity={0.6} />
        )}
      </g>

      {/* Status indicator pip */}
      <circle
        cx={pos.x + w - 7}
        cy={pos.y + h - 7}
        r={3.5}
        fill={statusBadge}
      />
    </g>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Animated Navigation Route with Moving Chevrons
// ──────────────────────────────────────────────────────────────────────────────
function AnimatedRoutePath({ points }) {
  const pathRef = useRef(null);
  const [totalLen, setTotalLen] = useState(0);

  const d = useMemo(() => {
    if (!points || points.length < 2) return '';
    return `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
  }, [points]);

  useEffect(() => {
    if (pathRef.current) {
      setTotalLen(pathRef.current.getTotalLength() || 600);
    }
  }, [d]);

  if (!d) return null;

  return (
    <g className="route-layer">
      {/* Route background shadow glow */}
      <path
        d={d}
        fill="none"
        stroke="#1D4ED8"
        strokeWidth="10"
        strokeOpacity="0.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Outer contrast stroke */}
      <path
        d={d}
        fill="none"
        stroke="#1E40AF"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Core Google Maps blue line */}
      <motion.path
        ref={pathRef}
        d={d}
        fill="none"
        stroke="#3B82F6"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={`${totalLen} ${totalLen}`}
        initial={{ strokeDashoffset: totalLen }}
        animate={{ strokeDashoffset: 0 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />

      {/* Animated directional dashed overlay */}
      <path
        d={d}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="8 12"
        opacity="0.85"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="40"
          to="0"
          dur="1.2s"
          repeatCount="indefinite"
        />
      </path>

      {/* Directional chevron arrows at segment midpoints */}
      {points.slice(1).map((p, i) => {
        const prev = points[i];
        const dist = Math.hypot(p.x - prev.x, p.y - prev.y);
        if (dist < 15) return null;
        const angle = (Math.atan2(p.y - prev.y, p.x - prev.x) * 180) / Math.PI;
        const mx = (prev.x + p.x) / 2;
        const my = (prev.y + p.y) / 2;
        return (
          <g key={i} transform={`translate(${mx},${my}) rotate(${angle})`}>
            <polygon points="-5,-4 4,0 -5,4" fill="#FFFFFF" />
          </g>
        );
      })}
    </g>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// "You Are Here" Google Maps Marker
// ──────────────────────────────────────────────────────────────────────────────
function YouAreHereMarker({ x, y, heading = 0 }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Outer pulsing radar aura */}
      <motion.circle
        r={14}
        fill="#3B82F6"
        initial={{ opacity: 0.6, scale: 0.8 }}
        animate={{ opacity: [0.6, 0], scale: [0.8, 2.4] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
      />

      {/* Directional beam / heading cone */}
      <g transform={`rotate(${heading})`}>
        <path
          d="M 0,0 L -16,-34 A 40 40 0 0 1 16,-34 Z"
          fill="url(#heading-cone-grad)"
          opacity={0.5}
        />
      </g>

      {/* White outer halo */}
      <circle r={8.5} fill="#FFFFFF" />
      {/* Vivid Google Blue core */}
      <circle r={6.5} fill="#1D4ED8" />
      <circle r={3} fill="#60A5FA" />
    </g>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Destination Pin Marker (Google Maps Red Teardrop)
// ──────────────────────────────────────────────────────────────────────────────
function DestinationPin({ x, y, slotNumber, zoneName }) {
  return (
    <motion.g
      initial={{ scale: 0, y: -20 }}
      animate={{ scale: 1, y: 0 }}
      transition={{ type: 'spring', damping: 12, stiffness: 200 }}
      transform={`translate(${x}, ${y})`}
    >
      {/* Shadow */}
      <ellipse cx={0} cy={2} rx={10} ry={4} fill="rgba(0,0,0,0.22)" />

      {/* Teardrop Pin */}
      <g transform="translate(0, -2)">
        <motion.g
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* SVG Teardrop Path */}
          <path
            d="M 0,0 C -8,-9 -14,-16 -14,-24 C -14,-33 -7,-39 0,-39 C 7,-39 14,-33 14,-24 C 14,-16 8,-9 0,0 Z"
            fill="#EA4335"
            stroke="#B91C1C"
            strokeWidth="1.2"
          />
          {/* Inner white circle */}
          <circle cx={0} cy={-24} r={6.5} fill="#FFFFFF" />
          {/* Destination star / P glyph */}
          <text
            x={0}
            y={-22.5}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="8"
            fontWeight="900"
            fill="#EA4335"
          >
            P
          </text>

          {/* Floating Pill Label */}
          <g transform="translate(0, -47)">
            <rect
              x={-42}
              y={-11}
              width={84}
              height={18}
              rx={9}
              fill="#1E293B"
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
            <text
              x={0}
              y={-1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="9"
              fontWeight="800"
              fill="#FFFFFF"
            >
              YOUR SLOT: {slotNumber}
            </text>
          </g>
        </motion.g>
      </g>
    </motion.g>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Moving Vehicle Simulation Component
// ──────────────────────────────────────────────────────────────────────────────
function SimulatedVehicle({ points, progress = 0, isBike = false }) {
  if (!points || points.length < 2) return null;

  // Calculate cumulative segment lengths
  const segLens = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    segLens.push(d);
    total += d;
  }
  if (total === 0) return null;

  const targetDist = progress * total;
  let accumulated = 0;
  let currX = points[0].x;
  let currY = points[0].y;
  let angle = 0;

  for (let i = 0; i < segLens.length; i++) {
    const len = segLens[i];
    if (accumulated + len >= targetDist || i === segLens.length - 1) {
      const segT = len > 0 ? (targetDist - accumulated) / len : 0;
      const clampedT = Math.max(0, Math.min(1, segT));
      const p0 = points[i];
      const p1 = points[i + 1];
      currX = p0.x + (p1.x - p0.x) * clampedT;
      currY = p0.y + (p1.y - p0.y) * clampedT;
      angle = (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI;
      break;
    }
    accumulated += len;
  }

  return (
    <g transform={`translate(${currX}, ${currY}) rotate(${angle})`}>
      {/* Ground shadow */}
      <ellipse cx={0} cy={1} rx={isBike ? 8 : 14} ry={isBike ? 5 : 8} fill="rgba(0,0,0,0.25)" />

      {/* Vehicle body */}
      {isBike ? (
        <g>
          <rect x={-8} y={-3.5} width={16} height={7} rx={3} fill="#059669" stroke="#FFFFFF" strokeWidth="1" />
          <circle cx={-5} cy={0} r={2} fill="#1E293B" />
          <circle cx={5} cy={0} r={2} fill="#1E293B" />
          <circle cx={0} cy={0} r={2.5} fill="#34D399" />
        </g>
      ) : (
        <g>
          {/* Car body */}
          <rect x={-12} y={-7} width={24} height={14} rx={4} fill="#2563EB" stroke="#FFFFFF" strokeWidth="1.2" />
          {/* Windshield */}
          <rect x={-4} y={-5} width={8} height={10} rx={2} fill="#93C5FD" opacity={0.8} />
          {/* Headlights */}
          <circle cx={10} cy={-4.5} r={1.5} fill="#FEF08A" />
          <circle cx={10} cy={4.5} r={1.5} fill="#FEF08A" />
          {/* Taillights */}
          <circle cx={-11} cy={-4.5} r={1.5} fill="#EF4444" />
          <circle cx={-11} cy={4.5} r={1.5} fill="#EF4444" />
        </g>
      )}
    </g>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT: ParkingMap
// ──────────────────────────────────────────────────────────────────────────────
export default function ParkingMap({
  slots = [],
  zones = [],
  route = null,
  myAllocation = null,
  user = null,
  isAdmin = false,
  onSlotClick = null,
  onBlockSlot = null,
  onUnblockSlot = null,
  onRefresh = null,
  isReallocating = false,
}) {
  // Navigation & viewport state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [activeZoneFilter, setActiveZoneFilter] = useState('all'); // 'all', 'student', 'staff'
  const [showLegend, setShowLegend] = useState(false);
  const [mapStyle, setMapStyle] = useState('standard'); // 'standard', 'satellite'

  // Live simulation state
  const [isSimulating, setIsSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const simRef = useRef(null);

  const containerRef = useRef(null);
  const svgRef = useRef(null);

  // Determine user role
  const isStaffUser = user?.role === 'staff' || myAllocation?.zone_name?.toLowerCase().includes('staff');

  // Find allocated slot
  const allocatedSlot = useMemo(() => {
    if (!myAllocation?.slot_id && !myAllocation?.id) return null;
    const targetId = myAllocation.slot_id || myAllocation.id;
    return slots.find(s => s.id === targetId || s.slot_number === myAllocation.slot_number) || null;
  }, [slots, myAllocation]);

  // Derive route points (backend or fallback Dijkstra)
  const routePoints = useMemo(() => {
    let path = route?.path;
    if ((!path || path.length < 2) && allocatedSlot) {
      const solved = solveClientRoute(slots, allocatedSlot.id);
      if (solved?.path) path = solved.path;
    }
    if (!path || path.length < 2) return [];

    const pts = [];
    for (const node of path) {
      if (LANE_POSITIONS[node]) {
        pts.push({ x: LANE_POSITIONS[node].x, y: LANE_POSITIONS[node].y });
      } else if (node.startsWith('slot-') || node === allocatedSlot?.id) {
        if (allocatedSlot) {
          const c = getSlotCenter(allocatedSlot);
          if (c) pts.push(c);
        }
      }
    }
    return pts;
  }, [route, allocatedSlot, slots]);

  // Turn-by-turn navigation steps
  const navSteps = useMemo(() => {
    if (!routePoints.length || !allocatedSlot) return [];
    const steps = [
      {
        icon: ArrowUp,
        text: 'Enter campus through Main Gate barrier',
        distance: '30 m',
        sub: 'Follow the central boulevard north',
      },
    ];

    const isZoneA = allocatedSlot.slot_number.startsWith('A');
    const isZoneB = allocatedSlot.slot_number.startsWith('B');
    const isZoneC = allocatedSlot.slot_number.startsWith('C');

    if (isZoneA) {
      steps.push({
        icon: CornerUpLeft,
        text: 'Turn left into Student Parking (Zone A — Bikes)',
        distance: '45 m',
        sub: 'Pass under the Student Entry gantry',
      });
      const row = Math.ceil((parseInt(allocatedSlot.slot_number.slice(1)) || 1) / 4);
      steps.push({
        icon: CornerUpRight,
        text: `Turn right into Bike Parking Row ${row}`,
        distance: '20 m',
        sub: `Aisle towards bay ${allocatedSlot.slot_number}`,
      });
    } else if (isZoneB) {
      steps.push({
        icon: CornerUpRight,
        text: 'Turn right into Student Parking (Zone B — Cars)',
        distance: '50 m',
        sub: 'Drive along the student car access avenue',
      });
      const row = Math.ceil((parseInt(allocatedSlot.slot_number.slice(1)) || 1) / 3);
      steps.push({
        icon: CornerUpLeft,
        text: `Turn left into Car Parking Row ${row}`,
        distance: '25 m',
        sub: `Aisle towards bay ${allocatedSlot.slot_number}`,
      });
    } else if (isZoneC) {
      steps.push({
        icon: CornerUpLeft,
        text: 'Turn left into Staff Reserved Parking (Zone C)',
        distance: '40 m',
        sub: 'Authorized staff & faculty access only',
      });
      const row = Math.ceil((parseInt(allocatedSlot.slot_number.slice(1)) || 1) / 4);
      steps.push({
        icon: CornerUpRight,
        text: `Turn into Staff Bay Row ${row}`,
        distance: '20 m',
        sub: `Staff parking stall ${allocatedSlot.slot_number}`,
      });
    }

    steps.push({
      icon: CheckCircle2,
      text: `Arrive at Slot ${allocatedSlot.slot_number} on your right`,
      distance: '10 m',
      sub: `${allocatedSlot.zone_name || 'Assigned Zone'} • Park inside the lines`,
    });

    return steps;
  }, [routePoints, allocatedSlot]);

  // Active step index during simulation
  const currentStepIndex = useMemo(() => {
    if (!navSteps.length) return 0;
    const idx = Math.min(
      Math.floor(simProgress * navSteps.length),
      navSteps.length - 1
    );
    return idx;
  }, [simProgress, navSteps]);

  // Auto-focus on user's region when allocation is present
  useEffect(() => {
    if (allocatedSlot) {
      const c = getSlotCenter(allocatedSlot);
      if (c) {
        // Smoothly center on the allocated slot
        const cx = VIEW_W / 2 - c.x;
        const cy = VIEW_H / 2 - c.y;
        setPan({ x: cx * 0.4, y: cy * 0.4 });
        setZoom(1.15);
      }
    } else if (isStaffUser) {
      setActiveZoneFilter('staff');
    }
  }, [allocatedSlot, isStaffUser]);

  // Simulation animation loop
  useEffect(() => {
    if (!isSimulating) {
      if (simRef.current) cancelAnimationFrame(simRef.current);
      return;
    }

    let lastTime = performance.now();
    const duration = 12000; // 12 seconds trip

    const step = (now) => {
      const delta = now - lastTime;
      lastTime = now;
      setSimProgress((prev) => {
        const next = prev + delta / duration;
        if (next >= 1) {
          setIsSimulating(false);
          return 1;
        }
        return next;
      });
      simRef.current = requestAnimationFrame(step);
    };

    simRef.current = requestAnimationFrame(step);
    return () => {
      if (simRef.current) cancelAnimationFrame(simRef.current);
    };
  }, [isSimulating]);

  // Reset simulation when route changes
  useEffect(() => {
    setSimProgress(0);
    setIsSimulating(false);
  }, [route, allocatedSlot]);

  // Mouse pan handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e) => {
    if (!isPanning) return;
    setPan({
      x: e.clientX - startPan.x,
      y: e.clientY - startPan.y,
    });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Wheel zoom handler
  const handleWheel = (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.12 : 0.89;
    setZoom((z) => Math.min(Math.max(z * zoomFactor, 0.65), 2.8));
  };

  // Recenter button
  const handleRecenter = () => {
    if (allocatedSlot) {
      const c = getSlotCenter(allocatedSlot);
      if (c) {
        const cx = VIEW_W / 2 - c.x;
        const cy = VIEW_H / 2 - c.y;
        setPan({ x: cx * 0.5, y: cy * 0.5 });
        setZoom(1.25);
        return;
      }
    }
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Focus specific zones
  const handleFocusZone = (zoneKey) => {
    setActiveZoneFilter(zoneKey);
    if (zoneKey === 'student') {
      setPan({ x: 40, y: 40 });
      setZoom(1.25);
    } else if (zoneKey === 'staff') {
      setPan({ x: 120, y: -120 });
      setZoom(1.35);
    } else {
      setPan({ x: 0, y: 0 });
      setZoom(1);
    }
  };

  // Legend list
  const legendItems = [
    { label: 'Available Slot', color: '#10B981', dot: '#10B981' },
    { label: 'Temporarily Held', color: '#F59E0B', dot: '#F59E0B' },
    { label: 'Occupied', color: '#EF4444', dot: '#EF4444' },
    { label: 'Blocked / Maint.', color: '#94A3B8', dot: '#94A3B8' },
    { label: 'Your Allocated Slot', color: '#2563EB', dot: '#2563EB' },
  ];

  return (
    <div className="relative w-full rounded-3xl overflow-hidden border border-slate-200 bg-white shadow-xl flex flex-col select-none">
      {/* ── Top Bar: Google Maps Header with Mode Chips ── */}
      <div className="px-5 py-3.5 bg-white/95 backdrop-blur border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-sm">
            <Compass className="w-5 h-5 text-blue-600 animate-spin-slow" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
                {myAllocation ? 'Live Slot Navigation' : 'Campus Parking Explorer'}
              </h2>
              {myAllocation ? (
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
                  Active Trip
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                  Campus Overview
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              PSG College of Technology • Real-time slot availability & lane routing
            </p>
          </div>
        </div>

        {/* Quick Zone Filter Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-2xl gap-1 text-xs font-bold text-slate-600">
          <button
            onClick={() => handleFocusZone('all')}
            className={`px-3 py-1.5 rounded-xl transition-all ${
              activeZoneFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'hover:text-slate-900'
            }`}
          >
            All Campus
          </button>
          <button
            onClick={() => handleFocusZone('student')}
            className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all ${
              activeZoneFilter === 'student' ? 'bg-emerald-500 text-white shadow-sm' : 'hover:text-emerald-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-300" />
            Student Parking
          </button>
          <button
            onClick={() => handleFocusZone('staff')}
            className={`px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all ${
              activeZoneFilter === 'staff' ? 'bg-blue-600 text-white shadow-sm' : 'hover:text-blue-700'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-300" />
            Staff Parking
          </button>
        </div>
      </div>

      {/* ── Reallocation Alert Banner ── */}
      <AnimatePresence>
        {isReallocating && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-500 text-white px-4 py-2.5 flex items-center gap-3 text-xs font-bold z-20 shadow-md"
          >
            <AlertTriangle className="w-4 h-4 text-white flex-shrink-0 animate-bounce" />
            <span>Assigned bay was occupied. Recalculating optimal turn-by-turn route to your new slot…</span>
            <div className="ml-auto w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Interactive Map Viewport Container ── */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="relative w-full h-[540px] md:h-[620px] bg-slate-50 overflow-hidden cursor-grab active:cursor-grabbing"
        style={{ userSelect: 'none', touchAction: 'none' }}
      >
        {/* Floating Google Maps Control Buttons (Top Right) */}
        <div className="absolute top-4 right-4 z-30 flex flex-col gap-2">
          {/* Zoom In & Out */}
          <div className="flex flex-col bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.25, 2.8))}
              title="Zoom In"
              className="p-2.5 text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors border-b border-slate-100"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.25, 0.65))}
              title="Zoom Out"
              className="p-2.5 text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
          </div>

          {/* Recenter Map */}
          <button
            onClick={handleRecenter}
            title="Recenter Map"
            className="p-2.5 bg-white text-slate-700 hover:text-blue-600 hover:bg-blue-50 active:bg-blue-100 rounded-2xl shadow-lg border border-slate-200 transition-all flex items-center justify-center"
          >
            <LocateFixed className="w-4 h-4" />
          </button>

          {/* Reset Overview */}
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
              setActiveZoneFilter('all');
            }}
            title="Reset View"
            className="p-2.5 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-2xl shadow-lg border border-slate-200 transition-colors flex items-center justify-center"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Map Legend Toggle */}
          <button
            onClick={() => setShowLegend(!showLegend)}
            title="Toggle Map Legend"
            className={`p-2.5 rounded-2xl shadow-lg border transition-colors flex items-center justify-center ${
              showLegend ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Layers className="w-4 h-4" />
          </button>

          {/* Refresh Data */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              title="Refresh Slots"
              className="p-2.5 bg-white text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-2xl shadow-lg border border-slate-200 transition-colors flex items-center justify-center"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Floating Legend Overlay */}
        <AnimatePresence>
          {showLegend && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              className="absolute top-4 right-16 z-30 bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-slate-200 w-60 text-xs"
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                <span className="font-extrabold text-slate-800">Map Legend</span>
                <button onClick={() => setShowLegend(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                {legendItems.map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-md border" style={{ backgroundColor: item.dot, borderColor: item.color }} />
                    <span className="text-slate-600 font-medium">{item.label}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-2 rounded bg-emerald-200 border border-emerald-500" />
                    <span>Student Parking (Zones A & B)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-2 rounded bg-blue-200 border border-blue-500" />
                    <span>Staff Parking (Zone C)</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── THE SVG MAP CANVAS ── */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full h-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '50% 50%',
            transition: isPanning ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0, 0, 1)',
          }}
        >
          {/* SVG Definitions */}
          <defs>
            {/* Heading Cone Gradient */}
            <radialGradient id="heading-cone-grad" cx="0%" cy="0%" r="100%">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
            </radialGradient>

            {/* Asphalt Texture Pattern */}
            <pattern id="asphalt-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <rect width="40" height="40" fill="#E2E8F0" />
              <line x1="0" y1="40" x2="40" y2="40" stroke="#CBD5E1" strokeWidth="0.5" />
            </pattern>

            {/* Grass Texture Pattern */}
            <pattern id="grass-pattern" width="60" height="60" patternUnits="userSpaceOnUse">
              <rect width="60" height="60" fill="#E8F5E9" />
              <circle cx="15" cy="15" r="2" fill="#C8E6C9" opacity="0.6" />
              <circle cx="45" cy="45" r="2" fill="#C8E6C9" opacity="0.6" />
            </pattern>

            {/* Shadow Filter */}
            <filter id="soft-shadow" x="-10%" y="-10%" width="125%" height="125%">
              <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#0F172A" floodOpacity="0.08" />
            </filter>
            <filter id="bldg-shadow" x="-10%" y="-10%" width="130%" height="130%">
              <feDropShadow dx="2" dy="5" stdDeviation="4" floodColor="#0F172A" floodOpacity="0.14" />
            </filter>
          </defs>

          {/* ── BASE GROUND: Clean Google Maps Campus Terrain ── */}
          <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#F8FAFC" />

          {/* Campus Lawn Zones */}
          <rect x="25" y="65" width="415" height="570" rx="20" fill="url(#grass-pattern)" stroke="#C8E6C9" strokeWidth="1" />
          <rect x="445" y="65" width="400" height="470" rx="20" fill="url(#grass-pattern)" stroke="#C8E6C9" strokeWidth="1" />
          <rect x="850" y="65" width="130" height="660" rx="20" fill="url(#grass-pattern)" stroke="#C8E6C9" strokeWidth="1" />

          {/* ── PEDESTRIAN SIDEWALKS & WALKWAYS ── */}
          {/* Main campus promenade */}
          <path d="M 370 70 L 370 650 L 450 650 L 450 70 Z" fill="#F1F5F9" />
          <path d="M 40 400 L 400 400 L 400 420 L 40 420 Z" fill="#F1F5F9" />
          <path d="M 420 400 L 840 400 L 840 420 L 420 420 Z" fill="#F1F5F9" />

          {/* ── DRIVING ROAD LANES (Asphalt Network) ── */}
          {/* Main Central Boulevard (two-way trunk from gate northward) */}
          <rect x="380" y="55" width="60" height="630" rx="6" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="1.5" />
          {/* Double Yellow Dividing Line */}
          <line x1="409" y1="65" x2="409" y2="670" stroke="#FBBF24" strokeWidth="1.8" strokeDasharray="14 10" />
          <line x1="412" y1="65" x2="412" y2="670" stroke="#FBBF24" strokeWidth="1.8" strokeDasharray="14 10" />

          {/* Student Access Lane A (East-West branching to Zone A) */}
          <rect x="40" y="475" width="350" height="45" rx="6" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="1.5" />
          {/* Zone A Vertical Driving Aisle */}
          <rect x="130" y="65" width="40" height="425" rx="6" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="1.5" />
          <line x1="150" y1="75" x2="150" y2="480" stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="8 8" opacity="0.8" />

          {/* Student Access Lane B (East-West branching to Zone B) */}
          <rect x="430" y="475" width="390" height="45" rx="6" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="1.5" />
          {/* Zone B Vertical Driving Aisle */}
          <rect x="580" y="65" width="45" height="425" rx="6" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="1.5" />
          <line x1="602" y1="75" x2="602" y2="480" stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="8 8" opacity="0.8" />

          {/* Staff Access Lane C */}
          <rect x="40" y="340" width="350" height="45" rx="6" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="1.5" />

          {/* Exit Avenue leading eastward */}
          <rect x="430" y="340" width="450" height="45" rx="6" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="1.5" />
          <line x1="440" y1="362" x2="870" y2="362" stroke="#FFFFFF" strokeWidth="1.5" strokeDasharray="8 8" opacity="0.8" />

          {/* Painted Crosswalks across lanes */}
          <Crosswalk x={380} y={490} width={60} height={18} />
          <Crosswalk x={380} y={355} width={60} height={18} />
          <Crosswalk x={130} y={370} width={40} height={16} />

          {/* Directional White Road Arrows Painted on Asphalt */}
          {/* Main Blvd Heading North */}
          <path d="M 425 610 L 425 580 M 421 588 L 425 580 L 429 588" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9" />
          <path d="M 425 450 L 425 420 M 421 428 L 425 420 L 429 428" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9" />
          {/* Turn Left into Zone A */}
          <path d="M 360 497 L 270 497 M 280 492 L 270 497 L 280 502" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9" />
          {/* Turn Right into Zone B */}
          <path d="M 460 497 L 550 497 M 540 492 L 550 497 L 540 502" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9" />
          {/* Exit arrow */}
          <path d="M 720 362 L 780 362 M 770 357 L 780 362 L 770 367" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9" />

          {/* ── ZONE BOUNDARIES & HIGHLIGHT AREAS ── */}
          {/* 1. STUDENT PARKING AREA (Zones A & B) */}
          <g className="student-zone-group">
            <rect
              x="30"
              y="60"
              width="795"
              height="355"
              rx="16"
              fill={activeZoneFilter === 'student' ? 'rgba(16, 185, 129, 0.09)' : 'rgba(16, 185, 129, 0.04)'}
              stroke="#10B981"
              strokeWidth="2"
              strokeDasharray="6 6"
            />
            {/* Student Zone Top Banner */}
            <g transform="translate(42, 68)">
              <rect x="0" y="0" width="260" height="26" rx="8" fill="#10B981" />
              <text x="130" y="14" textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="800" fill="#FFFFFF">
                🎓 STUDENT PARKING AREA (ZONES A & B)
              </text>
            </g>
            {/* Section badges */}
            <g transform="translate(190, 72)">
              <rect x="0" y="0" width="130" height="18" rx="6" fill="#ECFDF5" stroke="#10B981" strokeWidth="1" />
              <text x="65" y="9.5" textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill="#047857">
                BIKES SECTION (ZONE A)
              </text>
            </g>
            <g transform="translate(640, 72)">
              <rect x="0" y="0" width="130" height="18" rx="6" fill="#ECFDF5" stroke="#10B981" strokeWidth="1" />
              <text x="65" y="9.5" textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill="#047857">
                CARS SECTION (ZONE B)
              </text>
            </g>
          </g>

          {/* 2. STAFF PARKING AREA (Zone C) */}
          <g className="staff-zone-group">
            <rect
              x="30"
              y="425"
              width="455"
              height="185"
              rx="16"
              fill={activeZoneFilter === 'staff' ? 'rgba(37, 99, 235, 0.1)' : 'rgba(37, 99, 235, 0.05)'}
              stroke="#2563EB"
              strokeWidth="2"
              strokeDasharray="6 6"
            />
            {/* Staff Zone Header Banner */}
            <g transform="translate(42, 432)">
              <rect x="0" y="0" width="280" height="26" rx="8" fill="#2563EB" />
              <text x="140" y="14" textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="800" fill="#FFFFFF">
                👔 STAFF PARKING AREA — ZONE C (RESERVED)
              </text>
            </g>
            {/* Restricted Access Badge */}
            <g transform="translate(330, 436)">
              <rect x="0" y="0" width="145" height="18" rx="6" fill="#EFF6FF" stroke="#2563EB" strokeWidth="1" />
              <text x="72.5" y="9.5" textAnchor="middle" dominantBaseline="middle" fontSize="8.5" fontWeight="800" fill="#1D4ED8">
                RESTRICTED • STAFF PERMIT ONLY
              </text>
            </g>
            {/* Visual restricted overlay if user is student */}
            {!isStaffUser && !isAdmin && (
              <g opacity="0.35">
                <rect x="32" y="460" width="451" height="148" rx="12" fill="#94A3B8" opacity="0.12" />
              </g>
            )}
          </g>

          {/* ── PARKING SLOTS (STALLS) ── */}
          <g className="slots-layer">
            {slots.map((slot) => {
              const isAlloc = allocatedSlot && (slot.id === allocatedSlot.id || slot.slot_number === allocatedSlot.slot_number);
              const isDim = (activeZoneFilter === 'student' && slot.slot_number.startsWith('C')) ||
                            (activeZoneFilter === 'staff' && !slot.slot_number.startsWith('C'));
              return (
                <SlotCell
                  key={slot.id || slot.slot_number}
                  slot={slot}
                  isAllocated={isAlloc}
                  isDimmed={isDim}
                  onClick={(s) => setSelectedSlot(s)}
                />
              );
            })}
          </g>

          {/* ── TOP-DOWN CAMPUS BUILDINGS & LANDMARKS ── */}
          {/* 1. Main College Building (Academic Block) */}
          <g filter="url(#bldg-shadow)">
            <rect x="35" y="8" width="320" height="46" rx="8" fill="#FFFBEB" stroke="#FDE68A" strokeWidth="1.5" />
            {/* Roof bevel detail */}
            <rect x="42" y="13" width="306" height="36" rx="5" fill="#FEF3C7" />
            <rect x="55" y="18" width="120" height="26" rx="4" fill="#FDE68A" opacity="0.7" />
            <rect x="195" y="18" width="140" height="26" rx="4" fill="#FDE68A" opacity="0.7" />
            {/* Front portico columns */}
            {[70, 110, 150, 220, 260, 300].map((cx) => (
              <circle key={cx} cx={cx} cy={48} r={3} fill="#D97706" />
            ))}
            <text x="195" y="32" textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight="800" fill="#92400E" letterSpacing="0.5">
              🏫 MAIN COLLEGE BUILDING • PSG TECH
            </text>
          </g>

          {/* 2. Central Library & Auditorium */}
          <g filter="url(#bldg-shadow)">
            <rect x="385" y="8" width="220" height="46" rx="8" fill="#F0FDF4" stroke="#BBF7D0" strokeWidth="1.5" />
            <rect x="392" y="13" width="206" height="36" rx="5" fill="#DCFCE7" />
            <circle cx="495" cy="31" r="14" fill="#BBF7D0" />
            <text x="495" y="32" textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="800" fill="#166534">
              📚 CENTRAL LIBRARY & AUDITORIUM
            </text>
          </g>

          {/* 3. Administration Block (Dean & Registrar) */}
          <g filter="url(#bldg-shadow)">
            <rect x="635" y="8" width="325" height="46" rx="8" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="1.5" />
            <rect x="642" y="13" width="311" height="36" rx="5" fill="#F1F5F9" />
            <rect x="655" y="18" width="285" height="26" rx="4" fill="#E2E8F0" opacity="0.6" />
            <text x="797" y="32" textAnchor="middle" dominantBaseline="middle" fontSize="10.5" fontWeight="800" fill="#334155" letterSpacing="0.5">
              🏛️ ADMINISTRATION BLOCK • DEAN & REGISTRAR
            </text>
          </g>

          {/* 4. Campus Cafeteria & Food Court */}
          <g filter="url(#bldg-shadow)">
            <rect x="855" y="440" width="125" height="110" rx="10" fill="#FFF7ED" stroke="#FED7AA" strokeWidth="1.5" />
            <text x="917" y="460" textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="800" fill="#C2410C">
              ☕ CAMPUS CAFE
            </text>
            {/* Dining umbrella circles */}
            {[
              { x: 885, y: 490, c: '#FB923C' },
              { x: 925, y: 490, c: '#38BDF8' },
              { x: 905, y: 525, c: '#4ADE80' },
              { x: 945, y: 525, c: '#F472B6' },
            ].map((u, i) => (
              <g key={i}>
                <circle cx={u.x} cy={u.y} r={9} fill={u.c} opacity="0.85" />
                <circle cx={u.x} cy={u.y} r={2} fill="#FFFFFF" />
              </g>
            ))}
          </g>

          {/* ── LANDSCAPED TREES & FOLIAGE ── */}
          <Tree x={42} y={395} r={17} />
          <Tree x={75} y={402} r={15} />
          <Tree x={440} y={395} r={16} />
          <Tree x={440} y={430} r={14} />
          <Tree x={835} y={100} r={18} />
          <Tree x={835} y={150} r={16} />
          <Tree x={835} y={200} r={18} />
          <Tree x={835} y={250} r={15} />
          <Tree x={835} y={300} r={17} />
          <Tree x={880} y={120} r={16} />
          <Tree x={930} y={150} r={19} />
          <Tree x={910} y={220} r={18} />
          <Tree x={880} y={270} r={16} />
          <Tree x={335} y={625} r={18} />
          <Tree x={485} y={625} r={18} />

          {/* ── GATES AND CHECKPOINTS ── */}
          {/* Main Campus Entrance Gate */}
          <g transform="translate(370, 660)" filter="url(#bldg-shadow)">
            {/* Security Guard Booth */}
            <rect x="0" y="0" width="80" height="42" rx="8" fill="#1E293B" stroke="#38BDF8" strokeWidth="2" />
            <rect x="6" y="6" width="68" height="15" rx="3" fill="#38BDF8" opacity="0.3" />
            <text x="40" y="14" textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="900" fill="#FFFFFF">
              🅿️ MAIN GATE
            </text>
            <text x="40" y="29" textAnchor="middle" dominantBaseline="middle" fontSize="8" fontWeight="700" fill="#93C5FD">
              CAMPUS ENTRANCE
            </text>
            {/* Boom Barrier Striped Arm */}
            <rect x="80" y="18" width="45" height="5" rx="2" fill="#EF4444" />
            <rect x="90" y="18" width="8" height="5" fill="#FFFFFF" />
            <rect x="105" y="18" width="8" height="5" fill="#FFFFFF" />
          </g>

          {/* Student Entrance Arch */}
          <g transform="translate(195, 480)">
            <rect x="0" y="0" width="115" height="22" rx="6" fill="#10B981" stroke="#FFFFFF" strokeWidth="1.5" />
            <text x="57.5" y="12" textAnchor="middle" dominantBaseline="middle" fontSize="9.5" fontWeight="800" fill="#FFFFFF">
              🎓 STUDENT ENTRY →
            </text>
          </g>

          {/* Staff Entrance Gate Arch */}
          <g transform="translate(195, 345)">
            <rect x="0" y="0" width="115" height="22" rx="6" fill="#2563EB" stroke="#FFFFFF" strokeWidth="1.5" />
            <text x="57.5" y="12" textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="800" fill="#FFFFFF">
              👔 STAFF ENTRY →
            </text>
          </g>

          {/* Campus Exit Gate */}
          <g transform="translate(850, 335)" filter="url(#bldg-shadow)">
            <rect x="0" y="0" width="80" height="38" rx="8" fill="#15803D" stroke="#86EFAC" strokeWidth="2" />
            <text x="40" y="13" textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="900" fill="#FFFFFF">
              CAMPUS EXIT
            </text>
            <text x="40" y="26" textAnchor="middle" dominantBaseline="middle" fontSize="8" fontWeight="700" fill="#BBF7D0">
              ONE WAY →
            </text>
          </g>

          {/* ── ACTIVE NAVIGATION ROUTE ── */}
          {routePoints.length >= 2 && (
            <AnimatedRoutePath points={routePoints} />
          )}

          {/* ── "YOU ARE HERE" BLUE CIRCULAR MARKER ── */}
          <YouAreHereMarker
            x={410}
            y={680}
            heading={0} // Facing North
          />

          {/* ── SIMULATED LIVE VEHICLE (when simulation is running) ── */}
          {isSimulating && routePoints.length >= 2 && (
            <SimulatedVehicle
              points={routePoints}
              progress={simProgress}
              isBike={allocatedSlot?.vehicle_type === 'bike'}
            />
          )}

          {/* ── ALLOCATED SLOT DESTINATION PIN ── */}
          {allocatedSlot && (() => {
            const c = getSlotCenter(allocatedSlot);
            if (!c) return null;
            return (
              <DestinationPin
                x={c.x}
                y={c.y}
                slotNumber={allocatedSlot.slot_number}
                zoneName={allocatedSlot.zone_name}
              />
            );
          })()}
        </svg>

        {/* ── Slot Inspector Card (Shown on click) ── */}
        <AnimatePresence>
          {selectedSlot && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              className="absolute top-4 left-4 z-40 bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-slate-200 w-64 text-xs"
            >
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                    {selectedSlot.vehicle_type === 'bike' ? <Bike className="w-4 h-4" /> : <Car className="w-4 h-4" />}
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm">Slot {selectedSlot.slot_number}</h3>
                    <p className="text-[11px] text-slate-500 font-medium">{selectedSlot.zone_name}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedSlot(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Category:</span>
                  <span className={`font-bold ${selectedSlot.staff_only ? 'text-blue-600' : 'text-emerald-600'}`}>
                    {selectedSlot.staff_only ? 'Staff Reserved' : 'Student Parking'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Status:</span>
                  <span
                    className={`font-bold capitalize ${
                      selectedSlot.occupancy_status === 'occupied'
                        ? 'text-red-600'
                        : selectedSlot.occupancy_status === 'held'
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {selectedSlot.occupancy_status}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Vehicle:</span>
                  <span className="font-semibold text-slate-700 capitalize">{selectedSlot.vehicle_type}</span>
                </div>
                {selectedSlot.allocation_priority && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Bay Priority:</span>
                    <span className="font-mono font-bold text-slate-700">#{selectedSlot.allocation_priority}</span>
                  </div>
                )}
              </div>

              {isAdmin && (
                <div className="pt-2 border-t border-slate-100 flex gap-2">
                  {selectedSlot.operational_status !== 'blocked' ? (
                    <button
                      onClick={() => onBlockSlot?.(selectedSlot)}
                      className="w-full py-1.5 rounded-xl border border-red-200 text-red-600 font-semibold hover:bg-red-50 text-xs"
                    >
                      Block Slot
                    </button>
                  ) : (
                    <button
                      onClick={() => onUnblockSlot?.(selectedSlot)}
                      className="w-full py-1.5 rounded-xl border border-emerald-200 text-emerald-600 font-semibold hover:bg-emerald-50 text-xs"
                    >
                      Unblock Slot
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── GOOGLE MAPS NAVIGATION BOTTOM CARD (Turn-by-Turn Bottom Sheet) ── */}
      {allocatedSlot && routePoints.length >= 2 ? (
        <div className="border-t border-slate-200 bg-white p-4 md:p-5 z-20 shadow-2xl">
          <div className="max-w-4xl mx-auto space-y-4">
            {/* Step Guidance Header Banner */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-slate-900 text-white rounded-2xl p-4 shadow-md">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-blue-500 text-white flex items-center justify-center shadow-lg flex-shrink-0">
                  {navSteps[currentStepIndex] ? (
                    React.createElement(navSteps[currentStepIndex].icon, { className: 'w-6 h-6' })
                  ) : (
                    <Navigation className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                      Step {currentStepIndex + 1} of {navSteps.length}
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                    <span className="text-xs text-slate-300">
                      {navSteps[currentStepIndex]?.distance || 'In 30m'}
                    </span>
                  </div>
                  <h4 className="text-base sm:text-lg font-extrabold text-white leading-tight">
                    {navSteps[currentStepIndex]?.text || 'Proceed along marked route'}
                  </h4>
                  <p className="text-xs text-slate-400 font-medium">
                    {navSteps[currentStepIndex]?.sub || 'Follow lane arrows to allocated bay'}
                  </p>
                </div>
              </div>

              {/* Trip Simulation Toggle */}
              <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
                <button
                  onClick={() => setIsSimulating(!isSimulating)}
                  className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-md ${
                    isSimulating
                      ? 'bg-amber-500 hover:bg-amber-600 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {isSimulating ? (
                    <>
                      <Pause className="w-4 h-4" />
                      Pause Drive
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      {simProgress > 0 && simProgress < 1 ? 'Resume Drive' : 'Simulate Drive'}
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Trip Details Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-6">
                <div>
                  <span className="text-slate-400 font-medium block">Destination Bay</span>
                  <span className="text-slate-900 font-extrabold text-sm flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    Slot {allocatedSlot.slot_number}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Zone Area</span>
                  <span className="text-slate-800 font-bold">
                    {allocatedSlot.zone_name || 'Assigned Zone'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Est. Time</span>
                  <span className="text-emerald-600 font-extrabold text-sm">~1 min driving</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Distance</span>
                  <span className="text-slate-800 font-bold">~120 meters</span>
                </div>
              </div>

              {/* Role verification pill */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold shadow-sm">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>
                  {allocatedSlot.slot_number.startsWith('C') ? 'Staff Priority Access' : 'Student Verified Bay'}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500" />
            <span>
              Request a slot from the <strong>Home Tab</strong> to generate a live Google Maps route with directional arrows.
            </span>
          </div>
          <div className="font-medium text-slate-400 hidden sm:block">
            Drag to pan • Scroll wheel to zoom
          </div>
        </div>
      )}
    </div>
  );
}
