import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface SessionState {
  sessionId: string | null;
  cliPublicKey: string | null;
  connectionStatus: ConnectionStatus;
  errorMessage: string | null;
  isEncryptionReady: boolean;

  // Actions
  setSessionId: (sessionId: string) => void;
  setCliPublicKey: (publicKey: string) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setError: (message: string) => void;
  clearError: () => void;
  setEncryptionReady: (ready: boolean) => void;
  reset: () => void;
}

const initialState = {
  sessionId: null,
  cliPublicKey: null,
  connectionStatus: 'disconnected' as ConnectionStatus,
  errorMessage: null,
  isEncryptionReady: false,
};

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      ...initialState,

      setSessionId: (sessionId) => set({ sessionId }),

      setCliPublicKey: (cliPublicKey) => set({ cliPublicKey }),

      setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

      setError: (errorMessage) => set({ errorMessage, connectionStatus: 'error' }),

      clearError: () => set({ errorMessage: null }),

      setEncryptionReady: (isEncryptionReady) => set({ isEncryptionReady }),

      reset: () => set(initialState),
    }),
    {
      name: 'always-coder:session',
      storage: createJSONStorage(() => sessionStorage),
      // Only persist session-related data, not transient connection status
      partialize: (state) => ({
        sessionId: state.sessionId,
        cliPublicKey: state.cliPublicKey,
        isEncryptionReady: state.isEncryptionReady,
      }),
    }
  )
);
