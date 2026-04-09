import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from '@mui/material';
import { alpha, createTheme, ThemeProvider } from '@mui/material/styles';
import {
  AppAlertOptions,
  AppConfirmOptions,
  AppPromptOptions,
  detectDialogSeverity,
  messageToDialogText,
  registerAppDialogBridge,
} from '../utils/appDialogs';

type AlertRequest = {
  id: string;
  kind: 'alert';
  message: string;
  options: Required<Pick<AppAlertOptions, 'title' | 'confirmText' | 'severity'>>;
  resolve: () => void;
};

type ConfirmRequest = {
  id: string;
  kind: 'confirm';
  message: string;
  options: Required<Pick<AppConfirmOptions, 'title' | 'confirmText' | 'cancelText' | 'severity'>>;
  resolve: (confirmed: boolean) => void;
};

type PromptRequest = {
  id: string;
  kind: 'prompt';
  message: string;
  options: Required<Pick<AppPromptOptions, 'title' | 'label' | 'placeholder' | 'defaultValue' | 'confirmText' | 'cancelText' | 'severity' | 'inputType' | 'required' | 'rows'>>;
  resolve: (value: string | null) => void;
};

type DialogRequest = AlertRequest | ConfirmRequest | PromptRequest;

const nextDialogId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const appDialogTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#7c6cff' },
    secondary: { main: '#22d3ee' },
    background: {
      default: '#020617',
      paper: '#0f172a',
    },
    success: { main: '#34d399' },
    info: { main: '#38bdf8' },
    warning: { main: '#f59e0b' },
    error: { main: '#fb7185' },
  },
  shape: {
    borderRadius: 18,
  },
  typography: {
    fontFamily: '"Segoe UI", ui-sans-serif, system-ui, sans-serif',
  },
  components: {
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
    },
  },
});

const normalizeAlertOptions = (message?: any, options: AppAlertOptions = {}) => ({
  title: String(options.title || 'Notice'),
  confirmText: String(options.confirmText || 'OK'),
  severity: options.severity || detectDialogSeverity(message),
});

const normalizeConfirmOptions = (message?: any, options: AppConfirmOptions = {}) => ({
  title: String(options.title || 'Please confirm'),
  confirmText: String(options.confirmText || 'Continue'),
  cancelText: String(options.cancelText || 'Cancel'),
  severity: options.severity || 'warning',
});

const normalizePromptOptions = (message?: any, options: AppPromptOptions = {}) => ({
  title: String(options.title || 'Input required'),
  label: String(options.label || 'Value'),
  placeholder: String(options.placeholder || ''),
  defaultValue: String(options.defaultValue || ''),
  confirmText: String(options.confirmText || 'Save'),
  cancelText: String(options.cancelText || 'Cancel'),
  severity: options.severity || detectDialogSeverity(message),
  inputType: options.inputType || 'text',
  required: Boolean(options.required),
  rows: Number(options.rows || 3),
});

const clearStaleDialogArtifacts = () => {
  if (typeof document === 'undefined') return;

  document.querySelectorAll<HTMLElement>('.modal-backdrop, .swal2-container').forEach((node) => {
    node.remove();
  });

  document.querySelectorAll<HTMLElement>('.MuiModal-root').forEach((node) => {
    const hasVisibleDialogPaper = Array.from(node.querySelectorAll<HTMLElement>('.MuiDialog-paper')).some((paper) => {
      const style = window.getComputedStyle(paper);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    });

    if (!hasVisibleDialogPaper) {
      node.setAttribute('aria-hidden', 'true');
      node.style.pointerEvents = 'none';
      node.style.opacity = '0';
      node.style.visibility = 'hidden';
    }
  });

  document.querySelectorAll<HTMLElement>('.MuiBackdrop-root').forEach((node) => {
    node.style.pointerEvents = 'none';
    node.style.opacity = '0';
    node.style.visibility = 'hidden';
  });

  const html = document.documentElement;
  const body = document.body;

  html.style.removeProperty('overflow');
  html.style.removeProperty('padding-right');
  body.style.removeProperty('overflow');
  body.style.removeProperty('padding-right');
  body.removeAttribute('inert');
  html.removeAttribute('inert');
};

