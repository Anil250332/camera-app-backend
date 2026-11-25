const deviceService = require('../services/device.service');

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

  async getCameraDevices(req, res) {
    try {
      // Returns all camera-type devices — used by web dashboard to list streamers
      const cameras = await deviceService.getAllCameraDevices();
      return res.status(200).json({
        success: true,
        data: cameras.map(d => ({
          device: { id: d.id, name: d.name, type: d.type, status: d.status, lastSeen: d.lastSeen }
        }))
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
