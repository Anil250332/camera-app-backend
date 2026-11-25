const deviceRepository = require('../repositories/device.repository');

class DeviceService {
  async registerDevice(userId, { name, type, pairingCode, deviceId }) {
    if (!name || !type) {
      throw new Error('Device name and type are required');
    }
    if (!['camera', 'viewer'].includes(type)) {
      throw new Error('Device type must be either "camera" or "viewer"');
    }

    const device = await deviceRepository.create({
      id: deviceId,
      name,
      type,
      userId,
      pairingCode
    });

    return device;
  }

  async pairDevice(userId, viewerDeviceId, pairingCode) {
    if (!pairingCode) {
      throw new Error('Pairing code is required');
    }

    const cameraDevice = await deviceRepository.findByPairingCode(pairingCode);
    if (!cameraDevice) {
      throw new Error('No camera device found with this pairing code');
    }

    if (cameraDevice.type !== 'camera') {
      throw new Error('The target device is not a camera streamer device');
    }

    if (cameraDevice.id === viewerDeviceId) {
      throw new Error('Cannot pair a device with itself');
    }

    const pairing = await deviceRepository.createPairing(userId, viewerDeviceId, cameraDevice.id);

    return {
      pairing,
      pairedDevice: {
        id: cameraDevice.id,
        name: cameraDevice.name,
        type: cameraDevice.type,
        status: cameraDevice.status,
        lastSeen: cameraDevice.lastSeen
      }
    };
  }

  async getPairedDevices(userId, viewerDeviceId) {
    let pairings;
    if (viewerDeviceId) {
      pairings = await deviceRepository.findPairingsForViewer(viewerDeviceId);
    } else {
      pairings = await deviceRepository.findPairingsForUser(userId);
    }

    const devices = [];
    for (const p of pairings) {
      const dev = await deviceRepository.findById(p.cameraDeviceId);
      if (dev) {
        devices.push({
          pairingId: p.id,
          pairedAt: p.pairedAt,
          device: {
            id: dev.id,
            name: dev.name,
            type: dev.type,
            status: dev.status,
            lastSeen: dev.lastSeen
          }
        });
      }
    }
    return devices;
  }

  async updateDeviceStatus(deviceId, status) {
    return await deviceRepository.updateStatus(deviceId, status);
  }

  async getDeviceById(deviceId) {
    return await deviceRepository.findById(deviceId);
  }

  async getAllCameraDevices() {
    return await deviceRepository.findAllCameraDevices();
  }

  async deleteDevice(deviceId) {
    if (!deviceId) {
      throw new Error('Device ID is required');
    }
    const deleted = await deviceRepository.deleteById(deviceId);
    if (!deleted) {
      throw new Error('Device not found');
    }
    return true;
  }
}

module.exports = new DeviceService();
