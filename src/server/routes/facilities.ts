import { Router, Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.js';
import { Facility } from '../models/Facility.js';
import { FacilityBooking } from '../models/FacilityBooking.js';
import { Customer } from '../models/Customer.js';
import { MemberSubscription } from '../models/MemberSubscription.js';
import { MembershipPlan } from '../models/MembershipPlan.js';
import { AccountingInvoice } from '../models/AccountingInvoice.js';
import { generateNumber } from '../services/numbering.js';
import { cancelJournalEntry, createInvoice, createJournalEntry, recordPayment } from '../services/accountingEngine.js';

const router = Router();
const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'booked'] as const;
type BookingStatus = 'pending' | 'confirmed' | 'booked' | 'completed' | 'cancelled';
type PaymentStatus = 'pending' | 'partial' | 'paid' | 'refunded';
type BookingPaymentMethod = 'cash' | 'card' | 'upi' | 'bank_transfer' | 'cheque' | 'online';

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const normalizePhone = (value: any): string => String(value || '').replace(/\D+/g, '').slice(-10);
const normalizeEmail = (value: any): string => String(value || '').trim().toLowerCase();
const normalizePaymentMethod = (value: any): BookingPaymentMethod => {
  const method = String(value || 'cash').trim().toLowerCase();
  if (method === 'card') return 'card';
  if (method === 'upi') return 'upi';
  if (method === 'bank_transfer') return 'bank_transfer';
  if (method === 'cheque') return 'cheque';
  if (method === 'online') return 'online';
  return 'cash';
};

const normalizeStatus = (status: any): BookingStatus => {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'confirmed') return 'confirmed';
  if (value === 'booked') return 'booked';
  if (value === 'completed') return 'completed';
  if (value === 'cancelled') return 'cancelled';
  return 'pending';
};

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
  return { chargePct, cancellationCharge, refundAmount };
};

const facilityNameNormalized = (facility: any): string =>
  String(facility?.name || '')
    .trim()
    .toLowerCase();

const isBadmintonFacility = (facility: any): boolean =>
  facilityNameNormalized(facility).includes('badminton');

const isFootballTurfFacility = (facility: any): boolean => {
  const name = facilityNameNormalized(facility);
  return name.includes('football') && name.includes('turf');
};

const isSwimmingPoolFacility = (facility: any): boolean => {
  const name = facilityNameNormalized(facility);
  return name.includes('swimming') && name.includes('pool');
};

const facilityMaxUnits = (facility: any): number => {
  if (isBadmintonFacility(facility)) return 8;
  if (isFootballTurfFacility(facility)) return 1;
  if (isSwimmingPoolFacility(facility)) return 1;
  const configured = Number(facility?.capacity || 0);
  return configured > 0 ? Math.floor(configured) : 1;
};

const normalizeRequestedUnits = (facility: any, rawUnits: any): number => {
  const maxUnits = facilityMaxUnits(facility);
  const requested = Math.max(1, Math.floor(Number(rawUnits || 1)));
  if (maxUnits <= 1) return 1;
  return Math.min(maxUnits, requested);
};

const overlappingFacilityBookedUnits = async (
  facilityId: any,
  start: Date,
  end: Date,
  excludeBookingId?: string
): Promise<number> => {
  const filter: any = {
    facilityId,
    status: { $in: ACTIVE_BOOKING_STATUSES },
    startTime: { $lt: end },
    endTime: { $gt: start },
  };
  if (excludeBookingId) {
    filter._id = { $ne: excludeBookingId };
  }

  const overlapping = await FacilityBooking.find(filter).select('bookedUnits');
  return overlapping.reduce((sum, row: any) => sum + Math.max(1, Number(row.bookedUnits || 1)), 0);
};

