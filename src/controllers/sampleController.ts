import { Response } from 'express';
import { Sample, ISample } from '../models/Sample.js';
import { Company } from '../models/Company.js';
import { generateSampleCode, previewNextSampleCode } from '../services/sampleCodeService.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import {
  notifySampleRegistered,
  notifyAnalysisRejected,
  notifyInvoiceIssued,
  notifyInvoiceAcknowledged,
  notifyPaymentSent,
  notifySampleDispatched,
  notifySampleReceivedByLab,
  notifyAwaitingCertificate,
  notifyResultUploaded,
  notifyOneWeekTAT,
  notifyCannotPerformTest,
  notifyResultDiscrepancy,
  notifyPaymentConfirmedByLab,
  notificationLogs,
  sendTestEmail,
} from '../services/emailService.js';

// Preview next sample code without committing
export const getPreviewCode = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { dateOfEntry, sampleNature } = req.query;
    const code = await previewNextSampleCode({
      dateOfEntry: (dateOfEntry as string) || new Date(),
      sampleNature: (sampleNature as string) || 'Food',
    });
    res.json({ sampleCode: code });
  } catch (error: any) {
    res.status(500).json({ message: 'Error previewing sample code', error: error.message });
  }
};

// Create a new sample (Section A, B, C or Historical Intake)
export const createSample = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      sampleName,
      companyName,
      companyAddress,
      sampleCode: customSampleCode,
      sampleNature,
      pictureUrl,
      attachmentUrl,
      productionDate,
      expiryDate,
      batchNo,
      nafdacNo,
      sonNo,
      isoNo,
      barcodeNo,
      otherIdentifier,
      dateOfEntry,
      analysisRequired,
      receivingLabId,
      receivingLabName,
      sentBy,
      workflowStatus,
      resultStatus,
      resultFileUrl,
      resultComments,
      processingDate,
      invoiceNo,
      invoiceAmount,
      invoiceFileUrl,
      receiptNo,
      receiptFileUrl,
      paymentConfirmedByLab,
      isDirectSample,
      isHistorical,
      suppressNotifications,
    } = req.body;

    if (!sampleName || !companyName || !sampleNature) {
      res.status(400).json({ message: 'Sample Name, Company Name, and Sample Nature are required.' });
      return;
    }

    const entryDate = dateOfEntry ? new Date(dateOfEntry) : new Date();

    // Determine final sample code (user-typed/customized or auto-generated)
    let sampleCode = (customSampleCode && typeof customSampleCode === 'string' && customSampleCode.trim()) || '';
    if (sampleCode) {
      const existingWithCode = await Sample.findOne({ sampleCode });
      if (existingWithCode) {
        if (isHistorical) {
          // If historical import and code collisions exist, make unique
          sampleCode = `${sampleCode}-${Date.now().toString().slice(-4)}`;
        } else {
          res.status(400).json({ message: `Sample Code "${sampleCode}" is already in use. Please enter a unique sample code.` });
          return;
        }
      }
    } else {
      sampleCode = await generateSampleCode({
        dateOfEntry: entryDate,
        sampleNature,
      });
    }

    // Ensure company exists in Company collection so it always appears in the companies menu
    let existingCompany = await Company.findOne({ name: companyName.trim() });
    if (!existingCompany) {
      existingCompany = await Company.create({
        name: companyName.trim(),
        address: companyAddress ? companyAddress.trim() : '',
        contactPerson: 'Lead QA Officer',
        email: `qa@${companyName.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'client'}.ng`,
        phone: '+234 800 000 0000',
      });
      console.log(`[Auto-Company]: Automatically registered "${companyName.trim()}" into Company list.`);
    } else if (companyAddress && !existingCompany.address) {
      existingCompany.address = companyAddress.trim();
      await existingCompany.save();
    }

    const finalWorkflow = workflowStatus || (isHistorical ? 'Closed' : 'Sent to Lab');
    const finalResult = resultStatus || (finalWorkflow === 'Closed' || finalWorkflow === 'Result Received' ? 'Completed' : 'Pending');

    const initialHistory: any[] = [
      {
        status: 'Registered',
        changedBy: req.user?.name || sentBy || 'Registry Officer',
        note: isHistorical ? 'Historical sample registered into portal archives' : 'Sample registered in portal',
        timestamp: entryDate,
      },
    ];

    if (finalWorkflow !== 'Registered') {
      initialHistory.push({
        status: 'Sent to Lab',
        changedBy: req.user?.name || sentBy || 'Registry Officer',
        note: `Dispatched to ${receivingLabName || 'Assigned Laboratory'}`,
        timestamp: entryDate,
      });
    }

    if (finalWorkflow === 'In Processing' || finalWorkflow === 'Result Received' || finalWorkflow === 'Closed') {
      initialHistory.push({
        status: 'In Processing',
        changedBy: receivingLabName || 'Assigned Laboratory',
        note: 'Intake confirmed and analytical testing commenced',
        timestamp: processingDate ? new Date(processingDate) : entryDate,
      });
    }

    if (finalWorkflow === 'Result Received' || finalWorkflow === 'Closed') {
      initialHistory.push({
        status: 'Result Received',
        changedBy: receivingLabName || 'Assigned Laboratory',
        note: resultComments || 'Analytical results and certificate issued',
        timestamp: processingDate ? new Date(processingDate) : entryDate,
      });
    }

    if (finalWorkflow === 'Closed') {
      initialHistory.push({
        status: 'Closed',
        changedBy: req.user?.name || sentBy || 'Registry Officer',
        note: 'Sample testing record finalized and closed',
        timestamp: new Date(),
      });
    }

    const newSample = new Sample({
      sampleName: sampleName.trim(),
      companyName: companyName.trim(),
      companyAddress: companyAddress ? companyAddress.trim() : (existingCompany?.address || ''),
      sampleCode,
      sampleNature,
      pictureUrl: pictureUrl || (sampleNature.toLowerCase().includes('food')
        ? 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80'
        : 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80'),
      attachmentUrl: attachmentUrl || null,
      productionDate: productionDate ? new Date(productionDate) : undefined,
      expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      batchNo: batchNo ? batchNo.trim() : '',
      nafdacNo: nafdacNo ? nafdacNo.trim() : '',
      sonNo: sonNo ? sonNo.trim() : '',
      isoNo: isoNo ? isoNo.trim() : '',
      barcodeNo: barcodeNo ? barcodeNo.trim() : '',
      otherIdentifier: otherIdentifier ? otherIdentifier.trim() : '',
      dateOfEntry: entryDate,
      analysisRequired: Array.isArray(analysisRequired) && analysisRequired.length > 0
        ? analysisRequired
        : [analysisRequired || 'Standard Analysis'],
      receivingLabId: receivingLabId || 'LAB_1',
      receivingLabName: receivingLabName || 'Standard Analytical Laboratories',
      processingDate: processingDate ? new Date(processingDate) : (finalWorkflow === 'Closed' ? entryDate : undefined),
      sentBy: sentBy || req.user?.name || 'Registry Officer',
      invoiceNo: invoiceNo ? String(invoiceNo).trim() : '',
      invoiceAmount: invoiceAmount ? String(invoiceAmount).trim() : '',
      invoiceFileUrl: invoiceFileUrl || null,
      invoiceAcknowledged: Boolean(invoiceNo),
      receiptNo: receiptNo ? String(receiptNo).trim() : '',
      receiptFileUrl: receiptFileUrl || null,
      paymentConfirmedByLab: paymentConfirmedByLab !== undefined ? Boolean(paymentConfirmedByLab) : Boolean(receiptNo),
      isDirectSample: Boolean(isDirectSample || isHistorical),
      isHistorical: Boolean(isHistorical || isDirectSample),
      resultStatus: finalResult,
      resultFileUrl: resultFileUrl || null,
      resultComments: resultComments || '',
      workflowStatus: finalWorkflow,
      statusHistory: initialHistory,
      comments: [],
    });

    await newSample.save();

    // Trigger emails only if not historical or notifications not suppressed
    if (!isHistorical && !suppressNotifications) {
      try {
        await notifySampleRegistered(newSample);
        await notifySampleDispatched(newSample);
      } catch (e) {
        console.error('Registration/dispatch notification error:', e);
      }
    }

    res.status(201).json({ sample: newSample, message: 'Sample created successfully' });
  } catch (error: any) {
    console.error('Create sample error:', error);
    res.status(500).json({ message: 'Error registering sample', error: error.message });
  }
};

