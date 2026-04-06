import { randomUUID } from 'crypto';
import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { EventBooking } from '../models/EventBooking.js';
import { Facility } from '../models/Facility.js';
import { FacilityBooking } from '../models/FacilityBooking.js';
import { AccountingInvoice } from '../models/AccountingInvoice.js';
import { generateNumber } from '../services/numbering.js';
import {
  buildEventConfirmationDocument,
  buildEventPaymentReceiptDocument,
} from '../services/eventDocuments.js';
import { parseRecipients, sendConfiguredMail } from '../services/mail.js';
import { cancelJournalEntry, createInvoice, createJournalEntry, recordPayment } from '../services/accountingEngine.js';

const router = Router();
const ACTIVE_EVENT_STATUSES = ['pending', 'confirmed'] as const;
const ACTIVE_FACILITY_STATUSES = ['pending', 'confirmed', 'booked'] as const;
const PAYMENT_METHODS = ['cash', 'card', 'upi', 'bank_transfer', 'cheque', 'online'] as const;

type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';
type PaymentStatus = 'pending' | 'partial' | 'paid' | 'refunded';
type PaymentMethod = typeof PAYMENT_METHODS[number];

type NormalizedOccurrence = {
  occurrenceDate: Date;
  startTime: Date;
  endTime: Date;
};

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const normalizeEmail = (value: any): string => String(value || '').trim().toLowerCase();

const derivePaymentStatus = (paidAmount: number, totalAmount: number, refunded = false): PaymentStatus => {
  if (refunded) return 'refunded';
  if (totalAmount <= 0) return 'paid';
  if (paidAmount <= 0) return 'pending';
  if (paidAmount >= totalAmount) return 'paid';
  return 'partial';
};

const applyCancellationRules = (startTime: Date, totalAmount: number, paidAmount: number) => {
  const diffHours = (startTime.getTime() - Date.now()) / (1000 * 60 * 60);
  let chargePct = 0;
  if (diffHours < 2) chargePct = 100;
  else if (diffHours < 24) chargePct = 50;

  const cancellationCharge = round2((totalAmount * chargePct) / 100);
  const refundAmount = round2(Math.max(0, paidAmount - cancellationCharge));
  return { cancellationCharge, refundAmount };
};

const normalizePaymentMethod = (value: any): PaymentMethod => {
  const normalized = String(value || '').trim().toLowerCase();
  return (PAYMENT_METHODS as readonly string[]).includes(normalized) ? (normalized as PaymentMethod) : 'cash';
};

const isValidDate = (value: Date): boolean => !Number.isNaN(value.getTime());

const sortOccurrences = (rows: NormalizedOccurrence[]): NormalizedOccurrence[] => {
  return [...rows].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
};

const normalizeOccurrences = (body: any): NormalizedOccurrence[] => {
  const incoming = Array.isArray(body?.occurrences) ? body.occurrences : [];

  if (incoming.length > 0) {
    const normalized = incoming
      .map((row: any) => {
        const startTime = new Date(row?.startTime);
        const endTime = new Date(row?.endTime);
        const occurrenceDate = row?.occurrenceDate ? new Date(row.occurrenceDate) : new Date(startTime);
        occurrenceDate.setHours(0, 0, 0, 0);
        if (!isValidDate(startTime) || !isValidDate(endTime) || !isValidDate(occurrenceDate)) {
          return null;
        }
        return { occurrenceDate, startTime, endTime };
      })
      .filter((row: NormalizedOccurrence | null): row is NormalizedOccurrence => Boolean(row));

    return sortOccurrences(normalized);
  }

  const startTime = new Date(body?.startTime);
  const endTime = new Date(body?.endTime);
  if (!isValidDate(startTime) || !isValidDate(endTime)) {
    return [];
  }

  const occurrenceDate = new Date(startTime);
  occurrenceDate.setHours(0, 0, 0, 0);
  return [{ occurrenceDate, startTime, endTime }];
};

