import nodemailer from 'nodemailer';
import fs from 'fs';
import path from 'path';

export interface EmailLogEntry {
  id: string;
  triggerNumber: number;
  triggerName: string;
  recipient: string;
  subject: string;
  message: string;
  sampleCode: string;
  status: 'SENT' | 'SIMULATED' | 'FAILED';
  error?: string;
  timestamp: Date;
}

// Global in-memory log buffer for dashboard visibility
export const notificationLogs: EmailLogEntry[] = [];

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getGraphAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 60000) {
    return cachedToken;
  }

  const tenantId = process.env.AZURE_TENANT_ID || 'halalcert.com.ng';
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Azure client credentials (AZURE_CLIENT_ID / AZURE_CLIENT_SECRET) are missing');
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);
  params.append('scope', 'https://graph.microsoft.com/.default');

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = (await res.json()) as any;
  if (!res.ok) {
    throw new Error(`Failed to acquire Graph token: ${data.error_description || JSON.stringify(data)}`);
  }

  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in ? data.expires_in * 1000 : 3600000);
  return data.access_token as string;
}

function parseRecipients(to?: string | string[]): { emailAddress: { address: string } }[] {
  if (!to) return [];
  const list = Array.isArray(to) ? to : String(to).split(/[,;]/);
  return list
    .map((item) => {
      const email = item.includes('<') ? item.replace(/.*<([^>]+)>.*/, '$1').trim() : item.trim();
      return email ? { emailAddress: { address: email } } : null;
    })
    .filter((item): item is { emailAddress: { address: string } } => Boolean(item));
}

export const getRegistryEmail = (): string => {
  return process.env.FATIMAH_EMAIL || process.env.COMPANY_NOTIFICATION_EMAIL || 'registry@hdilabportal.com';
};

export const getLabEmail = (labId: string): string => {
  const map: Record<string, string> = {
    LAB_1: 'jarvismpock85@gmail.com', // Hydrochrom Analytical Services Limited
    LAB_2: 'info@saagchemical.com.ng', // SAAG Chemical Nigeria Limited (SNCL)
    LAB_3: 'info@kazlatpublicanalysts.com', // Kazlat Public Analyst Laboratory
    LAB_4: 'info@halalcert.com.ng', // Central Halal Laboratory
  };
  return map[labId] || 'jarvismpock85@gmail.com';
};

interface DispatchEmailParams {
  triggerNumber: number;
  triggerName: string;
  to: string;
  cc?: string;
  subject: string;
  htmlContent: string;
  plainText: string;
  sampleCode: string;
}

// Send via Microsoft Graph API with Azure OAuth2 Token
async function sendMailViaGraph(mailOptions: {
  from?: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{ filename?: string; content?: any; path?: string; contentType?: string }>;
}) {
  const token = await getGraphAccessToken();
  const sender = process.env.EMAIL_USER || 'ict@halalcert.com.ng';
  const sendMailUrl = `https://graph.microsoft.com/v1.0/users/${sender}/sendMail`;

  const toRecipients = parseRecipients(mailOptions.to);
  const ccRecipients = parseRecipients(mailOptions.cc);
  const bccRecipients = parseRecipients(mailOptions.bcc);

  let senderName = 'HDI Lab Portal';
  let senderAddress = sender;

  const rawFrom = mailOptions.from || `HDI Lab Portal <${sender}>`;
  if (rawFrom) {
    const match = String(rawFrom).match(/^(.*?)\s*<(.+)>$/);
    if (match) {
      senderName = match[1].replace(/["']/g, '').trim() || 'HDI Lab Portal';
      senderAddress = match[2].trim() || sender;
    } else {
      senderAddress = String(rawFrom).trim();
    }
  }

  const message: any = {
    subject: mailOptions.subject || '',
    from: {
      emailAddress: {
        name: senderName,
        address: senderAddress,
      },
    },
    body: {
      contentType: mailOptions.html ? 'HTML' : 'Text',
      content: mailOptions.html || mailOptions.text || '',
    },
    toRecipients,
  };

  if (ccRecipients.length > 0) message.ccRecipients = ccRecipients;
  if (bccRecipients.length > 0) message.bccRecipients = bccRecipients;

  if (Array.isArray(mailOptions.attachments) && mailOptions.attachments.length > 0) {
    message.attachments = mailOptions.attachments.map((att) => {
      let contentBytes = '';
      if (att.content) {
        contentBytes = Buffer.isBuffer(att.content)
          ? att.content.toString('base64')
          : Buffer.from(att.content).toString('base64');
      } else if (att.path) {
        contentBytes = fs.readFileSync(att.path).toString('base64');
      }
      return {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.filename || path.basename(att.path || 'attachment'),
        contentType: att.contentType || 'application/octet-stream',
        contentBytes,
      };
    });
  }

  const res = await fetch(sendMailUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, saveToSentItems: 'true' }),
  });

  if (res.status === 202 || res.status === 200) {
    return { messageId: `graph-${Date.now()}`, response: '202 Accepted via Microsoft Graph API' };
  }

  const errData = await res.text();
  throw new Error(`Microsoft Graph API error (${res.status}): ${errData}`);
}