// List samples with filters and role-based access
export const getSamples = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const {
      companyName,
      workflowStatus,
      resultStatus,
      receivingLabId,
      sampleNature,
      search,
      dateFrom,
      dateTo,
      limit = '100',
    } = req.query;

    const query: any = { isDeleted: { $ne: true } };
    const andClauses: any[] = [];

    // External Lab Isolation: If user is LAB_USER, only show samples dispatched to their lab
    if (req.user?.role === 'LAB_USER') {
      const labId = req.user.labIdentifier;
      const labName = req.user.name;
      const labOr: any[] = [];
      if (labId) labOr.push({ receivingLabId: labId });
      if (labName) {
        const clean = labName.replace(/lab(oratory)?/gi, '').trim();
        if (clean) {
          labOr.push({ receivingLabName: new RegExp(clean, 'i') });
        }
      }
      if (labOr.length > 0) {
        andClauses.push({ $or: labOr });
      }
      // "labs should only see sample sent from admin":
      andClauses.push({ workflowStatus: { $ne: 'Registered' } });
    } else if (receivingLabId) {
      query.receivingLabId = receivingLabId;
    }

    if (companyName) query.companyName = companyName;
    if (workflowStatus && req.user?.role !== 'LAB_USER') query.workflowStatus = workflowStatus;
    else if (workflowStatus && req.user?.role === 'LAB_USER') andClauses.push({ workflowStatus });
    if (resultStatus) query.resultStatus = resultStatus;
    if (sampleNature) query.sampleNature = sampleNature;

    if (dateFrom || dateTo) {
      query.dateOfEntry = {};
      if (dateFrom) query.dateOfEntry.$gte = new Date(dateFrom as string);
      if (dateTo) {
        const d = new Date(dateTo as string);
        d.setHours(23, 59, 59, 999);
        query.dateOfEntry.$lte = d;
      }
    }

    if (search) {
      const s = String(search).trim();
      const regex = new RegExp(s, 'i');
      andClauses.push({
        $or: [
          { sampleCode: regex },
          { sampleName: regex },
          { companyName: regex },
          { batchNo: regex },
          { nafdacNo: regex },
          { invoiceNo: regex },
          { receiptNo: regex },
        ],
      });
    }

    if (andClauses.length > 0) {
      query.$and = andClauses;
    }

    const samples = await Sample.find(query).sort({ createdAt: -1 }).limit(parseInt(limit as string, 10));

    res.json({ count: samples.length, samples });
  } catch (error: any) {
    console.error('Get samples error:', error);
    res.status(500).json({ message: 'Error fetching samples', error: error.message });
  }
};