const normalizeStoredOccurrences = (booking: any): NormalizedOccurrence[] => {
  const fromArray = Array.isArray(booking?.occurrences) ? booking.occurrences : [];
  if (fromArray.length > 0) {
    const normalized = fromArray
      .map((row: any) => {
        const startTime = new Date(row?.startTime);
        const endTime = new Date(row?.endTime);
        const occurrenceDate = row?.occurrenceDate ? new Date(row.occurrenceDate) : new Date(startTime);
        occurrenceDate.setHours(0, 0, 0, 0);
        if (!isValidDate(startTime) || !isValidDate(endTime) || !isValidDate(occurrenceDate)) {
          return null;
        }
        return { occurrenceDate, startTime, endTime };
      })
      .filter((row: NormalizedOccurrence | null): row is NormalizedOccurrence => Boolean(row));

    if (normalized.length > 0) {
      return sortOccurrences(normalized);
    }
  }

  const fallbackStart = new Date(booking?.startTime);
  const fallbackEnd = new Date(booking?.endTime);
  if (!isValidDate(fallbackStart) || !isValidDate(fallbackEnd)) {
    return [];
  }
  const occurrenceDate = new Date(fallbackStart);
  occurrenceDate.setHours(0, 0, 0, 0);
  return [{ occurrenceDate, startTime: fallbackStart, endTime: fallbackEnd }];
};

const occurrenceDateKey = (value: Date) => value.toISOString().slice(0, 10);

const validateOccurrences = (occurrences: NormalizedOccurrence[]) => {
  if (!occurrences.length) {
    throw new Error('At least one booking occurrence is required');
  }

  const uniqueDates = new Set<string>();
  occurrences.forEach((row) => {
    if (row.endTime <= row.startTime) {
      throw new Error('Each occurrence end time must be greater than start time');
    }
    const key = occurrenceDateKey(row.occurrenceDate);
    if (uniqueDates.has(key)) {
      throw new Error(`Duplicate booking date selected: ${key}`);
    }
    uniqueDates.add(key);
  });
};

const overlapFilter = (startTime: Date, endTime: Date) => ({
  $or: [
    {
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    },
    {
      occurrences: {
        $elemMatch: {
          startTime: { $lt: endTime },
          endTime: { $gt: startTime },
        },
      },
    },
  ],
});

const listFilterByRange = (rangeStart?: Date | null, rangeEnd?: Date | null) => {
  if (!rangeStart || !rangeEnd) return {};
  return {
    $or: [
      {
        startTime: { $lte: rangeEnd },
        endTime: { $gte: rangeStart },
      },
      {
        occurrences: {
          $elemMatch: {
            startTime: { $lte: rangeEnd },
            endTime: { $gte: rangeStart },
          },
        },
      },
    ],
  };
};

const ensureNoBookingConflict = async (
  facilityIds: string[],
  startTime: Date,
  endTime: Date,
  excludeEventId?: string
) => {
  const facilityConflict = await FacilityBooking.findOne({
    facilityId: { $in: facilityIds },
    status: { $in: ACTIVE_FACILITY_STATUSES },
    startTime: { $lt: endTime },
    endTime: { $gt: startTime },
  }).populate('facilityId', 'name');

  if (facilityConflict) {
    const facilityName = (facilityConflict.facilityId as any)?.name || 'facility';
    throw new Error(`Conflict found: ${facilityName} already has a facility booking in selected time range`);
  }

  const eventConflictFilter: any = {
    facilityIds: { $in: facilityIds },
    status: { $in: ACTIVE_EVENT_STATUSES },
    ...overlapFilter(startTime, endTime),
  };

  if (excludeEventId) {
    eventConflictFilter._id = { $ne: excludeEventId };
  }

  const eventConflict = await EventBooking.findOne(eventConflictFilter).populate('facilityIds', 'name');
  if (eventConflict) {
    throw new Error('Conflict found: selected facility is already reserved in another event');
  }
};

const buildReceiptData = (booking: any) => {
  const facilities = Array.isArray(booking?.facilityIds)
    ? booking.facilityIds.map((facility: any) => ({
        name: facility?.name || '',
        location: facility?.location || '',
      }))
    : [];
  const occurrences = normalizeStoredOccurrences(booking).map((row) => ({
    occurrenceDate: row.occurrenceDate,
    startTime: row.startTime,
    endTime: row.endTime,
  }));

  return {
    receiptNumber: booking.eventNumber || `EV-${String(booking._id).slice(-6).toUpperCase()}`,
    eventName: booking.eventName,
    organizerName: booking.organizerName,
    organizationName: booking.organizationName,
    contactPhone: booking.contactPhone,
    contactEmail: booking.contactEmail,
    facilities,
    occurrences,
    startTime: booking.startTime,
    endTime: booking.endTime,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    totalAmount: Number(booking.totalAmount || 0),
    advanceAmount: Number(booking.advanceAmount || 0),
    paidAmount: Number(booking.paidAmount || 0),
    balanceAmount: Number(booking.balanceAmount || 0),
    cancellationCharge: Number(booking.cancellationCharge || 0),
    refundAmount: Number(booking.refundAmount || 0),
    remarks: booking.remarks,
    generatedAt: new Date(),
  };
};

