const db = require('../database/db');

class UserRepository {
  async findById(id) {
    if (db.isMongo) {
      return await db.getModels().User.findOne({ id }).lean();
    }
    const users = db.getCollection('users');
    return users.find(u => u.id === id) || null;
  }

  async findByEmail(email) {
    if (!email) return null;
    const normalized = email.trim().toLowerCase();
    if (db.isMongo) {
      return await db.getModels().User.findOne({ email: normalized }).lean();
    }
    const users = db.getCollection('users');
    return users.find(u => u.email && u.email.toLowerCase() === normalized) || null;
  }

  async create(userData) {
    const newUser = {
      id: userData.id || ('usr_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7)),
      email: userData.email.trim().toLowerCase(),
      passwordHash: userData.passwordHash,
      role: userData.role || 'admin',
      createdAt: new Date().toISOString()
    };

    if (db.isMongo) {
      const doc = await db.getModels().User.create(newUser);
      return doc.toObject();
    }

    const users = db.getCollection('users');
    users.push(newUser);
    db.persist();
    return newUser;
  }

  async deleteByEmail(email) {
    if (!email) return false;
    const normalized = email.trim().toLowerCase();
    if (db.isMongo) {
      const res = await db.getModels().User.deleteOne({ email: normalized });
      return res.deletedCount > 0;
    }
    const users = db.getCollection('users');
    const idx = users.findIndex(u => u.email && u.email.toLowerCase() === normalized);
    if (idx === -1) return false;
    users.splice(idx, 1);
    db.persist();
    return true;
  }
}

module.exports = new UserRepository();
