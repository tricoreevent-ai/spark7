import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { Customer } from '../models/Customer.js';
import { EventQuotation } from '../models/EventQuotation.js';
import { Facility } from '../models/Facility.js';
import { generateNumber } from '../services/numbering.js';
import { writeAuditLog } from '../services/audit.js';
import { buildEventQuotationDocument } from '../services/eventDocuments.js';

const router = Router();

const DEFAULT_TERMS_AND_CONDITIONS = `1. Tentative blocking remains subject to facility availability at the time of approval.
2. Full sports complex rules, timing rules, and player discipline rules must be followed during the event.
3. Any damage to courts, lighting, seating, equipment, or common areas will be charged separately.
4. Final billing is based on the approved quotation, applicable taxes, and any extra services used on the event day.
5. Cancellation and rescheduling are subject to the venue policy and available slot timing.
6. Entry, setup, cleanup, and activity must stay within the approved booking window.`;

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const normalizeEmail = (value: any): string => String(value || '').trim().toLowerCase();
const normalizePhone = (value: any): string => String(value || '').replace(/\D+/g, '').slice(-10);

const findOrCreateQuotationCustomer = async (args: {
  customerId?: any;
  organizerName?: any;
  contactPhone?: any;
  contactEmail?: any;
  createdBy?: string;
}) => {
  const normalizedPhone = normalizePhone(args.contactPhone);
  const normalizedEmail = normalizeEmail(args.contactEmail);
  const normalizedName = String(args.organizerName || '').trim();

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

  if (normalizedPhone) {
    const existingByPhone = await Customer.findOne({ phone: normalizedPhone }).sort({ updatedAt: -1, createdAt: -1 });
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
  }

  if (!normalizedName) return null;

  const customerCode = await generateNumber('customer_code', { prefix: 'CUST-', padTo: 5 });
  return Customer.create({
    customerCode,
    name: normalizedName,
    phone: normalizedPhone || undefined,
    email: normalizedEmail || undefined,
    customerCategory: 'individual',
    accountType: 'cash',
    creditLimit: 0,
    creditDays: 0,
    openingBalance: 0,
    outstandingBalance: 0,
    createdBy: args.createdBy,
  });
};

type NormalizedOccurrence = {
  occurrenceDate: Date;
  startTime: Date;
  endTime: Date;
};

type NormalizedItem = {
  itemType: 'facility' | 'service' | 'custom';
  facilityId?: string;
  description: string;
  quantity: number;
  unitLabel?: string;
  unitPrice: number;
  lineTotal: number;
  notes?: string;
};

const isValidDate = (value: Date): boolean => !Number.isNaN(value.getTime());

const occurrenceDateKey = (value: Date) => value.toISOString().slice(0, 10);

const normalizeQuoteStatus = (value: any) => {
  const normalized = String(value || 'draft').trim().toLowerCase();
  if (normalized === 'sent') return 'sent';
  if (normalized === 'approved') return 'approved';
  if (normalized === 'rejected') return 'rejected';
  if (normalized === 'expired') return 'expired';
  if (normalized === 'replaced') return 'replaced';
  if (normalized === 'booked') return 'booked';
  return 'draft';
};

const normalizeDiscountType = (value: any): 'percentage' | 'fixed' =>
  String(value || '').trim().toLowerCase() === 'fixed' ? 'fixed' : 'percentage';

const normalizeOccurrences = (body: any): NormalizedOccurrence[] => {
  const incoming = Array.isArray(body?.occurrences) ? body.occurrences : [];
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
    .filter((row: NormalizedOccurrence | null): row is NormalizedOccurrence => Boolean(row))
    .sort((a: NormalizedOccurrence, b: NormalizedOccurrence) => a.startTime.getTime() - b.startTime.getTime());

  return normalized;
};

const validateOccurrences = (occurrences: NormalizedOccurrence[]) => {
  if (!occurrences.length) {
    throw new Error('At least one event date is required for the quotation');
  }

  const seen = new Set<string>();
  occurrences.forEach((occurrence) => {
    if (occurrence.endTime <= occurrence.startTime) {
      throw new Error('Each event time slot must end after it starts');
    }
    const key = occurrenceDateKey(occurrence.occurrenceDate);
    if (seen.has(key)) {
      throw new Error(`Duplicate event date selected: ${key}`);
    }
    seen.add(key);
  });
};

const durationHours = (occurrence: NormalizedOccurrence) =>
  Math.max(0, (occurrence.endTime.getTime() - occurrence.startTime.getTime()) / (1000 * 60 * 60));