// Nodemailer SMTP fallback if basic SMTP is explicitly provided
const createSmtpTransporter = () => {
  const port = parseInt(process.env.EMAIL_PORT || '587', 10);
  const secure = process.env.EMAIL_SECURE === 'true' || port === 465;

  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.office365.com',
    port,
    secure,
    requireTLS: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: false,
    },
  });
};

export const transporter = {
  sendMail: async (options: any) => {
    if (process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET) {
      return sendMailViaGraph(options);
    }
    if (process.env.EMAIL_PASS) {
      const smtp = createSmtpTransporter();
      return smtp.sendMail(options);
    }
    throw new Error('No email credentials configured (AZURE_CLIENT_ID or EMAIL_PASS required)');
  },
};

const dispatchEmail = async (params: DispatchEmailParams): Promise<void> => {
  const logId = 'log_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const entry: EmailLogEntry = {
    id: logId,
    triggerNumber: params.triggerNumber,
    triggerName: params.triggerName,
    recipient: params.to + (params.cc ? ` (CC: ${params.cc})` : ''),
    subject: params.subject,
    message: params.plainText,
    sampleCode: params.sampleCode,
    status: 'SIMULATED',
    timestamp: new Date(),
  };

  const isAzureConfigured = Boolean(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
  const isSmtpConfigured = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);

  if (!isAzureConfigured && !isSmtpConfigured) {
    entry.status = 'SIMULATED';
    console.log(`[Email Activity Logged #${params.triggerNumber}] (Simulated Mode - configure AZURE credentials in .env to deliver) TO: ${params.to} | SUBJECT: ${params.subject}`);
    notificationLogs.unshift(entry);
    if (notificationLogs.length > 100) notificationLogs.pop();
    return;
  }

  try {
    const sender = process.env.EMAIL_USER || 'ict@halalcert.com.ng';
    const fromAddress = `HDI Lab Portal <${sender}>`;

    await transporter.sendMail({
      from: fromAddress,
      to: params.to,
      cc: params.cc,
      subject: params.subject,
      html: params.htmlContent,
      text: params.plainText,
    });

    entry.status = 'SENT';
    console.log(`[Email Sent Trigger #${params.triggerNumber} via Azure/Nodemailer]: ${params.subject} -> ${params.to}`);
  } catch (err: any) {
    entry.status = 'FAILED';
    entry.error = err?.message || 'Unknown email dispatch error';
    console.error(`[Email Dispatch Exception Trigger #${params.triggerNumber}]:`, err);
  }

  notificationLogs.unshift(entry);
  if (notificationLogs.length > 100) {
    notificationLogs.pop();
  }
};

const buildHtmlEmail = (title: string, message: string, sampleCode: string, details?: Record<string, string>): string => {
  const detailsRows = details
    ? Object.entries(details)
        .map(
          ([k, v]) =>
            `<tr><td style="padding:6px 12px;font-weight:600;color:#475569;border-bottom:1px solid #f1f5f9;">${k}</td><td style="padding:6px 12px;color:#0f172a;border-bottom:1px solid #f1f5f9;">${v}</td></tr>`
        )
        .join('')
    : '';

  return `
    <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.05);">
      <div style="background:linear-gradient(135deg, #1e293b, #0f172a);padding:24px;text-align:left;border-bottom:3px solid #3b82f6;">
        <h2 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;letter-spacing:-0.5px;">HDI Sample Registration & Dispatch Portal</h2>
        <p style="color:#94a3b8;margin:6px 0 0 0;font-size:13px;">Official Notification — Sample Ref: <strong>${sampleCode}</strong></p>
      </div>
      <div style="padding:28px 24px;color:#1e293b;line-height:1.6;">
        <h3 style="color:#0f172a;font-size:17px;margin-top:0;">${title}</h3>
        <p style="font-size:15px;background:#f8fafc;padding:16px;border-left:4px solid #3b82f6;border-radius:4px;margin:16px 0;">${message}</p>
        ${
          detailsRows
            ? `<table style="width:100%;border-collapse:collapse;margin-top:20px;font-size:13px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">${detailsRows}</table>`
            : ''
        }
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b;text-align:center;">
          <p>This is an automated system notification from the HDI Lab Portal. Please do not reply directly to this email.</p>
        </div>
      </div>
    </div>
  `;
};

