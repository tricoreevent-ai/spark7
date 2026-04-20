import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import './models/registerTenantPlugin.js';
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import orderRoutes from './routes/orders.js';
import inventoryRoutes from './routes/inventory.js';
import supplierRoutes from './routes/suppliers.js';
import purchaseRoutes from './routes/purchases.js';
import salesRoutes from './routes/sales.js';
import returnsRoutes from './routes/returns.js';
import categoryRoutes from './routes/categories.js';
import accountingRoutes from './routes/accounting.js';
import employeeRoutes from './routes/employees.js';
import attendanceRoutes from './routes/attendance.js';
import facilityRoutes from './routes/facilities.js';
import eventRoutes from './routes/events.js';
import eventQuotationRoutes from './routes/eventQuotations.js';
import shiftRoutes from './routes/shifts.js';
import payrollRoutes from './routes/payroll.js';
import membershipRoutes from './routes/memberships.js';
import serviceRoutes from './routes/services.js';
import userRoutes from './routes/users.js';
import rbacRoutes from './routes/rbac.js';
import customerRoutes from './routes/customers.js';
import customerCrmRoutes from './routes/customerCrm.js';
import creditNoteRoutes from './routes/creditNotes.js';
import quoteRoutes from './routes/quotes.js';
import reportsRoutes from './routes/reports.js';
import adminReportsRoutes from './routes/adminReports.js';
import settlementRoutes from './routes/settlements.js';
import gstRoutes from './routes/gst.js';
import settingsRoutes from './routes/settings.js';
import generalSettingsRoutes from './routes/generalSettings.js';
import publicRoutes from './routes/public.js';
import validationRoutes from './validation/routes/validationRoutes.js';
import { authMiddleware } from './middleware/auth.js';
import { requireAnyPageAccess, requirePageAccess } from './middleware/authorization.js';
import { detectManagedImageMimeType } from './services/assetStorage.js';
import { bootstrapDatabaseOnStartup } from './services/databaseBootstrap.js';
import { redactSensitiveData } from './utils/redaction.js';
import { startValidationScheduler } from './validation/jobs/scheduler.js';

const entryDir = process.argv[1]
  ? path.dirname(path.resolve(process.argv[1]))
  : path.resolve(process.cwd(), 'src', 'server');

const runtimeRootCandidates = [
  path.resolve(process.cwd()),
  path.resolve(entryDir, '..', '..'),
  path.resolve(entryDir, '..'),
];

const runtimeRoot =
  runtimeRootCandidates.find((candidate, index) => {
    const packageJsonPath = path.join(candidate, 'package.json');
    const distDirPath = path.join(candidate, 'dist');
    const srcDirPath = path.join(candidate, 'src');
    if (fs.existsSync(packageJsonPath)) return true;
    if (index === 0) return true;
    return fs.existsSync(distDirPath) || fs.existsSync(srcDirPath);
  }) || path.resolve(process.cwd());

const distRoot = path.join(runtimeRoot, 'dist');

const envCandidates = [
  process.env.APP_ENV_PATH,
  path.join(path.dirname(process.execPath), '.env'),
  typeof (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath === 'string'
    ? path.join((process as NodeJS.Process & { resourcesPath?: string }).resourcesPath as string, '.env')
    : undefined,
  path.join(runtimeRoot, '.env'),
  path.resolve(process.cwd(), '.env'),
].filter((value): value is string => Boolean(value));

let loadedEnvPath: string | undefined;
for (const candidate of envCandidates) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate });
    loadedEnvPath = candidate;
    break;
  }
}

if (!loadedEnvPath) {
  dotenv.config();
}

const app: Express = express();
app.set('trust proxy', true);
const PORT: number = Number(process.env.PORT) || 3000;
const DB_RETRY_MS: number = Number(process.env.DB_RETRY_MS) || 15000;
const clientDistPath = path.join(distRoot, 'client');
const uploadsRoot = path.join(runtimeRoot, 'uploads');

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const parseCsv = (value: string | undefined): string[] => {
  if (typeof value !== 'string') return [];
  return value.split(',').map((part) => part.trim()).filter(Boolean);
};