// Get single sample
export const getSampleById = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const sample = await Sample.findById(id);
    if (!sample) {
      res.status(404).json({ message: 'Sample not found' });
      return;
    }

    // Role check for external lab
    if (req.user?.role === 'LAB_USER') {
      const labId = req.user.labIdentifier;
      const labName = req.user.name || '';
      const matchesLab =
        (labId && sample.receivingLabId === labId) ||
        (labName && sample.receivingLabName && sample.receivingLabName.toLowerCase().includes(labName.toLowerCase()));

      if (!matchesLab || sample.workflowStatus === 'Registered') {
        res.status(403).json({ message: 'Access denied to this external lab record' });
        return;
      }
    }

    res.json({ sample });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching sample details', error: error.message });
  }
};

// Update workflow, finance, or lab actions with automatic email triggers
export const updateSample = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const sample = await Sample.findById(id);
    if (!sample) {
      res.status(404).json({ message: 'Sample not found' });
      return;
    }

    const {
      workflowStatus,
      resultStatus,
      processingDate,
      invoiceNo,
      invoiceAmount,
      invoiceFileUrl,
      invoiceAcknowledged,
      receiptNo,
      receiptFileUrl,
      paymentConfirmedByLab,
      attachmentUrl,
      resultFileUrl,
      resultComments,
      statusNote,
      rejectionReason,
    } = req.body;

    const previousStatus = sample.workflowStatus;
    const previousResultStatus = sample.resultStatus;
    const previousInvoiceNo = sample.invoiceNo;
    const previousReceiptNo = sample.receiptNo;
    const previousInvoiceAck = sample.invoiceAcknowledged;
    const previousProcessingDate = sample.processingDate;

    // Strict Role Validation for Workflow Actions
    const isLabUser = req.user?.role === 'LAB_USER';
    const isSuperAdmin = req.user?.role === 'SUPER_ADMIN';
    const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'REGISTRY' || isSuperAdmin;
    const isFinance = req.user?.role === 'ACCOUNTANT' || req.user?.role === 'FINANCE' || isSuperAdmin;

    // 1. Lab Intake: Only assigned laboratory can accept intake and set processingDate
    if ((processingDate || (workflowStatus === 'In Processing' && previousStatus !== 'In Processing')) && !isLabUser) {
      res.status(403).json({ message: 'Only the assigned partner laboratory can accept physical sample intake and start analysis.' });
      return;
    }

    // 2. Lab Invoicing: Only laboratory can submit laboratory invoices
    if ((invoiceNo !== undefined && previousInvoiceNo === undefined) && !isLabUser) {
      res.status(403).json({ message: 'Only the assigned partner laboratory can submit laboratory invoices.' });
      return;
    }

    // 3. Payment Confirmation: Only laboratory can confirm receipt of payment
    if (paymentConfirmedByLab === true && !isLabUser) {
      res.status(403).json({ message: 'Only the assigned partner laboratory can confirm receipt of payment funds.' });
      return;
    }

    // 4. CoA Issuance: Only laboratory can issue Certificate of Analysis
    if ((resultFileUrl && !sample.resultFileUrl) && !isLabUser) {
      res.status(403).json({ message: 'Only the partner laboratory can issue Certificates of Analysis.' });
      return;
    }

    // 5. Sample Dispatch: Only Registry / Admin can dispatch sample to lab
    if (workflowStatus === 'Sent to Lab' && isLabUser) {
      res.status(403).json({ message: 'Only HDI Registry or Admin can dispatch samples.' });
      return;
    }

    // 6. Payment Remittance: Only Registry / Finance can submit client payment receipt
    if ((receiptNo !== undefined && !previousReceiptNo) && isLabUser) {
      res.status(403).json({ message: 'Only HDI Registry or Finance can remit and upload payment receipts.' });
      return;
    }

    // 7. Rejection: Admin can only reject while sample is Registered. Once sent to lab, intake rejection is performed by the laboratory.
    if (workflowStatus === 'Rejected' && !isLabUser && previousStatus !== 'Registered') {
      res.status(403).json({ message: 'Once a sample has been sent to the laboratory, intake rejection can only be performed by the assigned laboratory.' });
      return;
    }


    // VALIDATION: Cannot close/complete a sample without uploading a Certificate of Analysis
    if (
      (workflowStatus === 'Closed' || resultStatus === 'Completed') &&
      !resultFileUrl &&
      !sample.resultFileUrl
    ) {
      res.status(400).json({
        message: 'A Certificate of Analysis (CoA) document must be uploaded before marking this sample as Completed or Closed. Please upload the certificate file first.',
      });
      return;
    }
    // Apply updates
    if (workflowStatus && workflowStatus !== sample.workflowStatus) {
      sample.workflowStatus = workflowStatus;
      if (workflowStatus === 'Rejected') {
        const reasonText = (rejectionReason || statusNote || 'Sample rejected at intake inspection').trim();
        sample.resultStatus = 'Rejected';
        sample.rejectionReason = reasonText;
        sample.rejectedAt = new Date();
        sample.rejectedBy = req.user?.name || (isLabUser ? 'Laboratory Partner' : 'HDI Administration');
      }
      sample.statusHistory.push({
        status: workflowStatus,
        changedBy: req.user?.name || 'System User',
        note: statusNote || rejectionReason || `Status changed to ${workflowStatus}`,
        timestamp: new Date(),
      });
    } else if (statusNote) {
      sample.statusHistory.push({
        status: sample.workflowStatus,
        changedBy: req.user?.name || 'System User',
        note: statusNote,
        timestamp: new Date(),
      });
    }

    if (workflowStatus === 'Rejected' && !sample.rejectionReason) {
      sample.rejectionReason = (rejectionReason || statusNote || 'Sample rejected').trim();
      sample.rejectedAt = new Date();
      sample.rejectedBy = req.user?.name || (isLabUser ? 'Laboratory Partner' : 'HDI Administration');
    }

    if (resultStatus) sample.resultStatus = resultStatus;
    if (processingDate) sample.processingDate = new Date(processingDate);
    if (invoiceNo !== undefined) sample.invoiceNo = invoiceNo;
    if (invoiceAmount !== undefined) sample.invoiceAmount = invoiceAmount;
    if (invoiceFileUrl !== undefined) sample.invoiceFileUrl = invoiceFileUrl;
    if (invoiceAcknowledged !== undefined) sample.invoiceAcknowledged = invoiceAcknowledged;
    if (receiptNo !== undefined) sample.receiptNo = receiptNo;
    if (receiptFileUrl !== undefined) sample.receiptFileUrl = receiptFileUrl;
    if (paymentConfirmedByLab !== undefined) sample.paymentConfirmedByLab = paymentConfirmedByLab;
    if (attachmentUrl !== undefined) sample.attachmentUrl = attachmentUrl;
    if (resultFileUrl !== undefined) sample.resultFileUrl = resultFileUrl;
    if (resultComments !== undefined) sample.resultComments = resultComments;

    // Calculate Turnaround Time (TAT) if completed
    if (resultStatus === 'Completed' || workflowStatus === 'Result Received' || workflowStatus === 'Closed') {
      const start = sample.processingDate || sample.dateOfEntry;
      const end = new Date();
      const diffMs = end.getTime() - new Date(start).getTime();
      const diffDays = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
      sample.turnaroundTimeDays = diffDays;
    }

    await sample.save();

    // ==========================================
    // NOTIFICATION TRIGGER DISPATCHING
    // ==========================================

    // Trigger 2: Analysis Rejected (pre-invoice or during review)
    if (resultStatus === 'Rejected' && previousResultStatus !== 'Rejected') {
      await notifyAnalysisRejected(sample, statusNote || resultComments);
    }

    // Trigger 3: Analysis Confirmed & Invoice Issued (Invoice No. populated by Lab)
    if (invoiceNo && invoiceNo !== previousInvoiceNo) {
      await notifyInvoiceIssued(sample, invoiceNo);
    }

    // Trigger 4: Invoice Acknowledged (Registry marks invoice as received)
    if (invoiceAcknowledged === true && previousInvoiceAck !== true) {
      await notifyInvoiceAcknowledged(sample);
    }

    // Trigger 5: Payment Sent (Receipt No./payment field updated)
    if (receiptNo && receiptNo !== previousReceiptNo) {
      await notifyPaymentSent(sample, receiptNo);
    }

    // Trigger 14: Lab Confirmed Payment
    if (paymentConfirmedByLab === true && !req.body._prevPaymentConfirmed) {
      try {
        await notifyPaymentConfirmedByLab(sample, req.user?.name || 'Laboratory Desk');
      } catch (e) { console.error('Payment confirmed notification error:', e); }
    }

        // Trigger 6: Sample Dispatched (status -> Sent to Lab)
    if (workflowStatus === 'Sent to Lab' && previousStatus !== 'Sent to Lab') {
      await notifySampleDispatched(sample);
    }

    // Trigger 7: Sample Received by Lab (Lab confirms receipt / Processing Date set)
    if (processingDate && (!previousProcessingDate || workflowStatus === 'In Processing')) {
      await notifySampleReceivedByLab(sample, new Date(processingDate));
    }

    // Trigger 8: Awaiting Certificate (Processing in progress, awaiting result)
    if (
      (workflowStatus === 'In Processing' && previousStatus !== 'In Processing' && !processingDate) ||
      (sample.workflowStatus === 'In Processing' && req.body.notifyAwaitingCert)
    ) {
      await notifyAwaitingCertificate(sample);
    }

    // Trigger 10: Result/Certificate Uploaded (Result status -> Completed)
    if (
      (resultStatus === 'Completed' && previousResultStatus !== 'Completed') ||
      (resultFileUrl && resultStatus === 'Completed')
    ) {
      await notifyResultUploaded(sample, resultStatus || 'Completed');
    }

    // Trigger 2: Sample / Analysis Rejected
    if (workflowStatus === 'Rejected' && previousStatus !== 'Rejected') {
      await notifyAnalysisRejected(sample, sample.rejectionReason || statusNote || 'Sample rejected at intake inspection');
    }

    res.json({ sample, message: 'Sample updated successfully' });
  } catch (error: any) {
    console.error('Update sample error:', error);
    res.status(500).json({ message: 'Error updating sample', error: error.message });
  }
};