// ==========================================
// 10 AUTOMATED NOTIFICATION TRIGGERS
// ==========================================

// Trigger 1: Sample Registered
export const notifySampleRegistered = async (sample: any): Promise<void> => {
  const labEmail = getLabEmail(sample.receivingLabId);
  const msg = `Sample ${sample.sampleCode} has been registered by ${sample.companyName}. Kindly confirm the analysis and provide invoice.`;
  await dispatchEmail({
    triggerNumber: 1,
    triggerName: 'Sample Registered',
    to: labEmail,
    subject: `[New Registration] Sample ${sample.sampleCode} - ${sample.companyName}`,
    plainText: msg,
    htmlContent: buildHtmlEmail('Sample Registration Confirmation', msg, sample.sampleCode, {
      'Sample Name': sample.sampleName,
      'Company Name': sample.companyName,
      'Nature': sample.sampleNature,
      'Analysis Required': (sample.analysisRequired || []).join(', '),
      'Sent By': sample.sentBy,
    }),
    sampleCode: sample.sampleCode,
  });
};

// Trigger 2: Analysis Rejected
export const notifyAnalysisRejected = async (sample: any, reason?: string): Promise<void> => {
  const registryEmail = getRegistryEmail();
  const labName = sample.receivingLabName || 'External Lab';
  const msg = `Sample ${sample.sampleCode} was not accepted by ${labName} for analysis. Kindly review and resubmit.`;
  await dispatchEmail({
    triggerNumber: 2,
    triggerName: 'Analysis Rejected',
    to: registryEmail,
    subject: `[Action Required] Sample ${sample.sampleCode} Rejected by ${labName}`,
    plainText: msg,
    htmlContent: buildHtmlEmail('Analysis Rejected Pre-Invoice', msg, sample.sampleCode, {
      'Lab': labName,
      'Company': sample.companyName,
      'Sample Name': sample.sampleName,
      'Rejection Reason': reason || 'Not specified',
    }),
    sampleCode: sample.sampleCode,
  });
};

// Trigger 3: Analysis Confirmed & Invoice Issued
export const notifyInvoiceIssued = async (sample: any, invoiceNo: string): Promise<void> => {
  const registryEmail = getRegistryEmail();
  const labName = sample.receivingLabName || 'External Lab';
  const msg = `Analysis for sample ${sample.sampleCode} has been confirmed by ${labName}. Please find attached invoice ${invoiceNo}.`;
  await dispatchEmail({
    triggerNumber: 3,
    triggerName: 'Invoice Issued',
    to: registryEmail,
    subject: `[Invoice Issued] Sample ${sample.sampleCode} - Invoice ${invoiceNo}`,
    plainText: msg,
    htmlContent: buildHtmlEmail('Invoice Issued & Analysis Confirmed', msg, sample.sampleCode, {
      'Lab': labName,
      'Invoice No': invoiceNo,
      'Company': sample.companyName,
      'Sample Name': sample.sampleName,
    }),
    sampleCode: sample.sampleCode,
  });
};

// Trigger 4: Invoice Acknowledged
export const notifyInvoiceAcknowledged = async (sample: any): Promise<void> => {
  const labEmail = getLabEmail(sample.receivingLabId);
  const msg = `Invoice for sample ${sample.sampleCode} has been received. Thank you.`;
  await dispatchEmail({
    triggerNumber: 4,
    triggerName: 'Invoice Acknowledged',
    to: labEmail,
    subject: `[Invoice Acknowledged] Sample ${sample.sampleCode}`,
    plainText: msg,
    htmlContent: buildHtmlEmail('Invoice Acknowledgment', msg, sample.sampleCode, {
      'Sample Code': sample.sampleCode,
      'Invoice No': sample.invoiceNo || 'N/A',
      'Acknowledged By': 'Registry / Finance',
    }),
    sampleCode: sample.sampleCode,
  });
};

// Trigger 5: Payment Sent
export const notifyPaymentSent = async (sample: any, receiptNo: string): Promise<void> => {
  const labEmail = getLabEmail(sample.receivingLabId);
  const msg = `Payment for sample ${sample.sampleCode} has been sent. Please find attached receipt/reference ${receiptNo}.`;
  await dispatchEmail({
    triggerNumber: 5,
    triggerName: 'Payment Sent',
    to: labEmail,
    subject: `[Payment Confirmation] Sample ${sample.sampleCode} - Ref ${receiptNo}`,
    plainText: msg,
    htmlContent: buildHtmlEmail('Payment Confirmation Advice', msg, sample.sampleCode, {
      'Sample Code': sample.sampleCode,
      'Receipt / Reference No': receiptNo,
      'Company': sample.companyName,
    }),
    sampleCode: sample.sampleCode,
  });
};

