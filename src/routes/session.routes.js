const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/session.controller');
const { authMiddleware } = require('../middlewares/auth.middleware');

router.post('/create', authMiddleware, (req, res) => sessionController.create(req, res));
router.post('/approve', (req, res) => sessionController.approve(req, res));
router.post('/reject', (req, res) => sessionController.reject(req, res));
router.post('/terminate', authMiddleware, (req, res) => sessionController.terminate(req, res));
router.get('/', authMiddleware, (req, res) => sessionController.list(req, res));

module.exports = router;