// Add threaded comment / chat message
export const addComment = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { message, attachmentUrl } = req.body;

    if (!message || !message.trim()) {
      res.status(400).json({ message: 'Comment message cannot be empty' });
      return;
    }

    const sample = await Sample.findById(id);
    if (!sample) {
      res.status(404).json({ message: 'Sample not found' });
      return;
    }

    const newComment = {
      senderId: req.user?.id as any,
      senderName: req.user?.name || 'User',
      senderRole: req.user?.role || 'REGISTRY',
      message: message.trim(),
      attachmentUrl: attachmentUrl || null,
      createdAt: new Date(),
    };

    sample.comments.push(newComment as any);
    await sample.save();

    res.status(201).json({ comments: sample.comments, message: 'Comment posted' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error adding comment', error: error.message });
  }
};

// Companies controller (List and Add New)
export const getCompanies = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // Sync any sample company names into the Company collection if missing
    const sampleCompanies = await Sample.distinct('companyName');
    for (const name of sampleCompanies) {
      if (name && typeof name === 'string' && name.trim()) {
        const found = await Company.findOne({ name: name.trim() });
        if (!found) {
          await Company.create({
            name: name.trim(),
            contactPerson: 'Lead QA Officer',
            email: `qa@${name.trim().toLowerCase().replace(/[^a-z0-9]/g, '') || 'client'}.ng`,
            phone: '+234 800 000 0000',
          });
        }
      }
    }

    const companies = await Company.find().sort({ name: 1 });
    res.json({ companies });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching companies', error: error.message });
  }
};

