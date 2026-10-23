import { Response } from 'express';
import { Sample } from '../models/Sample.js';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit-table';

export const getDashboardStats = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const query: any = { isDeleted: { $ne: true } };
    if (req.user?.role === 'LAB_USER') {
      const labId = req.user.labIdentifier;
      const labName = req.user.name;
      const labOr: any[] = [];
      if (labId) labOr.push({ receivingLabId: labId });
      if (labName) {
        const clean = labName.replace(/lab(oratory)?/gi, '').trim();
        if (clean) labOr.push({ receivingLabName: new RegExp(clean, 'i') });
      }
      query.$and = [
        { $or: labOr.length > 0 ? labOr : [{ receivingLabId: labId || 'LAB_NONE' }] },
        { workflowStatus: { $ne: 'Registered' } },
      ];
    }

    const samples = await Sample.find(query);

    const total = samples.length;
    const statusCounts: Record<string, number> = {
      Received: 0,
      Registered: 0,
      'Sent to Lab': 0,
      'In Processing': 0,
      'Result Received': 0,
      Closed: 0,
      Rejected: 0,
    };

    const labCounts: Record<string, number> = {
      LAB_1: 0,
      LAB_2: 0,
      LAB_3: 0,
      LAB_4: 0,
    };

    const companyCounts: Record<string, number> = {};
    const labTatMap: Record<string, { totalDays: number; count: number }> = {
      LAB_1: { totalDays: 0, count: 0 },
      LAB_2: { totalDays: 0, count: 0 },
      LAB_3: { totalDays: 0, count: 0 },
      LAB_4: { totalDays: 0, count: 0 },
    };

    let totalTatDays = 0;
    let completedCount = 0;

    const monthlyTrends: Record<string, number> = {};

    samples.forEach((s) => {
      // Status
      if (statusCounts[s.workflowStatus] !== undefined) {
        statusCounts[s.workflowStatus]++;
      }

      // Lab
      if (s.receivingLabId && labCounts[s.receivingLabId] !== undefined) {
        labCounts[s.receivingLabId]++;
      }

      // Company
      if (s.companyName) {
        companyCounts[s.companyName] = (companyCounts[s.companyName] || 0) + 1;
      }

      // TAT
      if (s.turnaroundTimeDays && s.turnaroundTimeDays > 0) {
        totalTatDays += s.turnaroundTimeDays;
        completedCount++;
        if (s.receivingLabId && labTatMap[s.receivingLabId]) {
          labTatMap[s.receivingLabId].totalDays += s.turnaroundTimeDays;
          labTatMap[s.receivingLabId].count++;
        }
      }

      // Monthly Trend
      if (s.dateOfEntry) {
        const d = new Date(s.dateOfEntry);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyTrends[monthKey] = (monthlyTrends[monthKey] || 0) + 1;
      }
    });

    const averageTatOverall = completedCount > 0 ? Number((totalTatDays / completedCount).toFixed(1)) : 0;
    const tatPerLab: Record<string, number> = {};
    Object.entries(labTatMap).forEach(([k, v]) => {
      tatPerLab[k] = v.count > 0 ? Number((v.totalDays / v.count).toFixed(1)) : 0;
    });

    // Top companies
    const topCompanies = Object.entries(companyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    res.json({
      total,
      statusCounts,
      labCounts,
      averageTatOverall,
      tatPerLab,
      topCompanies,
      monthlyTrends,
    });
  } catch (error: any) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Error fetching stats', error: error.message });
  }
};