const nextUpcomingOccurrence = (booking: any, now: Date, until?: Date) => {
  const upcoming = normalizeStoredOccurrences(booking)
    .filter((row) => row.startTime.getTime() >= now.getTime())
    .filter((row) => (until ? row.startTime.getTime() <= until.getTime() : true))
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  return upcoming[0] || null;
};

const attemptDocumentEmail = async (args: {
  email?: string;
  subject: string;
  text: string;
  html: string;
  fileName: string;
  pdfBuffer: Buffer;
}) => {
  const recipients = parseRecipients(args.email);
  if (!recipients.length) {
    return { emailed: false, emailedTo: '', emailError: '' };
  }

  try {
    await sendConfiguredMail({
      recipients,
      subject: args.subject,
      text: args.text,
      html: args.html,
      attachments: [
        {
          filename: args.fileName,
          content: args.pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    return {
      emailed: true,
      emailedTo: recipients.join(', '),
      emailError: '',
    };
  } catch (error: any) {
    return {
      emailed: false,
      emailedTo: recipients.join(', '),
      emailError: error.message || 'Failed to email document',
    };
  }
};

const buildDocumentResponse = (
  fileName: string,
  pdfBuffer: Buffer,
  emailResult: { emailed: boolean; emailedTo: string; emailError: string }
) => ({
  fileName,
  pdfBase64: pdfBuffer.toString('base64'),
  emailed: emailResult.emailed,
  emailedTo: emailResult.emailedTo,
  emailError: emailResult.emailError,
});

router.get('/bookings/list', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date, startDate, endDate, facilityId, status } = req.query;
    const filter: any = {};
    if (status) filter.status = status;
    if (facilityId) filter.facilityIds = { $in: [facilityId] };

    const rangeStart = startDate || date;
    if (rangeStart) {
      const start = new Date(rangeStart as string);
      start.setHours(0, 0, 0, 0);
      const end = endDate ? new Date(endDate as string) : new Date(start);
      end.setHours(23, 59, 59, 999);
      Object.assign(filter, listFilterByRange(start, end));
    }

    const rows = await EventBooking.find(filter)
      .populate('facilityIds', 'name location hourlyRate')
      .sort({ startTime: 1, createdAt: 1 });

    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch events' });
  }
});

router.post('/bookings', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      eventName,
      organizerName,
      organizationName,
      contactPhone,
      contactEmail,
      facilityIds,
      status = 'pending',
      totalAmount,
      gstAmount,
      gstRate,
      gstTreatment,
      advanceAmount,
      paidAmount,
      paymentMethod,
      remarks,
      reminderAt,
      advancePaymentMethod,
      advanceRemarks,
    } = req.body;

    const selectedFacilities = Array.isArray(facilityIds) ? facilityIds.map((id) => String(id)) : [];
    const occurrences = normalizeOccurrences(req.body);
    validateOccurrences(occurrences);

    if (!eventName || !organizerName || selectedFacilities.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'eventName, organizerName, facilityIds, and at least one booking occurrence are required',
      });
    }

    const facilities = await Facility.find({ _id: { $in: selectedFacilities }, active: true });
    if (facilities.length !== selectedFacilities.length) {
      return res.status(400).json({ success: false, error: 'One or more selected facilities are invalid/inactive' });
    }

    const conflicts: string[] = [];
    for (const occurrence of occurrences) {
      try {
        await ensureNoBookingConflict(selectedFacilities, occurrence.startTime, occurrence.endTime);
      } catch (error: any) {
        conflicts.push(`${occurrenceDateKey(occurrence.occurrenceDate)}: ${error.message || 'Conflict detected'}`);
      }
    }

    if (conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        error: `Booking conflicts found. ${conflicts.join(' | ')}`,
      });
    }

    const hourlyTotal = facilities.reduce((sum, facility) => sum + Number(facility.hourlyRate || 0), 0);
    const autoTotal = round2(
      occurrences.reduce((sum, occurrence) => {
        const hours = Math.max((occurrence.endTime.getTime() - occurrence.startTime.getTime()) / (1000 * 60 * 60), 0);
        return sum + hourlyTotal * hours;
      }, 0)
    );

    const finalTotal = Math.max(0, Number(totalAmount !== undefined ? totalAmount : autoTotal));
    const finalAdvance = Math.max(0, Number(advanceAmount || 0));
    const finalPaid = Math.min(finalTotal, Math.max(finalAdvance, Number(paidAmount ?? finalAdvance)));
    const finalBalance = round2(Math.max(0, finalTotal - finalPaid));
    const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
    const eventNumber = await generateNumber('corporate_event_booking_number', {
      prefix: 'EVT-',
      datePart: true,
      padTo: 5,
    });

    const initialPayments: any[] = [];
    if (finalPaid > 0) {
      initialPayments.push({
        receiptNumber: await generateNumber('event_payment_receipt_number', {
          prefix: 'EPR-',
          datePart: true,
          padTo: 5,
        }),
        amount: round2(finalPaid),
        paymentMethod: normalizePaymentMethod(advancePaymentMethod),
        paidAt: new Date(),
        remarks: String(advanceRemarks || remarks || '').trim() || 'Advance payment',
        confirmationEmail: normalizeEmail(contactEmail) || undefined,
        receivedBy: req.userId,
      });
    }

    const earliestOccurrence = occurrences[0];
    const seriesId = occurrences.length > 1 ? randomUUID() : undefined;

    const row = await EventBooking.create({
      eventNumber,
      seriesId,
      seriesTotalDates: occurrences.length,
      eventName,
      organizerName,
      organizationName,
      contactPhone,
      contactEmail: normalizeEmail(contactEmail) || undefined,
      facilityIds: selectedFacilities,
      startTime: earliestOccurrence.startTime,
      endTime: earliestOccurrence.endTime,
      occurrences,
      status,
      paymentStatus: derivePaymentStatus(finalPaid, finalTotal),
      paymentMethod: normalizedPaymentMethod,
      totalAmount: finalTotal,
      gstAmount: round2(Number(gstAmount || 0)),
      gstTreatment: String(gstTreatment || 'none').toLowerCase() === 'interstate'
        ? 'interstate'
        : String(gstTreatment || 'none').toLowerCase() === 'intrastate'
          ? 'intrastate'
          : 'none',
      advanceAmount: finalAdvance,
      paidAmount: finalPaid,
      balanceAmount: finalBalance,
      payments: initialPayments,
      remarks,
      reminderAt: reminderAt
        ? new Date(reminderAt)
        : new Date(earliestOccurrence.startTime.getTime() - 24 * 60 * 60 * 1000),
      createdBy: req.userId,
    });

    await createInvoice({
      invoiceDate: new Date(),
      customerName: organizerName,
      referenceType: 'event_booking',
      referenceId: row._id.toString(),
      description: `Event booking ${row.eventNumber}`,
      baseAmount: round2(Math.max(0, finalTotal - Number(gstAmount || 0))),
      gstAmount: round2(Number(gstAmount || 0)),
      gstRate: Number(gstRate || 0),
      gstTreatment: row.gstTreatment || 'none',
      paymentAmount: finalPaid,
      paymentMode: normalizedPaymentMethod,
      revenueAccountKey: 'event_revenue',
      createdBy: req.userId,
      metadata: {
        eventNumber: row.eventNumber,
        eventName,
      },
    });

    const created = await EventBooking.findById(row._id).populate('facilityIds', 'name location hourlyRate');
    res.status(201).json({
      success: true,
      data: created,
      message: occurrences.length > 1 ? `Event booking created for ${occurrences.length} dates` : 'Event booking created',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create event booking' });
  }
});

