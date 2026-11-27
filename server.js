const http = require('http');
const { Server } = require('socket.io');
const app = require('./src/app');
const config = require('./src/config/config');
const db = require('./src/database/db');
const authService = require('./src/services/auth.service');
const { initSignalingSocket } = require('./src/sockets/signaling.socket');

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: config.corsOrigin,
    methods: ['GET', 'POST']
  },
  pingInterval: 20000,
  pingTimeout: 45000
});

initSignalingSocket(io);

async function bootstrap() {
  await db.connect();
  await authService.seedDefaultAdmin();
}

if (require.main === module) {
  bootstrap().then(() => {
    const PORT = config.port;
    server.listen(PORT, () => {
      console.log(`[Server] WebRTC Signaling & Backend API running on port ${PORT}`);
      console.log(`[Server] Environment: ${config.nodeEnv}`);

      const keepAliveBase =
        process.env.KEEP_ALIVE_URL ||
        process.env.RENDER_EXTERNAL_URL ||
        (config.nodeEnv === 'production' ? 'https://camera-app-backend-q7p5.onrender.com' : '');
      if (keepAliveBase) {
        const healthUrl = `${keepAliveBase.replace(/\/+$/, '')}/health`;
        setInterval(async () => {
          try {
            const res = await fetch(healthUrl);
            console.log(`[KeepAlive] Pinged ${healthUrl} -> ${res.status}`);
          } catch (err) {
            console.warn(`[KeepAlive] Ping failed: ${err.message}`);
          }
        }, 10 * 60 * 1000).unref();
      }
    });
  });
}

module.exports = { app, server, io, bootstrap };
