import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware.js';
import { Communication } from '../models/Communication.js';

const LAB_NAMES: Record<string, string> = {
  LAB_1: 'Hydrochrom Resources',
  LAB_2: 'SAAG Chemical Nigeria',
  LAB_3: 'Kazlat Public Analysts',
  LAB_4: 'Central Halal Laboratory',
};

// Get communications for current user or filtered by lab
export const getCommunications = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const isLab = req.user?.role === 'LAB_USER';
    const filter: Record<string, any> = {};

    if (isLab) {
      filter.labIdentifier = req.user?.labIdentifier || 'LAB_1';
    } else if (req.query.labIdentifier && req.query.labIdentifier !== 'ALL') {
      filter.labIdentifier = req.query.labIdentifier;
    }

    const communications = await Communication.find(filter).sort({ createdAt: 1 });
    res.json({ communications });
  } catch (error: any) {
    console.error('Error fetching communications:', error);
    res.status(500).json({ message: 'Error fetching communications', error: error.message });
  }
};

// Send a new message / ticket
export const createCommunication = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { message, subject, sampleCode, priority } = req.body;
    let { labIdentifier } = req.body;

    if (!message || !message.trim()) {
      res.status(400).json({ message: 'Message cannot be empty.' });
      return;
    }

    const isLab = req.user?.role === 'LAB_USER';
    if (isLab) {
      labIdentifier = req.user?.labIdentifier || 'LAB_1';
    } else if (!labIdentifier) {
      labIdentifier = 'LAB_1';
    }

    const labName = LAB_NAMES[labIdentifier] || (req.user?.labName || 'Partner Laboratory');

    const newComm = new Communication({
      labIdentifier,
      labName,
      senderId: req.user?.id || 'unknown',
      senderName: req.user?.name || (isLab ? labName : 'HDI Administration'),
      senderRole: req.user?.role || 'REGISTRY',
      senderEmail: req.user?.email || '',
      subject: (subject && subject.trim()) || 'General Discussion',
      message: message.trim(),
      sampleCode: (sampleCode && sampleCode.trim()) || '',
      priority: priority === 'URGENT' || priority === 'HIGH' ? priority : 'NORMAL',
      status: 'OPEN',
    });

    await newComm.save();
    res.status(201).json({ communication: newComm, message: 'Message sent successfully.' });
  } catch (error: any) {
    console.error('Error creating communication:', error);
    res.status(500).json({ message: 'Error sending message', error: error.message });
  }
};

// Update status of communication (e.g. resolve)
export const updateCommunicationStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['OPEN', 'RESOLVED'].includes(status)) {
      res.status(400).json({ message: 'Invalid status.' });
      return;
    }

    const comm = await Communication.findByIdAndUpdate(id, { status }, { new: true });
    if (!comm) {
      res.status(404).json({ message: 'Communication message not found.' });
      return;
    }

    res.json({ communication: comm, message: 'Status updated.' });
  } catch (error: any) {
    console.error('Error updating communication status:', error);
    res.status(500).json({ message: 'Error updating communication', error: error.message });
  }
};
