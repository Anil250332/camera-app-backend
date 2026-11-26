const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { app, bootstrap } = require('../server');

let serverInstance;
let baseUrl;

before(async () => {
  await bootstrap();
  await new Promise((resolve) => {
    serverInstance = http.createServer(app);
    serverInstance.listen(0, () => {
      const port = serverInstance.address().port;
      baseUrl = `http://localhost:${port}`;
      resolve();
    });
  });
});

after((t, done) => {
  serverInstance.close(done);
});

async function postJson(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function getJson(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, { method: 'GET', headers });
  const data = await res.json();
  return { status: res.status, data };
}

describe('Remote Camera & Audio Streaming Backend Integration Tests', () => {
  let authToken;
  let cameraDeviceId;
  let cameraPairingCode;
  let viewerDeviceId = 'web_test_viewer';
  let sessionId;

  test('GET /api/devices/cameras rejects unauthenticated access (401)', async () => {
    const res = await getJson('/api/devices/cameras');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.data.success, false);
  });

  test('POST /api/auth/login rejects wrong credentials (401)', async () => {
    const res = await postJson('/api/auth/login', {
      email: 'asahu896214@gmail.com',
      password: 'wrongpassword'
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.data.success, false);
  });

  test('POST /api/auth/login succeeds with seeded admin credentials', async () => {
    const res = await postJson('/api/auth/login', {
      email: 'asahu896214@gmail.com',
      password: 'asahu896214@gmail.com'
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.user.email, 'asahu896214@gmail.com');
    assert.ok(res.data.data.token);
    authToken = res.data.data.token;
  });

  test('GET /api/auth/me returns current authenticated user', async () => {
    const res = await getJson('/api/auth/me', authToken);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.email, 'asahu896214@gmail.com');
  });

  test('POST /api/devices/register registers Mobile A (Camera Device)', async () => {
    const res = await postJson('/api/devices/register', {
      name: 'Old Android Phone (Camera)',
      type: 'camera'
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.data.id);
    assert.ok(res.data.data.pairingCode);

    cameraDeviceId = res.data.data.id;
    cameraPairingCode = res.data.data.pairingCode;
  });

  test('POST /api/devices/register registers Web Dashboard Viewer', async () => {
    const res = await postJson('/api/devices/register', {
      deviceId: viewerDeviceId,
      name: 'Web Dashboard (Viewer)',
      type: 'viewer'
    });
    assert.strictEqual(res.status, 201);
  });

  test('POST /api/devices/pair pairs Authenticated Viewer with Camera Device', async () => {
    const res = await postJson('/api/devices/pair', {
      viewerDeviceId,
      pairingCode: cameraPairingCode
    }, authToken);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.pairedDevice.id, cameraDeviceId);
  });

  test('GET /api/devices/cameras returns registered camera devices when authenticated', async () => {
    const res = await getJson('/api/devices/cameras', authToken);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.data.some(item => item.device.id === cameraDeviceId));
  });

  test('POST /api/sessions/create -> approve -> terminate works end-to-end', async () => {
    const createRes = await postJson('/api/sessions/create', {
      viewerDeviceId,
      cameraDeviceId
    }, authToken);
    assert.strictEqual(createRes.status, 201);
    sessionId = createRes.data.data.id;

    const approveRes = await postJson('/api/sessions/approve', {
      sessionId,
      cameraDeviceId
    });
    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveRes.data.data.status, 'active');

    const termRes = await postJson('/api/sessions/terminate', {
      sessionId,
      deviceId: viewerDeviceId
    }, authToken);
    assert.strictEqual(termRes.status, 200);
    assert.strictEqual(termRes.data.data.status, 'terminated');
  });

  test('POST /api/devices/room/join updates socketId and joins camguard_room', async () => {
    const camRes = await postJson('/api/devices/room/join', {
      deviceId: cameraDeviceId,
      deviceName: 'Old Android Phone (Camera)',
      deviceType: 'camera',
      socketId: 'sock_cam_123'
    });
    assert.strictEqual(camRes.status, 200);
    assert.strictEqual(camRes.data.success, true);
    assert.strictEqual(camRes.data.data.device.socketId, 'sock_cam_123');
    assert.strictEqual(camRes.data.data.room, 'camguard_room');

    const unauthViewer = await postJson('/api/devices/room/join', {
      deviceId: viewerDeviceId,
      deviceType: 'viewer',
      socketId: 'sock_view_unauth'
    });
    assert.strictEqual(unauthViewer.status, 401);

    const viewRes = await postJson('/api/devices/room/join', {
      deviceId: viewerDeviceId,
      deviceName: 'CamGuard Web Viewer',
      deviceType: 'viewer',
      socketId: 'sock_view_456'
    }, authToken);
    assert.strictEqual(viewRes.status, 200);
    assert.strictEqual(viewRes.data.success, true);
    assert.strictEqual(viewRes.data.data.device.socketId, 'sock_view_456');
  });

  test('DELETE /api/devices/:id deletes a registered device when authenticated', async () => {
    const res = await fetch(`${baseUrl}/api/devices/${cameraDeviceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
  });
});
