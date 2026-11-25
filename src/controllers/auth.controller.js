const authService = require('../services/auth.service');

class AuthController {
  async login(req, res) {
    try {
      const email = req.body.email || req.body.username;
      const { password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email ID and password are required'
        });
      }

      const result = await authService.login({ email, password });
      return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: result
      });
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: err.message
      });
    }
  }

  async me(req, res) {
    try {
      return res.status(200).json({
        success: true,
        data: req.user
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }
}

module.exports = new AuthController();