router.put('/bookings/:id/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const booking = await EventBooking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: 'Event booking not found' });

    const { status, remarks } = req.body;
    if (status) booking.status = String(status).toLowerCase() as BookingStatus;
    if (remarks !== undefined) booking.remarks = String(remarks || '').trim();
    await booking.save();

    const updated = await EventBooking.findById(booking._id).populate('facilityIds', 'name location hourlyRate');
    res.json({ success: true, data: updated, message: 'Event status updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update event status' });
  }
});

router.post('/bookings/:id/payments', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const amount = Number(req.body?.amount || 0);
    const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);
    if (amount <= 0) return res.status(400).json({ success: false, error: 'amount must be greater than zero' });

    const booking = await EventBooking.findById(req.params.id).populate('facilityIds', 'name location hourlyRate');
    if (!booking) return res.status(404).json({ success: false, error: 'Event booking not found' });
    if (String(booking.status) === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Cancelled event cannot accept payments' });
    }

    const paymentReceiptNumber = await generateNumber('event_payment_receipt_number', {
      prefix: 'EPR-',
      datePart: true,
      padTo: 5,
    });
    const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);
    const paymentRemarks = String(req.body?.remarks || '').trim();
    const confirmationEmail = normalizeEmail(req.body?.confirmationEmail || booking.contactEmail || '');

    const paymentRow: any = {
      receiptNumber: paymentReceiptNumber,
      amount: round2(amount),
      paymentMethod,
      paidAt: new Date(),
      remarks: paymentRemarks || undefined,
      confirmationEmail: confirmationEmail || undefined,
      receivedBy: req.userId,
    };

    booking.paidAmount = round2(Math.min(Number(booking.totalAmount || 0), Number(booking.paidAmount || 0) + amount));
    booking.balanceAmount = round2(Math.max(0, Number(booking.totalAmount || 0) - Number(booking.paidAmount || 0)));
    booking.paymentStatus = derivePaymentStatus(Number(booking.paidAmount || 0), Number(booking.totalAmount || 0));
    booking.paymentMethod = paymentMethod;
    if (String(booking.status) === 'pending' && booking.paidAmount > 0) {
      booking.status = 'confirmed';
    }
    const nextPayments = Array.isArray(booking.payments) ? [...booking.payments] : [];
    nextPayments.push(paymentRow);
    booking.payments = nextPayments as any;
    await booking.save();

    const latestPayment = Array.isArray(booking.payments) ? booking.payments[booking.payments.length - 1] : null;
    const accountingInvoice = await AccountingInvoice.findOne({
      referenceType: 'event_booking',
      referenceId: booking._id.toString(),
      status: { $ne: 'cancelled' },
    }).sort({ createdAt: -1 });
    if (accountingInvoice) {
      await recordPayment({
        invoiceId: accountingInvoice._id.toString(),
        amount,
        mode: paymentMethod,
        description: `Payment for event ${booking.eventNumber}`,
        createdBy: req.userId,
      });
    }

    let document: any = null;
    let emailMessage = '';

    if (latestPayment && (Boolean(req.body?.printAsConfirmation) || Boolean(confirmationEmail))) {
      const paymentDocument = await buildEventPaymentReceiptDocument({
        receiptNumber: latestPayment.receiptNumber,
        bookingNumber: booking.eventNumber || `EV-${String(booking._id).slice(-6).toUpperCase()}`,
        eventName: booking.eventName,
        organizerName: booking.organizerName,
        organizationName: booking.organizationName,
        contactPhone: booking.contactPhone,
        contactEmail: booking.contactEmail,
        facilities: Array.isArray(booking.facilityIds)
          ? booking.facilityIds.map((facility: any) => ({
              name: facility?.name || '',
              location: facility?.location || '',
            }))
          : [],
        occurrences: normalizeStoredOccurrences(booking),
        totalAmount: Number(booking.totalAmount || 0),
        paidAmount: Number(booking.paidAmount || 0),
        balanceAmount: Number(booking.balanceAmount || 0),
        paymentStatus: String(booking.paymentStatus || ''),
        payment: {
          receiptNumber: latestPayment.receiptNumber,
          amount: Number(latestPayment.amount || 0),
          paidAt: latestPayment.paidAt,
          paymentMethod: latestPayment.paymentMethod,
          remarks: latestPayment.remarks,
        },
        generatedAt: new Date(),
      });

      const emailResult = await attemptDocumentEmail({
        email: confirmationEmail,
        subject: paymentDocument.subject,
        text: paymentDocument.text,
        html: paymentDocument.html,
        fileName: paymentDocument.fileName,
        pdfBuffer: paymentDocument.pdfBuffer,
      });

      if (emailResult.emailed || emailResult.emailError) {
        latestPayment.emailedAt = emailResult.emailed ? new Date() : latestPayment.emailedAt;
        latestPayment.emailedTo = emailResult.emailedTo || undefined;
        latestPayment.confirmationEmail = confirmationEmail || undefined;
        await booking.save();
      }

      document = buildDocumentResponse(paymentDocument.fileName, paymentDocument.pdfBuffer, emailResult);
      if (emailResult.emailed) {
        emailMessage = ` Payment receipt emailed to ${emailResult.emailedTo}.`;
      } else if (emailResult.emailError) {
        emailMessage = ` Payment recorded, but email failed: ${emailResult.emailError}`;
      }
    }

    res.json({
      success: true,
      data: booking,
      payment: latestPayment,
      document,
      message: `Event payment recorded.${emailMessage}`.trim(),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to record event payment' });
  }
});