export const createCompany = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { name, address, contactPerson, email, phone } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ message: 'Company name is required' });
      return;
    }

    const existing = await Company.findOne({ name: name.trim() });
    if (existing) {
      if (address && !existing.address) {
        existing.address = address.trim();
        await existing.save();
      }
      res.status(200).json({ company: existing, message: 'Company already exists' });
      return;
    }

    const company = new Company({
      name: name.trim(),
      address: address ? address.trim() : '',
      contactPerson: contactPerson || '',
      email: email || '',
      phone: phone || '',
    });
    await company.save();

    res.status(201).json({ company, message: 'Company created successfully' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error creating company', error: error.message });
  }
};

// Return recent notification log entries
export const getNotificationsFeed = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    res.json({ logs: notificationLogs });
  } catch (error: any) {
    res.status(500).json({ message: 'Error fetching notifications', error: error.message });
  }
};

// 1. Lab sends 1-Week TAT Notice to Admin (after payment made/confirmed)
export const sendOneWeekTatNotice = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const sample = await Sample.findById(id);
    if (!sample) {
      res.status(404).json({ message: 'Sample not found' });
      return;
    }

    sample.tatNoticeSentAt = new Date();
    sample.statusHistory.push({
      status: sample.workflowStatus,
      changedBy: req.user?.name || 'Laboratory Desk',
      note: 'Lab notified Admin: Testing underway; analysis results expected within 1 week.',
      timestamp: new Date(),
    });
    await sample.save();

    await notifyOneWeekTAT(sample, req.user?.name || 'Laboratory Desk');
    res.json({ sample, message: '1-Week TAT Notice sent to Admin and email dispatched.' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error sending 1-week TAT notice', error: error.message });
  }
};

