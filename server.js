require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');

const app = express();
app.disable('x-powered-by'); // Hide Express version
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const DATA_FILE = path.join(__dirname, 'data', 'bookings.json');
const DB_FILE = path.join(__dirname, 'data', 'mirage.db');
const LOGS_DIR = path.join(__dirname, 'logs');
const NOTIFICATION_LOG = path.join(LOGS_DIR, 'notifications.log');

// Load secrets from environment variables (fallback to defaults for local dev)
const SERVER_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const ADMIN_USER = process.env.ADMIN_USER || 'MIRAGE';
const ADMIN_PASS = process.env.ADMIN_PASS || 'MIRAGE26';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || process.env.EMAIL_FROM || 'admin@miragecocktails.com';

let activeAdminOtp = { code: null, expiresAt: 0 };

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://js.paystack.co; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; frame-src https://checkout.paystack.com; img-src 'self' data:; connect-src 'self' https://api.paystack.co");
  if (NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Rate Limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // 10 login attempts per window
  message: { error: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const bookingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 20,                    // 20 bookings per hour per IP
  message: { error: 'Too many booking requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ----------------------------------------------------------------------
// NOTIFICATION SERVICES (Email + SMS)
// ----------------------------------------------------------------------

// Nodemailer transporter (lazy-init)
let mailTransporter = null;
const getMailTransporter = () => {
  if (mailTransporter) return mailTransporter;
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    mailTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return mailTransporter;
};

const sendEmail = async (to, subject, html) => {
  const transporter = getMailTransporter();
  if (!transporter) return false;
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Mirage Cocktails" <noreply@miragecocktails.com>',
      to, subject, html
    });
    return true;
  } catch (err) {
    console.error('[Email Error]', err.message);
    return false;
  }
};

const sendSMS = async (to, message) => {
  const apiKey = process.env.SMS_API_KEY;
  const apiUrl = process.env.SMS_API_URL;
  const senderId = process.env.SMS_SENDER_ID || 'Mirage';
  if (!apiKey || !apiUrl) return false;
  try {
    const payload = { apiKey, senderId, to, message };
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return response.ok;
  } catch (err) {
    console.error('[SMS Error]', err.message);
    return false;
  }
};

const notify = async (bookingId, type, recipient, message) => {
  const logEntry = `[${new Date().toISOString()}] [Booking ID: ${bookingId}] [Type: ${type}] [Recipient: ${recipient}]\nMessage: ${message}\n----------------------------------------------------------------------\n`;
  try {
    fs.appendFileSync(NOTIFICATION_LOG, logEntry, 'utf8');
  } catch (err) {
    console.error('Error writing to notification log:', err);
  }
  if (type.includes('Email') || type === 'Confirmation Receipt' || type === 'Deposit Confirmation' || type === 'Status Update Log' || type === 'Status Action Alert') {
    sendEmail(recipient, `Mirage Cocktails - ${type}`, message.replace(/\n/g, '<br>'));
  }
  if (type.includes('SMS')) {
    sendSMS(recipient, message);
  }
};

// ----------------------------------------------------------------------
// PAYSTACK WEBHOOK
// ----------------------------------------------------------------------

