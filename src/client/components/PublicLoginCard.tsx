import React from 'react';
import { DEFAULT_BRAND_LOGO_PATH } from '../utils/brandAssets';

type PublicLoginCardProps = {
  loginFormRef?: React.RefObject<HTMLFormElement | null>;
  pendingOtpChallengeId?: string;
  pendingOtpEmail?: string;
  email: string;
  tenantSlug: string;
  password: string;
  otpCode: string;
  showPassword: boolean;
  rememberCredentials: boolean;
  loading: boolean;
  error: string;
  success: string;
  onEmailChange: (value: string) => void;
  onTenantSlugChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onOtpCodeChange: (value: string) => void;
  onShowPasswordChange: (value: boolean) => void;
  onRememberCredentialsChange: (value: boolean) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onResendOtp: () => void;
  onCancelOtp: () => void;
  onResetLoading: () => void;
};

export const PublicLoginCard: React.FC<PublicLoginCardProps> = ({
  loginFormRef,
  pendingOtpChallengeId,
  pendingOtpEmail,
  email,
  tenantSlug,
  password,
  otpCode,
  showPassword,
  rememberCredentials,
  loading,
  error,
  success,
  onEmailChange,
  onTenantSlugChange,
  onPasswordChange,
  onOtpCodeChange,
  onShowPasswordChange,
  onRememberCredentialsChange,
  onSubmit,
  onResendOtp,
  onCancelOtp,
  onResetLoading,
}) => {
  return (
    <section className="mx-auto w-full max-w-[760px] rounded-[1.8rem] border border-white/10 bg-slate-900/82 p-5 shadow-[0_24px_70px_rgba(2,6,23,0.32)] backdrop-blur-xl sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">Client Login</p>
          <h2 className="mt-2 text-xl font-bold text-white sm:text-[1.7rem]">Sign in to your client workspace</h2>
          <p className="mt-2 text-sm leading-7 text-slate-300">
            Use your email, password, and tenant or company identifier to enter the correct Sarva software environment.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <img src={DEFAULT_BRAND_LOGO_PATH} alt="Sarva Horizon logo" className="h-11 w-11 object-contain drop-shadow-[0_12px_28px_rgba(2,6,23,0.28)] sm:h-12 sm:w-12" />
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
            Secure Access
          </span>
        </div>
      </div>

      <form ref={loginFormRef} onSubmit={onSubmit} className="mt-5 space-y-3.5">
        {pendingOtpChallengeId ? (
          <>
            <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
              Enter the OTP sent to <span className="font-semibold text-white">{pendingOtpEmail || email}</span> to finish login.
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otpCode}
              onChange={(event) => onOtpCodeChange(event.target.value.replace(/\D+/g, '').slice(0, 6))}
              placeholder="Enter 6-digit OTP"
              required
              className="pointer-events-auto w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white opacity-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            />
          </>
        ) : (
          <>
            <input
              type="email"
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="user@example.com"
              required
              className="pointer-events-auto w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white opacity-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            <input
              type="text"
              value={tenantSlug}
              onChange={(event) => onTenantSlugChange(event.target.value.toLowerCase())}
              placeholder="Company or tenant id"
              className="pointer-events-auto w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white opacity-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            />

            <div className="space-y-2">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                placeholder="Enter password"
                required
                className="pointer-events-auto w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white opacity-100 placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
              />
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(event) => onShowPasswordChange(event.target.checked)}
                  className="pointer-events-auto h-4 w-4 rounded border-white/20 bg-white/5 opacity-100 accent-cyan-500"
                />
                Show password
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={rememberCredentials}
                  onChange={(event) => onRememberCredentialsChange(event.target.checked)}
                  className="pointer-events-auto h-4 w-4 rounded border-white/20 bg-white/5 opacity-100 accent-cyan-500"
                />
                Keep me signed in for 7 days
              </label>
            </div>
          </>
        )}

        {error ? <div className="rounded-2xl border border-red-400/15 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
        {success ? <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}

        {pendingOtpChallengeId ? (
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              type="submit"
              className="pointer-events-auto w-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 opacity-100 hover:from-cyan-400 hover:to-emerald-400"
            >
              {loading ? 'Please wait...' : 'Verify OTP'}
            </button>
            <button
              type="button"
              onClick={onResendOtp}
              className="pointer-events-auto w-full rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 opacity-100 hover:bg-white/10"
            >
              Resend OTP
            </button>
            <button
              type="button"
              onClick={onCancelOtp}
              className="pointer-events-auto w-full rounded-full border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100 opacity-100 hover:bg-rose-500/20"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="submit"
              className="pointer-events-auto w-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 opacity-100 hover:from-cyan-400 hover:to-emerald-400"
            >
              {loading ? 'Please wait...' : 'Login'}
            </button>
            <a
              href="/user-manual"
              className="pointer-events-auto flex w-full items-center justify-center rounded-full border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-white/10"
            >
              User Manual
            </a>
          </div>
        )}

        {loading ? (
          <button
            type="button"
            onClick={onResetLoading}
            className="w-full rounded-full border border-white/20 bg-transparent px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200 hover:bg-white/10"
          >
            Reset Login Form
          </button>
        ) : null}
      </form>
    </section>
  );
};
