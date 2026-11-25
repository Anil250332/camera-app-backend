const sessionRepository = require('../repositories/session.repository');
const deviceRepository = require('../repositories/device.repository');

class SessionService {
  async createSession(userId, { viewerDeviceId, cameraDeviceId }) {
    if (!viewerDeviceId || !cameraDeviceId) {
      throw new Error('Both viewerDeviceId and cameraDeviceId are required');
    }

    const cameraDevice = await deviceRepository.findById(cameraDeviceId);
    if (!cameraDevice) {
      throw new Error('Camera device not found');
    }

    const viewerDevice = await deviceRepository.findById(viewerDeviceId);
    if (!viewerDevice) {
      throw new Error('Viewer device not found');
    }

    // Check if there is already an active session
    const existingSession = await sessionRepository.findActiveByDeviceId(cameraDeviceId);
    if (existingSession && existingSession.status === 'active') {
      throw new Error('Camera device is already in an active streaming session');
    }

    const session = await sessionRepository.create({
      cameraDeviceId,
      viewerDeviceId,
      userId
    });

    return session;
  }

  async approveSession(sessionId, cameraDeviceId) {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (cameraDeviceId && session.cameraDeviceId !== cameraDeviceId) {
      throw new Error('Unauthorized: only the camera device owner can approve this stream');
    }

    if (session.status !== 'pending') {
      throw new Error(`Cannot approve session with status '${session.status}'`);
    }

    const updated = await sessionRepository.updateStatus(sessionId, 'active');
    await deviceRepository.updateStatus(session.cameraDeviceId, 'streaming');
    return updated;
  }

  async rejectSession(sessionId, cameraDeviceId) {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (cameraDeviceId && session.cameraDeviceId !== cameraDeviceId) {
      throw new Error('Unauthorized: only the camera device owner can reject this stream');
    }

    const updated = await sessionRepository.updateStatus(sessionId, 'rejected');
    return updated;
  }

  async terminateSession(sessionId, deviceId) {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (deviceId && session.cameraDeviceId !== deviceId && session.viewerDeviceId !== deviceId) {
      throw new Error('Unauthorized to terminate this session');
    }

    const updated = await sessionRepository.updateStatus(sessionId, 'terminated');
    await deviceRepository.updateStatus(session.cameraDeviceId, 'online');
    return updated;
  }

  async getSessionById(sessionId) {
    return await sessionRepository.findById(sessionId);
  }

  async getAllSessions() {
    return await sessionRepository.listAll();
  }
}

module.exports = new SessionService();
