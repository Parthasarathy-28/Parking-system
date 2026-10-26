// Auth routes
const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { getDb } = require('../db/database');
const { generateToken, requireAuth } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login
router.post('/login', loginLimiter, (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid email or password format.' });
  }

  const { email, password } = parsed.data;
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = generateToken({ userId: user.id, role: user.role, collegeId: user.college_id });

  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('parkpulse_token', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: process.env.COOKIE_SAME_SITE || (isProd ? 'none' : 'lax'),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  const college = db.prepare('SELECT * FROM colleges WHERE id = ?').get(user.college_id);

  return res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      userCategory: user.user_category || user.role,
      vehicleType: user.vehicle_type,
      collegeId: user.college_id,
      collegeName: college?.name,
    },
    token,
    redirectTo: user.role === 'admin' ? '/admin/dashboard' : '/student/dashboard',
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('parkpulse_token', {
    httpOnly: true,
    secure: isProd,
    sameSite: process.env.COOKIE_SAME_SITE || (isProd ? 'none' : 'lax'),
  });
  return res.json({ message: 'Logged out successfully.' });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const college = db.prepare('SELECT * FROM colleges WHERE id = ?').get(req.user.college_id);
  return res.json({
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      userCategory: req.user.user_category || req.user.role,
      vehicleType: req.user.vehicle_type,
      collegeId: req.user.college_id,
      collegeName: college?.name,
    }
  });
});

module.exports = router;
