'use client';

import { useRef, useCallback } from 'react';
import { WebCrypto } from '@/lib/crypto';
import type { EncryptedEnvelope, Message } from '@always-coder/shared';

export function useCrypto() {
  const cryptoRef = useRef<WebCrypto | null>(null);

  // Initialize crypto lazily, restoring shared key from sessionStorage if available.
  // Note: Private key is NEVER stored - only the derived shared key is persisted.
  const getCrypto = useCallback(() => {
    if (!cryptoRef.current) {
      cryptoRef.current = new WebCrypto(true);
    }
    return cryptoRef.current;
  }, []);

  const getPublicKey = useCallback(() => {
    return getCrypto().getPublicKey();
  }, [getCrypto]);

  const establishSharedKey = useCallback((cliPublicKey: string) => {
    getCrypto().establishSharedKey(cliPublicKey);
  }, [getCrypto]);

  // Force re-establishment of shared key (e.g., when CLI restarted with new keys)
  const reestablishSharedKey = useCallback((cliPublicKey: string) => {
    getCrypto().reestablishSharedKey(cliPublicKey);
  }, [getCrypto]);

  // Check if CLI's public key changed since we stored the shared key
  const isCliKeyChanged = useCallback((cliPublicKey: string) => {
    return getCrypto().isCliKeyChanged(cliPublicKey);
  }, [getCrypto]);

  // Get the stored CLI public key for comparison
  const getStoredCliPublicKey = useCallback(() => {
    return getCrypto().getStoredCliPublicKey();
  }, [getCrypto]);

  // Check if crypto is ready (has shared key from either restoration or establishment)
  const isReady = useCallback(() => {
    return getCrypto().hasSharedKey();
  }, [getCrypto]);

  const encrypt = useCallback(<T>(message: Message<T>, sessionId: string): EncryptedEnvelope => {
    return getCrypto().encrypt(message, sessionId);
  }, [getCrypto]);

  const decrypt = useCallback((envelope: EncryptedEnvelope): Message => {
    return getCrypto().decrypt(envelope);
  }, [getCrypto]);

  // Clear all stored crypto state (used when disconnecting)
  const clearCrypto = useCallback(() => {
    WebCrypto.clearStorage();
    cryptoRef.current = null;
  }, []);

  return {
    getPublicKey,
    establishSharedKey,
    reestablishSharedKey,
    isCliKeyChanged,
    getStoredCliPublicKey,
    isReady,
    encrypt,
    decrypt,
    clearCrypto,
  };
}
