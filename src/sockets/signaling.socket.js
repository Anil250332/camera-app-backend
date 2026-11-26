const deviceService = require('../services/device.service');
const sessionService = require('../services/session.service');
const authService = require('../services/auth.service');
const config = require('../config/config');

const GLOBAL_ROOM = 'camguard_room';
const VIEWERS_ROOM = 'viewers_room';
const CAMERAS_ROOM = 'cameras_room';

// In-memory mapping of deviceId -> socketId and socketId -> deviceId
const deviceSocketMap = new Map();
const socketDeviceMap = new Map();
let ioRef = null;

function attachDeviceSocket(io, socket, { deviceId, deviceType, room = GLOBAL_ROOM }) {
  const oldSocketId = deviceSocketMap.get(deviceId);
  if (oldSocketId && oldSocketId !== socket.id) {
    socketDeviceMap.delete(oldSocketId);
    const oldSocket = io.sockets.sockets.get(oldSocketId);
    if (oldSocket) {
      oldSocket.leave(GLOBAL_ROOM);
      oldSocket.leave(VIEWERS_ROOM);
      oldSocket.leave(CAMERAS_ROOM);
      oldSocket.leave(`device:${deviceId}`);
      oldSocket.emit('socket-replaced', {
        reason: 'New socket registered for this device',
        newSocketId: socket.id
      });
      oldSocket.disconnect(true);
    }
    console.log(`[Room] Evicted old socket ${oldSocketId} for device ${deviceId}`);
  }

  deviceSocketMap.set(deviceId, socket.id);
  socketDeviceMap.set(socket.id, deviceId);

  socket.join(room);
  socket.join(`device:${deviceId}`);
  socket.join(deviceType === 'viewer' ? VIEWERS_ROOM : CAMERAS_ROOM);
}

function syncSocketIntoRoom({ deviceId, deviceName, deviceType, socketId, room = GLOBAL_ROOM }) {
  if (!ioRef || !deviceId) return { joinedRoom: false };

  const liveSocket = socketId ? ioRef.sockets.sockets.get(socketId) : null;
  if (liveSocket) {
    attachDeviceSocket(ioRef, liveSocket, { deviceId, deviceType, room });
  }

  if (deviceType === 'viewer') {
    // Notify every online mobile app in cameras_room that a panel logged in with a fresh socket
    ioRef.to(CAMERAS_ROOM).emit('viewer-room-sync', {
      viewerDeviceId: deviceId,
      viewerName: deviceName || 'CamGuard Web Viewer',
      viewerSocketId: socketId || deviceSocketMap.get(deviceId) || null,
      room
    });
  } else {
    ioRef.to(VIEWERS_ROOM).emit('devices-updated');
  }

  return { joinedRoom: Boolean(liveSocket), room, activeSocketId: deviceSocketMap.get(deviceId) || socketId };
}