router.put('/bookings/:id/cancel', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const booking = await EventBooking.findById(req.params.id).populate('facilityIds', 'name location hourlyRate');
    if (!booking) return res.status(404).json({ success: false, error: 'Event booking not found' });
    if (String(booking.status) === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Event already cancelled' });
    }

    const { cancellationReason, remarks } = req.body;
    const firstOccurrence = normalizeStoredOccurrences(booking)[0];
    const { cancellationCharge, refundAmount } = applyCancellationRules(
      new Date(firstOccurrence?.startTime || booking.startTime),
      Number(booking.totalAmount || 0),
      Number(booking.paidAmount || 0)
    );

    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancellationReason = String(cancellationReason || '').trim() || 'Cancelled by user';
    booking.cancellationCharge = cancellationCharge;
    booking.refundAmount = refundAmount;
    booking.balanceAmount = 0;
    booking.paymentStatus = refundAmount > 0 ? 'refunded' : derivePaymentStatus(Number(booking.paidAmount || 0), Number(booking.totalAmount || 0));
    if (remarks !== undefined) booking.remarks = String(remarks || '').trim();
    await booking.save();

    const accountingInvoice = await AccountingInvoice.findOne({
      referenceType: 'event_booking',
      referenceId: booking._id.toString(),
      status: { $ne: 'cancelled' },
    }).sort({ createdAt: -1 });

    if (accountingInvoice?.journalEntryId) {
      const postingMode = String((accountingInvoice.metadata as Record<string, any> | undefined)?.postingMode || '');
      const settlementAccountKey = normalizePaymentMethod(booking.paymentMethod || 'cash') === 'cash'
        ? 'cash_in_hand'
        : 'bank_account';
      const retainedAmount = round2(Math.max(0, Number(booking.paidAmount || 0) - Number(refundAmount || 0)));

      await cancelJournalEntry({
        journalEntryId: accountingInvoice.journalEntryId.toString(),
        reason: `Cancelled event ${booking.eventNumber}`,
        createdBy: req.userId,
      });

      if (postingMode !== 'cash_sale' && Number(refundAmount || 0) > 0) {
        await createJournalEntry({
          entryDate: new Date(),
          referenceType: 'refund',
          referenceId: booking._id.toString(),
          referenceNo: booking.eventNumber,
          description: `Refund for cancelled event ${booking.eventNumber}`,
          paymentMode: normalizePaymentMethod(booking.paymentMethod || 'cash'),
          createdBy: req.userId,
          lines: [
            { accountKey: 'accounts_receivable', debit: round2(Number(refundAmount || 0)), credit: 0, description: 'Reverse received payment' },
            { accountKey: settlementAccountKey, debit: 0, credit: round2(Number(refundAmount || 0)), description: 'Refund cash/bank' },
          ],
        });
      }

      if (retainedAmount > 0) {
        await createJournalEntry({
          entryDate: new Date(),
          referenceType: 'invoice',
          referenceId: booking._id.toString(),
          referenceNo: booking.eventNumber,
          description: `Cancellation charge retained for event ${booking.eventNumber}`,
          paymentMode: normalizePaymentMethod(booking.paymentMethod || 'cash'),
          createdBy: req.userId,
          lines: postingMode === 'cash_sale'
            ? [
                { accountKey: settlementAccountKey, debit: retainedAmount, credit: 0, description: 'Cash retained as cancellation charge' },
                { accountKey: 'event_revenue', debit: 0, credit: retainedAmount, description: 'Cancellation charge income' },
              ]
            : [
                { accountKey: 'accounts_receivable', debit: retainedAmount, credit: 0, description: 'Cancellation charge receivable adjustment' },
                { accountKey: 'event_revenue', debit: 0, credit: retainedAmount, description: 'Cancellation charge income' },
              ],
        });
      }

      accountingInvoice.status = 'cancelled';
      accountingInvoice.cancelledAt = new Date();
      accountingInvoice.cancelledBy = req.userId;
      accountingInvoice.cancellationReason = booking.cancellationReason;
      await accountingInvoice.save();
    }

    res.json({ success: true, data: booking, message: 'Event cancelled and refund tracked' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to cancel event booking' });
  }
});