const findOrCreateCustomerByPhone = async (args: {
  customerId?: any;
  customerPhone?: any;
  customerName?: any;
  customerEmail?: any;
  createdBy?: string;
}) => {
  const normalizedPhone = normalizePhone(args.customerPhone);
  const normalizedEmail = normalizeEmail(args.customerEmail);
  const normalizedName = String(args.customerName || '').trim();

  if (args.customerId) {
    const existingById = await Customer.findById(args.customerId);
    if (!existingById) throw new Error('Customer not found');
    let changed = false;
    if (normalizedPhone && existingById.phone !== normalizedPhone) {
      existingById.phone = normalizedPhone;
      changed = true;
    }
    if (normalizedEmail && existingById.email !== normalizedEmail) {
      existingById.email = normalizedEmail;
      changed = true;
    }
    if (normalizedName && existingById.name !== normalizedName) {
      existingById.name = normalizedName;
      changed = true;
    }
    if (changed) await existingById.save();
    return existingById;
  }

  if (!normalizedPhone) return null;

  const existingByPhone = await Customer.findOne({ phone: normalizedPhone }).sort({ createdAt: -1 });
  if (existingByPhone) {
    let changed = false;
    if (normalizedEmail && !existingByPhone.email) {
      existingByPhone.email = normalizedEmail;
      changed = true;
    }
    if (normalizedName && existingByPhone.name !== normalizedName) {
      existingByPhone.name = normalizedName;
      changed = true;
    }
    if (changed) await existingByPhone.save();
    return existingByPhone;
  }

  const member = await MemberSubscription.findOne({ phone: normalizedPhone })
    .select('memberName fullName email')
    .sort({ updatedAt: -1, createdAt: -1 });
  const memberName = String(member?.memberName || member?.fullName || '').trim();
  const memberEmail = normalizeEmail(member?.email);

  const customerCode = await generateNumber('customer_code', { prefix: 'CUST-', padTo: 5 });
  const customer = await Customer.create({
    customerCode,
    name: normalizedName || memberName || `Customer ${normalizedPhone}`,
    phone: normalizedPhone,
    email: normalizedEmail || memberEmail || undefined,
    accountType: 'cash',
    creditLimit: 0,
    creditDays: 0,
    openingBalance: 0,
    outstandingBalance: 0,
    createdBy: args.createdBy,
  });
  return customer;
};

router.get('/', authMiddleware, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const facilities = await Facility.find().sort({ active: -1, name: 1 });
    res.json({ success: true, data: facilities });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch facilities' });
  }
});

router.post('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, type, location, hourlyRate, capacity, description, imageUrl, active } = req.body;

    if (!name || hourlyRate === undefined) {
      return res.status(400).json({ success: false, error: 'name and hourlyRate are required' });
    }

    if (!imageUrl || !String(imageUrl).trim()) {
      return res.status(400).json({ success: false, error: 'Facility image is required' });
    }

    const derivedCapacity = (() => {
      const probe = { name, capacity: Number(capacity || 0) };
      if (isBadmintonFacility(probe)) return 8;
      if (isFootballTurfFacility(probe)) return 1;
      if (isSwimmingPoolFacility(probe)) return 1;
      return Number(capacity || 0);
    })();

    const facility = await Facility.create({
      name,
      type: type || 'other',
      location,
      hourlyRate: Number(hourlyRate),
      capacity: Number(derivedCapacity || 0),
      description,
      imageUrl: String(imageUrl).trim(),
      active: active !== undefined ? Boolean(active) : true,
      createdBy: req.userId,
    });

    res.status(201).json({ success: true, data: facility, message: 'Facility created' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create facility' });
  }
});

router.put('/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const existing = await Facility.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, error: 'Facility not found' });

    const updates = { ...req.body } as any;
    if (updates.imageUrl !== undefined) {
      updates.imageUrl = String(updates.imageUrl || '').trim();
    }
    if (updates.type === '' || updates.type === null) {
      updates.type = 'other';
    }

    const candidate = {
      name: updates.name !== undefined ? updates.name : existing.name,
      capacity: updates.capacity !== undefined ? Number(updates.capacity || 0) : Number(existing.capacity || 0),
    };
    if (isBadmintonFacility(candidate)) updates.capacity = 8;
    else if (isFootballTurfFacility(candidate) || isSwimmingPoolFacility(candidate)) updates.capacity = 1;

    const facility = await Facility.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!facility) return res.status(404).json({ success: false, error: 'Facility not found' });

    res.json({ success: true, data: facility, message: 'Facility updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update facility' });
  }
});

router.get('/customers/search', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ success: true, data: [] });
    const normalizedPhone = normalizePhone(q);
    const regex = new RegExp(q, 'i');
    const filter: any = {
      $or: [
        { name: regex },
        { customerCode: regex },
        { phone: regex },
        { email: regex },
      ],
    };
    if (normalizedPhone) {
      filter.$or.push({ phone: normalizedPhone });
    }
    const customers = await Customer.find(filter)
      .select('_id customerCode name phone email accountType isBlocked')
      .sort({ updatedAt: -1, name: 1 })
      .limit(10);
    res.json({ success: true, data: customers });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to search customers' });
  }
});

