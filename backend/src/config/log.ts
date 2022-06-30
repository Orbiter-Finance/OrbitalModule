import { Configuration } from 'log4js'
import path from 'path'

const logsDir = 'logs'
const defaultC = { appenders: ['access', 'console'], level: 'trace' }
const configure: Configuration = {
  appenders: {
    access: {
      type: 'dateFile',
      filename: path.resolve(logsDir, 'access.log'),
      pattern: '.dd',
      mode: 0o644
    },
    error: {
      type: 'dateFile',
      filename: path.resolve(logsDir, 'error.log'),
      pattern: '.dd',
      mode: 0o644
    },
    console: { type: 'console' },
  },
  categories: {
    default: defaultC,
    access: defaultC,
    error: { appenders: ['error', 'console'], level: 'trace' },
  },
}

export { configure }
