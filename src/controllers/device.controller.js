const deviceService = require('../services/device.service');
const authService = require('../services/auth.service');
const { isDeviceOnline, syncSocketIntoRoom } = require('../sockets/signaling.socket');

class DeviceController {
  async register(req, res) {
    try {
      const userId = req.body.userId || 'anonymous';
      const { name, type, pairingCode, deviceId } = req.body;

      if (!name || !type) {
        return res.status(400).json({
          success: false,
          message: 'Device name and type are required'
        });
      }

      const device = await deviceService.registerDevice(userId, {
        name,
        type,
        pairingCode,
        deviceId
      });

      return res.status(201).json({
        success: true,
        message: 'Device registered successfully',
        data: device
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  async pair(req, res) {
    try {
      const userId = req.body.userId || 'anonymous';
      const { pairingCode, viewerDeviceId } = req.body;

      if (!pairingCode) {
        return res.status(400).json({
          success: false,
          message: 'Pairing code is required'
        });
      }

      const result = await deviceService.pairDevice(userId, viewerDeviceId, pairingCode);
      return res.status(200).json({
        success: true,
        message: 'Device paired successfully',
        data: result
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  async getDevices(req, res) {
    try {
      const { viewerDeviceId } = req.query;

      const devices = await deviceService.getPairedDevices(null, viewerDeviceId);
      return res.status(200).json({
        success: true,
        data: devices
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }

  async joinRoom(req, res) {
    try {
      const { deviceId, deviceName, deviceType, socketId, room } = req.body;
      if (!deviceId) {
        return res.status(400).json({ success: false, message: 'deviceId is required' });
      }

      let userId = 'anonymous';
      if (deviceType === 'viewer') {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!token) {
          return res.status(401).json({ success: false, message: 'Unauthorized: Bearer token required for viewer room join' });
        }
        const decoded = authService.verifyToken(token);
        userId = decoded.id || 'viewer';
      }

      const targetRoom = room || 'camguard_room';
      const device = await deviceService.syncRoomSocket({
        deviceId,
        deviceName,
        deviceType: deviceType || 'camera',
        userId,
        socketId,
        room: targetRoom
      });

      const roomState = syncSocketIntoRoom({
        deviceId,
        deviceName: device.name,
        deviceType: device.type,
        socketId,
        room: targetRoom
      });

      return res.status(200).json({
        success: true,
        message: 'Joined socket room successfully',
        data: { device, ...roomState }
      });
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }
  }

  async getCameraDevices(req, res) {
    try {
      // Returns all camera-type devices with live socket online status
      const cameras = await deviceService.getAllCameraDevices();
      return res.status(200).json({
        success: true,
        data: cameras.map(d => {
          const liveOnline = isDeviceOnline(d.id);
          const liveStatus = liveOnline ? (d.status === 'streaming' ? 'streaming' : 'online') : 'offline';
          return {
            device: { id: d.id, name: d.name, type: d.type, status: liveStatus, lastSeen: d.lastSeen }
          };
        })
      });
    } catch (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
  }

  async deleteDevice(req, res) {
    try {
      const { id } = req.params;
      await deviceService.deleteDevice(id);
      return res.status(200).json({
        success: true,
        message: 'Device deleted successfully'
      });
    } catch (err) {
      return res.status(404).json({ success: false, message: err.message });
    }
  }
}

module.exports = new DeviceController();