export const exportExcelReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { companyName, workflowStatus, receivingLabId, sampleNature, dateFrom, dateTo } = req.query;
    const query: any = { isDeleted: { $ne: true } };

    if (req.user?.role === 'LAB_USER' && req.user.labIdentifier) {
      query.receivingLabId = req.user.labIdentifier;
    } else if (receivingLabId) {
      query.receivingLabId = receivingLabId;
    }

    if (companyName) query.companyName = companyName;
    if (workflowStatus) query.workflowStatus = workflowStatus;
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

    const samples = await Sample.find(query).sort({ dateOfEntry: -1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'HDI Portal';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Sample Summary Report');

    // Title Row
    sheet.mergeCells('A1:L1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'SAMPLE REGISTRATION & DISPATCH PORTAL - SUMMARY REPORT';
    titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 35;

    // Subtitle Row
    sheet.mergeCells('A2:L2');
    const subCell = sheet.getCell('A2');
    subCell.value = `Generated on ${new Date().toLocaleString()} | Total Records: ${samples.length}`;
    subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(2).height = 20;

    // Blank row
    sheet.addRow([]);

    // Headers
    const headers = [
      'Sample Code',
      'Sample Name',
      'Company Name',
      'Nature',
      'Date of Entry',
      'Analysis Required',
      'Receiving Lab',
      'Processing Date',
      'Invoice No.',
      'Receipt No.',
      'Result Status',
      'TAT (Days)',
      'Workflow Status',
    ];

    const headerRow = sheet.addRow(headers);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'medium' },
        right: { style: 'thin' },
      };
    });

    // Populate Data
    samples.forEach((s) => {
      const row = sheet.addRow([
        s.sampleCode,
        s.sampleName,
        s.companyName,
        s.sampleNature,
        s.dateOfEntry ? new Date(s.dateOfEntry).toLocaleDateString() : '',
        (s.analysisRequired || []).join(', '),
        s.receivingLabName,
        s.processingDate ? new Date(s.processingDate).toLocaleDateString() : 'N/A',
        s.invoiceNo || 'N/A',
        s.receiptNo || 'N/A',
        s.resultStatus,
        s.turnaroundTimeDays || '—',
        s.workflowStatus,
      ]);

      row.height = 20;
      row.eachCell((cell, colNumber) => {
        cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 || colNumber === 5 ? 'center' : 'left' };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    });

    // Column widths
    sheet.columns = [
      { width: 18 }, // Code
      { width: 25 }, // Name
      { width: 25 }, // Company
      { width: 15 }, // Nature
      { width: 14 }, // Entry Date
      { width: 28 }, // Analysis
      { width: 26 }, // Lab
      { width: 16 }, // Proc Date
      { width: 15 }, // Invoice
      { width: 15 }, // Receipt
      { width: 15 }, // Result Status
      { width: 12 }, // TAT
      { width: 18 }, // Status
    ];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=HDI_Sample_Report_${Date.now()}.xlsx`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error: any) {
    console.error('Export Excel error:', error);
    res.status(500).json({ message: 'Error generating Excel report', error: error.message });
  }
};

export const exportPdfReport = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { companyName, workflowStatus, receivingLabId, sampleNature } = req.query;
    const query: any = { isDeleted: { $ne: true } };

    if (req.user?.role === 'LAB_USER' && req.user.labIdentifier) {
      query.receivingLabId = req.user.labIdentifier;
    } else if (receivingLabId) {
      query.receivingLabId = receivingLabId;
    }

    if (companyName) query.companyName = companyName;
    if (workflowStatus) query.workflowStatus = workflowStatus;
    if (sampleNature) query.sampleNature = sampleNature;

    const samples = await Sample.find(query).sort({ dateOfEntry: -1 }).limit(100);

    const doc = new PDFDocument({ margin: 30, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=HDI_Sample_Report_${Date.now()}.pdf`);

    doc.pipe(res);

    // Title Header
    doc.fillColor('#0f172a').fontSize(16).text('SAMPLE REGISTRATION & DISPATCH PORTAL', { align: 'center' });
    doc.fillColor('#64748b').fontSize(10).text(`Management Review Summary Report — Generated: ${new Date().toLocaleDateString()}`, {
      align: 'center',
    });
    doc.moveDown();

    // Table
    const tableData = {
      headers: ['Code', 'Sample Name', 'Company', 'Nature', 'Lab', 'Status', 'Result'],
      rows: samples.map((s) => [
        s.sampleCode,
        s.sampleName.length > 20 ? s.sampleName.substring(0, 18) + '...' : s.sampleName,
        s.companyName.length > 18 ? s.companyName.substring(0, 16) + '...' : s.companyName,
        s.sampleNature,
        s.receivingLabId,
        s.workflowStatus,
        s.resultStatus,
      ]),
    };

    await (doc as any).table(tableData, {
      prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8).fillColor('#1e293b'),
      prepareRow: () => doc.font('Helvetica').fontSize(8).fillColor('#334155'),
    });

    doc.end();
  } catch (error: any) {
    console.error('Export PDF error:', error);
    res.status(500).json({ message: 'Error generating PDF report', error: error.message });
  }
};