router.get('/customers/by-phone/:phone', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const phone = normalizePhone(req.params.phone);
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Valid phone number is required' });
    }
    const customer = await Customer.findOne({ phone })
      .select('_id customerCode name phone email accountType isBlocked')
      .sort({ updatedAt: -1, createdAt: -1 });
    if (!customer) return res.json({ success: true, data: null });
    res.json({ success: true, data: customer });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch customer by phone' });
  }
});

router.get('/bookings/list', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { date, startDate, endDate, facilityId, status } = req.query;
    const filter: any = {};

    if (facilityId) filter.facilityId = facilityId;
    if (status) filter.status = status;

    const dateRangeStart = startDate || date;
    if (dateRangeStart) {
      const start = new Date(dateRangeStart as string);
      start.setHours(0, 0, 0, 0);
      const end = endDate ? new Date(endDate as string) : new Date(start);
      end.setHours(23, 59, 59, 999);
      filter.startTime = { $lte: end };
      filter.endTime = { $gte: start };
    }

    const bookings = await FacilityBooking.find(filter)
      .populate('facilityId', 'name location hourlyRate imageUrl')
      .populate({
        path: 'memberSubscriptionId',
        select: 'memberName status endDate bookingDiscountPercentage planId',
        populate: { path: 'planId', select: 'name bookingDiscountPercentage' },
      })
      .sort({ startTime: 1 });

    res.json({ success: true, data: bookings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch bookings' });
  }
});

