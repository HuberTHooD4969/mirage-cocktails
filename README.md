# Mirage Cocktails Booking Webpage

This is a premium event booking web application for **Mirage Cocktails** built with a luxury black-and-gold glassmorphic theme, smooth 3D transitions, and a responsive Node.js/Express backend.

---

## Features

- **Luxury Glassmorphism UI**: Beautiful semi-transparent frosted cards with thin gold borders and blurred backgrounds matching the flyer color scheme.
- **3D Card Tilting**: Package selection cards tilt dynamically in response to mouse movement.
- **3D Page Flips**: The booking form rotates in 3D space as you proceed through the steps (flipping horizontally on Y-axis for Step 2, and vertically on X-axis for Step 3).
- **Responsive Calculations**: Automatically computes total pricing, 70% non-refundable booking deposit, 30% balance, and balance payment due dates (2 weeks prior to the event).
- **3D Parallax Background**: Citrus slices, shaker icons, mint leaves, and ice cubes float and drift dynamically with mouse coordinates.
- **Admin Dashboard**: Secure administrative portal to manage, search, filter, and change client bookings in real-time.

---

## Quick Start Guide

### Prerequisites
- [Node.js](https://nodejs.org/) (v16.0 or higher recommended)
- `npm` (normally bundled with Node)

### Installation
1. Open your terminal in this workspace folder.
2. Run npm install (already completed in this sandbox):
   ```bash
   npm install
   ```

### Running the Application
To launch the server locally:
```bash
npm start
```
Or to run with live-reloads during changes:
```bash
npm run dev
```

The server will spin up on **[http://localhost:3000](http://localhost:3000)**.

---

## Administration Portal
- **Access URL**: [http://localhost:3000/admin.html](http://localhost:3000/admin.html) (or click the lock icon in the footer/header).
- **Passcode**: `mirage2026`
- **Actions**: Approve bookings, mark deposits as paid, mark bookings fully paid, or cancel reservations.