// 2. Lab cannot perform required test after intake
export const notifyCannotTest = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      res.status(400).json({ message: 'A reason for being unable to perform test is required' });
      return;
    }

    const sample = await Sample.findById(id);
    if (!sample) {
      res.status(404).json({ message: 'Sample not found' });
      return;
    }

    sample.workflowStatus = 'Rejected';
    sample.resultStatus = 'Rejected';
    sample.cannotPerformTestReason = reason.trim();
    sample.statusHistory.push({
      status: 'Rejected',
      changedBy: req.user?.name || 'Laboratory Desk',
      note: `Lab cannot perform test: ${reason.trim()}`,
      timestamp: new Date(),
    });
    await sample.save();

    await notifyCannotPerformTest(sample, reason.trim(), req.user?.name || 'Laboratory Desk');
    res.json({ sample, message: 'Admin notified that lab cannot perform test. Status updated.' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error reporting inability to test', error: error.message });
  }
};

// 3. Admin reports result discrepancy or rejects certificate
export const reportResultDiscrepancy = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { note, attachmentUrl } = req.body;
    if (!note || !note.trim()) {
      res.status(400).json({ message: 'A discrepancy note / rejection explanation is required' });
      return;
    }

    const sample = await Sample.findById(id);
    if (!sample) {
      res.status(404).json({ message: 'Sample not found' });
      return;
    }

    sample.resultStatus = 'Rejected';
    sample.resultDiscrepancyNote = note.trim();
    if (attachmentUrl) {
      sample.resultDiscrepancyFileUrl = attachmentUrl;
    }
    sample.statusHistory.push({
      status: sample.workflowStatus,
      changedBy: req.user?.name || 'Quality Assurance / Registry',
      note: `Certificate / Result Issue Reported by Admin: ${note.trim()}${attachmentUrl ? ' (Markup file attached)' : ''}`,
      timestamp: new Date(),
    });
    await sample.save();

    await notifyResultDiscrepancy(sample, note.trim(), attachmentUrl, req.user?.name || 'Quality Assurance / Registry');
    res.json({ sample, message: 'Result issue / Certificate rejection sent to Laboratory.' });
  } catch (error: any) {
    res.status(500).json({ message: 'Error reporting result discrepancy', error: error.message });
  }
};

// ── Deleted Bin Endpoints (Strictly Super Admin Only) ──

// 1. List all deleted samples in Deleted Bin
export const getDeletedSamples = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Access denied. Only Super Admin can access the Deleted Bin.' });
      return;
    }

    const samples = await Sample.find({ isDeleted: true }).sort({ deletedAt: -1 });
    res.json({ samples });
  } catch (error: any) {
    console.error('Error fetching deleted samples:', error);
    res.status(500).json({ message: 'Error fetching deleted samples', error: error.message });
  }
};