app.post('/webhook/paystack', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'];
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return res.status(500).send('Webhook not configured');

    const hash = crypto.createHmac('sha512', secret).update(req.body).digest('hex');
    if (hash !== signature) return res.status(401).send('Invalid signature');

    const event = JSON.parse(req.body.toString());
    console.log(`[Paystack Webhook] Received: ${event.event}`);

    if (event.event === 'charge.success') {
      const data = event.data;
      const reference = data.reference;
      const bookingId = reference.split('_')[0];
      const amountGHS = data.amount / 100;
      const currency = data.currency;

      const booking = await getBookingById(bookingId);
      if (!booking) return res.status(404).send('Booking not found');

      if (currency !== 'GHS') return res.sendStatus(200);

      if (booking.status === 'Pending') {
        const depositAmount = typeof booking.deposit === 'number' ? booking.deposit : 0;
        if (Math.abs(amountGHS - depositAmount) <= 1) {
          await updateBookingStatus(bookingId, 'Deposit Paid', reference);
          const msg = `Payment confirmed! Your deposit of GHS ${depositAmount.toLocaleString()} for booking ${bookingId} has been received.`;
          await notify(bookingId, 'Deposit Confirmation', booking.email, msg);
        }
      } else if (booking.status === 'Deposit Paid') {
        const balanceAmount = typeof booking.balance === 'number' ? booking.balance : 0;
        if (Math.abs(amountGHS - balanceAmount) <= 1) {
          await updateBookingStatus(bookingId, 'Fully Paid', reference);
          const msg = `Payment received! Your final balance of GHS ${balanceAmount.toLocaleString()} has been paid. Booking ${bookingId} is now fully paid.`;
          await notify(bookingId, 'Balance Confirmation', booking.email, msg);
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[Paystack Webhook Error]', err);
    res.sendStatus(500);
  }
});

// Middleware
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure folders exist
const initDirs = () => {
  const dataDir = path.dirname(DB_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
  if (!fs.existsSync(NOTIFICATION_LOG)) {
    fs.writeFileSync(NOTIFICATION_LOG, '', 'utf8');
  }
};
initDirs();

// Initialize SQLite Database
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error("[Mirage DB] SQLite database connection failure:", err);
  } else {
    console.log("[Mirage DB] SQLite Database connected.");
  }
});

// Create schema and migrate old data if needed
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT,
      phone TEXT,
      instagram TEXT,
      date TEXT,
      guests INTEGER,
      packageType TEXT,
      packageName TEXT,
      durationHours INTEGER,
      isCustom INTEGER,
      barTemplate TEXT,
      barLabel TEXT,
      addons TEXT,
      logistics TEXT,
      mileage TEXT,
      totalPrice TEXT,
      deposit TEXT,
      balance TEXT,
      balanceDueDate TEXT,
      notes TEXT,
      status TEXT,
      paymentReference TEXT,
      createdAt TEXT,
      updatedAt TEXT
    )
  `);

  // Migrate bookings from legacy JSON file into SQLite if DB table is empty
  db.get("SELECT COUNT(*) as count FROM bookings", (err, row) => {
    if (!err && row && row.count === 0 && fs.existsSync(DATA_FILE)) {
      try {
        const jsonData = fs.readFileSync(DATA_FILE, 'utf8');
        const jsonBookings = JSON.parse(jsonData);
        if (Array.isArray(jsonBookings) && jsonBookings.length > 0) {
          console.log(`[Mirage DB] Migrating ${jsonBookings.length} records from JSON file...`);
          const stmt = db.prepare(`
            INSERT INTO bookings (
              id, name, email, phone, instagram, date, guests, packageType, packageName,
              durationHours, isCustom, barTemplate, barLabel, addons, logistics, mileage,
              totalPrice, deposit, balance, balanceDueDate, notes, status, paymentReference,
              createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          jsonBookings.forEach(b => {
            stmt.run(
              b.id, b.name, b.email, b.phone, b.instagram || 'N/A', b.date, b.guests, b.packageType, b.packageName || '',
              b.durationHours, b.isCustom ? 1 : 0, b.barTemplate || 'small', b.barLabel || '',
              JSON.stringify(b.addons || []), JSON.stringify(b.logistics || {}), JSON.stringify(b.mileage || {}),
              String(b.totalPrice), String(b.deposit), String(b.balance), b.balanceDueDate, b.notes || '',
              b.status, b.paymentReference || '', b.createdAt || new Date().toISOString(), b.updatedAt || ''
            );
          });
          stmt.finalize();
          console.log(`[Mirage DB] Successfully migrated ${jsonBookings.length} bookings into SQLite.`);
        }
      } catch (migrateErr) {
        console.error("[Mirage DB] Migration from JSON failed:", migrateErr);
      }
    }
  });
});