// Trigger 6: Sample Dispatched
export const notifySampleDispatched = async (sample: any): Promise<void> => {
  const labEmail = getLabEmail(sample.receivingLabId);
  const msg = `Sample ${sample.sampleCode} has been dispatched and is on its way to your facility.`;
  await dispatchEmail({
    triggerNumber: 6,
    triggerName: 'Sample Dispatched',
    to: labEmail,
    subject: `[Sample Dispatched] Sample ${sample.sampleCode} En Route`,
    plainText: msg,
    htmlContent: buildHtmlEmail('Dispatch Notification', msg, sample.sampleCode, {
      'Sample Name': sample.sampleName,
      'Batch No': sample.batchNo || 'N/A',
      'Date Dispatched': new Date().toLocaleDateString(),
    }),
    sampleCode: sample.sampleCode,
  });
};

// Trigger 7: Sample Received by Lab
export const notifySampleReceivedByLab = async (sample: any, processingDate: Date): Promise<void> => {
  const registryEmail = getRegistryEmail();
  const labName = sample.receivingLabName || 'Lab';
  const msg = `Sample ${sample.sampleCode} has been received by ${labName}. Processing has commenced.`;
  await dispatchEmail({
    triggerNumber: 7,
    triggerName: 'Sample Received by Lab',
    to: registryEmail,
    subject: `[Receipt Confirmed] Sample ${sample.sampleCode} at ${labName}`,
    plainText: msg,
    htmlContent: buildHtmlEmail('Sample Receipt & Processing Started', msg, sample.sampleCode, {
      'Lab': labName,
      'Processing Date': new Date(processingDate).toLocaleDateString(),
      'Analysis': (sample.analysisRequired || []).join(', '),
    }),
    sampleCode: sample.sampleCode,
  });
};

// Trigger 8: Awaiting Certificate
export const notifyAwaitingCertificate = async (sample: any): Promise<void> => {
  const registryEmail = getRegistryEmail();
  const labName = sample.receivingLabName || 'Lab';
  const msg = `Sample ${sample.sampleCode} is with ${labName}. We are awaiting the result/certificate.`;
  await dispatchEmail({
    triggerNumber: 8,
    triggerName: 'Awaiting Certificate',
    to: registryEmail,
    subject: `[Status Update] Sample ${sample.sampleCode} - Awaiting Certificate`,
    plainText: msg,
    htmlContent: buildHtmlEmail('Processing in Progress', msg, sample.sampleCode, {
      'Lab': labName,
      'Status': 'In Progress / Processing',
    }),
    sampleCode: sample.sampleCode,
  });
};

// Trigger 9: Pending Result Reminder (7 days after processing date)
export const notifyPendingResultReminder = async (sample: any): Promise<void> => {
  const labEmail = getLabEmail(sample.receivingLabId);
  const registryEmail = getRegistryEmail();
  const dateOfEntryStr = sample.dateOfEntry ? new Date(sample.dateOfEntry).toLocaleDateString() : 'N/A';
  const msg = `Reminder: We are still awaiting the result/certificate for sample ${sample.sampleCode}, sent on ${dateOfEntryStr}. Kindly advise on status.`;

  await dispatchEmail({
    triggerNumber: 9,
    triggerName: 'Pending Result Reminder',
    to: labEmail,
    cc: registryEmail,
    subject: `[Urgent Reminder] Awaiting Result for Sample ${sample.sampleCode}`,
    plainText: msg,
    htmlContent: buildHtmlEmail('7-Day Pending Certificate Reminder', msg, sample.sampleCode, {
      'Sample Code': sample.sampleCode,
      'Date of Entry': dateOfEntryStr,
      'Lab': sample.receivingLabName,
      'Company': sample.companyName,
    }),
    sampleCode: sample.sampleCode,
  });
};

