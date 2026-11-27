const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/user.repository');
const config = require('../config/config');

const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'anonmus@gmail.com';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '42025120613@anil';

class AuthService {
  async seedDefaultAdmin() {
    for (const legacyEmail of ['asahu896214@gmail.com', 'sahuanil6266@gmail.com']) {
      if (DEFAULT_ADMIN_EMAIL.toLowerCase() !== legacyEmail) {
        await userRepository.deleteByEmail(legacyEmail);
      }
    }
    const existing = await userRepository.findByEmail(DEFAULT_ADMIN_EMAIL);
    if (!existing) {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, salt);
      await userRepository.create({
        email: DEFAULT_ADMIN_EMAIL,
        passwordHash,
        role: 'admin'
      });
      console.log(`[Auth] Seeded default admin user in DB: ${DEFAULT_ADMIN_EMAIL}`);
    }
  }

  async login({ email, password }) {
    if (!email || !password) {
      throw new Error('Email ID and password are required');
    }

    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new Error('Invalid email ID or password');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new Error('Invalid email ID or password');
    }

    const token = this.generateToken(user);
    return {
      user: { id: user.id, email: user.email, role: user.role },
      token
    };
  }

  generateToken(user) {
    return jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );
  }

  verifyToken(token) {
    return jwt.verify(token, config.jwtSecret);
  }
}

module.exports = new AuthService();