// Database Query Wrappers (Promise-based)
const getSetting = (key) => {
  return new Promise((resolve) => {
    db.get("SELECT value FROM settings WHERE key = ?", [key], (err, row) => {
      if (err || !row) return resolve(null);
      resolve(row.value);
    });
  });
};

const setSetting = (key, value) => {
  return new Promise((resolve, reject) => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value], (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

const getAllBookings = () => {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM bookings ORDER BY createdAt DESC", [], (err, rows) => {
      if (err) {
        console.error("[Mirage DB] SELECT error:", err);
        return resolve([]);
      }
      const bookings = rows.map(row => ({
        ...row,
        isCustom: row.isCustom === 1,
        addons: JSON.parse(row.addons || '[]'),
        logistics: JSON.parse(row.logistics || '{}'),
        mileage: JSON.parse(row.mileage || '{}'),
        totalPrice: isNaN(Number(row.totalPrice)) ? row.totalPrice : Number(row.totalPrice),
        deposit: isNaN(Number(row.deposit)) ? row.deposit : Number(row.deposit),
        balance: isNaN(Number(row.balance)) ? row.balance : Number(row.balance),
      }));
      resolve(bookings);
    });
  });
};

const getBookingById = (id) => {
  return new Promise((resolve, reject) => {
    db.get("SELECT * FROM bookings WHERE id = ?", [id], (err, row) => {
      if (err || !row) return resolve(null);
      resolve({
        ...row,
        isCustom: row.isCustom === 1,
        addons: JSON.parse(row.addons || '[]'),
        logistics: JSON.parse(row.logistics || '{}'),
        mileage: JSON.parse(row.mileage || '{}'),
        totalPrice: isNaN(Number(row.totalPrice)) ? row.totalPrice : Number(row.totalPrice),
        deposit: isNaN(Number(row.deposit)) ? row.deposit : Number(row.deposit),
        balance: isNaN(Number(row.balance)) ? row.balance : Number(row.balance),
      });
    });
  });
};

const insertBooking = (b) => {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT INTO bookings (
        id, name, email, phone, instagram, date, guests, packageType, packageName,
        durationHours, isCustom, barTemplate, barLabel, addons, logistics, mileage,
        totalPrice, deposit, balance, balanceDueDate, notes, status, paymentReference,
        createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      b.id, b.name, b.email, b.phone, b.instagram || 'N/A', b.date, b.guests, b.packageType, b.packageName || '',
      b.durationHours, b.isCustom ? 1 : 0, b.barTemplate || 'small', b.barLabel || '',
      JSON.stringify(b.addons || []), JSON.stringify(b.logistics || {}), JSON.stringify(b.mileage || {}),
      String(b.totalPrice), String(b.deposit), String(b.balance), b.balanceDueDate, b.notes || '',
      b.status, b.paymentReference || '', b.createdAt || new Date().toISOString()
    ], function(err) {
      if (err) {
        console.error("[Mirage DB] INSERT error:", err);
        return resolve(false);
      }
      resolve(true);
    });
  });
};

const updateBookingStatus = (id, status, paymentReference = '', updatedAt = new Date().toISOString()) => {
  return new Promise((resolve, reject) => {
    db.run(`
      UPDATE bookings 
      SET status = ?, paymentReference = ?, updatedAt = ?
      WHERE id = ?
    `, [status, paymentReference, updatedAt, id], function(err) {
      if (err) {
        console.error("[Mirage DB] UPDATE status error:", err);
        return resolve(false);
      }
      resolve(this.changes > 0);
    });
  });
};

