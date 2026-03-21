const cron = require('node-cron');
import { ChatService } from './chatService';
import { log } from '../utils/logger';

export class CronService {
  private static instance: CronService;
  private jobs: Map<string, any> = new Map();

  private constructor() {}

  static getInstance(): CronService {
    if (!CronService.instance) {
      CronService.instance = new CronService();
    }
    return CronService.instance;
  }

  // Initialize all cron jobs
  init() {
    log.info('🕐 Initializing cron jobs...');
    
    // Chat cleanup job - runs every day at 2:00 AM
    this.scheduleChatCleanup();
    
    // Add more cron jobs here as needed
    // this.scheduleDatabaseBackup();
    // this.scheduleAnalytics();
    
    log.info('✅ Cron jobs initialized successfully');
  }

  // Schedule chat cleanup job
  private scheduleChatCleanup() {
    const jobName = 'chat-cleanup';
    
    // Run every day at 2:00 AM
    const task = cron.schedule('0 2 * * *', async () => {
      try {
        log.info('🧹 Starting scheduled chat cleanup...');
        const deletedCount = await ChatService.cleanupOldMessages();
        
        if (deletedCount > 0) {
          log.info(`✅ Chat cleanup completed: ${deletedCount} messages deleted`);
        } else {
          log.debug('✅ Chat cleanup completed: No old messages to delete');
        }
      } catch (error) {
        log.error('❌ Chat cleanup failed:', error);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.jobs.set(jobName, task);
    log.info(`📅 Scheduled ${jobName}: Daily at 2:00 AM UTC`);
  }

  // Manual trigger for chat cleanup (for testing)
  async triggerChatCleanup() {
    try {
      log.info('🧹 Manually triggering chat cleanup...');
      const deletedCount = await ChatService.cleanupOldMessages();
      log.info(`✅ Manual chat cleanup completed: ${deletedCount} messages deleted`);
      return deletedCount;
    } catch (error) {
      log.error('❌ Manual chat cleanup failed:', error);
      throw error;
    }
  }

  // Get status of all cron jobs
  getJobStatus() {
    const status: Record<string, any> = {};
    
    this.jobs.forEach((job, name) => {
      status[name] = {
        running: job.getStatus() === 'scheduled',
        nextRun: job.nextDate().toISOString(),
        lastRun: job.lastDate()?.toISOString() || null
      };
    });
    
    return status;
  }

  // Stop all cron jobs
  stopAll() {
    log.info('🛑 Stopping all cron jobs...');
    this.jobs.forEach((job, name) => {
      job.stop();
      log.info(`⏹️  Stopped job: ${name}`);
    });
  }

  // Stop a specific job
  stopJob(jobName: string) {
    const job = this.jobs.get(jobName);
    if (job) {
      job.stop();
      log.info(`⏹️  Stopped job: ${jobName}`);
    } else {
      log.warn(`⚠️  Job not found: ${jobName}`);
    }
  }

  // Start a specific job
  startJob(jobName: string ) {
    const job = this.jobs.get(jobName);
    if (job) {
      job.start();
      log.info(`▶️  Started job: ${jobName}`);
    } else {
      log.warn(`⚠️  Job not found: ${jobName}`);
    }
  }
}

export default CronService.getInstance();