const reserveUniqueEventQuoteNumber = async (): Promise<string> => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = await generateNumber('event_quote_number', {
      prefix: 'EVQ-',
      datePart: true,
      padTo: 5,
    });
    const exists = await EventQuotation.exists({ quoteNumber: candidate });
    if (!exists) return candidate;
  }
  throw new Error('Unable to create a unique event quotation number. Please try again.');
};

const buildDefaultFacilityItems = (
  facilities: Array<{ _id: string; name: string; hourlyRate?: number }>,
  occurrences: NormalizedOccurrence[]
): NormalizedItem[] => {
  const totalHours = round2(
    occurrences.reduce((sum, occurrence) => sum + durationHours(occurrence), 0)
  );

  return facilities.map((facility) => {
    const unitPrice = round2(Number(facility.hourlyRate || 0));
    const lineTotal = round2(totalHours * unitPrice);
    return {
      itemType: 'facility',
      facilityId: String(facility._id),
      description: facility.name,
      quantity: totalHours,
      unitLabel: 'Hours',
      unitPrice,
      lineTotal,
      notes: '',
    };
  });
};

const normalizeItems = (
  rawItems: any[],
  facilities: Array<{ _id: string; name: string; hourlyRate?: number }>,
  occurrences: NormalizedOccurrence[]
): NormalizedItem[] => {
  const preparedItems = Array.isArray(rawItems) && rawItems.length > 0
    ? rawItems
    : buildDefaultFacilityItems(facilities, occurrences);

  const normalized = preparedItems
    .map((item: any) => {
      const itemType =
        String(item?.itemType || '').trim().toLowerCase() === 'service'
          ? 'service'
          : String(item?.itemType || '').trim().toLowerCase() === 'custom'
            ? 'custom'
            : 'facility';
      const description = String(item?.description || '').trim();
      const quantity = Math.max(0, Number(item?.quantity || 0));
      const unitPrice = Math.max(0, Number(item?.unitPrice || 0));
      if (!description || quantity <= 0) {
        return null;
      }
      return {
        itemType,
        facilityId: item?.facilityId ? String(item.facilityId) : undefined,
        description,
        quantity: round2(quantity),
        unitLabel: String(item?.unitLabel || '').trim() || undefined,
        unitPrice: round2(unitPrice),
        lineTotal: round2(quantity * unitPrice),
        notes: String(item?.notes || '').trim() || undefined,
      } as NormalizedItem;
    })
    .filter((item: NormalizedItem | null): item is NormalizedItem => Boolean(item));

  if (!normalized.length) {
    throw new Error('Add at least one quotation item');
  }

  return normalized;
};

const buildTotals = (
  items: NormalizedItem[],
  discountType: 'percentage' | 'fixed',
  discountValueRaw: any,
  gstRateRaw: any
) => {
  const subtotal = round2(items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0));
  const discountValue = Math.max(0, Number(discountValueRaw || 0));
  const discountAmount = discountType === 'percentage'
    ? round2((subtotal * Math.min(discountValue, 100)) / 100)
    : round2(Math.min(discountValue, subtotal));
  const taxableAmount = round2(Math.max(0, subtotal - discountAmount));
  const gstRate = Math.max(0, Number(gstRateRaw || 0));
  const gstAmount = round2((taxableAmount * gstRate) / 100);
  const totalAmount = round2(taxableAmount + gstAmount);

  return {
    subtotal,
    discountValue: round2(discountValue),
    discountAmount,
    taxableAmount,
    gstRate: round2(gstRate),
    gstAmount,
    totalAmount,
  };
};

const populatedQuote = (id: string) =>
  EventQuotation.findById(id)
    .populate('facilityIds', 'name location hourlyRate')
    .populate('items.facilityId', 'name location hourlyRate');

const buildDocumentResponse = (fileName: string, pdfBuffer: Buffer) => ({
  fileName,
  pdfBase64: pdfBuffer.toString('base64'),
});

router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { q, status, skip = 0, limit = 50 } = req.query;
    const filter: any = {};

    if (status) filter.quoteStatus = normalizeQuoteStatus(status);
    if (q) {
      const regex = new RegExp(String(q).trim(), 'i');
      filter.$or = [
        { quoteNumber: regex },
        { quoteGroupCode: regex },
        { eventName: regex },
        { organizerName: regex },
        { organizationName: regex },
        { contactPhone: regex },
        { contactEmail: regex },
      ];
    }

    const rows = await EventQuotation.find(filter)
      .populate('facilityIds', 'name location hourlyRate')
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip(Math.max(0, Number(skip) || 0))
      .limit(Math.max(1, Number(limit) || 50));
    const total = await EventQuotation.countDocuments(filter);

    res.json({
      success: true,
      data: rows,
      pagination: {
        total,
        skip: Math.max(0, Number(skip) || 0),
        limit: Math.max(1, Number(limit) || 50),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load event quotations' });
  }
});

