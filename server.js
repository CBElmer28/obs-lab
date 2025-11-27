const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const requestId = require('./middlewares/request-id');
const logger = require('./logger');
const { 
    register, 
    httpRequestDurationMicroseconds, 
    httpRequestsTotal, 
    httpErrorsTotal,
    httpLoginErrorsTotal 
} = require('./metrics');

const app = express();
let isReady = true;

// --- MIDDLEWARES GLOBALES ---
app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(compression());
app.use(requestId);

// Configurar Morgan para enviar logs a Winston
const morganFormat = ':method :url :status :res[content-length] - :response-time ms';
app.use(morgan(morganFormat, {
    stream: {
        write: (message) => {
            const parts = message.trim().split(' ');
            logger.info({
                message: 'HTTP Request',
                method: parts[0],
                url: parts[1],
                status: parts[2],
                durationMs: parts[5],
                correlationId: 'N/A'
            });
        }
    }
}));

// Middleware interceptor para registrar MÉTRICAS
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const route = req.route ? req.route.path : req.path;
        
        httpRequestDurationMicroseconds.observe({ method: req.method, route, code: res.statusCode }, duration / 1000);
        httpRequestsTotal.inc({ method: req.method, route, code: res.statusCode });
        
        if (res.statusCode >= 400) {
            httpErrorsTotal.inc({ method: req.method, route, code: res.statusCode });
        }
    });
    next();
});

// --- RUTAS DE MONITOREO ---

app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'OK' });
});

app.get('/readyz', (req, res) => {
    if (isReady) return res.status(200).json({ status: 'READY' });
    res.status(503).json({ status: 'NOT_READY' });
});

app.post('/toggle-ready', (req, res) => {
    isReady = !isReady;
    logger.info({ message: `Readiness toggled to: ${isReady}`, correlationId: req.correlationId });
    res.json({ status: isReady ? 'READY' : 'NOT_READY' });
});

// --- RUTAS DE PRUEBA ---

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === '1234') {
        res.json({ token: 'fake-token' });
    } else {
        httpLoginErrorsTotal.inc(); 
        logger.warn({ message: 'Login failed', user: username, correlationId: req.correlationId });
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.get('/api/hello', (req, res) => {
    logger.info({ message: 'Hello endpoint called', correlationId: req.correlationId });
    res.json({ message: 'Hello World', cid: req.correlationId });
});

app.get('/api/slow', async (req, res) => {
    const delay = 700;
    await new Promise(resolve => setTimeout(resolve, delay));
    
    logger.warn({ message: 'Slow endpoint called', duration: delay, correlationId: req.correlationId });
    res.json({ message: `Slow response after ${delay}ms` });
});

app.get('/api/error', async (req, res) => {
    throw new Error('Simulated Backend Failure'); 
});

app.post('/client-logs', (req, res) => {
    const { level, message, stack, meta } = req.body;
    logger.log({
        level: level || 'info',
        message: message || 'Client log',
        source: 'frontend',
        stack,
        meta,
        correlationId: req.correlationId
    });
    res.status(200).send('Log received');
});

app.get('/api/calc', (req, res) => {
    const { a, b, op } = req.query;
    logger.info({ 
        message: 'Calculation requested', 
        params: { a, b, op },
        correlationId: req.correlationId 
    });
    
    if (!a || !b) return res.status(400).json({ error: 'Missing params' });
    res.json({ result: Number(a) + Number(b) });
});

// --- MANEJO DE ERRORES ---

app.use((err, req, res, next) => {
    logger.error({ 
        message: err.message, 
        stack: err.stack, 
        correlationId: req.correlationId 
    });
    res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});