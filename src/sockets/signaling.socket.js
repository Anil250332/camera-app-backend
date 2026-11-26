const deviceService = require('../services/device.service');
const sessionService = require('../services/session.service');
const authService = require('../services/auth.service');
const config = require('../config/config');

// In-memory mapping of deviceId -> socketId and socketId -> deviceId
const deviceSocketMap = new Map();
const socketDeviceMap = new Map();

function initSignalingSocket(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Register a device to its socket
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

        deviceSocketMap.set(deviceId, socket.id);
        socketDeviceMap.set(socket.id, deviceId);

        // Auto-create device in DB if it doesn't exist yet (Android APK registers here)
        const existing = await deviceService.getDeviceById(deviceId);
        if (!existing) {
          await deviceService.registerDevice('socket-auto', {
            deviceId,
            name: deviceName || 'Android Device',
            type: deviceType || 'camera',
            pairingCode: pairingCode || undefined
          });
          await deviceService.updateDeviceStatus(deviceId, 'online');
          console.log(`[Socket] Auto-registered new device as online: ${deviceId} (${deviceType})`);
        } else {
          if (pairingCode && existing.pairingCode !== pairingCode) {
            await deviceService.registerDevice('socket-auto', {
              deviceId,
              name: deviceName || existing.name,
              type: existing.type,
              pairingCode
            });
          }
          await deviceService.updateDeviceStatus(deviceId, 'online');
        }
        if (deviceType === 'camera') {
          // Clean up any stale pending/active sessions from a prior dropped connection
          await sessionService.terminateActiveSessionsForDevice(deviceId);
          io.emit('devices-updated');
        }
        console.log(`[Socket] Device socket mapped: ${deviceId} (${deviceType || 'unknown'}) -> ${socket.id}`);

        socket.emit('registered', {
          success: true,
          deviceId,
          iceServers: config.iceServers
        });
      } catch (err) {
        console.error('[Socket] register-device error:', err.message);
      }
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

        // Forward consent request to Mobile A
        io.to(cameraSocketId).emit('stream-requested', {
          sessionId: session.id,
          viewerDeviceId,
          viewerName: viewerName || 'Viewer Device',
          requestedAt: new Date().toISOString()
        });

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

        if (approved) {
          await sessionService.approveSession(sessionId, cameraDeviceId);
          if (viewerSocketId) {
            io.to(viewerSocketId).emit('stream-approved', {
              sessionId,
              cameraDeviceId,
              iceServers: config.iceServers
            });
          }
          socket.emit('stream-started', { sessionId });
        } else {
          await sessionService.rejectSession(sessionId, cameraDeviceId);
          if (viewerSocketId) {
            io.to(viewerSocketId).emit('stream-rejected', {
              sessionId,
              message: message || 'Camera device owner declined the streaming request.'
            });
          }
        }
      } catch (err) {
        console.error('[Socket] stream-decision error:', err.message);
      }
    });

    // WebRTC Offer forwarding (Mobile A -> Mobile B or vice versa)
    socket.on('offer', (data) => {
      const { targetDeviceId, sdp, sessionId } = data;
      const targetSocketId = deviceSocketMap.get(targetDeviceId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('offer', {
          sdp,
          sessionId,
          senderDeviceId: socketDeviceMap.get(socket.id)
        });
      }
    });

    // WebRTC Answer forwarding
    socket.on('answer', (data) => {
      const { targetDeviceId, sdp, sessionId } = data;
      const targetSocketId = deviceSocketMap.get(targetDeviceId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('answer', {
          sdp,
          sessionId,
          senderDeviceId: socketDeviceMap.get(socket.id)
        });
      }
    });

    // WebRTC ICE Candidate forwarding
    socket.on('ice-candidate', (data) => {
      const { targetDeviceId, candidate, sessionId } = data;
      const targetSocketId = deviceSocketMap.get(targetDeviceId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('ice-candidate', {
          candidate,
          sessionId,
          senderDeviceId: socketDeviceMap.get(socket.id)
        });
      }
    });

    // Switch Front/Back camera on Camera Device
    socket.on('switch-camera', (data) => {
      if (!socket.user) return;
      const { targetDeviceId } = data;
      const targetSocketId = deviceSocketMap.get(targetDeviceId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('switch-camera', {
          senderDeviceId: socketDeviceMap.get(socket.id)
        });
      }
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
          const targetSocketId = deviceSocketMap.get(targetDeviceId);
          if (targetSocketId) {
            io.to(targetSocketId).emit('stream-ended', {
              sessionId,
              message: 'Streaming session was terminated.'
            });
          }
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
          io.emit('devices-updated');
          const terminated = await sessionService.terminateActiveSessionsForDevice(deviceId);
          for (const session of terminated) {
            const otherDeviceId = session.cameraDeviceId === deviceId ? session.viewerDeviceId : session.cameraDeviceId;
            const otherSocketId = deviceSocketMap.get(otherDeviceId);
            if (otherSocketId) {
              io.to(otherSocketId).emit('peer-disconnected', {
                sessionId: session.id,
                deviceId
              });
            }
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

module.exports = { initSignalingSocket, isDeviceOnline };