router.put('/bookings/:id/reschedule', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const booking = await EventBooking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: 'Event booking not found' });

    const storedOccurrences = normalizeStoredOccurrences(booking);
    if (storedOccurrences.length > 1) {
      return res.status(400).json({ success: false, error: 'Multi-date event reschedule is not supported from this screen yet' });
    }

    const { startTime, endTime, facilityIds, reason } = req.body;
    if (!startTime || !endTime) {
      return res.status(400).json({ success: false, error: 'startTime and endTime are required' });
    }

    const selectedFacilities = Array.isArray(facilityIds) && facilityIds.length > 0
      ? facilityIds.map((id: any) => String(id))
      : (booking.facilityIds || []).map((id: any) => String(id));

    const nextOccurrence = normalizeOccurrences({ startTime, endTime })[0];
    if (!nextOccurrence) {
      return res.status(400).json({ success: false, error: 'Valid startTime and endTime are required' });
    }

    await ensureNoBookingConflict(selectedFacilities, nextOccurrence.startTime, nextOccurrence.endTime, String(booking._id));

    const oldStart = new Date(booking.startTime);
    const oldEnd = new Date(booking.endTime);
    booking.facilityIds = selectedFacilities as any;
    booking.startTime = nextOccurrence.startTime;
    booking.endTime = nextOccurrence.endTime;
    booking.occurrences = [nextOccurrence] as any;
    booking.seriesId = undefined;
    booking.seriesTotalDates = 1;
    booking.rescheduleCount = Number(booking.rescheduleCount || 0) + 1;
    const nextHistory = Array.isArray(booking.rescheduleHistory) ? booking.rescheduleHistory : [];
    nextHistory.push({
      fromStart: oldStart,
      fromEnd: oldEnd,
      toStart: nextOccurrence.startTime,
      toEnd: nextOccurrence.endTime,
      reason: String(reason || '').trim() || undefined,
      changedBy: req.userId,
      changedAt: new Date(),
    } as any);
    booking.rescheduleHistory = nextHistory as any;
    booking.reminderAt = new Date(nextOccurrence.startTime.getTime() - 24 * 60 * 60 * 1000);
    await booking.save();

    const updated = await EventBooking.findById(booking._id).populate('facilityIds', 'name location hourlyRate');
    res.json({ success: true, data: updated, message: 'Event rescheduled successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to reschedule event' });
  }
});