// Use SERVE_CLIENT=false when frontend is deployed separately.
const serveClient = parseBoolean(process.env.SERVE_CLIENT, true);
const enableHsts = parseBoolean(process.env.ENABLE_HSTS, String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production');
const allowedCorsOrigins = parseCsv(process.env.CORS_ORIGIN || process.env.FRONTEND_URL);
const clientIndexPath = path.join(clientDistPath, 'index.html');

const applyDetectedUploadContentType = (req: Request, res: Response, next: NextFunction): void => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    next();
    return;
  }

  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  try {
    const relativePath = decodeURIComponent(String(req.path || '').trim()).replace(/^\/+/, '');
    if (!relativePath) {
      next();
      return;
    }

    const absolutePath = path.resolve(uploadsRoot, relativePath);
    const normalizedUploadsRoot = path.resolve(uploadsRoot);
    if (absolutePath !== normalizedUploadsRoot && !absolutePath.startsWith(`${normalizedUploadsRoot}${path.sep}`)) {
      next();
      return;
    }

    const stat = fs.existsSync(absolutePath) ? fs.statSync(absolutePath) : null;
    if (!stat?.isFile()) {
      next();
      return;
    }

    const fd = fs.openSync(absolutePath, 'r');
    try {
      const probe = Buffer.alloc(16);
      const bytesRead = fs.readSync(fd, probe, 0, probe.length, 0);
      const detectedMimeType = detectManagedImageMimeType(probe.subarray(0, bytesRead));
      if (detectedMimeType) {
        res.type(detectedMimeType);
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Leave content type resolution to express.static if inspection fails.
  }

  next();
};

const logRuntimeSummary = (): void => {
  console.log(
    'Runtime env summary:',
    JSON.stringify({
      nodeEnv: process.env.NODE_ENV || '',
      port: PORT,
      serveClient,
      frontendUrl: process.env.FRONTEND_URL || '',
      corsOrigin: process.env.CORS_ORIGIN || '',
      databaseUrlConfigured: Boolean(String(process.env.DATABASE_URL || '').trim()),
      smtpConfigured: Boolean(String(process.env.SMTP_HOST || '').trim() && String(process.env.SMTP_USER || '').trim()),
      runtimeRoot,
      distRoot,
      clientIndexExists: fs.existsSync(clientIndexPath),
    })
  );
};

if (loadedEnvPath) {
  console.log(`Loaded environment from ${loadedEnvPath}`);
} else {
  console.warn('No .env file found in expected runtime locations. Using process environment/defaults.');
}
logRuntimeSummary();

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedCorsOrigins.length === 0 || allowedCorsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  hsts: enableHsts
    ? {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      }
    : false,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', applyDetectedUploadContentType, express.static(uploadsRoot));

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'Server is running', timestamp: new Date() });
});

// Compatibility endpoint for older cached clients that still request legacy security alerts.
app.get('/api/security-alerts', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Security alerts are not used in this version.',
    data: {
      alerts: [],
      items: [],
      total: 0,
      openCount: 0,
    },
    alerts: [],
    items: [],
    total: 0,
    openCount: 0,
  });
});

// Database connection
const connectDB = async (): Promise<boolean> => {
  try {
    const mongoUrl = process.env.DATABASE_URL || 'mongodb+srv://rootchirayil:rootchirayil@microcluster.5kjshke.mongodb.net/sarva?appName=MicroCluster';
    await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 10000 });
    try {
      await bootstrapDatabaseOnStartup();
    } catch (bootstrapError) {
      console.error('Database bootstrap warning:', redactSensitiveData(bootstrapError));
    }
    console.log('MongoDB connected successfully');
    return true;
  } catch (error) {
    console.error('MongoDB connection error:', redactSensitiveData(error));
    return false;
  }
};

let dbConnected = false;
let dbConnectInProgress = false;

const connectDbWithRetry = async (): Promise<void> => {
  if (dbConnected || dbConnectInProgress) return;
  dbConnectInProgress = true;
  const connected = await connectDB();
  dbConnectInProgress = false;
  dbConnected = connected;
  if (!connected) {
    console.warn(`Retrying MongoDB connection in ${DB_RETRY_MS} ms...`);
    setTimeout(() => {
      void connectDbWithRetry();
    }, DB_RETRY_MS);
  }
};

