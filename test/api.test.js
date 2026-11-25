const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { app } = require('../server');

let serverInstance;
let baseUrl;

before((t, done) => {
  serverInstance = http.createServer(app);
  serverInstance.listen(0, () => {
    const port = serverInstance.address().port;
    baseUrl = `http://localhost:${port}`;
    done();
  });
});

after((t, done) => {
  serverInstance.close(done);
});

async function postJson(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function getJson(path) {
  const res = await fetch(`${baseUrl}${path}`, { method: 'GET' });
  const data = await res.json();
  return { status: res.status, data };
}

describe('Remote Camera & Audio Streaming Backend Integration Tests', () => {
  let cameraDeviceId;
  let cameraPairingCode;
  let viewerDeviceId;
  let sessionId;

  test('POST /api/devices/register registers Mobile A (Camera Device)', async () => {
    const res = await postJson('/api/devices/register', {
      name: 'Pixel 8 Pro (Camera)',
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
      name: 'Web Dashboard (Viewer)',
      type: 'viewer'
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert.ok(res.data.data.id);
    viewerDeviceId = res.data.data.id;
  });

  test('POST /api/devices/pair pairs Viewer with Camera Device using pairing code', async () => {
    const res = await postJson('/api/devices/pair', {
      viewerDeviceId,
      pairingCode: cameraPairingCode
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.pairedDevice.id, cameraDeviceId);
  });

  test('GET /api/devices/cameras returns registered camera devices', async () => {
    const res = await getJson('/api/devices/cameras');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(Array.isArray(res.data.data));
    assert.ok(res.data.data.some(item => item.device.id === cameraDeviceId));
  });

  test('GET /api/devices returns the paired camera device for viewer', async () => {
    const res = await getJson(`/api/devices?viewerDeviceId=${viewerDeviceId}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.ok(Array.isArray(res.data.data));
    assert.ok(res.data.data.length >= 1);
    assert.strictEqual(res.data.data[0].device.id, cameraDeviceId);
  });

  test('POST /api/sessions/create initiates a pending streaming session', async () => {
    const res = await postJson('/api/sessions/create', {
      viewerDeviceId,
      cameraDeviceId
    });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.status, 'pending');
    sessionId = res.data.data.id;
  });

  test('POST /api/sessions/approve explicitly approves session by camera owner', async () => {
    const res = await postJson('/api/sessions/approve', {
      sessionId,
      cameraDeviceId
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.status, 'active');
  });

  test('POST /api/sessions/terminate ends the active session', async () => {
    const res = await postJson('/api/sessions/terminate', {
      sessionId,
      deviceId: viewerDeviceId
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.data.status, 'terminated');
  });

  test('Unauthorized device cannot approve another device\'s session', async () => {
    const createRes = await postJson('/api/sessions/create', {
      viewerDeviceId,
      cameraDeviceId
    });
    const newSessionId = createRes.data.data.id;

    const hackRes = await postJson('/api/sessions/approve', {
      sessionId: newSessionId,
      cameraDeviceId: 'fake_camera_device'
    });

    assert.strictEqual(hackRes.status, 400);
    assert.strictEqual(hackRes.data.success, false);
  });
});
