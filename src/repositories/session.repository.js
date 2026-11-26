const db = require('../database/db');

class SessionRepository {
  async findById(sessionId) {
    if (db.isMongo) {
      return await db.getModels().Session.findOne({ id: sessionId }).lean();
    }
    const sessions = db.getCollection('sessions');
    return sessions.find(s => s.id === sessionId) || null;
  }

  async findActiveByDeviceId(deviceId) {
    if (db.isMongo) {
      return await db.getModels().Session.findOne({
        $or: [{ cameraDeviceId: deviceId }, { viewerDeviceId: deviceId }],
        status: { $in: ['pending', 'active'] }
      }).lean();
    }
    const sessions = db.getCollection('sessions');
    return sessions.find(s =>
      (s.cameraDeviceId === deviceId || s.viewerDeviceId === deviceId) &&
      (s.status === 'pending' || s.status === 'active')
    ) || null;
  }

  async create(sessionData) {
    const newSession = {
      id: sessionData.id || ('sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
      cameraDeviceId: sessionData.cameraDeviceId,
      viewerDeviceId: sessionData.viewerDeviceId,
      userId: sessionData.userId || 'anonymous',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (db.isMongo) {
      const doc = await db.getModels().Session.create(newSession);
      return doc.toObject();
    }

    const sessions = db.getCollection('sessions');
    sessions.push(newSession);
    db.persist();
    return newSession;
  }

  async updateStatus(sessionId, status) {
    const updatedAt = new Date().toISOString();
    if (db.isMongo) {
      return await db.getModels().Session.findOneAndUpdate(
        { id: sessionId },
        { $set: { status, updatedAt } },
        { returnDocument: 'after' }
      ).lean();
    }

    const sessions = db.getCollection('sessions');
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      session.status = status;
      session.updatedAt = updatedAt;
      db.persist();
      return session;
    }
    return null;
  }

  async terminateActiveByDeviceId(deviceId) {
    const updatedAt = new Date().toISOString();
    if (db.isMongo) {
      const active = await db.getModels().Session.find({
        $or: [{ cameraDeviceId: deviceId }, { viewerDeviceId: deviceId }],
        status: { $in: ['pending', 'active'] }
      }).lean();
      if (active.length > 0) {
        await db.getModels().Session.updateMany(
          {
            $or: [{ cameraDeviceId: deviceId }, { viewerDeviceId: deviceId }],
            status: { $in: ['pending', 'active'] }
          },
          { $set: { status: 'terminated', updatedAt } }
        );
      }
      return active;
    }

    const sessions = db.getCollection('sessions');
    const terminated = [];
    for (const s of sessions) {
      if ((s.cameraDeviceId === deviceId || s.viewerDeviceId === deviceId) &&
          (s.status === 'pending' || s.status === 'active')) {
        s.status = 'terminated';
        s.updatedAt = updatedAt;
        terminated.push(s);
      }
    }
    if (terminated.length > 0) db.persist();
    return terminated;
  }

  async listAll() {
    if (db.isMongo) {
      return await db.getModels().Session.find({}).lean();
    }
    return db.getCollection('sessions');
  }
}

module.exports = new SessionRepository();
