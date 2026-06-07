const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'TC Efficiency Measurement Dashboard API',
      version: '1.0.0',
      description: 'Enterprise REST API for the Technology Center Efficiency Measurement Dashboard',
      contact: { name: 'TC Efficiency Team', email: 'admin@tc-efficiency.com' },
    },
    servers: [{ url: `http://localhost:${process.env.PORT || 5000}/api`, description: 'Development Server' }],
    components: {
      securitySchemes: {
        BearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
          },
        },
        Program: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            dept: { type: 'string' },
            program_name: { type: 'string' },
            pm_responsible: { type: 'string' },
            program_code: { type: 'string' },
            baseline: { type: 'string' },
            baseline_start: { type: 'string', format: 'date' },
            baseline_end: { type: 'string', format: 'date' },
            funding_source: { type: 'string' },
            approved_budget_ke: { type: 'number' },
            actual_budget_ke: { type: 'number' },
            estimated_hrs: { type: 'number' },
            actual_hrs: { type: 'number' },
            effort_variance: { type: 'number' },
            productivity_index: { type: 'number' },
            total_effort_saved: { type: 'number' },
            total_cost_saved: { type: 'number' },
            efficiency_pct: { type: 'number' },
          },
        },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
