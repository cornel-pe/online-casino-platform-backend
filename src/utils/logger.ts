import fs from 'fs';
import path from 'path';
import log, { config, tag } from '@slackgram/logger';

const logsDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const minLevel = (process.env.MB_LOG_LEVEL || (env === 'development' ? 'debug' : 'info')) as
  | 'debug'
  | 'info'
  | 'warn'
  | 'error';

config({
  env,
  minLevel,
  debug: env === 'development',
  colors: env === 'development',
  file: {
    enabled: true,
    filePath: path.join(logsDir, 'app.log'),
    rotation: {
      strategy: '1D',
      maxFiles: parseInt(process.env.MB_LOG_MAX_FILES || '7', 10) || 7,
    },
    flushIntervalMs: parseInt(process.env.MB_LOG_FLUSH_MS || '2000', 10) || 2000,
    prettyJson: env === 'development',
  },
  hooks: {
    minLevel: (process.env.MB_LOG_HOOK_LEVEL || 'warn') as any,
    slack: {
      enabled: !!process.env.SLACK_WEBHOOK_URL,
      webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
    },
    telegram: {
      enabled: !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
      botToken: process.env.TELEGRAM_BOT_TOKEN || '',
      chatId: process.env.TELEGRAM_CHAT_ID || '',
    },
    discord: {
      enabled: !!process.env.DISCORD_WEBHOOK_URL,
      webhookUrl: process.env.DISCORD_WEBHOOK_URL || '',
    },
  },
});

export const httpLog = tag('HTTP');

export function createMorganStream() {
  return {
    write: (msg: string) => {
      const line = msg.trim();
      if (!line) return;
      httpLog.info(line);
    },
  };
}

export { log };