router.get('/bookings/:id/receipt', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const booking = await EventBooking.findById(req.params.id).populate('facilityIds', 'name location hourlyRate');
    if (!booking) return res.status(404).json({ success: false, error: 'Event booking not found' });

    const data = buildReceiptData(booking);
    res.json({ success: true, data, message: 'Event confirmation receipt generated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate event receipt' });
  }
});

router.post('/bookings/:id/confirmation-document', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const booking = await EventBooking.findById(req.params.id).populate('facilityIds', 'name location hourlyRate');
    if (!booking) return res.status(404).json({ success: false, error: 'Event booking not found' });

    const receiptData = buildReceiptData(booking);
    const confirmationDocument = await buildEventConfirmationDocument(receiptData);
    const email = normalizeEmail(req.body?.confirmationEmail || booking.contactEmail || '');
    const emailResult = await attemptDocumentEmail({
      email,
      subject: confirmationDocument.subject,
      text: confirmationDocument.text,
      html: confirmationDocument.html,
      fileName: confirmationDocument.fileName,
      pdfBuffer: confirmationDocument.pdfBuffer,
    });

    res.json({
      success: true,
      data: buildDocumentResponse(confirmationDocument.fileName, confirmationDocument.pdfBuffer, emailResult),
      message: emailResult.emailed
        ? `Booking confirmation prepared and emailed to ${emailResult.emailedTo}`
        : emailResult.emailError
          ? `Booking confirmation prepared. Email failed: ${emailResult.emailError}`
          : 'Booking confirmation prepared',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to prepare booking confirmation' });
  }
});

