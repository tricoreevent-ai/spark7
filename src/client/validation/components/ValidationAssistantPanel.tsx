import React, { useMemo, useState } from 'react';
import { ValidationReport } from '../types';
import { formatAmount } from '../utils';

interface Message {
  role: 'user' | 'assistant';
  text: string;
}

const answerQuestion = (question: string, report?: ValidationReport): string => {
  const q = question.toLowerCase();
  if (!report) return 'Select a validation report first, then I can explain the findings in that run.';

  if (q.includes('tds')) {
    const tds = report.details.find((detail) => detail.checkName.toLowerCase().includes('tds'));
    if (!tds) return 'I do not see a TDS validation result in this report.';
    const outstanding = (tds.actual as any)?.computedOutstanding ?? (tds.actual as any)?.storedOutstanding ?? tds.diff ?? 0;
    return `TDS outstanding is showing ${formatAmount(outstanding)} because deducted TDS has not fully matched challan deposits or the payable ledger. Suggested action: ${tds.suggestedFix}`;
  }

  if (q.includes('vendor') && (q.includes('gst') || q.includes('missing'))) {
    return 'Use the Vendor/Customer Reconciliation and Orphan Records checks. If vendor GST is missing, add GSTIN/PAN in Vendor Master, then rerun validation.';
  }

  if (q.includes('balance sheet') || q.includes('profit') || q.includes('trial')) {
    const check = report.details.find((detail) => /balance sheet|trial balance|double-entry/i.test(detail.checkName));
    return check
      ? `${check.checkName}: ${check.status}. ${check.status === 'FAIL' ? check.suggestedFix : 'No correction is currently required.'}`
      : 'No core accounting check was found in this report.';
  }

  const failed = report.details.filter((detail) => detail.status === 'FAIL');
  if (!failed.length) return 'This report looks clean: all available checks passed.';
  return `There are ${failed.length} finding(s). Start with ${failed[0].checkName}: ${failed[0].suggestedFix}`;
};

export const ValidationAssistantPanel: React.FC<{ report?: ValidationReport }> = ({ report }) => {
  const starter = useMemo<Message>(
    () => ({
      role: 'assistant',
      text: 'Ask me about TDS outstanding, Trial Balance, Balance Sheet difference, vendors, cash/bank, or missing sequences.',
    }),
    []
  );
  const [messages, setMessages] = useState<Message[]>([starter]);
  const [question, setQuestion] = useState('');

  const ask = () => {
    const trimmed = question.trim();
    if (!trimmed) return;
    setMessages((current) => [
      ...current,
      { role: 'user', text: trimmed },
      { role: 'assistant', text: answerQuestion(trimmed, report) },
    ]);
    setQuestion('');
  };

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
      <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Assistant</p>
      <h3 className="mt-1 text-lg font-bold text-white">Validation explainer</h3>
      <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`rounded-2xl px-3 py-2 text-sm ${
              message.role === 'user'
                ? 'ml-8 bg-cyan-300 text-slate-950'
                : 'mr-8 border border-white/10 bg-slate-950/60 text-slate-100'
            }`}
          >
            {message.text}
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') ask();
          }}
          placeholder="Why is my TDS outstanding showing..."
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/50"
        />
        <button onClick={ask} className="rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950 hover:bg-cyan-100">
          Ask
        </button>
      </div>
    </div>
  );
};
