import { Router, Request, Response } from 'express';
import { loadResolvedMailSettings, parseRecipients, sendConfiguredMail } from '../services/mail.js';

const router = Router();

const isValidEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isValidPhone = (value: string): boolean => /^[0-9+\-()\s]{7,20}$/.test(value);
const normalize = (value: unknown): string => String(value || '').trim();

router.post('/contact', async (req: Request, res: Response) => {
  try {
    const name = normalize(req.body?.name);
    const email = normalize(req.body?.email).toLowerCase();
    const mobile = normalize(req.body?.mobile);
    const message = normalize(req.body?.message);

    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required.' });
    }

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address.' });
    }

    if (mobile && !isValidPhone(mobile)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid mobile number or leave it blank.' });
    }

    if (!message) {
      return res.status(400).json({ success: false, error: 'Message is required.' });
    }

    const mail = await loadResolvedMailSettings();
    const recipients = parseRecipients(mail.smtpToRecipients || mail.smtpFromEmail);

    if (!recipients.length) {
      return res.status(503).json({
        success: false,
        error: 'Public contact mail is not configured yet. Please contact Sarva Horizon by phone or WhatsApp.',
      });
    }

    const subject = `Sarva Horizon website enquiry from ${name}`;
    const text = [
      'New public website enquiry',
      '',
      `Name: ${name}`,
      `Email: ${email}`,
      `Mobile: ${mobile || 'Not provided'}`,
      '',
      'Message:',
      message,
    ].join('\n');

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
        <h2 style="margin:0 0 12px">Sarva Horizon Website Enquiry</h2>
        <table style="border-collapse:collapse;margin:0 0 16px">
          <tr><td style="padding:4px 12px 4px 0"><strong>Name</strong></td><td style="padding:4px 0">${name}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Email</strong></td><td style="padding:4px 0">${email}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Mobile</strong></td><td style="padding:4px 0">${mobile || 'Not provided'}</td></tr>
        </table>
        <div style="padding:14px;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc">
          <strong>Message</strong>
          <p style="margin:8px 0 0;white-space:pre-wrap">${message}</p>
        </div>
      </div>
    `;

    await sendConfiguredMail({
      recipients,
      subject,
      text,
      html,
    });

    return res.json({
      success: true,
      message: 'Your enquiry has been sent successfully. Sarva Horizon will get back to you soon.',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to send contact enquiry.',
    });
  }
});

export default router;
