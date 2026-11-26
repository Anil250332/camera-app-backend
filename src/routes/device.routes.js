const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/device.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');

router.post('/register', (req, res) => deviceController.register(req, res));
router.post('/room/join', (req, res) => deviceController.joinRoom(req, res));
router.post('/pair', authMiddleware, (req, res) => deviceController.pair(req, res));
router.get('/cameras', authMiddleware, (req, res) => deviceController.getCameraDevices(req, res));
router.delete('/:id', authMiddleware, (req, res) => deviceController.deleteDevice(req, res));
router.get('/', authMiddleware, (req, res) => deviceController.getDevices(req, res));

module.exports = router;
