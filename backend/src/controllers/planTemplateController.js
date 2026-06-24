const path = require('path');
const fs = require('fs');
const logger = require('../config/logger');

const DEFAULT_TEMPLATE = path.join(__dirname, '../../templates/TC_Efficiency-Clean.xlsx');
const DOWNLOAD_FILENAME = 'TC_Efficiency_Plan_Template.xlsx';

function resolveTemplatePath() {
  const configured = process.env.PLAN_TEMPLATE_PATH;
  if (!configured) return DEFAULT_TEMPLATE;
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(process.cwd(), configured);
}

exports.getTemplate = (req, res, next) => {
  try {
    const templatePath = resolveTemplatePath();

    if (!fs.existsSync(templatePath)) {
      logger.warn('Plan template file not found', { path: templatePath });
      return res.status(404).json({
        success: false,
        message: 'Template file is not available. Please contact your administrator.',
        path: path.basename(templatePath),
      });
    }

    const stat = fs.statSync(templatePath);
    logger.info('Plan template download', {
      fileName: DOWNLOAD_FILENAME,
      size: stat.size,
      ip: req.ip,
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${DOWNLOAD_FILENAME}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'no-cache');

    const stream = fs.createReadStream(templatePath);
    stream.on('error', (err) => {
      logger.error('Template stream error', { error: err.message });
      if (!res.headersSent) next(err);
    });
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
};

exports.resolveTemplatePath = resolveTemplatePath;
exports.DEFAULT_TEMPLATE = DEFAULT_TEMPLATE;
exports.DOWNLOAD_FILENAME = DOWNLOAD_FILENAME;
