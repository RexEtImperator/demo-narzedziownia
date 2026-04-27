const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const hpp = require('hpp');
const path = require('path');
const logger = require('./logger');
const { responseHandler } = require('./middleware/responseHandler');
const { auditLogger } = require('./middleware/auditLogger');
const { csrfProtection } = require('./middleware/csrf');
const authRoutes = require('./routes/auth');
const toolsRoutes = require('./routes/tools');
const toolIssuesRoutes = require('./routes/toolIssues');
const bhpRoutes = require('./routes/bhp');
const bhpIssuesRoutes = require('./routes/bhpIssues');
const analyticsRoutes = require('./routes/analytics');
const systemRoutes = require('./routes/system');
const employeesRoutes = require('./routes/employees');
const usersRoutes = require('./routes/users');
const chatRoutes = require('./routes/chat');
const inventoryRoutes = require('./routes/inventory');
const departmentsRoutes = require('./routes/departments');
const categoriesRoutes = require('./routes/categories');
const positionsRoutes = require('./routes/positions');
const backupRoutes = require('./routes/backup');
const dashboardRoutes = require('./routes/dashboard');
const auditRoutes = require('./routes/audit');
const settingsRoutes = require('./routes/settings');
const reportsRoutes = require('./routes/reports');
const notificationsRoutes = require('./routes/notifications');
const pushRoutes = require('./routes/push');
const rolesRoutes = require('./routes/roles');
const slingsRoutes = require('./routes/slings');
const detectorsRoutes = require('./routes/detectors');
const impactSocketsRoutes = require('./routes/impactSockets');
const plantMapRoutes = require('./routes/plantMap');
const { ROOT_DIR } = require('./config/constants');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./swagger');

const { loginLimiter, refreshLimiter, mutateLimiter, globalLimiter } = require('./middleware/rateLimiters');
const performanceMonitor = require('./middleware/performance');

const app = express();

// Initialize Passport
require('./config/passport')(app);

// Middleware
const allowedOrigins = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://192.168.10.99:3001',
  'https://localhost:3001',
  'https://127.0.0.1:3001',
  'https://192.168.10.99:3001'
];

app.use(cors({
  origin: function(origin, callback) {
    // allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.indexOf(origin) !== -1 ||
      origin.startsWith('http://192.168.') ||
      origin.startsWith('https://192.168.') ||
      origin.endsWith('.trycloudflare.com')
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'x-csrf-token'],
  preflightContinue: true
}));
app.use((req, res, next) => {
  if (req.method === 'OPTIONS' && req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  next();
});
app.options('*', (req, res) => {
  res.sendStatus(204);
});
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "blob:"],
      workerSrc: ["'self'", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws://localhost:3000", "ws://localhost:3001", "http://localhost:3000", "http://localhost:3001", "https://localhost:3000", "https://localhost:3001", "*.trycloudflare.com", "wss://*.trycloudflare.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: null,
    },
  },
}));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(hpp());

// Performance Monitor
app.use(performanceMonitor);

// API Version Header
app.use((req, res, next) => {
  res.setHeader('X-API-Version', '1.0.0');
  next();
});

// Swagger Docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs));

// Apply mutateLimiter to state-changing methods
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return mutateLimiter(req, res, next);
  }
  next();
});

app.use(globalLimiter);

// CSRF Protection
app.use(csrfProtection);

// Static files
app.use(express.static(path.join(ROOT_DIR, 'frontend/build')));
app.use('/uploads', express.static(path.join(ROOT_DIR, 'uploads')));
app.use('/attachments', express.static(path.join(ROOT_DIR, 'public', 'report_attachments')));
app.use('/logos', express.static(path.join(ROOT_DIR, 'public', 'logos')));

// Audit Logging
app.use(auditLogger);

// Logging
app.use((req, res, next) => {
  logger.info(`Incoming: ${req.method} ${req.url}`);
  next();
});

// Custom Response Handler
app.use(responseHandler);

// API Routes
app.use('/api', authRoutes);
app.use('/api/tools', toolsRoutes);
app.use('/api/tool-issues', toolIssuesRoutes);
app.use('/api/bhp', bhpRoutes);
app.use('/api/bhp-issues', bhpIssuesRoutes);
app.use('/api', analyticsRoutes);
app.use('/api', systemRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/departments', departmentsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/positions', positionsRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api', settingsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/push', pushRoutes);
app.use('/api', rolesRoutes);
app.use('/api/slings', slingsRoutes);
app.use('/api/detectors', detectorsRoutes);
app.use('/api/impact-sockets', impactSocketsRoutes);
app.use('/api', plantMapRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/webhooks', require('./routes/webhooks'));

// Force restart trigger
module.exports = app;