function initSignalingSocket(io) {
  ioRef = io;
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Register a device to its socket and shared room, evicting any old socketId for this device
    socket.on('register-device', async (data) => {
      try {
        const { deviceId, deviceName, deviceType, pairingCode } = data;
        if (!deviceId) return;

        // Viewer clients (dashboard) must present a valid JWT token
        if (deviceType === 'viewer') {
          const token = socket.handshake.auth?.token || data.token;
          if (!token) {
            socket.emit('stream-error', { message: 'Unauthorized: Please login first.' });
            socket.disconnect(true);
            return;
          }
          try {
            socket.user = authService.verifyToken(token);
          } catch (err) {
            socket.emit('stream-error', { message: 'Unauthorized: Invalid or expired login session.' });
            socket.disconnect(true);
            return;
          }
        }

        attachDeviceSocket(io, socket, { deviceId, deviceType });

        await deviceService.syncRoomSocket({
          deviceId,
          deviceName,
          deviceType: deviceType || 'camera',
          userId: socket.user?.id || 'socket-auto',
          socketId: socket.id,
          room: GLOBAL_ROOM
        });

        if (pairingCode) {
          const existing = await deviceService.getDeviceById(deviceId);
          if (existing && existing.pairingCode !== pairingCode) {
            await deviceService.registerDevice('socket-auto', {
              deviceId,
              name: deviceName || existing.name,
              type: existing.type,
              pairingCode
            });
            await deviceService.syncRoomSocket({
              deviceId,
              deviceName: deviceName || existing.name,
              deviceType: existing.type,
              socketId: socket.id,
              room: GLOBAL_ROOM
            });
          }
        }

        if (deviceType === 'camera') {
          // Clean up any stale pending/active sessions from a prior dropped connection
          await sessionService.terminateActiveSessionsForDevice(deviceId);
          io.to(VIEWERS_ROOM).emit('devices-updated');
        } else {
          io.to(CAMERAS_ROOM).emit('viewer-room-sync', {
            viewerDeviceId: deviceId,
            viewerName: deviceName || 'CamGuard Web Viewer',
            viewerSocketId: socket.id,
            room: GLOBAL_ROOM
          });
        }
        console.log(`[Room] Device mapped into ${GLOBAL_ROOM}: ${deviceId} (${deviceType || 'camera'}) -> ${socket.id}`);

        socket.emit('registered', {
          success: true,
          deviceId,
          socketId: socket.id,
          room: GLOBAL_ROOM,
          iceServers: config.iceServers
        });
      } catch (err) {
        console.error('[Socket] register-device error:', err.message);
      }
    });

    // Mobile confirms readiness inside the shared room when a new viewer joins
    socket.on('camera-ready', (data) => {
      const cameraDeviceId = data?.cameraDeviceId || socketDeviceMap.get(socket.id);
      if (!cameraDeviceId) return;
      io.to(VIEWERS_ROOM).emit('devices-updated');
    });

    // Mobile B / Dashboard requests streaming session from Mobile A
    socket.on('request-stream', async (data) => {
      try {
        if (!socket.user) {
          socket.emit('stream-error', { message: 'Unauthorized: Please login to request a stream.' });
          return;
        }
        const { viewerDeviceId, cameraDeviceId, viewerName } = data;
        const cameraSocketId = deviceSocketMap.get(cameraDeviceId);

        if (!cameraSocketId) {
          socket.emit('stream-error', {
            message: 'Camera device is currently offline or unreachable.'
          });
          return;
        }

        // Clean up stale/same-viewer active sessions so reconnects don't get blocked
        const existingActive = await sessionService.getActiveSessionForDevice(cameraDeviceId);
        if (existingActive) {
          const oldViewerOnline = deviceSocketMap.has(existingActive.viewerDeviceId);
          if (existingActive.viewerDeviceId === viewerDeviceId || !oldViewerOnline) {
            await sessionService.terminateActiveSessionsForDevice(cameraDeviceId);
          }
        }

        // Create pending session in layered service
        const session = await sessionService.createSession('socket-user', {
          viewerDeviceId,
          cameraDeviceId
        });

        // Forward consent request to camera room (or socket fallback)
        const payload = {
          sessionId: session.id,
          viewerDeviceId,
          viewerName: viewerName || 'Viewer Device',
          room: GLOBAL_ROOM,
          requestedAt: new Date().toISOString()
        };
        io.to(`device:${cameraDeviceId}`).emit('stream-requested', payload);

        socket.emit('stream-request-sent', {
          sessionId: session.id,
          message: 'Streaming request sent to camera device. Waiting for user approval.'
        });
      } catch (err) {
        socket.emit('stream-error', { message: err.message });
      }
    });

    // Mobile A responds with approval or rejection
    socket.on('stream-decision', async (data) => {
      try {
        const { sessionId, approved, cameraDeviceId, viewerDeviceId, message } = data;
        const viewerSocketId = deviceSocketMap.get(viewerDeviceId);
        const sessionRoom = `session:${sessionId}`;

        if (approved) {
          await sessionService.approveSession(sessionId, cameraDeviceId);
          socket.join(sessionRoom);
          if (viewerSocketId) {
            io.sockets.sockets.get(viewerSocketId)?.join(sessionRoom);
          }
          io.to(`device:${viewerDeviceId}`).emit('stream-approved', {
            sessionId,
            cameraDeviceId,
            room: sessionRoom,
            iceServers: config.iceServers
          });
          socket.emit('stream-started', { sessionId, room: sessionRoom });
        } else {
          await sessionService.rejectSession(sessionId, cameraDeviceId);
          io.to(`device:${viewerDeviceId}`).emit('stream-rejected', {
            sessionId,
            message: message || 'Camera device owner declined the streaming request.'
          });
        }
      } catch (err) {
        console.error('[Socket] stream-decision error:', err.message);
      }
    });

    // Shared room-aware WebRTC signaling & control forwarding
    const forwardToPeer = (event, data, buildPayload) => {
      const { targetDeviceId } = data || {};
      if (!targetDeviceId) return;
      io.to(`device:${targetDeviceId}`).emit(event, buildPayload());
    };

    socket.on('offer', (data) => {
      forwardToPeer('offer', data, () => ({
        sdp: data.sdp,
        sessionId: data.sessionId,
        senderDeviceId: socketDeviceMap.get(socket.id)
      }));
    });

    socket.on('answer', (data) => {
      forwardToPeer('answer', data, () => ({
        sdp: data.sdp,
        sessionId: data.sessionId,
        senderDeviceId: socketDeviceMap.get(socket.id)
      }));
    });

    socket.on('ice-candidate', (data) => {
      forwardToPeer('ice-candidate', data, () => ({
        candidate: data.candidate,
        sessionId: data.sessionId,
        senderDeviceId: socketDeviceMap.get(socket.id)
      }));
    });

    socket.on('switch-camera', (data) => {
      if (!socket.user) return;
      forwardToPeer('switch-camera', data, () => ({
        senderDeviceId: socketDeviceMap.get(socket.id)
      }));
    });

    // Explicit stream termination by either party
    socket.on('end-stream', async (data) => {
      try {
        const { sessionId, targetDeviceId } = data;
        const currentDeviceId = socketDeviceMap.get(socket.id);

        if (sessionId) {
          await sessionService.terminateSession(sessionId, currentDeviceId);
        }

        if (targetDeviceId) {
          io.to(`device:${targetDeviceId}`).emit('stream-ended', {
            sessionId,
            message: 'Streaming session was terminated.'
          });
        }
      } catch (err) {
        console.error('[Socket] end-stream error:', err.message);
      }
    });

    // Handle client disconnect
    socket.on('disconnect', async () => {
      const deviceId = socketDeviceMap.get(socket.id);
      if (deviceId) {
        socketDeviceMap.delete(socket.id);
        // Only mark offline if a newer socket hasn't already replaced this connection
        if (deviceSocketMap.get(deviceId) !== socket.id) {
          console.log(`[Socket] Ignored stale socket disconnect for ${deviceId}`);
          return;
        }
        console.log(`[Socket] Device disconnected: ${deviceId}`);
        deviceSocketMap.delete(deviceId);

        try {
          await deviceService.updateDeviceStatus(deviceId, 'offline');
          io.to(VIEWERS_ROOM).emit('devices-updated');
          const terminated = await sessionService.terminateActiveSessionsForDevice(deviceId);
          for (const session of terminated) {
            const otherDeviceId = session.cameraDeviceId === deviceId ? session.viewerDeviceId : session.cameraDeviceId;
            io.to(`device:${otherDeviceId}`).emit('peer-disconnected', {
              sessionId: session.id,
              deviceId
            });
          }
        } catch (err) {
          console.error('[Socket] Disconnect cleanup error:', err.message);
        }
      }
    });
  });
}

function isDeviceOnline(deviceId) {
  return deviceSocketMap.has(deviceId);
}

module.exports = { initSignalingSocket, isDeviceOnline, syncSocketIntoRoom };