// Trigger 10: Result/Certificate Uploaded
export const notifyResultUploaded = async (sample: any, status: string): Promise<void> => {
  const registryEmail = getRegistryEmail();
  const msg = `Result/certificate for sample ${sample.sampleCode} has been uploaded. Status: [${status}].`;
  await dispatchEmail({
    triggerNumber: 10,
    triggerName: 'Result Uploaded',
    to: registryEmail,
    subject: `[Certificate Ready] Result for Sample ${sample.sampleCode} (${status})`,
    plainText: msg,
    htmlContent: buildHtmlEmail('Certificate Uploaded', msg, sample.sampleCode, {
      'Final Status': status,
      'Lab': sample.receivingLabName,
      'Sample Name': sample.sampleName,
      'Company': sample.companyName,
      'Certificate Attached/Linked': sample.resultFileUrl ? 'Yes' : 'Pending View',
    }),
    sampleCode: sample.sampleCode,
  });
};

// Trigger 11: 1-Week Result TAT Notice (Sent by Lab after payment confirmed)
export const notifyOneWeekTAT = async (sample: any, labUser: string): Promise<void> => {
  const registryEmail = getRegistryEmail();
  const labName = sample.receivingLabName || 'Laboratory';
  const msg = `Payment has been verified. ${labName} has started testing for sample ${sample.sampleCode} (${sample.sampleName}). Full analysis results and Certificate of Analysis (CoA) will be delivered within one (1) week.`;
  await dispatchEmail({
    triggerNumber: 11,
    triggerName: '1-Week Result TAT Notice',
    to: registryEmail,
    subject: `[Analysis Underway: 1-Week TAT Notice] Sample ${sample.sampleCode} - ${sample.sampleName}`,
    plainText: msg,
    htmlContent: buildHtmlEmail('Analysis Underway — 1-Week Result Notice', msg, sample.sampleCode, {
      'Sample Code': sample.sampleCode,
      'Sample Name': sample.sampleName,
      'Laboratory': labName,
      'Analyses Underway': (sample.analysisRequired || []).join(', ') || 'Standard Panel',
      'Expected Delivery': '7 Business Days (1 Week)',
      'Notified By': labUser || 'Laboratory Desk',
    }),
    sampleCode: sample.sampleCode,
  });
};

// Trigger 12: Lab Unable to Perform Required Test
export const notifyCannotPerformTest = async (sample: any, reason: string, labUser: string): Promise<void> => {
  const registryEmail = getRegistryEmail();
  const labName = sample.receivingLabName || 'Laboratory';
  const msg = `URGENT NOTICE: ${labName} is unable to perform the required analysis for sample ${sample.sampleCode} (${sample.sampleName}). Reason provided: "${reason}". Please review the intake and reassign or resubmit as appropriate.`;
  await dispatchEmail({
    triggerNumber: 12,
    triggerName: 'Lab Unable to Perform Analysis',
    to: registryEmail,
    subject: `[Action Required: Unable to Analyze] Sample ${sample.sampleCode} at ${labName}`,
    plainText: msg,
    htmlContent: buildHtmlEmail('Lab Unable to Perform Required Analysis', msg, sample.sampleCode, {
      'Sample Code': sample.sampleCode,
      'Sample Name': sample.sampleName,
      'Laboratory': labName,
      'Requested Analyses': (sample.analysisRequired || []).join(', ') || 'Standard Panel',
      'Reason Stated': reason,
      'Reported By': labUser || 'Laboratory Officer',
    }),
    sampleCode: sample.sampleCode,
  });
};

// Trigger 13: Admin Result / Certificate Discrepancy & Rejection
export const notifyResultDiscrepancy = async (
  sample: any,
  note: string,
  attachmentUrl: string | undefined,
  adminUser: string
): Promise<void> => {
  const labEmail = getLabEmail(sample.receivingLabId);
  const registryEmail = getRegistryEmail();
  const msg = `ATTENTION: Quality Assurance / Registry has flagged an error or discrepancy with the test result / Certificate of Analysis for sample ${sample.sampleCode} (${sample.sampleName}). Discrepancy Note: "${note}". ${attachmentUrl ? 'An annotated error document has been uploaded for your review.' : ''} Please review and issue a revised certificate.`;
  await dispatchEmail({
    triggerNumber: 13,
    triggerName: 'Certificate Rejection / Result Discrepancy',
    to: labEmail,
    cc: registryEmail,
    subject: `[Certificate Issue / Rejection] Sample ${sample.sampleCode} Requires Attention`,
    plainText: msg,
    htmlContent: buildHtmlEmail('Certificate Discrepancy Reported', msg, sample.sampleCode, {
      'Sample Code': sample.sampleCode,
      'Sample Name': sample.sampleName,
      'Client Company': sample.companyName,
      'Discrepancy Details': note,
      'Error Markup File': attachmentUrl ? 'Document uploaded & attached' : 'None',
      'Flagged By': adminUser || 'Quality Assurance / Registry',
    }),
    sampleCode: sample.sampleCode,
  });
};