router.post('/bookings', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      facilityId,
      customerId,
      customerName,
      customerPhone,
      customerEmail,
      startTime,
      endTime,
      amount,
      totalAmount,
      gstAmount,
      gstRate,
      gstTreatment,
      advanceAmount,
      paidAmount,
      paymentMethod,
      paymentStatus,
      status,
      notes,
      remarks,
      reminderAt,
      memberSubscriptionId,
      bookedUnits,
    } = req.body;

    if (!facilityId || !startTime || !endTime) {
      return res.status(400).json({ success: false, error: 'facilityId, startTime and endTime are required' });
    }
    const normalizedPhone = normalizePhone(customerPhone);
    if (!normalizedPhone) {
      return res.status(400).json({ success: false, error: 'customerPhone is required' });
    }

    const facility = await Facility.findById(facilityId);
    if (!facility) return res.status(404).json({ success: false, error: 'Facility not found' });

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (end <= start) {
      return res.status(400).json({ success: false, error: 'endTime must be greater than startTime' });
    }

    const maxUnits = facilityMaxUnits(facility);
    const requestedUnits = normalizeRequestedUnits(facility, bookedUnits);
    const occupiedUnits = await overlappingFacilityBookedUnits(facilityId, start, end);
    const availableUnits = Math.max(0, maxUnits - occupiedUnits);
    if (requestedUnits > availableUnits) {
      return res.status(409).json({
        success: false,
        error: maxUnits > 1
          ? `Only ${availableUnits} court(s) available for selected badminton slot`
          : 'Selected slot is already booked',
      });
    }

    let bookingDiscountPercentage = 0;
    const linkedCustomer = await findOrCreateCustomerByPhone({
      customerId,
      customerPhone: normalizedPhone,
      customerName,
      customerEmail,
      createdBy: req.userId,
    });
    const resolvedCustomerName = String(linkedCustomer?.name || customerName || '').trim();
    if (!resolvedCustomerName) {
      return res.status(400).json({ success: false, error: 'customerName is required for new customer' });
    }
    const resolvedCustomerEmail = normalizeEmail(linkedCustomer?.email || customerEmail || '');

    if (memberSubscriptionId) {
      const subscription = await MemberSubscription.findById(memberSubscriptionId).populate('planId');
      if (!subscription) {
        return res.status(404).json({ success: false, error: 'Member subscription not found' });
      }

      if (!['active'].includes(String(subscription.status || '').toLowerCase())) {
        return res.status(400).json({ success: false, error: 'Membership is not active' });
      }

      if (new Date(subscription.endDate).getTime() < Date.now()) {
        subscription.status = 'expired';
        await subscription.save();
        return res.status(400).json({ success: false, error: 'Membership has expired' });
      }

      const plan = subscription.planId as any;
      if (plan?._id) {
        const fullPlan = await MembershipPlan.findById(plan._id);
        const selectedFacilityId = String(facilityId);
        const allowedFacilities = Array.isArray(fullPlan?.facilityIds) ? fullPlan?.facilityIds : [];
        if (allowedFacilities.length > 0 && !allowedFacilities.some((id: any) => String(id) === selectedFacilityId)) {
          return res.status(400).json({ success: false, error: 'Selected facility is not covered under this membership plan' });
        }
        bookingDiscountPercentage = Number(
          subscription.bookingDiscountPercentage ?? fullPlan?.bookingDiscountPercentage ?? plan?.bookingDiscountPercentage ?? 0
        );
      }
    }

    const hours = Math.max((end.getTime() - start.getTime()) / (1000 * 60 * 60), 0);
    const baseAmount =
      totalAmount !== undefined
        ? Number(totalAmount)
        : amount !== undefined
          ? Number(amount)
          : round2(hours * Number(facility.hourlyRate || 0) * requestedUnits);
    const discountedAmount = round2(baseAmount - (baseAmount * Math.max(0, bookingDiscountPercentage)) / 100);
    const finalTotalAmount = Math.max(0, discountedAmount);
    const finalAdvance = round2(Math.max(0, Number(advanceAmount || 0)));
    const finalPaid = round2(Math.max(finalAdvance, Number(paidAmount ?? finalAdvance)));
    const cappedPaid = Math.min(finalPaid, finalTotalAmount);
    const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
    const balance = round2(Math.max(0, finalTotalAmount - cappedPaid));
    const statusValue = normalizeStatus(status);
    const payment = paymentStatus
      ? (String(paymentStatus).toLowerCase() as PaymentStatus)
      : derivePaymentStatus(cappedPaid, finalTotalAmount, false);
    const bookingNumber = await generateNumber('event_booking_number', {
      prefix: 'EVT-',
      datePart: true,
      padTo: 5,
    });

    const booking = await FacilityBooking.create({
      bookingNumber,
      facilityId,
      customerId: linkedCustomer?._id,
      customerName: resolvedCustomerName,
      customerPhone: normalizedPhone,
      customerEmail: resolvedCustomerEmail || undefined,
      memberSubscriptionId: memberSubscriptionId || undefined,
      startTime: start,
      endTime: end,
      amount: finalTotalAmount,
      totalAmount: finalTotalAmount,
      gstAmount: round2(Number(gstAmount || 0)),
      gstTreatment: String(gstTreatment || 'none').toLowerCase() === 'interstate'
        ? 'interstate'
        : String(gstTreatment || 'none').toLowerCase() === 'intrastate'
          ? 'intrastate'
          : 'none',
      advanceAmount: finalAdvance,
      paidAmount: cappedPaid,
      balanceAmount: balance,
      paymentStatus: payment,
      paymentMethod: normalizedPaymentMethod,
      notes,
      remarks,
      reminderAt: reminderAt ? new Date(reminderAt) : new Date(start.getTime() - 24 * 60 * 60 * 1000),
      status: statusValue,
      bookedUnits: requestedUnits,
      createdBy: req.userId,
    });

    await createInvoice({
      invoiceDate: new Date(),
      customerId: linkedCustomer?._id?.toString(),
      customerName: resolvedCustomerName,
      referenceType: 'facility_booking',
      referenceId: booking._id.toString(),
      description: `Facility booking ${booking.bookingNumber}`,
      baseAmount: round2(Math.max(0, finalTotalAmount - Number(gstAmount || 0))),
      gstAmount: round2(Number(gstAmount || 0)),
      gstRate: Number(gstRate || 0),
      gstTreatment: booking.gstTreatment || 'none',
      paymentAmount: cappedPaid,
      paymentMode: normalizedPaymentMethod,
      revenueAccountKey: 'booking_revenue',
      createdBy: req.userId,
      metadata: {
        bookingNumber: booking.bookingNumber,
        facilityId: facility._id.toString(),
        facilityName: facility.name,
      },
    });

    res.status(201).json({ success: true, data: booking, message: 'Booking created' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create booking' });
  }
});

