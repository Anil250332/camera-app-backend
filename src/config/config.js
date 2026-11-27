require('dotenv').config();

const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' }
];

if (process.env.TURN_URL) {
  iceServers.push({
    urls: process.env.TURN_URL,
    username: process.env.TURN_USERNAME || '',
    credential: process.env.TURN_CREDENTIAL || ''
  });
}

const DEFAULT_ALLOWED_ORIGINS = ['https://myapp-wheat-six-49.vercel.app'];
const envOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(o => o.trim().replace(/\/+$/, ''))
  .filter(o => o && o !== '*');
const allowedOrigins = envOrigins.length > 0 ? envOrigins : DEFAULT_ALLOWED_ORIGINS;

function corsOriginValidator(origin, callback) {
  // Native mobile apps (Android/OkHttp/Socket.IO), curl, and server health checks send no Origin header
  if (!origin) return callback(null, true);
  const normalized = origin.trim().replace(/\/+$/, '');
  if (allowedOrigins.includes(normalized)) {
    return callback(null, true);
  }
  return callback(null, false);
}

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: allowedOrigins,
  corsOriginValidator,
  mongoUri: process.env.MONGO_URI || process.env.MONGODB_URI || process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || 'remote_streaming_super_secret_jwt_key_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '3650d',
  iceServers
};