// Routes will be added here
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', authMiddleware, requireAnyPageAccess(['products', 'sales']), productRoutes);
app.use('/api/orders', authMiddleware, requirePageAccess('orders'), orderRoutes);
app.use('/api/inventory', authMiddleware, requirePageAccess('inventory'), inventoryRoutes);
app.use('/api/suppliers', authMiddleware, requirePageAccess('inventory'), supplierRoutes);
app.use('/api/purchases', authMiddleware, requirePageAccess('inventory'), purchaseRoutes);
app.use('/api/sales', authMiddleware, requirePageAccess('sales'), salesRoutes);
app.use('/api/returns', authMiddleware, requirePageAccess('returns'), returnsRoutes);
app.use('/api/categories', authMiddleware, requireAnyPageAccess(['categories', 'products', 'sales']), categoryRoutes);
app.use('/api/accounting', authMiddleware, requirePageAccess('accounting'), accountingRoutes);
app.use('/api/employees', authMiddleware, requirePageAccess('employees'), employeeRoutes);
app.use('/api/attendance', authMiddleware, attendanceRoutes);
app.use('/api/facilities', authMiddleware, requireAnyPageAccess(['facilities', 'event-quotations']), facilityRoutes);
app.use('/api/events', authMiddleware, requirePageAccess('facilities'), eventRoutes);
app.use('/api/events/quotations', authMiddleware, requireAnyPageAccess(['event-quotations', 'facilities']), eventQuotationRoutes);
app.use('/api/shifts', authMiddleware, requirePageAccess('shifts'), shiftRoutes);
app.use('/api/payroll', authMiddleware, requirePageAccess('payroll'), payrollRoutes);
app.use('/api/memberships', authMiddleware, requirePageAccess('memberships'), membershipRoutes);
app.use('/api/services', authMiddleware, requirePageAccess('facilities'), serviceRoutes);
app.use('/api/users', authMiddleware, requirePageAccess('user-management'), userRoutes);
app.use('/api/rbac', authMiddleware, requirePageAccess('user-management'), rbacRoutes);
app.use('/api/customers', authMiddleware, requireAnyPageAccess(['customers', 'sales', 'facilities']), customerRoutes);
app.use('/api/customer-crm', authMiddleware, requireAnyPageAccess(['customers', 'sales']), customerCrmRoutes);
app.use('/api/quotes', authMiddleware, requirePageAccess('sales'), quoteRoutes);
app.use('/api/credit-notes', authMiddleware, requirePageAccess('accounting'), creditNoteRoutes);
app.use('/api/reports', authMiddleware, requirePageAccess('reports'), reportsRoutes);
app.use('/api/admin-reports', authMiddleware, requirePageAccess('admin-reports'), adminReportsRoutes);
app.use('/api/settlements', authMiddleware, requirePageAccess('accounting'), settlementRoutes);
app.use('/api/gst', authMiddleware, requireAnyPageAccess(['accounting', 'customers', 'inventory', 'products', 'sales']), gstRoutes);
app.use('/api/settings', authMiddleware, requirePageAccess('settings'), settingsRoutes);
app.use('/api/general-settings', authMiddleware, generalSettingsRoutes);
app.use('/api/validate', authMiddleware, requirePageAccess('accounting'), validationRoutes);

app.use('/api', (req: Request, res: Response) => {
  const detail = `API endpoint not found: ${req.method} ${req.originalUrl}`;
  console.warn(detail);
  res.status(404).json({
    success: false,
    error: detail,
    message: 'The requested API route does not exist on this server. Make sure the frontend and backend are running the same latest code.',
  });
});

if (serveClient) {
  // Combined mode: API + built frontend served from the same Node process.
  if (!fs.existsSync(clientIndexPath)) {
    console.warn(`Client index not found at ${clientIndexPath}. Frontend routes may fail until dist/client is present.`);
  }
  app.use(express.static(clientDistPath));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(clientIndexPath);
  });
} else {
  // Separate mode: backend only, frontend hosted on a different service.
  app.get('/', (_req: Request, res: Response) => {
    res.json({ status: 'API server', message: 'Frontend is deployed separately.' });
  });
}

// Error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Request payload too large. Use a smaller image.' });
  }
  console.error(redactSensitiveData(err?.stack || err));
  res.status(500).json({ success: false, error: 'Internal Server Error' });
});

// Start server
const startServer = async () => {
  mongoose.connection.on('disconnected', () => {
    dbConnected = false;
    console.warn('MongoDB disconnected. Reconnecting...');
    void connectDbWithRetry();
  });

  const server = app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Frontend serving mode: ${serveClient ? 'combined' : 'separate'}`);
    if (allowedCorsOrigins.length > 0) {
      console.log(`CORS allowed origins: ${allowedCorsOrigins.join(', ')}`);
    }
    startValidationScheduler();
  });

  void connectDbWithRetry().then(() => {
    if (!dbConnected) {
      console.warn('Server is up, but database connection is unavailable. Set DATABASE_URL and ensure DB network access.');
    }
  });

  server.on('error', (err) => {
    console.error('Server error:', redactSensitiveData(err));
  });

  // Lightweight heartbeat to make liveness explicit in logs
  setInterval(() => {
    console.log(`Heartbeat: server listening on http://localhost:${PORT} at ${new Date().toISOString()}`);
  }, 60_000);
};

startServer();

// Global error handlers (prevents silent exits; logs for debugging)
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', redactSensitiveData(promise), 'reason:', redactSensitiveData(reason));
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception thrown:', redactSensitiveData(err));
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully.');
  process.exit(0);
});

export default app;