router.put('/bookings/:id/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const booking = await FacilityBooking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

    const { status, paymentStatus, remarks, notes, paidAmount } = req.body;
    if (status) {
      booking.status = normalizeStatus(status) as any;
      if (booking.status === 'cancelled') {
        booking.cancelledAt = new Date();
      }
    }
    if (paidAmount !== undefined) {
      return res.status(400).json({
        success: false,
        error: 'Direct paidAmount editing is not allowed. Use the booking payment action to post accounting correctly.',
      });
    }
    if (paymentStatus) booking.paymentStatus = String(paymentStatus).toLowerCase() as any;
    else booking.paymentStatus = derivePaymentStatus(Number(booking.paidAmount || 0), Number(booking.totalAmount || 0));
    if (remarks !== undefined) booking.remarks = String(remarks || '').trim();
    if (notes !== undefined) booking.notes = String(notes || '').trim();

    await booking.save();
    const populated = await FacilityBooking.findById(booking._id).populate('facilityId', 'name location hourlyRate imageUrl');

    if (!populated) return res.status(404).json({ success: false, error: 'Booking not found' });

    res.json({ success: true, data: populated, message: 'Booking updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update booking' });
  }
});

router.post('/bookings/:id/payments', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { amount, remarks, paymentMethod } = req.body;
    const payAmount = Number(amount || 0);
    if (payAmount <= 0) {
      return res.status(400).json({ success: false, error: 'amount must be greater than zero' });
    }

    const booking = await FacilityBooking.findById(req.params.id).populate('facilityId', 'name location hourlyRate imageUrl');
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    if (String(booking.status) === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Cancelled booking cannot accept payments' });
    }

    const totalAmount = Number(booking.totalAmount || booking.amount || 0);
    const currentPaid = Number(booking.paidAmount || 0);
    const nextPaid = round2(Math.min(totalAmount, currentPaid + payAmount));
    const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod || booking.paymentMethod || 'cash');
    booking.paidAmount = nextPaid;
    booking.balanceAmount = round2(Math.max(0, totalAmount - nextPaid));
    booking.paymentStatus = derivePaymentStatus(nextPaid, totalAmount);
    booking.paymentMethod = normalizedPaymentMethod;
    if (String(booking.status) === 'pending' && booking.paidAmount > 0) {
      booking.status = 'confirmed' as any;
    }
    if (remarks) {
      const existing = String(booking.remarks || '').trim();
      booking.remarks = existing ? `${existing}\n${String(remarks).trim()}` : String(remarks).trim();
    }
    await booking.save();

    const accountingInvoice = await AccountingInvoice.findOne({
      referenceType: 'facility_booking',
      referenceId: booking._id.toString(),
      status: { $ne: 'cancelled' },
    }).sort({ createdAt: -1 });
    if (accountingInvoice) {
      await recordPayment({
        invoiceId: accountingInvoice._id.toString(),
        amount: payAmount,
        mode: normalizedPaymentMethod,
        description: `Payment for booking ${booking.bookingNumber}`,
        createdBy: req.userId,
      });
    }

    res.json({
      success: true,
      data: booking,
      message: `Payment recorded. Balance ${round2(Number(booking.balanceAmount || 0))}`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to record booking payment' });
  }
});