const updateBooking = (id, b) => {
  return new Promise((resolve, reject) => {
    db.run(`
      UPDATE bookings 
      SET name = ?, guests = ?, totalPrice = ?, status = ?, notes = ?, updatedAt = ?
      WHERE id = ?
    `, [
      b.name, b.guests, String(b.totalPrice), b.status, b.notes || '', new Date().toISOString(), id
    ], function(err) {
      if (err) {
        console.error("[Mirage DB] UPDATE booking error:", err);
        return resolve(false);
      }
      resolve(this.changes > 0);
    });
  });
};

const deleteBooking = (id) => {
  return new Promise((resolve, reject) => {
    db.run("DELETE FROM bookings WHERE id = ?", [id], function(err) {
      if (err) {
        console.error("[Mirage DB] DELETE error:", err);
        return resolve(false);
      }
      resolve(this.changes > 0);
    });
  });
};

// Legacy logNotification wrapper (keeps existing callers working)
const logNotification = (bookingId, type, recipient, message) => {
  notify(bookingId, type, recipient, message);
};

// Custom JWT Signer (Zero-dependency JWT-like token implementation)
const signToken = (username) => {
  const expiry = Date.now() + (60 * 60 * 1000); // 1 hour expiration
  const payload = Buffer.from(JSON.stringify({ username, expiry })).toString('base64');
  const signature = crypto.createHmac('sha256', SERVER_SECRET).update(payload).digest('hex');
  return `${payload}.${signature}`;
};

// Custom JWT Verifier Middleware
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Missing bearer token.' });
  }

  const token = authHeader.split(' ')[1];
  const parts = token.split('.');
  if (parts.length !== 2) {
    return res.status(401).json({ error: 'Unauthorized. Invalid token structure.' });
  }

  const [payloadBase64, signature] = parts;
  
  // Re-generate signature to check integrity
  const expectedSig = crypto.createHmac('sha256', SERVER_SECRET).update(payloadBase64).digest('hex');
  if (signature !== expectedSig) {
    return res.status(401).json({ error: 'Unauthorized. Token signature mismatch.' });
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString('utf8'));
    if (payload.expiry < Date.now()) {
      return res.status(401).json({ error: 'Unauthorized. Token has expired.' });
    }
    req.adminUser = payload.username;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized. Token parsing failure.' });
  }
};

// Package Configs
const PACKAGES = {
  silver: { name: 'Silver Package', minGuests: 70, maxGuests: 100, price: 8000, drinksPerGuest: 3 },
  gold: { name: 'Gold Package', minGuests: 100, maxGuests: 150, price: 9500, drinksPerGuest: 4 },
  premium: { name: 'Premium Package', minGuests: 150, maxGuests: 200, price: 11500, drinksPerGuest: 5 }
};

// ----------------------------------------------------------------------
// PUBLIC APIS
// ----------------------------------------------------------------------

// Get public config (exposes Paystack Public Key and Subaccount)
app.get('/api/config', (req, res) => {
  res.json({
    paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    paystackSubaccount: process.env.PAYSTACK_SUBACCOUNT || ''
  });
});

// Admin Authentication Login (Username & Password)
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (username !== ADMIN_USER) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const customHash = await getSetting('admin_pass_hash');
  let isValid = false;

  if (customHash) {
    const [salt, key] = customHash.split(':');
    const hashedBuffer = crypto.scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(key, 'hex');
    isValid = crypto.timingSafeEqual(hashedBuffer, keyBuffer);
  } else {
    // Fallback to .env password
    isValid = (password === ADMIN_PASS);
  }

  if (!isValid) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const token = signToken(username);
  res.json({ token, message: 'Authentication successful. Gate unlocked!' });
});