export const AppDialogProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const [promptValue, setPromptValue] = useState('');
  const [promptError, setPromptError] = useState('');

  const current = queue[0] || null;
  const dialogFormId = current ? `app-dialog-form-${current.id}` : undefined;

  useEffect(() => {
    if (current?.kind === 'prompt') {
      setPromptValue(current.options.defaultValue);
      setPromptError('');
      return;
    }
    setPromptValue('');
    setPromptError('');
  }, [current?.id, current?.kind]);

  useEffect(() => {
    const bridge = {
      alert: (message?: any, options: AppAlertOptions = {}) =>
        new Promise<void>((resolve) => {
          setQueue((prev) => [
            ...prev,
            {
              id: nextDialogId(),
              kind: 'alert',
              message: messageToDialogText(message),
              options: normalizeAlertOptions(message, options),
              resolve,
            },
          ]);
        }),
      confirm: (message?: any, options: AppConfirmOptions = {}) =>
        new Promise<boolean>((resolve) => {
          setQueue((prev) => [
            ...prev,
            {
              id: nextDialogId(),
              kind: 'confirm',
              message: messageToDialogText(message),
              options: normalizeConfirmOptions(message, options),
              resolve,
            },
          ]);
        }),
      prompt: (message?: any, options: AppPromptOptions = {}) =>
        new Promise<string | null>((resolve) => {
          setQueue((prev) => [
            ...prev,
            {
              id: nextDialogId(),
              kind: 'prompt',
              message: messageToDialogText(message),
              options: normalizePromptOptions(message, options),
              resolve,
            },
          ]);
        }),
    };

    registerAppDialogBridge(bridge);
    return () => {
      registerAppDialogBridge(null);
    };
  }, []);

  useEffect(() => {
    if (current) return;

    const runCleanup = () => clearStaleDialogArtifacts();
    const timer = window.setTimeout(runCleanup, 120);
    const handleFocus = () => runCleanup();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') runCleanup();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [current]);

  const dismissCurrent = () => {
    setQueue((prev) => prev.slice(1));
    setPromptError('');
    window.setTimeout(() => clearStaleDialogArtifacts(), 0);
  };

  const handleCancel = () => {
    if (!current) return;
    if (current.kind === 'confirm') current.resolve(false);
    if (current.kind === 'prompt') current.resolve(null);
    if (current.kind === 'alert') current.resolve();
    dismissCurrent();
  };

  const handleConfirm = () => {
    if (!current) return;

    if (current.kind === 'prompt') {
      if (current.options.required && !String(promptValue || '').trim()) {
        setPromptError(`${current.options.label} is required.`);
        return;
      }
      current.resolve(promptValue);
      dismissCurrent();
      return;
    }

    if (current.kind === 'confirm') {
      current.resolve(true);
      dismissCurrent();
      return;
    }

    current.resolve();
    dismissCurrent();
  };

  const dialogContent = useMemo(() => {
    if (!current) return null;

    const contentStyles = {
      border: `1px solid ${alpha('#ffffff', 0.08)}`,
      borderRadius: 3,
      backgroundColor: alpha('#0b1120', 0.82),
      '& .MuiAlert-message': {
        width: '100%',
      },
    };

    if (current.kind === 'prompt') {
      const isTextarea = current.options.inputType === 'textarea';
      return (
        <>
          {current.message ? (
            <Alert severity={current.options.severity} variant="outlined" sx={contentStyles}>
              {current.message}
            </Alert>
          ) : null}
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label={current.options.label}
            placeholder={current.options.placeholder}
            type={isTextarea ? 'text' : current.options.inputType}
            value={promptValue}
            onChange={(event) => {
              setPromptValue(event.target.value);
              if (promptError) setPromptError('');
            }}
            error={Boolean(promptError)}
            helperText={promptError || ' '}
            multiline={isTextarea}
            minRows={isTextarea ? current.options.rows : undefined}
            InputLabelProps={
              current.options.inputType === 'date' || current.options.inputType === 'time'
                ? { shrink: true }
                : undefined
            }
          />
        </>
      );
    }

    return current.message ? (
      <Alert severity={current.options.severity} variant="outlined" sx={contentStyles}>
        {current.message}
      </Alert>
    ) : (
      <DialogContentText sx={{ color: 'rgba(255,255,255,0.78)' }}>
        Please review and continue.
      </DialogContentText>
    );
  }, [current, promptError, promptValue]);

  return (
    <ThemeProvider theme={appDialogTheme}>
      {children}
      <Dialog
        open={Boolean(current)}
        onClose={(_event, reason) => {
          if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
            handleCancel();
          }
        }}
        fullWidth
        maxWidth="xs"
        slotProps={{
          backdrop: {
            sx: {
              backgroundColor: 'rgba(2, 6, 23, 0.78)',
              backdropFilter: 'blur(8px)',
            },
          },
        }}
        PaperProps={{
          sx: {
            background: 'linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(15,23,42,0.94) 100%)',
            border: `1px solid ${alpha('#ffffff', 0.08)}`,
            boxShadow: '0 30px 80px rgba(2, 6, 23, 0.55)',
          },
        }}
      >
        {current && (
          <>
            <DialogTitle sx={{ pb: 1, fontWeight: 700 }}>{current.options.title}</DialogTitle>
            <DialogContent
              id={dialogFormId}
              sx={{ display: 'grid', gap: 2 }}
              component="form"
              onSubmit={(event) => {
                event.preventDefault();
                handleConfirm();
              }}
            >
              {dialogContent}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 3, pt: 1.5 }}>
              {current.kind !== 'alert' ? (
                <Button
                  onClick={handleCancel}
                  variant="outlined"
                  color="inherit"
                  sx={{
                    borderColor: alpha('#ffffff', 0.16),
                    color: 'rgba(255,255,255,0.78)',
                    '&:hover': {
                      borderColor: alpha('#ffffff', 0.28),
                      backgroundColor: alpha('#ffffff', 0.04),
                    },
                  }}
                >
                  {current.options.cancelText}
                </Button>
              ) : null}
              <Button
                onClick={current.kind === 'prompt' ? undefined : handleConfirm}
                variant="contained"
                type={current.kind === 'prompt' ? 'submit' : 'button'}
                form={current.kind === 'prompt' ? dialogFormId : undefined}
              >
                {current.options.confirmText}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </ThemeProvider>
  );
};
