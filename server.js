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
  }
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
    });
  });
}

module.exports = { app, server, io, bootstrap };
