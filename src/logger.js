const pino = require('pino');
const config = require('./config');

// In serverless/prod, devDependencies like pino-pretty may not be installed.
// Only enable pretty transport when not in production AND the module is resolvable.
let transport;
if (config.env !== 'production') {
  try {
    require.resolve('pino-pretty');
    transport = { target: 'pino-pretty', options: { colorize: true } };
  } catch (_e) {
    transport = undefined; // fall back to JSON logs
  }
}

const logger = pino({
  level: config.env === 'production' ? 'info' : 'debug',
  transport,
});

module.exports = logger;

