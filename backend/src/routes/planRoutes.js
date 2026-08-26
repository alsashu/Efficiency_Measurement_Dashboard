const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticate, authorize } = require('../middleware/auth');

const planUploadCtrl = require('../controllers/planUploadController');
const planProgramCtrl = require('../controllers/planProgramController');
const planAnalyticsCtrl = require('../controllers/planAnalyticsController');
const planTemplateCtrl = require('../controllers/planTemplateController');

// Multer setup for plan uploads
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `plan-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
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

// Template download — public endpoint (no sensitive data, no auth required)
router.get('/template/download', planTemplateCtrl.getTemplate);

// Years
router.get('/years', authenticate, planUploadCtrl.getYears);

// Uploads
router.post('/uploads/validate', authenticate, authorize('admin', 'manager'), upload.single('file'), planUploadCtrl.validateExcel);
router.post('/uploads', authenticate, authorize('admin', 'manager'), upload.single('file'), planUploadCtrl.upload);
router.get('/uploads', authenticate, planUploadCtrl.getUploads);
router.get('/uploads/:id', authenticate, planUploadCtrl.getUploadById);
router.delete('/uploads/:id', authenticate, authorize('admin'), planUploadCtrl.deleteUpload);

// Programs
router.get('/programs', authenticate, planProgramCtrl.getPrograms);
router.get('/programs/filter-options', authenticate, planProgramCtrl.getFilterOptions);
router.get('/programs/:id', authenticate, planProgramCtrl.getProgramById);
router.post('/programs', authenticate, authorize('admin', 'manager'), planProgramCtrl.createProgram);
router.put('/programs/:id', authenticate, authorize('admin', 'manager'), planProgramCtrl.updateProgram);
router.delete('/programs/:id', authenticate, authorize('admin'), planProgramCtrl.deleteProgram);

// Analytics
router.get('/analytics/summary', authenticate, planAnalyticsCtrl.getSummary);
router.get('/analytics/by-department', authenticate, planAnalyticsCtrl.getByDepartment);
router.get('/analytics/by-program', authenticate, planAnalyticsCtrl.getByProgram);
router.get('/analytics/trends', authenticate, planAnalyticsCtrl.getTrends);
router.get('/analytics/top-programs', authenticate, planAnalyticsCtrl.getTopPrograms);
router.get('/analytics/opportunities', authenticate, planAnalyticsCtrl.getOpportunityBreakdown);
router.get('/analytics/period-options', authenticate, planAnalyticsCtrl.getPeriodOptions);
router.get('/analytics/kpi-detail', authenticate, planAnalyticsCtrl.getKpiDetail);

module.exports = router;
