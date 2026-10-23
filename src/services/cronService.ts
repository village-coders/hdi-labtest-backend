import cron from 'node-cron';
import { Sample } from '../models/Sample.js';
import { notifyPendingResultReminder } from './resendService.js';

export const triggerPendingResultReminders = async (): Promise<number> => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Find samples with processingDate older than 7 days, whose result is not completed
    const pendingSamples = await Sample.find({
      processingDate: { $lte: sevenDaysAgo },
      resultStatus: { $in: ['Pending', 'In Progress'] },
      workflowStatus: { $ne: 'Closed' },
      $or: [{ reminderSentAt: null }, { reminderSentAt: { $lte: sevenDaysAgo } }],
    });

    console.log(`[Cron Reminder Check]: Found ${pendingSamples.length} samples requiring 7-day reminders.`);

    for (const sample of pendingSamples) {
      await notifyPendingResultReminder(sample);
      sample.reminderSentAt = new Date();
      await sample.save();
    }

    return pendingSamples.length;
  } catch (error) {
    console.error('[Cron Reminder Error]:', error);
    return 0;
  }
};

export const initCronJobs = (): void => {
  // Run every morning at 08:00 AM
  cron.schedule('0 8 * * *', async () => {
    console.log('[Cron Scheduler]: Running daily 08:00 AM 7-Day Pending Result Reminder Scan...');
    await triggerPendingResultReminders();
  });

  console.log('[Cron Service]: Initialized automated daily reminders schedule (08:00 AM).');
};
