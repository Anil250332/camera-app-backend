const db = require('../database/db');

class DeviceRepository {
  async findById(deviceId) {
    if (db.isMongo) {
      return await db.getModels().Device.findOne({ id: deviceId }).lean();
    }
    const devices = db.getCollection('devices');
    return devices.find(d => d.id === deviceId) || null;
  }

  async findByPairingCode(pairingCode) {
    const code = pairingCode.trim().toUpperCase();
    if (db.isMongo) {
      return await db.getModels().Device.findOne({ pairingCode: code }).lean();
    }
    const devices = db.getCollection('devices');
    return devices.find(d => d.pairingCode && d.pairingCode.toUpperCase() === code) || null;
  }

  async findAllCameraDevices() {
    if (db.isMongo) {
      return await db.getModels().Device.find({ type: 'camera' }).lean();
    }
    const devices = db.getCollection('devices');
    return devices.filter(d => d.type === 'camera');
  }

  async findByUserId(userId) {
    if (db.isMongo) {
      return await db.getModels().Device.find({ userId }).lean();
    }
    const devices = db.getCollection('devices');
    return devices.filter(d => d.userId === userId);
  }

  async create(deviceData) {
    const newDevice = {
      id: deviceData.id || ('dev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
      name: deviceData.name || 'Android Device',
      type: deviceData.type || 'camera',
      userId: deviceData.userId || 'anonymous',
      pairingCode: (deviceData.pairingCode || Math.random().toString(36).substring(2, 8)).toUpperCase(),
      status: 'offline',
      lastSeen: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    if (db.isMongo) {
      const updated = await db.getModels().Device.findOneAndUpdate(
        { id: newDevice.id },
        { $set: newDevice },
        { upsert: true, returnDocument: 'after' }
      ).lean();
      return updated;
    }

    const devices = db.getCollection('devices');
    const existingIndex = devices.findIndex(d => d.id === newDevice.id);
    if (existingIndex >= 0) {
      devices[existingIndex] = { ...devices[existingIndex], ...newDevice };
    } else {
      devices.push(newDevice);
    }
    db.persist();
    return existingIndex >= 0 ? devices[existingIndex] : newDevice;
  }

  async updateStatus(deviceId, status) {
    const lastSeen = new Date().toISOString();
    if (db.isMongo) {
      return await db.getModels().Device.findOneAndUpdate(
        { id: deviceId },
        { $set: { status, lastSeen } },
        { returnDocument: 'after' }
      ).lean();
    }

    const devices = db.getCollection('devices');
    const device = devices.find(d => d.id === deviceId);
    if (device) {
      device.status = status;
      device.lastSeen = lastSeen;
      db.persist();
      return device;
    }
    return null;
  }

  async upsertRoomSocket({ deviceId, deviceName, deviceType, userId, socketId, room = 'camguard_room' }) {
    const lastSeen = new Date().toISOString();
    if (db.isMongo) {
      return await db.getModels().Device.findOneAndUpdate(
        { id: deviceId },
        {
          $set: {
            socketId,
            room,
            status: 'online',
            lastSeen,
            ...(deviceName ? { name: deviceName } : {}),
            ...(deviceType ? { type: deviceType } : {})
          },
          $setOnInsert: {
            id: deviceId,
            userId: userId || 'anonymous',
            pairingCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
            createdAt: lastSeen
          }
        },
        { upsert: true, returnDocument: 'after' }
      ).lean();
    }

    const devices = db.getCollection('devices');
    const existing = devices.find(d => d.id === deviceId);
    if (existing) {
      if (deviceName) existing.name = deviceName;
      if (deviceType) existing.type = deviceType;
      existing.socketId = socketId;
      existing.room = room;
      existing.status = 'online';
      existing.lastSeen = lastSeen;
      db.persist();
      return existing;
    }

    const newDevice = {
      id: deviceId,
      name: deviceName || 'Android Device',
      type: deviceType || 'camera',
      userId: userId || 'anonymous',
      pairingCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
      socketId,
      room,
      status: 'online',
      lastSeen,
      createdAt: lastSeen
    };
    devices.push(newDevice);
    db.persist();
    return newDevice;
  }

  async createPairing(userId, viewerDeviceId, cameraDeviceId) {
    if (db.isMongo) {
      const existing = await db.getModels().Pairing.findOne({ viewerDeviceId, cameraDeviceId }).lean();
      if (existing) return existing;
      const doc = await db.getModels().Pairing.create({
        id: 'pair_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        userId,
        viewerDeviceId,
        cameraDeviceId,
        pairedAt: new Date().toISOString()
      });
      return doc.toObject();
    }

    const pairings = db.getCollection('pairings');
    const existing = pairings.find(p => p.viewerDeviceId === viewerDeviceId && p.cameraDeviceId === cameraDeviceId);
    if (existing) return existing;

    const newPairing = {
      id: 'pair_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      userId,
      viewerDeviceId,
      cameraDeviceId,
      pairedAt: new Date().toISOString()
    };
    pairings.push(newPairing);
    db.persist();
    return newPairing;
  }

  async findPairingsForViewer(viewerDeviceId) {
    if (db.isMongo) {
      return await db.getModels().Pairing.find({ viewerDeviceId }).lean();
    }
    const pairings = db.getCollection('pairings');
    return pairings.filter(p => p.viewerDeviceId === viewerDeviceId);
  }

  async findPairingsForUser(userId) {
    if (db.isMongo) {
      return await db.getModels().Pairing.find({ userId }).lean();
    }
    const pairings = db.getCollection('pairings');
    return pairings.filter(p => p.userId === userId);
  }

  async deleteById(deviceId) {
    if (db.isMongo) {
      const res = await db.getModels().Device.deleteOne({ id: deviceId });
      await db.getModels().Pairing.deleteMany({ cameraDeviceId: deviceId });
      return res.deletedCount > 0;
    }
    const devices = db.getCollection('devices');
    const idx = devices.findIndex(d => d.id === deviceId);
    if (idx === -1) return false;
    devices.splice(idx, 1);
    db.persist();
    return true;
  }
}

module.exports = new DeviceRepository();
