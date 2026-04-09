export interface ServerPdfDocument {
  fileName: string;
  pdfBase64: string;
  emailed?: boolean;
  emailedTo?: string;
  emailError?: string;
}

const base64ToBlob = (base64: string): Blob => {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'application/pdf' });
};

export const downloadPdfDocument = (document: ServerPdfDocument): boolean => {
  if (!document?.pdfBase64) return false;

  const blob = base64ToBlob(document.pdfBase64);
  const blobUrl = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = blobUrl;
  link.download = document.fileName || 'document.pdf';
  window.document.body.appendChild(link);
  link.click();
  window.document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  return true;
};

export const openPdfDocument = (document: ServerPdfDocument, autoPrint = false): boolean => {
  if (!document?.pdfBase64) return false;

  const blob = base64ToBlob(document.pdfBase64);
  const blobUrl = URL.createObjectURL(blob);

  if (!autoPrint) {
    const popup = window.open(blobUrl, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    return Boolean(popup);
  }

  const popup = window.open('', '_blank', 'width=980,height=760');
  if (!popup) {
    URL.revokeObjectURL(blobUrl);
    return false;
  }

  const safeTitle = String(document.fileName || 'document.pdf')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  popup.document.write(`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${safeTitle}</title>
        <style>
          html, body, iframe { width: 100%; height: 100%; margin: 0; border: 0; background: #111827; }
        </style>
      </head>
      <body>
        <iframe id="pdf-frame" src="${blobUrl}" title="${safeTitle}"></iframe>
        <script>
          const frame = document.getElementById('pdf-frame');
          const cleanup = () => setTimeout(() => URL.revokeObjectURL('${blobUrl}'), 60000);
          frame.addEventListener('load', () => {
            setTimeout(() => {
              try {
                frame.contentWindow.focus();
                frame.contentWindow.print();
              } catch (error) {
                console.warn('Print failed', error);
              }
            }, 700);
          });
          window.addEventListener('afterprint', cleanup, { once: true });
          cleanup();
        </script>
      </body>
    </html>`);
  popup.document.close();
  return true;
};