router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const selectedFacilityIds = Array.isArray(req.body?.facilityIds)
      ? req.body.facilityIds.map((id: any) => String(id))
      : [];
    const occurrences = normalizeOccurrences(req.body);
    validateOccurrences(occurrences);

    if (!selectedFacilityIds.length || !String(req.body?.eventName || '').trim() || !String(req.body?.organizerName || '').trim()) {
      return res.status(400).json({
        success: false,
        error: 'Event name, organizer name, facilities, and at least one date are required',
      });
    }

    const facilities = await Facility.find({ _id: { $in: selectedFacilityIds } }).select('name location hourlyRate active');
    if (facilities.length !== selectedFacilityIds.length) {
      return res.status(400).json({ success: false, error: 'One or more selected facilities are invalid' });
    }

    const items = normalizeItems(req.body?.items, facilities as any, occurrences);
    const discountType = normalizeDiscountType(req.body?.discountType);
    const totals = buildTotals(items, discountType, req.body?.discountValue, req.body?.gstRate);
    const quoteNumber = await reserveUniqueEventQuoteNumber();
    const validUntilDate = req.body?.validUntil ? new Date(req.body.validUntil) : undefined;
    const linkedCustomer = await findOrCreateQuotationCustomer({
      customerId: req.body?.customerId,
      organizerName: req.body?.organizerName,
      contactPhone: req.body?.contactPhone,
      contactEmail: req.body?.contactEmail,
      createdBy: req.userId,
    });

    const quote = await EventQuotation.create({
      quoteNumber,
      quoteGroupCode: quoteNumber,
      version: 1,
      customerId: linkedCustomer?._id?.toString() || undefined,
      customerCode: linkedCustomer?.customerCode || undefined,
      quoteStatus: normalizeQuoteStatus(req.body?.quoteStatus),
      validUntil: validUntilDate && isValidDate(validUntilDate) ? validUntilDate : undefined,
      eventName: String(req.body?.eventName || '').trim(),
      organizerName: String(req.body?.organizerName || '').trim(),
      organizationName: String(req.body?.organizationName || '').trim(),
      contactPhone: normalizePhone(req.body?.contactPhone) || undefined,
      contactEmail: normalizeEmail(req.body?.contactEmail) || undefined,
      facilityIds: selectedFacilityIds,
      occurrences,
      items,
      subtotal: totals.subtotal,
      discountType,
      discountValue: totals.discountValue,
      discountAmount: totals.discountAmount,
      taxableAmount: totals.taxableAmount,
      gstRate: totals.gstRate,
      gstAmount: totals.gstAmount,
      totalAmount: totals.totalAmount,
      termsAndConditions: String(req.body?.termsAndConditions || '').trim() || DEFAULT_TERMS_AND_CONDITIONS,
      notes: String(req.body?.notes || '').trim(),
      createdBy: req.userId,
      updatedBy: req.userId,
    });

    await writeAuditLog({
      module: 'event_quotations',
      action: 'event_quote_created',
      entityType: 'event_quote',
      entityId: quote._id.toString(),
      referenceNo: quote.quoteNumber,
      userId: req.userId,
      after: quote.toObject(),
    });

    const created = await populatedQuote(quote._id.toString());
    res.status(201).json({ success: true, data: created, message: 'Event quotation created successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to create event quotation' });
  }
});

router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const quote = await populatedQuote(String(req.params.id));
    if (!quote) return res.status(404).json({ success: false, error: 'Event quotation not found' });
    res.json({ success: true, data: quote });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch event quotation' });
  }
});

router.get('/:id/versions', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const quote = await EventQuotation.findById(req.params.id).select('quoteGroupCode');
    if (!quote) return res.status(404).json({ success: false, error: 'Event quotation not found' });
    const rows = await EventQuotation.find({ quoteGroupCode: quote.quoteGroupCode })
      .populate('facilityIds', 'name location hourlyRate')
      .sort({ version: -1, createdAt: -1 });
    res.json({ success: true, data: rows });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to load quotation revisions' });
  }
});

