// ParkPulse Server - Main Entry Point
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Initialize database
const { getDb } = require('./db/database');
getDb(); // Creates tables on startup

// Services
const { recoverExpiredHolds, setSocketIo } = require('./services/allocationEngine');

// Routes
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const adminRoutes = require('./routes/admin');
const { verifyToken } = require('./middleware/auth');

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const IS_DEMO = process.env.DEMO_MODE !== 'false'; // Default to demo mode

const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: CLIENT_URL,
    credentials: true,
  },
});

// Give allocation engine access to socket.io
setSocketIo(io);

// ---- Middleware ----
app.use(helmet({
  contentSecurityPolicy: false, // Relaxed for development
}));

app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// Demo mode header
app.use((req, res, next) => {
  if (IS_DEMO) res.setHeader('X-Demo-Mode', 'true');
  next();
});

// ---- API Routes ----
app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  const db = getDb();
  const college = db.prepare('SELECT name FROM colleges LIMIT 1').get();
  res.json({
    status: 'ok',
    demo: IS_DEMO,
    college: college?.name,
    timestamp: new Date().toISOString(),
  });
});

// Parking availability - public endpoint (for landing page)
app.get('/api/public/stats', (req, res) => {
  try {
    const db = getDb();
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_slots,
        SUM(CASE WHEN operational_status = 'available' AND occupancy_status = 'free' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN occupancy_status = 'held' THEN 1 ELSE 0 END) as held,
        SUM(CASE WHEN occupancy_status = 'occupied' THEN 1 ELSE 0 END) as occupied,
        SUM(CASE WHEN operational_status = 'blocked' THEN 1 ELSE 0 END) as blocked
      FROM parking_slots
    `).get();
    res.json({ stats, demo: IS_DEMO, timestamp: new Date().toISOString() });
  } catch {
    res.json({ stats: { total_slots: 36, available: 28, held: 3, occupied: 5 }, demo: true, fallback: true });
  }
});

// ---- Socket.IO Auth & Rooms ----
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.cookie?.match(/parkpulse_token=([^;]+)/)?.[1];
  if (!token) {
    // Allow unauthenticated connections for public rooms (landing page stats)
    socket.userId = null;
    socket.collegeId = null;
    return next();
  }
  try {
    const decoded = verifyToken(token);
    socket.userId = decoded.userId;
    socket.collegeId = decoded.collegeId;
    socket.userRole = decoded.role;
    next();
  } catch {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  const { userId, collegeId } = socket;

  if (userId) {
    socket.join(`user:${userId}`);
  }
  if (collegeId) {
    socket.join(`college:${collegeId}`);
  }

  // Client requests slot updates room
  socket.on('join:slots', () => {
    if (collegeId) socket.join(`slots:${collegeId}`);
  });

  socket.on('disconnect', () => {
    // Cleanup handled by socket.io rooms
  });
});

// ---- Background Jobs ----

// Check expired holds every 5 seconds
setInterval(() => {
  try {
    const count = recoverExpiredHolds();
    if (count > 0) console.log(`[Job] Recovered ${count} expired hold(s)`);
  } catch (err) {
    console.error('[Job] Error in expiry recovery:', err.message);
  }
}, 5000);

// ---- Startup ----
server.listen(PORT, () => {
  console.log(`\n🚗 ParkPulse Server running on http://localhost:${PORT}`);
  console.log(`🔧 Demo mode: ${IS_DEMO ? 'ON' : 'OFF'}`);
  console.log(`🌐 Client URL: ${CLIENT_URL}\n`);

  // Recover any holds that expired while server was down
  try {
    const count = recoverExpiredHolds();
    if (count > 0) console.log(`[Startup] Recovered ${count} expired hold(s) from previous run`);
  } catch (err) {
    console.error('[Startup] Expiry recovery error:', err.message);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
