const client = require('prom-client');

const register = new client.Registry();
register.setDefaultLabels({
    app: 'obs-lab',
    environment: 'development'
});

client.collectDefaultMetrics({ register });

const httpRequestDurationMicroseconds = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'code'],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});

const httpRequestsTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'code']
});

const httpErrorsTotal = new client.Counter({
    name: 'http_errors_total',
    help: 'Total number of HTTP errors',
    labelNames: ['method', 'route', 'code']
});

const httpLoginErrorsTotal = new client.Counter({
    name: 'http_login_errors_total',
    help: 'Total number of failed login attempts',
});

register.registerMetric(httpRequestDurationMicroseconds);
register.registerMetric(httpRequestsTotal);
register.registerMetric(httpErrorsTotal);
register.registerMetric(httpLoginErrorsTotal);

module.exports = {
    register,
    httpRequestDurationMicroseconds,
    httpRequestsTotal,
    httpErrorsTotal,
    httpLoginErrorsTotal
};