router.put('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const quote = await EventQuotation.findById(req.params.id);
    if (!quote) return res.status(404).json({ success: false, error: 'Event quotation not found' });
    if (quote.quoteStatus === 'booked') {
      return res.status(400).json({ success: false, error: 'Booked quotation cannot be edited' });
    }
    if (quote.replacedByQuotationId) {
      return res.status(400).json({ success: false, error: 'Replaced quotation cannot be edited. Edit the latest version instead.' });
    }

    const selectedFacilityIds = Array.isArray(req.body?.facilityIds)
      ? req.body.facilityIds.map((id: any) => String(id))
      : [];
    const occurrences = normalizeOccurrences(req.body);
    validateOccurrences(occurrences);

    if (!selectedFacilityIds.length || !String(req.body?.eventName || '').trim() || !String(req.body?.organizerName || '').trim()) {
      return res.status(400).json({
        success: false,
        error: 'Event name, organizer name, facilities, and at least one date are required',
      });
    }

    const facilities = await Facility.find({ _id: { $in: selectedFacilityIds } }).select('name location hourlyRate active');
    if (facilities.length !== selectedFacilityIds.length) {
      return res.status(400).json({ success: false, error: 'One or more selected facilities are invalid' });
    }

    const items = normalizeItems(req.body?.items, facilities as any, occurrences);
    const discountType = normalizeDiscountType(req.body?.discountType);
    const totals = buildTotals(items, discountType, req.body?.discountValue, req.body?.gstRate);
    const validUntilDate = req.body?.validUntil ? new Date(req.body.validUntil) : undefined;
    const linkedCustomer = await findOrCreateQuotationCustomer({
      customerId: req.body?.customerId || quote.customerId,
      organizerName: req.body?.organizerName,
      contactPhone: req.body?.contactPhone,
      contactEmail: req.body?.contactEmail,
      createdBy: req.userId,
    });

    quote.quoteStatus = normalizeQuoteStatus(req.body?.quoteStatus);
    quote.validUntil = validUntilDate && isValidDate(validUntilDate) ? validUntilDate : undefined;
    quote.customerId = linkedCustomer?._id?.toString() || undefined;
    quote.customerCode = linkedCustomer?.customerCode || undefined;
    quote.eventName = String(req.body?.eventName || '').trim();
    quote.organizerName = String(req.body?.organizerName || '').trim();
    quote.organizationName = String(req.body?.organizationName || '').trim();
    quote.contactPhone = normalizePhone(req.body?.contactPhone) || undefined;
    quote.contactEmail = normalizeEmail(req.body?.contactEmail) || undefined;
    quote.facilityIds = selectedFacilityIds as any;
    quote.occurrences = occurrences as any;
    quote.items = items as any;
    quote.subtotal = totals.subtotal;
    quote.discountType = discountType;
    quote.discountValue = totals.discountValue;
    quote.discountAmount = totals.discountAmount;
    quote.taxableAmount = totals.taxableAmount;
    quote.gstRate = totals.gstRate;
    quote.gstAmount = totals.gstAmount;
    quote.totalAmount = totals.totalAmount;
    quote.termsAndConditions = String(req.body?.termsAndConditions || '').trim() || DEFAULT_TERMS_AND_CONDITIONS;
    quote.notes = String(req.body?.notes || '').trim();
    quote.updatedBy = req.userId;
    await quote.save();

    await writeAuditLog({
      module: 'event_quotations',
      action: 'event_quote_updated',
      entityType: 'event_quote',
      entityId: quote._id.toString(),
      referenceNo: quote.quoteNumber,
      userId: req.userId,
      after: quote.toObject(),
    });

    const updated = await populatedQuote(quote._id.toString());
    res.json({ success: true, data: updated, message: 'Event quotation updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to update event quotation' });
  }
});