router.put('/bookings/:id/cancel', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { cancellationReason, remarks } = req.body;
    const booking = await FacilityBooking.findById(req.params.id).populate('facilityId', 'name location hourlyRate imageUrl');
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });
    if (String(booking.status) === 'cancelled') {
      return res.status(400).json({ success: false, error: 'Booking already cancelled' });
    }

    const rules = applyCancellationRules(
      new Date(booking.startTime),
      Number(booking.totalAmount || booking.amount || 0),
      Number(booking.paidAmount || 0)
    );

    booking.status = 'cancelled' as any;
    booking.cancelledAt = new Date();
    booking.cancellationReason = String(cancellationReason || '').trim() || 'Cancelled by user';
    booking.cancellationCharge = rules.cancellationCharge;
    booking.refundAmount = rules.refundAmount;
    booking.balanceAmount = 0;
    booking.paymentStatus = rules.refundAmount > 0 ? ('refunded' as any) : derivePaymentStatus(Number(booking.paidAmount || 0), Number(booking.totalAmount || booking.amount || 0));
    if (remarks !== undefined) {
      const existing = String(booking.remarks || '').trim();
      const next = String(remarks || '').trim();
      booking.remarks = next ? (existing ? `${existing}\n${next}` : next) : existing;
    }
    await booking.save();

    const accountingInvoice = await AccountingInvoice.findOne({
      referenceType: 'facility_booking',
      referenceId: booking._id.toString(),
      status: { $ne: 'cancelled' },
    }).sort({ createdAt: -1 });

    if (accountingInvoice?.journalEntryId) {
      const postingMode = String((accountingInvoice.metadata as Record<string, any> | undefined)?.postingMode || '');
      const settlementAccountKey = normalizePaymentMethod(booking.paymentMethod || 'cash') === 'cash'
        ? 'cash_in_hand'
        : 'bank_account';
      const retainedAmount = round2(Math.max(0, Number(booking.paidAmount || 0) - Number(rules.refundAmount || 0)));

      await cancelJournalEntry({
        journalEntryId: accountingInvoice.journalEntryId.toString(),
        reason: `Cancelled booking ${booking.bookingNumber}`,
        createdBy: req.userId,
      });

      if (postingMode !== 'cash_sale' && Number(rules.refundAmount || 0) > 0) {
        await createJournalEntry({
          entryDate: new Date(),
          referenceType: 'refund',
          referenceId: booking._id.toString(),
          referenceNo: booking.bookingNumber,
          description: `Refund for cancelled booking ${booking.bookingNumber}`,
          paymentMode: normalizePaymentMethod(booking.paymentMethod || 'cash'),
          createdBy: req.userId,
          lines: [
            { accountKey: 'accounts_receivable', debit: round2(Number(rules.refundAmount || 0)), credit: 0, description: 'Reverse received payment' },
            { accountKey: settlementAccountKey, debit: 0, credit: round2(Number(rules.refundAmount || 0)), description: 'Refund cash/bank' },
          ],
        });
      }

      if (retainedAmount > 0) {
        await createJournalEntry({
          entryDate: new Date(),
          referenceType: 'invoice',
          referenceId: booking._id.toString(),
          referenceNo: booking.bookingNumber,
          description: `Cancellation charge retained for booking ${booking.bookingNumber}`,
          paymentMode: normalizePaymentMethod(booking.paymentMethod || 'cash'),
          createdBy: req.userId,
          lines: postingMode === 'cash_sale'
            ? [
                { accountKey: settlementAccountKey, debit: retainedAmount, credit: 0, description: 'Cash retained as cancellation charge' },
                { accountKey: 'booking_revenue', debit: 0, credit: retainedAmount, description: 'Cancellation charge income' },
              ]
            : [
                { accountKey: 'accounts_receivable', debit: retainedAmount, credit: 0, description: 'Cancellation charge receivable adjustment' },
                { accountKey: 'booking_revenue', debit: 0, credit: retainedAmount, description: 'Cancellation charge income' },
              ],
        });
      }

      accountingInvoice.status = 'cancelled';
      accountingInvoice.cancelledAt = new Date();
      accountingInvoice.cancelledBy = req.userId;
      accountingInvoice.cancellationReason = booking.cancellationReason;
      await accountingInvoice.save();
    }

    res.json({
      success: true,
      data: booking,
      message: `Booking cancelled. Refund ${rules.refundAmount} after cancellation charge ${rules.cancellationCharge}`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to cancel booking' });
  }
});

