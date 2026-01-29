'use client';

import { useRef, useCallback } from 'react';
import { WebCrypto } from '@/lib/crypto';
import type { EncryptedEnvelope, Message } from '@always-coder/shared';

export function useCrypto() {
  const cryptoRef = useRef<WebCrypto | null>(null);

  // Initialize crypto lazily
  const getCrypto = useCallback(() => {
    if (!cryptoRef.current) {
      cryptoRef.current = new WebCrypto();
    }
    return cryptoRef.current;
  }, []);

  const getPublicKey = useCallback(() => {
    return getCrypto().getPublicKey();
  }, [getCrypto]);

  const establishSharedKey = useCallback((cliPublicKey: string) => {
    getCrypto().establishSharedKey(cliPublicKey);
  }, [getCrypto]);

  const isReady = useCallback(() => {
    return cryptoRef.current?.hasSharedKey() ?? false;
  }, []);

  const encrypt = useCallback(<T>(message: Message<T>, sessionId: string): EncryptedEnvelope => {
    return getCrypto().encrypt(message, sessionId);
  }, [getCrypto]);

  const decrypt = useCallback((envelope: EncryptedEnvelope): Message => {
    return getCrypto().decrypt(envelope);
  }, [getCrypto]);

  return {
    getPublicKey,
    establishSharedKey,
    isReady,
    encrypt,
    decrypt,
  };
}