router.post('/bookings/:id/payments/:paymentId/confirmation', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const booking = await EventBooking.findById(req.params.id).populate('facilityIds', 'name location hourlyRate');
    if (!booking) return res.status(404).json({ success: false, error: 'Event booking not found' });

    const payment = Array.isArray(booking.payments)
      ? booking.payments.find((row: any) => String(row._id) === String(req.params.paymentId))
      : null;
    if (!payment) {
      return res.status(404).json({ success: false, error: 'Payment receipt not found' });
    }

    const paymentDocument = await buildEventPaymentReceiptDocument({
      receiptNumber: payment.receiptNumber,
      bookingNumber: booking.eventNumber || `EV-${String(booking._id).slice(-6).toUpperCase()}`,
      eventName: booking.eventName,
      organizerName: booking.organizerName,
      organizationName: booking.organizationName,
      contactPhone: booking.contactPhone,
      contactEmail: booking.contactEmail,
      facilities: Array.isArray(booking.facilityIds)
        ? booking.facilityIds.map((facility: any) => ({
            name: facility?.name || '',
            location: facility?.location || '',
          }))
        : [],
      occurrences: normalizeStoredOccurrences(booking),
      totalAmount: Number(booking.totalAmount || 0),
      paidAmount: Number(booking.paidAmount || 0),
      balanceAmount: Number(booking.balanceAmount || 0),
      paymentStatus: String(booking.paymentStatus || ''),
      payment: {
        receiptNumber: payment.receiptNumber,
        amount: Number(payment.amount || 0),
        paidAt: payment.paidAt,
        paymentMethod: payment.paymentMethod,
        remarks: payment.remarks,
      },
      generatedAt: new Date(),
    });

    const email = normalizeEmail(req.body?.confirmationEmail || payment.confirmationEmail || booking.contactEmail || '');
    const emailResult = await attemptDocumentEmail({
      email,
      subject: paymentDocument.subject,
      text: paymentDocument.text,
      html: paymentDocument.html,
      fileName: paymentDocument.fileName,
      pdfBuffer: paymentDocument.pdfBuffer,
    });

    if (emailResult.emailed || emailResult.emailError) {
      payment.emailedAt = emailResult.emailed ? new Date() : payment.emailedAt;
      payment.emailedTo = emailResult.emailedTo || undefined;
      payment.confirmationEmail = email || undefined;
      await booking.save();
    }

    res.json({
      success: true,
      data: buildDocumentResponse(paymentDocument.fileName, paymentDocument.pdfBuffer, emailResult),
      message: emailResult.emailed
        ? `Payment receipt prepared and emailed to ${emailResult.emailedTo}`
        : emailResult.emailError
          ? `Payment receipt prepared. Email failed: ${emailResult.emailError}`
          : 'Payment receipt prepared',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to prepare payment receipt' });
  }
});

router.get('/reminders', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const days = Math.max(1, Math.min(30, Number(req.query.days || 5)));
    const now = new Date();
    const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const [upcomingRows, paymentDue] = await Promise.all([
      EventBooking.find({
        status: { $in: ACTIVE_EVENT_STATUSES },
        ...listFilterByRange(now, until),
      })
        .populate('facilityIds', 'name location')
        .limit(100),
      EventBooking.find({
        status: { $in: ACTIVE_EVENT_STATUSES },
        balanceAmount: { $gt: 0 },
      })
        .populate('facilityIds', 'name location')
        .sort({ startTime: 1 })
        .limit(50),
    ]);

    const upcoming = upcomingRows
      .map((row) => ({
        row,
        nextOccurrence: nextUpcomingOccurrence(row, now, until),
      }))
      .filter((entry) => entry.nextOccurrence)
      .sort((a, b) => a.nextOccurrence!.startTime.getTime() - b.nextOccurrence!.startTime.getTime())
      .slice(0, 50)
      .map((entry) => entry.row);

    res.json({ success: true, data: { upcoming, paymentDue } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch event reminders' });
  }
});

export default router;
