const sessionService = require('../services/session.service');

class SessionController {
  async create(req, res) {
    try {
      const userId = req.body.userId || 'anonymous';
      const { viewerDeviceId, cameraDeviceId } = req.body;

      if (!viewerDeviceId || !cameraDeviceId) {
        return res.status(400).json({
          success: false,
          message: 'viewerDeviceId and cameraDeviceId are required'
        });
      }

      const session = await sessionService.createSession(userId, { viewerDeviceId, cameraDeviceId });
      return res.status(201).json({
        success: true,
        message: 'Session requested. Awaiting camera device approval.',
        data: session
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  async approve(req, res) {
    try {
      const { sessionId, cameraDeviceId } = req.body;
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'sessionId is required'
        });
      }

      const session = await sessionService.approveSession(sessionId, cameraDeviceId);
      return res.status(200).json({
        success: true,
        message: 'Session approved by camera owner',
        data: session
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  async reject(req, res) {
    try {
      const { sessionId, cameraDeviceId } = req.body;
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'sessionId is required'
        });
      }

      const session = await sessionService.rejectSession(sessionId, cameraDeviceId);
      return res.status(200).json({
        success: true,
        message: 'Session rejected by camera owner',
        data: session
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  async terminate(req, res) {
    try {
      const { sessionId, deviceId } = req.body;
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'sessionId is required'
        });
      }

      const session = await sessionService.terminateSession(sessionId, deviceId);
      return res.status(200).json({
        success: true,
        message: 'Session terminated',
        data: session
      });
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: err.message
      });
    }
  }

  async list(req, res) {
    try {
      const sessions = await sessionService.getAllSessions();
      return res.status(200).json({
        success: true,
        data: sessions
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: err.message
      });
    }
  }
}

module.exports = new SessionController();
