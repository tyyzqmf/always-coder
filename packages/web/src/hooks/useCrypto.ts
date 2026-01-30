'use client';

import { useRef, useCallback } from 'react';
import { WebCrypto } from '@/lib/crypto';
import type { EncryptedEnvelope, Message } from '@always-coder/shared';

export function useCrypto() {
  const cryptoRef = useRef<WebCrypto | null>(null);

  // Initialize crypto lazily, restoring from sessionStorage if available
  const getCrypto = useCallback(() => {
    if (!cryptoRef.current) {
      // Will automatically restore keypair and sharedKey from sessionStorage
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
    isReady,
    encrypt,
    decrypt,
    clearCrypto,
  };
}
