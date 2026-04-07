export type AppDialogSeverity = 'success' | 'error' | 'warning' | 'info';

export type AppAlertOptions = {
  title?: string;
  confirmText?: string;
  severity?: AppDialogSeverity;
};

export type AppConfirmOptions = {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  severity?: AppDialogSeverity;
};

export type AppPromptOptions = {
  title?: string;
  message?: any;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmText?: string;
  cancelText?: string;
  severity?: AppDialogSeverity;
  inputType?: 'text' | 'number' | 'date' | 'time' | 'email' | 'textarea';
  required?: boolean;
  rows?: number;
};

type AppDialogBridge = {
  alert: (message?: any, options?: AppAlertOptions) => Promise<void>;
  confirm: (message?: any, options?: AppConfirmOptions) => Promise<boolean>;
  prompt: (message?: any, options?: AppPromptOptions) => Promise<string | null>;
};

let dialogBridge: AppDialogBridge | null = null;

export const messageToDialogText = (value: any): string => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

export const detectDialogSeverity = (message?: any): AppDialogSeverity => {
  const text = messageToDialogText(message).toLowerCase();
  if (text.includes('error') || text.includes('failed') || text.includes('fail')) return 'error';
  if (text.includes('warning') || text.includes('warn') || text.includes('overwrite')) return 'warning';
  if (
    text.includes('success')
    || text.includes('saved')
    || text.includes('created')
    || text.includes('updated')
    || text.includes('deleted')
    || text.includes('completed')
  ) {
    return 'success';
  }
  return 'info';
};

export const registerAppDialogBridge = (bridge: AppDialogBridge | null) => {
  dialogBridge = bridge;
};

export const showAlertDialog = async (message?: any, options: AppAlertOptions = {}): Promise<void> => {
  if (dialogBridge) return dialogBridge.alert(message, options);
  if (typeof window !== 'undefined') window.alert(messageToDialogText(message));
};

export const showConfirmDialog = async (message?: any, options: AppConfirmOptions = {}): Promise<boolean> => {
  if (dialogBridge) return dialogBridge.confirm(message, options);
  if (typeof window !== 'undefined') return window.confirm(messageToDialogText(message));
  return false;
};

export const showPromptDialog = async (message?: any, options: AppPromptOptions = {}): Promise<string | null> => {
  if (dialogBridge) return dialogBridge.prompt(message, options);
  if (typeof window !== 'undefined') return window.prompt(messageToDialogText(message), options.defaultValue || '');
  return null;
};
