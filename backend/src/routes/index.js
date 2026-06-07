const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate, authorize } = require('../middleware/auth');

// Controllers
const authCtrl = require('../controllers/authController');
const uploadCtrl = require('../controllers/uploadController');
const programCtrl = require('../controllers/programController');
const analyticsCtrl = require('../controllers/analyticsController');
const userCtrl = require('../controllers/userController');
const auditCtrl = require('../controllers/auditController');
const healthCtrl = require('../controllers/healthController');

// Multer setup
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random()*1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls'].includes(ext)) cb(null, true);
    else cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
  },
});

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: User login
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 */
router.post('/auth/login', authCtrl.login);
router.get('/auth/me', authenticate, authCtrl.me);
router.post('/auth/logout', authenticate, authCtrl.logout);
router.put('/auth/change-password', authenticate, authCtrl.changePassword);

// Health
router.get('/health', healthCtrl.getHealth);
router.get('/health/stats', authenticate, healthCtrl.getStats);

// Years
router.get('/years', authenticate, uploadCtrl.getYears);

// Uploads
router.post('/uploads', authenticate, authorize('admin','manager'), upload.single('file'), uploadCtrl.upload);
router.get('/uploads', authenticate, uploadCtrl.getUploads);
router.get('/uploads/compare', authenticate, uploadCtrl.compareUploads);
router.get('/uploads/:id', authenticate, uploadCtrl.getUploadById);
router.delete('/uploads/:id', authenticate, authorize('admin'), uploadCtrl.deleteUpload);

// Programs
router.get('/programs', authenticate, programCtrl.getPrograms);
router.get('/programs/filter-options', authenticate, programCtrl.getFilterOptions);
router.get('/programs/:id', authenticate, programCtrl.getProgramById);
router.post('/programs', authenticate, authorize('admin','manager'), programCtrl.createProgram);
router.put('/programs/:id', authenticate, authorize('admin','manager'), programCtrl.updateProgram);
router.delete('/programs/:id', authenticate, authorize('admin'), programCtrl.deleteProgram);
router.delete('/programs', authenticate, authorize('admin'), programCtrl.bulkDelete);

// Analytics
router.get('/analytics/summary', authenticate, analyticsCtrl.getSummary);
router.get('/analytics/by-department', authenticate, analyticsCtrl.getByDepartment);
router.get('/analytics/by-program', authenticate, analyticsCtrl.getByProgram);
router.get('/analytics/opportunities', authenticate, analyticsCtrl.getOpportunities);
router.get('/analytics/trends', authenticate, analyticsCtrl.getTrends);
router.get('/analytics/heatmap', authenticate, analyticsCtrl.getProductivityHeatmap);
router.get('/analytics/ai-insights', authenticate, analyticsCtrl.getAiInsights);
router.get('/analytics/top-programs', authenticate, analyticsCtrl.getTopPrograms);

// Users (admin only)
router.get('/users', authenticate, authorize('admin'), userCtrl.getUsers);
router.post('/users', authenticate, authorize('admin'), userCtrl.createUser);
router.put('/users/:id', authenticate, authorize('admin'), userCtrl.updateUser);
router.delete('/users/:id', authenticate, authorize('admin'), userCtrl.deleteUser);
router.get('/roles', authenticate, userCtrl.getRoles);

// Audit & Notifications
router.get('/audit', authenticate, authorize('admin','manager'), auditCtrl.getLogs);
router.get('/notifications', authenticate, auditCtrl.getNotifications);
router.put('/notifications/:id/read', authenticate, auditCtrl.markNotificationRead);
router.put('/notifications/read-all', authenticate, auditCtrl.markAllRead);

module.exports = router;
