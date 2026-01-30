'use client';

import { useState, useCallback, FormEvent, Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js';

// Cognito configuration - injected at build time
const COGNITO_CONFIG = {
  UserPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '',
  ClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '',
};

function LoginContent() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup' | 'newPasswordRequired' | 'forgotPassword' | 'confirmReset'>('login');
  const [verificationCode, setVerificationCode] = useState('');
  const [cognitoUser, setCognitoUser] = useState<CognitoUser | null>(null);
  const [userAttributes, setUserAttributes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  // Get return URL from state parameter
  const getReturnUrl = useCallback(() => {
    const state = searchParams.get('state');
    if (state) {
      try {
        const decoded = JSON.parse(atob(state));
        return decoded.returnUrl || '/';
      } catch {
        return '/';
      }
    }
    return '/';
  }, [searchParams]);

  const userPool = new CognitoUserPool(COGNITO_CONFIG);

  const setSessionCookies = useCallback((session: CognitoUserSession, userEmail: string) => {
    const idToken = session.getIdToken().getJwtToken();
    const accessToken = session.getAccessToken().getJwtToken();
    const refreshToken = session.getRefreshToken().getToken();

    // Calculate expiry (1 day from now, matching Cognito settings)
    const expires = new Date();
    expires.setDate(expires.getDate() + 1);
    const expiresStr = expires.toUTCString();

    // Set cookies (these will be readable by Lambda@Edge)
    document.cookie = `id_token=${idToken}; path=/; expires=${expiresStr}; secure; samesite=lax`;
    document.cookie = `access_token=${accessToken}; path=/; expires=${expiresStr}; secure; samesite=lax`;
    document.cookie = `refresh_token=${refreshToken}; path=/auth; expires=${expiresStr}; secure; samesite=lax`;
    document.cookie = `logged_in=true; path=/; expires=${expiresStr}; secure; samesite=lax`;
    document.cookie = `user_email=${encodeURIComponent(userEmail)}; path=/; expires=${expiresStr}; secure; samesite=lax`;
  }, []);

  const handleLogin = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setIsLoading(true);

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password;

    if (!trimmedEmail || !trimmedPassword) {
      setError('Email and password are required');
      setIsLoading(false);
      return;
    }

    const authenticationDetails = new AuthenticationDetails({
      Username: trimmedEmail,
      Password: trimmedPassword,
    });

    const cognitoUser = new CognitoUser({
      Username: trimmedEmail,
      Pool: userPool,
    });

    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: (session) => {
        setSessionCookies(session, trimmedEmail);
        // Redirect to the original destination
        window.location.href = getReturnUrl();
      },
      onFailure: (err) => {
        setIsLoading(false);
        if (err.code === 'UserNotConfirmedException') {
          setError('Please verify your email address before logging in');
        } else if (err.code === 'NotAuthorizedException') {
          setError('Incorrect email or password');
        } else if (err.code === 'UserNotFoundException') {
          setError('No account found with this email');
        } else {
          setError(err.message || 'Authentication failed');
        }
      },
      newPasswordRequired: (userAttributes, requiredAttributes) => {
        setIsLoading(false);
        setCognitoUser(cognitoUser);
        // Remove non-mutable attributes
        delete userAttributes.email_verified;
        delete userAttributes.email;
        setUserAttributes(userAttributes);
        setMode('newPasswordRequired');
      },
    });
  }, [email, password, userPool, setSessionCookies, getReturnUrl]);

  const handleNewPassword = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      setIsLoading(false);
      return;
    }

    if (!cognitoUser) {
      setError('Session expired. Please try again.');
      setIsLoading(false);
      setMode('login');
      return;
    }

    cognitoUser.completeNewPasswordChallenge(newPassword, userAttributes, {
      onSuccess: (session) => {
        setSessionCookies(session, email.trim().toLowerCase());
        window.location.href = getReturnUrl();
      },
      onFailure: (err) => {
        setIsLoading(false);
        setError(err.message || 'Failed to set new password');
      },
    });
  }, [newPassword, confirmPassword, cognitoUser, userAttributes, email, setSessionCookies, getReturnUrl]);

  const handleSignup = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setIsLoading(true);

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !password) {
      setError('Email and password are required');
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      setIsLoading(false);
      return;
    }

    const emailAttribute = new CognitoUserAttribute({
      Name: 'email',
      Value: trimmedEmail,
    });

    userPool.signUp(
      trimmedEmail,
      password,
      [emailAttribute],
      [],
      (err, result) => {
        setIsLoading(false);
        if (err) {
          if (err.message.includes('password')) {
            setError('Password must contain uppercase, lowercase, and numbers');
          } else {
            setError(err.message || 'Signup failed');
          }
          return;
        }
        setMessage('Account created! Please check your email to verify your account, then log in.');
        setMode('login');
        setPassword('');
        setConfirmPassword('');
      }
    );
  }, [email, password, confirmPassword, userPool]);

  const handleForgotPassword = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setIsLoading(true);

    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail) {
      setError('Email is required');
      setIsLoading(false);
      return;
    }

    const cognitoUser = new CognitoUser({
      Username: trimmedEmail,
      Pool: userPool,
    });

    cognitoUser.forgotPassword({
      onSuccess: () => {
        setIsLoading(false);
        setMessage('Verification code sent to your email');
        setCognitoUser(cognitoUser);
        setMode('confirmReset');
      },
      onFailure: (err) => {
        setIsLoading(false);
        setError(err.message || 'Failed to send reset code');
      },
    });
  }, [email, userPool]);

  const handleConfirmReset = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (!verificationCode) {
      setError('Verification code is required');
      setIsLoading(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      setIsLoading(false);
      return;
    }

    if (!cognitoUser) {
      setError('Session expired. Please try again.');
      setIsLoading(false);
      setMode('forgotPassword');
      return;
    }

    cognitoUser.confirmPassword(verificationCode, newPassword, {
      onSuccess: () => {
        setIsLoading(false);
        setMessage('Password reset successful! Please log in.');
        setMode('login');
        setPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setVerificationCode('');
      },
      onFailure: (err) => {
        setIsLoading(false);
        setError(err.message || 'Failed to reset password');
      },
    });
  }, [verificationCode, newPassword, confirmPassword, cognitoUser]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-terminal-bg">
      <div className="max-w-md w-full">
        {/* Logo and title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-terminal-blue via-terminal-magenta to-terminal-cyan bg-clip-text text-transparent">
            Always Coder
          </h1>
          <p className="text-terminal-fg/60">
            {mode === 'login' && 'Sign in to continue'}
            {mode === 'signup' && 'Create your account'}
            {mode === 'newPasswordRequired' && 'Set your new password'}
            {mode === 'forgotPassword' && 'Reset your password'}
            {mode === 'confirmReset' && 'Enter verification code'}
          </p>
        </div>

        {/* Success message */}
        {message && (
          <div className="mb-4 p-3 bg-terminal-green/10 border border-terminal-green/30 rounded-lg text-terminal-green text-sm">
            {message}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-terminal-red/10 border border-terminal-red/30 rounded-lg text-terminal-red text-sm">
            {error}
          </div>
        )}

        {/* Login form */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm text-terminal-fg/80 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-terminal-black/50 border border-terminal-fg/20 rounded-lg text-terminal-fg placeholder:text-terminal-fg/30 focus:outline-none focus:border-terminal-blue transition-colors"
                autoFocus
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm text-terminal-fg/80 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 bg-terminal-black/50 border border-terminal-fg/20 rounded-lg text-terminal-fg placeholder:text-terminal-fg/30 focus:outline-none focus:border-terminal-blue transition-colors"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-terminal-blue hover:bg-terminal-blue/80 disabled:bg-terminal-blue/50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>

            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                onClick={() => {
                  setMode('forgotPassword');
                  setError(null);
                  setMessage(null);
                }}
                className="text-terminal-fg/60 hover:text-terminal-blue transition-colors"
              >
                Forgot password?
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                  setMessage(null);
                  setPassword('');
                }}
                className="text-terminal-blue hover:text-terminal-blue/80 transition-colors"
              >
                Create account
              </button>
            </div>
          </form>
        )}

        {/* Signup form */}
        {mode === 'signup' && (
          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label htmlFor="signup-email" className="block text-sm text-terminal-fg/80 mb-1">
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-terminal-black/50 border border-terminal-fg/20 rounded-lg text-terminal-fg placeholder:text-terminal-fg/30 focus:outline-none focus:border-terminal-blue transition-colors"
                autoFocus
                autoComplete="email"
              />
            </div>

            <div>
              <label htmlFor="signup-password" className="block text-sm text-terminal-fg/80 mb-1">
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-4 py-3 bg-terminal-black/50 border border-terminal-fg/20 rounded-lg text-terminal-fg placeholder:text-terminal-fg/30 focus:outline-none focus:border-terminal-blue transition-colors"
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-terminal-fg/40">
                Must contain uppercase, lowercase, and numbers
              </p>
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm text-terminal-fg/80 mb-1">
                Confirm Password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                className="w-full px-4 py-3 bg-terminal-black/50 border border-terminal-fg/20 rounded-lg text-terminal-fg placeholder:text-terminal-fg/30 focus:outline-none focus:border-terminal-blue transition-colors"
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-terminal-blue hover:bg-terminal-blue/80 disabled:bg-terminal-blue/50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </button>

            <div className="text-center text-sm">
              <span className="text-terminal-fg/60">Already have an account? </span>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setMessage(null);
                  setPassword('');
                  setConfirmPassword('');
                }}
                className="text-terminal-blue hover:text-terminal-blue/80 transition-colors"
              >
                Sign in
              </button>
            </div>
          </form>
        )}

        {/* New password required form */}
        {mode === 'newPasswordRequired' && (
          <form onSubmit={handleNewPassword} className="space-y-4">
            <p className="text-terminal-fg/60 text-sm mb-4">
              You need to set a new password to continue.
            </p>

            <div>
              <label htmlFor="new-password" className="block text-sm text-terminal-fg/80 mb-1">
                New Password
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-4 py-3 bg-terminal-black/50 border border-terminal-fg/20 rounded-lg text-terminal-fg placeholder:text-terminal-fg/30 focus:outline-none focus:border-terminal-blue transition-colors"
                autoFocus
                autoComplete="new-password"
              />
            </div>

            <div>
              <label htmlFor="confirm-new-password" className="block text-sm text-terminal-fg/80 mb-1">
                Confirm New Password
              </label>
              <input
                id="confirm-new-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                className="w-full px-4 py-3 bg-terminal-black/50 border border-terminal-fg/20 rounded-lg text-terminal-fg placeholder:text-terminal-fg/30 focus:outline-none focus:border-terminal-blue transition-colors"
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-terminal-blue hover:bg-terminal-blue/80 disabled:bg-terminal-blue/50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Setting password...
                </>
              ) : (
                'Set Password'
              )}
            </button>
          </form>
        )}

        {/* Forgot password form */}
        {mode === 'forgotPassword' && (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div>
              <label htmlFor="reset-email" className="block text-sm text-terminal-fg/80 mb-1">
                Email
              </label>
              <input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 bg-terminal-black/50 border border-terminal-fg/20 rounded-lg text-terminal-fg placeholder:text-terminal-fg/30 focus:outline-none focus:border-terminal-blue transition-colors"
                autoFocus
                autoComplete="email"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-terminal-blue hover:bg-terminal-blue/80 disabled:bg-terminal-blue/50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Sending code...
                </>
              ) : (
                'Send Reset Code'
              )}
            </button>

            <div className="text-center text-sm">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setMessage(null);
                }}
                className="text-terminal-fg/60 hover:text-terminal-blue transition-colors"
              >
                Back to sign in
              </button>
            </div>
          </form>
        )}

        {/* Confirm password reset form */}
        {mode === 'confirmReset' && (
          <form onSubmit={handleConfirmReset} className="space-y-4">
            <div>
              <label htmlFor="verification-code" className="block text-sm text-terminal-fg/80 mb-1">
                Verification Code
              </label>
              <input
                id="verification-code"
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="Enter the code from your email"
                className="w-full px-4 py-3 bg-terminal-black/50 border border-terminal-fg/20 rounded-lg text-terminal-fg font-mono tracking-wider placeholder:text-terminal-fg/30 focus:outline-none focus:border-terminal-blue transition-colors"
                autoFocus
                autoComplete="one-time-code"
              />
            </div>

            <div>
              <label htmlFor="reset-new-password" className="block text-sm text-terminal-fg/80 mb-1">
                New Password
              </label>
              <input
                id="reset-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-4 py-3 bg-terminal-black/50 border border-terminal-fg/20 rounded-lg text-terminal-fg placeholder:text-terminal-fg/30 focus:outline-none focus:border-terminal-blue transition-colors"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label htmlFor="reset-confirm-password" className="block text-sm text-terminal-fg/80 mb-1">
                Confirm New Password
              </label>
              <input
                id="reset-confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                className="w-full px-4 py-3 bg-terminal-black/50 border border-terminal-fg/20 rounded-lg text-terminal-fg placeholder:text-terminal-fg/30 focus:outline-none focus:border-terminal-blue transition-colors"
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-terminal-blue hover:bg-terminal-blue/80 disabled:bg-terminal-blue/50 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Resetting password...
                </>
              ) : (
                'Reset Password'
              )}
            </button>

            <div className="text-center text-sm">
              <button
                type="button"
                onClick={() => {
                  setMode('forgotPassword');
                  setError(null);
                  setMessage(null);
                  setVerificationCode('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                className="text-terminal-fg/60 hover:text-terminal-blue transition-colors"
              >
                Resend code
              </button>
            </div>
          </form>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-terminal-fg/30">
          <p>Remote AI Coding Agent Control</p>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-terminal-bg">
          <div className="animate-spin w-8 h-8 border-2 border-terminal-blue border-t-transparent rounded-full" />
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