router.post('/:id/revise', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const quote = await EventQuotation.findById(req.params.id);
    if (!quote) return res.status(404).json({ success: false, error: 'Event quotation not found' });
    if (quote.linkedBookingId || quote.quoteStatus === 'booked') {
      return res.status(400).json({ success: false, error: 'Booked quotation cannot be revised' });
    }

    const quoteNumber = await reserveUniqueEventQuoteNumber();
    const latestVersion = await EventQuotation.find({ quoteGroupCode: quote.quoteGroupCode || quote.quoteNumber })
      .sort({ version: -1 })
      .limit(1)
      .select('version');
    const nextVersion = Math.max(1, Number(latestVersion[0]?.version || quote.version || 1)) + 1;

    const revised = await EventQuotation.create({
      quoteNumber,
      quoteGroupCode: quote.quoteGroupCode || quote.quoteNumber,
      version: nextVersion,
      customerId: quote.customerId,
      customerCode: quote.customerCode,
      sourceQuotationId: quote._id.toString(),
      quoteStatus: 'draft',
      validUntil: quote.validUntil,
      eventName: quote.eventName,
      organizerName: quote.organizerName,
      organizationName: quote.organizationName,
      contactPhone: quote.contactPhone,
      contactEmail: quote.contactEmail,
      facilityIds: quote.facilityIds,
      occurrences: quote.occurrences,
      items: quote.items,
      subtotal: quote.subtotal,
      discountType: quote.discountType,
      discountValue: quote.discountValue,
      discountAmount: quote.discountAmount,
      taxableAmount: quote.taxableAmount,
      gstRate: quote.gstRate,
      gstAmount: quote.gstAmount,
      totalAmount: quote.totalAmount,
      termsAndConditions: quote.termsAndConditions,
      notes: quote.notes,
      createdBy: req.userId,
      updatedBy: req.userId,
    });

    quote.replacedByQuotationId = revised._id.toString();
    quote.quoteStatus = 'replaced';
    quote.updatedBy = req.userId;
    await quote.save();

    await writeAuditLog({
      module: 'event_quotations',
      action: 'event_quote_revised',
      entityType: 'event_quote',
      entityId: revised._id.toString(),
      referenceNo: revised.quoteNumber,
      userId: req.userId,
      metadata: {
        sourceQuotationId: quote._id.toString(),
        sourceQuotationNumber: quote.quoteNumber,
      },
      after: revised.toObject(),
    });

    const created = await populatedQuote(revised._id.toString());
    res.status(201).json({ success: true, data: created, message: 'Revised quotation created successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to revise event quotation' });
  }
});

router.post('/:id/document', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const quote = await populatedQuote(String(req.params.id));
    if (!quote) return res.status(404).json({ success: false, error: 'Event quotation not found' });

    const document = await buildEventQuotationDocument({
      quoteNumber: quote.quoteNumber,
      quoteStatus: quote.quoteStatus,
      validUntil: quote.validUntil,
      eventName: quote.eventName,
      organizerName: quote.organizerName,
      organizationName: quote.organizationName,
      contactPhone: quote.contactPhone,
      contactEmail: quote.contactEmail,
      occurrences: Array.isArray(quote.occurrences) ? quote.occurrences : [],
      facilities: Array.isArray(quote.facilityIds)
        ? quote.facilityIds.map((facility: any) => ({
            name: String(facility?.name || ''),
            location: String(facility?.location || ''),
            hourlyRate: Number(facility?.hourlyRate || 0),
          }))
        : [],
      items: Array.isArray(quote.items)
        ? quote.items.map((item: any) => ({
            description: String(item?.description || ''),
            quantity: Number(item?.quantity || 0),
            unitLabel: String(item?.unitLabel || ''),
            unitPrice: Number(item?.unitPrice || 0),
            lineTotal: Number(item?.lineTotal || 0),
            notes: String(item?.notes || ''),
          }))
        : [],
      subtotal: Number(quote.subtotal || 0),
      discountType: quote.discountType,
      discountValue: Number(quote.discountValue || 0),
      discountAmount: Number(quote.discountAmount || 0),
      taxableAmount: Number(quote.taxableAmount || 0),
      gstRate: Number(quote.gstRate || 0),
      gstAmount: Number(quote.gstAmount || 0),
      totalAmount: Number(quote.totalAmount || 0),
      termsAndConditions: quote.termsAndConditions,
      notes: quote.notes,
      linkedBookingNumber: quote.linkedBookingNumber,
      generatedAt: new Date(),
    });

    res.json({
      success: true,
      data: buildDocumentResponse(document.fileName, document.pdfBuffer),
      message: 'Event quotation document prepared successfully',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to prepare event quotation document' });
  }
});

router.delete('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const quote = await EventQuotation.findById(req.params.id);
    if (!quote) return res.status(404).json({ success: false, error: 'Event quotation not found' });
    if (quote.linkedBookingId || quote.quoteStatus === 'booked') {
      return res.status(400).json({ success: false, error: 'Booked quotation cannot be deleted' });
    }
    if (quote.replacedByQuotationId) {
      return res.status(400).json({ success: false, error: 'Replaced quotation should be retained for revision history' });
    }

    await EventQuotation.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Event quotation deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to delete event quotation' });
  }
});

export default router;