// Update Admin Password
app.put('/api/auth/password', authenticateAdmin, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Missing password fields.' });
  }

  // Verify current password
  const customHash = await getSetting('admin_pass_hash');
  let isValid = false;
  if (customHash) {
    const [salt, key] = customHash.split(':');
    const hashedBuffer = crypto.scryptSync(currentPassword, salt, 64);
    const keyBuffer = Buffer.from(key, 'hex');
    isValid = crypto.timingSafeEqual(hashedBuffer, keyBuffer);
  } else {
    isValid = (currentPassword === ADMIN_PASS);
  }

  if (!isValid) {
    return res.status(401).json({ error: 'Incorrect current password.' });
  }

  // Hash new password
  const newSalt = crypto.randomBytes(16).toString('hex');
  const newHash = crypto.scryptSync(newPassword, newSalt, 64).toString('hex');
  
  try {
    await setSetting('admin_pass_hash', `${newSalt}:${newHash}`);
    res.json({ success: true, message: 'Password updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update password in database.' });
  }
});

// Get Availability (blocked dates)
app.get('/api/availability', async (req, res) => {
  const bookings = await getAllBookings();
  const blockedDates = bookings
    .filter(b => b.status !== 'Cancelled')
    .map(b => b.date);
  
  res.json(blockedDates);
});

// Helper to sanitize HTML tags from inputs
const sanitizeInput = (str) => typeof str === 'string' ? str.replace(/<[^>]*>?/gm, '').trim() : str;

