const express = require('express');
const cors = require('cors');
const config = require('./config/config');

const authRoutes = require('./routes/auth.routes');
const deviceRoutes = require('./routes/device.routes');
const sessionRoutes = require('./routes/session.routes');

const app = express();

app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount modular routes strictly following layered architecture
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/sessions', sessionRoutes);

// Global 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Resource not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[App Error]', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

module.exports = app;
