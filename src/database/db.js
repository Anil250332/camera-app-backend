const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const config = require('../config/config');

const DATA_DIR = path.join(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Mongoose Schemas (used when MONGO_URI is configured in .env)
const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'admin' },
  createdAt: { type: String, default: () => new Date().toISOString() }
});

const deviceSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, default: 'Android Device' },
  type: { type: String, enum: ['camera', 'viewer'], default: 'camera' },
  userId: { type: String, default: 'anonymous' },
  pairingCode: { type: String },
  status: { type: String, default: 'offline' },
  lastSeen: { type: String, default: () => new Date().toISOString() },
  createdAt: { type: String, default: () => new Date().toISOString() }
});

const pairingSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, default: 'anonymous' },
  viewerDeviceId: { type: String, required: true },
  cameraDeviceId: { type: String, required: true },
  pairedAt: { type: String, default: () => new Date().toISOString() }
});

const sessionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  cameraDeviceId: { type: String, required: true },
  viewerDeviceId: { type: String, required: true },
  userId: { type: String, default: 'anonymous' },
  status: { type: String, default: 'pending' },
  createdAt: { type: String, default: () => new Date().toISOString() },
  updatedAt: { type: String, default: () => new Date().toISOString() }
});

const models = {
  User: mongoose.models.User || mongoose.model('User', userSchema),
  Device: mongoose.models.Device || mongoose.model('Device', deviceSchema),
  Pairing: mongoose.models.Pairing || mongoose.model('Pairing', pairingSchema),
  Session: mongoose.models.Session || mongoose.model('Session', sessionSchema)
};

class Database {
  constructor() {
    this.isMongo = false;
    this.data = {
      users: [],
      devices: [],
      pairings: [],
      sessions: []
    };
    this.initFileStore();
  }

  async connect() {
    if (config.mongoUri && config.mongoUri.trim() !== '') {
      try {
        await mongoose.connect(config.mongoUri.trim());
        this.isMongo = true;
        console.log('[DB] Connected to MongoDB successfully');
      } catch (err) {
        console.error('[DB] MongoDB connection failed, falling back to local file store:', err.message);
        this.isMongo = false;
      }
    } else {
      console.log('[DB] No MONGO_URI provided — using local file/in-memory store');
    }
  }

  initFileStore() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(fileContent);
      } else {
        this.persist();
      }
    } catch (err) {
      console.error('Database initialization warning, continuing with in-memory store:', err.message);
    }
  }

  persist() {
    if (this.isMongo) return;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write database file:', err.message);
    }
  }

  getCollection(name) {
    if (!this.data[name]) {
      this.data[name] = [];
    }
    return this.data[name];
  }

  getModels() {
    return models;
  }
}

const dbInstance = new Database();
module.exports = dbInstance;