// 2. Soft-delete a sample (moves to Deleted Bin)
export const softDeleteSample = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Access denied. Only Super Admin can delete samples.' });
      return;
    }

    const { id } = req.params;
    const { reason } = req.body;

    const sample = await Sample.findById(id);
    if (!sample) {
      res.status(404).json({ message: 'Sample not found' });
      return;
    }

    sample.isDeleted = true;
    sample.deletedAt = new Date();
    sample.deletedBy = req.user.name || req.user.email || 'Super Administrator';
    sample.deletionReason = reason || 'Moved to Deleted Bin by Super Administrator';
    sample.statusHistory.push({
      status: sample.workflowStatus,
      changedBy: req.user.name || 'Super Admin',
      note: `Moved to Deleted Bin: ${sample.deletionReason}`,
      timestamp: new Date(),
    });
    await sample.save();

    console.log(`[Deleted Bin]: Sample ${sample.sampleCode} moved to Deleted Bin by ${req.user.email}`);
    res.json({ message: `Sample ${sample.sampleCode} moved to Deleted Bin.`, sample });
  } catch (error: any) {
    console.error('Error soft-deleting sample:', error);
    res.status(500).json({ message: 'Error deleting sample', error: error.message });
  }
};

// 3. Restore a sample from the Deleted Bin
export const restoreSample = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Access denied. Only Super Admin can restore samples.' });
      return;
    }

    const { id } = req.params;
    const sample = await Sample.findById(id);
    if (!sample) {
      res.status(404).json({ message: 'Sample not found' });
      return;
    }

    sample.isDeleted = false;
    sample.deletedAt = null;
    sample.deletedBy = null;
    sample.deletionReason = null;
    sample.statusHistory.push({
      status: sample.workflowStatus,
      changedBy: req.user.name || 'Super Admin',
      note: 'Sample restored from Deleted Bin back to active registry.',
      timestamp: new Date(),
    });
    await sample.save();

    console.log(`[Deleted Bin]: Sample ${sample.sampleCode} restored by ${req.user.email}`);
    res.json({ message: `Sample ${sample.sampleCode} restored successfully.`, sample });
  } catch (error: any) {
    console.error('Error restoring sample:', error);
    res.status(500).json({ message: 'Error restoring sample', error: error.message });
  }
};

// 4. Permanently purge a sample from database
export const permanentlyDeleteSample = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (req.user?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ message: 'Access denied. Only Super Admin can permanently purge samples.' });
      return;
    }

    const { id } = req.params;
    const sample = await Sample.findByIdAndDelete(id);
    if (!sample) {
      res.status(404).json({ message: 'Sample not found' });
      return;
    }

    console.log(`[Permanent Deletion]: Sample ${sample.sampleCode} permanently purged by ${req.user.email}`);
    res.json({ message: `Sample ${sample.sampleCode} permanently deleted.` });
  } catch (error: any) {
    console.error('Error permanently deleting sample:', error);
    res.status(500).json({ message: 'Error permanently deleting sample', error: error.message });
  }
};