// Create a booking with advanced specs
app.post('/api/bookings', bookingLimiter, async (req, res) => {
  let { 
    name, email, phone, instagram, notes,
    date, guests, packageType
  } = req.body;

  // Sanitize text inputs to prevent XSS
  name = sanitizeInput(name);
  email = sanitizeInput(email);
  phone = sanitizeInput(phone);
  instagram = sanitizeInput(instagram);
  notes = sanitizeInput(notes);

  // Validate inputs
  if (!name || !email || !phone || !date || !guests || !packageType) {
    return res.status(400).json({ error: 'Required fields missing.' });
  }

  const guestCount = parseInt(guests, 10);

  if (isNaN(guestCount) || guestCount <= 0) {
    return res.status(400).json({ error: 'Guests count must be a positive number.' });
  }

  // Check if date is already booked
  const bookings = await getAllBookings();
  const dateIsTaken = bookings.some(b => b.date === date && b.status !== 'Cancelled');
  if (dateIsTaken) {
    return res.status(409).json({ error: 'This date is already booked. Please select another date.' });
  }

  // Calculate pricing based on guest count and package type
  let basePrice = 0;
  let isCustom = false;
  let packageName = '';

  if (guestCount > 200) {
    isCustom = true;
    packageName = 'Bespoke / Custom (Over 200 Guests)';
    basePrice = 13000;
  } else {
    const type = packageType.toLowerCase();
    const pkg = PACKAGES[type];
    if (!pkg) {
      return res.status(400).json({ error: 'Invalid package type.' });
    }
    packageName = pkg.name;
    basePrice = pkg.price;
  }

  // Totals calculations (70% deposit, 30% balance)
  let totalPrice = basePrice;
  let deposit = totalPrice * 0.70;
  let balance = totalPrice * 0.30;



  // Dates calculations
  const eventDateObj = new Date(date);
  const balanceDueObj = new Date(eventDateObj.getTime() - (14 * 24 * 60 * 60 * 1000));
  const formattedBalanceDueDate = balanceDueObj.toISOString().split('T')[0];

  // Create unique ID
  const dateString = date.replace(/-/g, '');
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const uniqueId = `MC-${dateString}-${randomSuffix}`;

  const newBooking = {
    id: uniqueId,
    name,
    email,
    phone,
    instagram: instagram || 'N/A',
    date,
    guests: guestCount,
    packageType,
    packageName,
    durationHours: 5,
    isCustom,
    barTemplate: 'standard',
    barLabel: 'Standard',
    addons: [],
    logistics: {},
    mileage: {},
    totalPrice: totalPrice,
    deposit: deposit,
    balance: balance,
    balanceDueDate: formattedBalanceDueDate,
    notes: notes || '',
    status: 'Pending',
    createdAt: new Date().toISOString()
  };

  const success = await insertBooking(newBooking);

  if (success) {
    const formattedDeposit = typeof deposit === 'number' ? deposit.toLocaleString() : 'Pending Quote';
    const formattedBalance = typeof balance === 'number' ? balance.toLocaleString() : 'Pending Quote';
    const confirmMessage = `Hello ${name}, your booking request for Mirage Cocktails mobile bar services is received. Booking ID: ${uniqueId}. To secure your date (${date}), please pay the 70% deposit of GHC ${formattedDeposit}. Thank you!`;
    logNotification(uniqueId, 'Confirmation Receipt (Email/SMS)', email, confirmMessage);

    const reminderDate = new Date(eventDateObj.getTime() - (5 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
    const reminderMessage = `Reminder: Hello ${name}, your event date of ${date} with Mirage Cocktails is in 5 days. Ensure logistics are confirmed. Outstanding 30% balance: GHC ${formattedBalance}.`;
    logNotification(uniqueId, '5-Days Event Alert (Scheduled for ' + reminderDate + ')', email, reminderMessage);

    return res.status(201).json({
      message: 'Booking request created successfully.',
      booking: newBooking
    });
  } else {
    return res.status(500).json({ error: 'Failed to write booking record to database.' });
  }
});

// Paystack Real Payment Verification Endpoint
app.post('/api/bookings/:id/verify-payment', async (req, res) => {
  const { id } = req.params;
  const { reference } = req.body;

  if (!reference) {
    return res.status(400).json({ error: 'Paystack payment reference is required.' });
  }

  try {
    const booking = await getBookingById(id);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    if (booking.status !== 'Pending') {
      return res.status(400).json({ error: 'Booking status is not Pending.' });
    }

    if (isNaN(Number(booking.deposit))) {
      return res.status(400).json({ error: 'Custom booking quote is pending. Payment cannot be verified yet.' });
    }

    // Verify payment status with Paystack API
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
    if (!paystackSecret) {
      console.error("[Paystack Error] Paystack Secret Key is missing in environment variables.");
      return res.status(500).json({ error: 'Payment gateway configuration error.' });
    }

    const paystackUrl = `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`;
    const response = await fetch(paystackUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${paystackSecret}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok || !data.status || data.data.status !== 'success') {
      return res.status(400).json({ error: 'Payment verification failed at Paystack.' });
    }

    // Paystack returns amount in minor units (GHS * 100 = pesewas)
    const expectedAmountPesewas = Math.round(Number(booking.deposit) * 100);
    const actualAmountPesewas = data.data.amount;
    const actualCurrency = data.data.currency;

    if (actualCurrency !== 'GHS') {
      return res.status(400).json({ error: 'Payment currency mismatch.' });
    }

    // Check if paid amount matches expected deposit amount (allow up to 1 GHS variance for safety)
    if (Math.abs(actualAmountPesewas - expectedAmountPesewas) > 100) {
      return res.status(400).json({ error: 'Payment amount mismatch.' });
    }

    // Confirm booking and update status
    const success = await updateBookingStatus(id, 'Deposit Paid', reference);
    if (success) {
      const alertMsg = `Payment confirmed via Paystack (Ref: ${reference}). Your deposit of GHC ${Number(booking.deposit).toLocaleString()} has been received.`;
      logNotification(id, 'Deposit Confirmation', booking.email, alertMsg);

      // Fetch the updated booking to return
      const updatedBooking = await getBookingById(id);
      return res.json({ message: 'Payment verified and deposit confirmed successfully.', booking: updatedBooking });
    } else {
      return res.status(500).json({ error: 'Failed to update booking status in database.' });
    }

  } catch (err) {
    console.error('Paystack verification error:', err);
    return res.status(500).json({ error: 'Payment verification failed due to internal error.' });
  }
});

// Mock/Local fallback endpoint to manually confirm booking without real payments
app.post('/api/bookings/:id/confirm-deposit', async (req, res) => {
  const { id } = req.params;
  const booking = await getBookingById(id);

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  // Security: Only allow status change from Pending to Deposit Paid
  if (booking.status !== 'Pending') {
    return res.status(400).json({ error: 'Booking status cannot be updated via this endpoint.' });
  }

  const success = await updateBookingStatus(id, 'Deposit Paid', 'MOCK-PAYMENT-' + Date.now());

  if (success) {
    const alertMsg = `Payment received (Local Mock): Your deposit for booking ${id} has been confirmed. Status updated to "Deposit Paid".`;
    logNotification(id, 'Deposit Confirmation', booking.email, alertMsg);
    
    const updated = await getBookingById(id);
    res.json({ message: 'Deposit confirmed successfully.', booking: updated });
  } else {
    res.status(500).json({ error: 'Failed to update status.' });
  }
});

// ----------------------------------------------------------------------
// PROTECTED BACKOFFICE ADMIN APIS (Requires JWT)
// ----------------------------------------------------------------------

// Get all bookings
app.get('/api/bookings', authenticateAdmin, async (req, res) => {
  const bookings = await getAllBookings();
  res.json(bookings);
});

// Update booking details / custom quotes / payment status
app.patch('/api/bookings/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  
  const original = await getBookingById(id);
  if (!original) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  const updatedBooking = { ...original, ...updates };

  if (updates.totalPrice !== undefined && updates.totalPrice !== original.totalPrice) {
    const numericTotal = parseFloat(updates.totalPrice);
    if (!isNaN(numericTotal)) {
      updatedBooking.totalPrice = numericTotal;
      updatedBooking.deposit = numericTotal * 0.70;
      updatedBooking.balance = numericTotal * 0.30;
      updatedBooking.isCustom = false;
    }
  }

  const success = await updateBooking(id, updatedBooking);

  if (success) {
    const message = `Alert: Your booking file (${id}) has been updated by the operations team. Current status: ${updatedBooking.status}.`;
    logNotification(id, 'Status Update Log', updatedBooking.email, message);

    res.json({ message: 'Booking file updated successfully.', booking: updatedBooking });
  } else {
    res.status(500).json({ error: 'Failed to save updates.' });
  }
});

// Update booking status specific endpoint
app.patch('/api/bookings/:id/status', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatuses = ['Pending', 'Deposit Paid', 'Fully Paid', 'Cancelled', 'Refunded'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status update command.' });
  }

  const booking = await getBookingById(id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  const success = await updateBookingStatus(id, status, booking.paymentReference || '');

  if (success) {
    const alertMsg = `Booking update notification: Your order status for ID ${id} is updated to "${status}".`;
    logNotification(id, 'Status Action Alert', booking.email, alertMsg);

    const updated = await getBookingById(id);
    res.json({ message: 'Status updated successfully.', booking: updated });
  } else {
    res.status(500).json({ error: 'Failed to update status.' });
  }
});

// Delete (Remove) booking completely
app.delete('/api/bookings/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const exists = await getBookingById(id);

  if (!exists) {
    return res.status(404).json({ error: 'Booking not found.' });
  }

  const success = await deleteBooking(id);

  if (success) {
    res.json({ message: 'Booking record deleted from database.' });
  } else {
    res.status(500).json({ error: 'Failed to delete record.' });
  }
});

// Fallback routing to client app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global Error Handler for Invalid JSON
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    console.error('[Mirage Security] Invalid JSON payload intercepted:', err.message);
    return res.status(400).json({ error: 'Bad Request. Invalid JSON payload.' });
  }
  next(err);
});

// Start Server
app.listen(PORT, () => {
  console.log(`[Mirage Backend] Server running on port ${PORT} (${NODE_ENV})`);
  console.log(`[Mirage Security] Security headers: ON | Rate limiting: ON`);
  if (NODE_ENV === 'development') {
    console.log(`[Mirage Backend] Admin Credentials - User: ${ADMIN_USER}, Pass: ${ADMIN_PASS}`);
  } else {
    console.log(`[Mirage Security] Credentials loaded from environment variables.`);
  }
});
