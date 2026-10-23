import { Router } from 'express';
import { login, getCurrentUser, listUsers, createUser, switchLab, resetPassword, revertToSuperAdmin } from '../controllers/authController.js';
import {
  getPreviewCode,
  createSample,
  getSamples,
  getSampleById,
  updateSample,
  addComment,
  getCompanies,
  createCompany,
  getNotificationsFeed,
  sendOneWeekTatNotice,
  notifyCannotTest,
  reportResultDiscrepancy,
  getDeletedSamples,
  softDeleteSample,
  restoreSample,
  permanentlyDeleteSample,
} from '../controllers/sampleController.js';
import { getDashboardStats, exportExcelReport, exportPdfReport } from '../controllers/reportController.js';
import { getCommunications, createCommunication, updateCommunicationStatus } from '../controllers/communicationController.js';
import { authenticateToken, requireSuperAdmin } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/uploadMiddleware.js';
import { triggerPendingResultReminders } from '../services/cronService.js';

const router = Router();

// Auth Routes
router.post('/auth/login', login);
router.post('/auth/reset-password', resetPassword);
router.get('/auth/me', authenticateToken, getCurrentUser);
router.get('/auth/users', authenticateToken, listUsers);
router.post('/auth/users', authenticateToken, requireSuperAdmin, createUser);
router.post('/auth/switch-lab', authenticateToken, requireSuperAdmin, switchLab);
router.post('/auth/revert-superadmin', authenticateToken, revertToSuperAdmin);

// Sample Routes
router.get('/samples/preview-code', authenticateToken, getPreviewCode);
router.get('/samples/deleted-bin', authenticateToken, requireSuperAdmin, getDeletedSamples);
router.get('/samples', authenticateToken, getSamples);
router.post('/samples', authenticateToken, createSample);
router.get('/samples/:id', authenticateToken, getSampleById);
router.patch('/samples/:id', authenticateToken, updateSample);
router.delete('/samples/:id', authenticateToken, requireSuperAdmin, softDeleteSample);
router.post('/samples/:id/restore', authenticateToken, requireSuperAdmin, restoreSample);
router.delete('/samples/:id/permanent', authenticateToken, requireSuperAdmin, permanentlyDeleteSample);
router.post('/samples/:id/comments', authenticateToken, addComment);
router.post('/samples/:id/notify-tat-week', authenticateToken, sendOneWeekTatNotice);
router.post('/samples/:id/cannot-test', authenticateToken, notifyCannotTest);
router.post('/samples/:id/report-discrepancy', authenticateToken, reportResultDiscrepancy);

// Company Routes
router.get('/companies', authenticateToken, getCompanies);
router.post('/companies', authenticateToken, createCompany);

// Communications / Tickets / Chats (Admin <-> Labs)
router.get('/communications', authenticateToken, getCommunications);
router.post('/communications', authenticateToken, createCommunication);
router.patch('/communications/:id/status', authenticateToken, updateCommunicationStatus);

// Notifications Feed
router.get('/notifications', authenticateToken, getNotificationsFeed);

// Reports & Statistics
router.get('/reports/dashboard-stats', authenticateToken, getDashboardStats);
router.get('/reports/export-excel', authenticateToken, exportExcelReport);
router.get('/reports/export-pdf', authenticateToken, exportPdfReport);

// Manual Trigger for Reminder #9 (useful for verification/testing)
router.post('/cron/trigger-reminders', authenticateToken, async (_req, res) => {
  const count = await triggerPendingResultReminders();
  res.json({ message: `Triggered pending reminders check. Sent ${count} reminders.` });
});

// File Upload endpoint
router.post('/upload', authenticateToken, upload.single('file'), (req, res): void => {
  if (!req.file) {
    res.status(400).json({ message: 'No file uploaded' });
    return;
  }
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ fileUrl, originalName: req.file.originalname, size: req.file.size });
});

export default router;