// Bulk Import Previous/Historical Samples (from CSV or Excel)
export const bulkImportSamples = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { samples, suppressNotifications = true } = req.body;
    if (!Array.isArray(samples) || samples.length === 0) {
      res.status(400).json({ message: 'A non-empty list of samples is required for bulk import.' });
      return;
    }

    const importedList: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < samples.length; i++) {
      const item = samples[i];
      const sName = item.sampleName ? String(item.sampleName).trim() : '';
      const cName = item.companyName ? String(item.companyName).trim() : '';
      if (!sName || !cName) {
        errors.push(`Row #${i + 1} skipped: Sample Name and Company Name are required.`);
        continue;
      }

      const entryDate = item.dateOfEntry ? new Date(item.dateOfEntry) : new Date();
      const sNature = item.sampleNature ? String(item.sampleNature).trim() : 'Food / Beverage';

      // Determine sampleCode
      let sampleCode = item.sampleCode ? String(item.sampleCode).trim() : '';
      if (!sampleCode) {
        sampleCode = await generateSampleCode({ dateOfEntry: entryDate, sampleNature: sNature });
      } else {
        const existing = await Sample.findOne({ sampleCode });
        if (existing) {
          sampleCode = `${sampleCode}-${Date.now().toString().slice(-4)}`;
        }
      }

      // Auto-create or link company
      let existingCompany = await Company.findOne({ name: cName });
      if (!existingCompany) {
        existingCompany = await Company.create({
          name: cName,
          address: item.companyAddress ? String(item.companyAddress).trim() : '',
          contactPerson: 'Lead QA Officer',
          email: `qa@${cName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'client'}.ng`,
          phone: '+234 800 000 0000',
        });
      } else if (item.companyAddress && !existingCompany.address) {
        existingCompany.address = String(item.companyAddress).trim();
        await existingCompany.save();
      }

      const finalWorkflowStatus = item.workflowStatus || 'Closed';
      const finalResultStatus = item.resultStatus || (finalWorkflowStatus === 'Closed' || finalWorkflowStatus === 'Result Received' ? 'Completed' : 'Pending');

      const history: any[] = [
        {
          status: 'Registered',
          changedBy: req.user?.name || item.sentBy || 'Registry Officer',
          note: 'Historical sample batch imported into portal archives',
          timestamp: entryDate,
        },
      ];

      if (finalWorkflowStatus !== 'Registered') {
        history.push({
          status: 'Sent to Lab',
          changedBy: req.user?.name || item.sentBy || 'Registry Officer',
          note: `Dispatched to ${item.receivingLabName || 'Assigned Laboratory'}`,
          timestamp: entryDate,
        });
      }

      if (finalWorkflowStatus === 'In Processing' || finalWorkflowStatus === 'Result Received' || finalWorkflowStatus === 'Closed') {
        history.push({
          status: 'In Processing',
          changedBy: item.receivingLabName || 'Assigned Laboratory',
          note: 'Sample received and tested',
          timestamp: item.processingDate ? new Date(item.processingDate) : entryDate,
        });
      }

      if (finalWorkflowStatus === 'Result Received' || finalWorkflowStatus === 'Closed') {
        history.push({
          status: 'Result Received',
          changedBy: item.receivingLabName || 'Assigned Laboratory',
          note: item.resultComments || 'Historical analytical results and certificate recorded',
          timestamp: item.processingDate ? new Date(item.processingDate) : entryDate,
        });
      }

      if (finalWorkflowStatus === 'Closed') {
        history.push({
          status: 'Closed',
          changedBy: req.user?.name || item.sentBy || 'Registry Officer',
          note: 'Historical record closed and archived',
          timestamp: new Date(),
        });
      }

      let parsedAnalysis: string[] = ['Standard Analysis'];
      if (Array.isArray(item.analysisRequired) && item.analysisRequired.length > 0) {
        parsedAnalysis = item.analysisRequired;
      } else if (typeof item.analysisRequired === 'string' && item.analysisRequired.trim()) {
        parsedAnalysis = item.analysisRequired.split(',').map((s: string) => s.trim()).filter(Boolean);
      }

      const doc = new Sample({
        sampleName: sName,
        companyName: cName,
        companyAddress: item.companyAddress ? String(item.companyAddress).trim() : (existingCompany.address || ''),
        sampleCode,
        sampleNature: sNature,
        pictureUrl: item.pictureUrl || (sNature.toLowerCase().includes('food')
          ? 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=600&q=80'
          : 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80'),
        attachmentUrl: item.attachmentUrl || null,
        productionDate: item.productionDate ? new Date(item.productionDate) : undefined,
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
        batchNo: item.batchNo ? String(item.batchNo).trim() : '',
        nafdacNo: item.nafdacNo ? String(item.nafdacNo).trim() : '',
        sonNo: item.sonNo ? String(item.sonNo).trim() : '',
        isoNo: item.isoNo ? String(item.isoNo).trim() : '',
        barcodeNo: item.barcodeNo ? String(item.barcodeNo).trim() : '',
        otherIdentifier: item.otherIdentifier ? String(item.otherIdentifier).trim() : '',
        dateOfEntry: entryDate,
        analysisRequired: parsedAnalysis,
        receivingLabId: item.receivingLabId || 'LAB_1',
        receivingLabName: item.receivingLabName || 'Standard Analytical Laboratories',
        processingDate: item.processingDate ? new Date(item.processingDate) : (finalWorkflowStatus === 'Closed' ? entryDate : undefined),
        sentBy: item.sentBy || req.user?.name || 'Registry Officer',
        invoiceNo: item.invoiceNo ? String(item.invoiceNo).trim() : '',
        invoiceAmount: item.invoiceAmount ? String(item.invoiceAmount).trim() : '',
        invoiceFileUrl: item.invoiceFileUrl || null,
        invoiceAcknowledged: Boolean(item.invoiceNo),
        receiptNo: item.receiptNo ? String(item.receiptNo).trim() : '',
        receiptFileUrl: item.receiptFileUrl || null,
        paymentConfirmedByLab: Boolean(item.receiptNo),
        isDirectSample: true,
        isHistorical: true,
        resultStatus: finalResultStatus,
        resultFileUrl: item.resultFileUrl || null,
        resultComments: item.resultComments || 'Historical analysis record imported into dashboard.',
        workflowStatus: finalWorkflowStatus,
        statusHistory: history,
        comments: [],
      });

      await doc.save();
      importedList.push(doc);
    }

    res.status(201).json({
      message: `Successfully imported ${importedList.length} previous samples`,
      count: importedList.length,
      samples: importedList,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Bulk import error:', error);
    res.status(500).json({ message: 'Error during bulk import of samples', error: error.message });
  }
};

// Dispatch a live test email verification
export const triggerTestEmail = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { toEmail } = req.body;
    const result = await sendTestEmail(toEmail || 'info@halalcert.com.ng');
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to send test email', error: error.message });
  }
};