router.put('/bookings/:id/reschedule', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { startTime, endTime, facilityId, reason, bookedUnits } = req.body;
    if (!startTime || !endTime) {
      return res.status(400).json({ success: false, error: 'startTime and endTime are required' });
    }

    const booking = await FacilityBooking.findById(req.params.id);
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

    const targetFacilityId = facilityId || booking.facilityId;
    const facility = await Facility.findById(targetFacilityId);
    if (!facility) return res.status(404).json({ success: false, error: 'Facility not found' });
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (end <= start) {
      return res.status(400).json({ success: false, error: 'endTime must be greater than startTime' });
    }

    const requestedUnits = normalizeRequestedUnits(facility, bookedUnits ?? booking.bookedUnits ?? 1);
    const maxUnits = facilityMaxUnits(facility);
    const occupiedUnits = await overlappingFacilityBookedUnits(targetFacilityId, start, end, String(booking._id));
    const availableUnits = Math.max(0, maxUnits - occupiedUnits);
    if (requestedUnits > availableUnits) {
      return res.status(409).json({
        success: false,
        error: maxUnits > 1
          ? `Only ${availableUnits} court(s) available for selected badminton slot`
          : 'Selected slot is already booked',
      });
    }

    const oldStart = new Date(booking.startTime);
    const oldEnd = new Date(booking.endTime);

    booking.facilityId = targetFacilityId as any;
    booking.startTime = start;
    booking.endTime = end;
    booking.bookedUnits = requestedUnits as any;
    booking.rescheduleCount = Number(booking.rescheduleCount || 0) + 1;
    const nextHistory = Array.isArray(booking.rescheduleHistory) ? booking.rescheduleHistory : [];
    nextHistory.push({
      fromStart: oldStart,
      fromEnd: oldEnd,
      toStart: start,
      toEnd: end,
      reason: String(reason || '').trim() || undefined,
      changedBy: req.userId,
      changedAt: new Date(),
    } as any);
    booking.rescheduleHistory = nextHistory as any;
    booking.reminderAt = new Date(start.getTime() - 24 * 60 * 60 * 1000);
    await booking.save();

    const updated = await FacilityBooking.findById(booking._id).populate('facilityId', 'name location hourlyRate imageUrl');

    res.json({ success: true, data: updated, message: 'Booking rescheduled' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to reschedule booking' });
  }
});

router.get('/bookings/:id/receipt', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const booking = await FacilityBooking.findById(req.params.id)
      .populate('facilityId', 'name location hourlyRate')
      .populate({
        path: 'memberSubscriptionId',
        select: 'memberName memberCode bookingDiscountPercentage planId',
        populate: { path: 'planId', select: 'name' },
      });
    if (!booking) return res.status(404).json({ success: false, error: 'Booking not found' });

    const receipt = {
      receiptNumber: booking.bookingNumber || `BK-${booking._id.toString().slice(-6).toUpperCase()}`,
      generatedAt: new Date(),
      bookingId: booking._id,
      bookingStatus: booking.status,
      paymentStatus: booking.paymentStatus,
      customerName: booking.customerName,
      customerPhone: booking.customerPhone,
      customerEmail: booking.customerEmail,
      facilityName: (booking.facilityId as any)?.name || '',
      facilityLocation: (booking.facilityId as any)?.location || '',
      bookedUnits: Number(booking.bookedUnits || 1),
      startTime: booking.startTime,
      endTime: booking.endTime,
      totalAmount: Number(booking.totalAmount || booking.amount || 0),
      advanceAmount: Number(booking.advanceAmount || 0),
      paidAmount: Number(booking.paidAmount || 0),
      balanceAmount: Number(booking.balanceAmount || 0),
      cancellationCharge: Number(booking.cancellationCharge || 0),
      refundAmount: Number(booking.refundAmount || 0),
      remarks: booking.remarks || booking.notes || '',
      member: booking.memberSubscriptionId
        ? {
            memberName: (booking.memberSubscriptionId as any).memberName,
            memberCode: (booking.memberSubscriptionId as any).memberCode,
            planName: (booking.memberSubscriptionId as any)?.planId?.name,
            bookingDiscountPercentage: Number((booking.memberSubscriptionId as any)?.bookingDiscountPercentage || 0),
          }
        : null,
    };

    res.json({
      success: true,
      data: receipt,
      message: 'Booking confirmation receipt generated',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to generate booking receipt' });
  }
});

router.get('/bookings/reminders', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const days = Math.max(1, Math.min(30, Number(req.query.days || 3)));
    const now = new Date();
    const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const upcoming = await FacilityBooking.find({
      status: { $in: ACTIVE_BOOKING_STATUSES },
      startTime: { $gte: now, $lte: until },
    })
      .populate('facilityId', 'name location')
      .sort({ startTime: 1 })
      .limit(40);

    const paymentDue = await FacilityBooking.find({
      status: { $in: ACTIVE_BOOKING_STATUSES },
      balanceAmount: { $gt: 0 },
    })
      .populate('facilityId', 'name location')
      .sort({ startTime: 1 })
      .limit(40);

    res.json({
      success: true,
      data: {
        upcoming,
        paymentDue,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load booking reminders' });
  }
});

export default router;
