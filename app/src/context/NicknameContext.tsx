import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export const NICKNAME_STORAGE_KEY = 'mote_nicknames';

interface NicknameContextValue {
  getNickname: (address: string) => string;
  setNickname: (address: string, name: string) => void;
  hasEntry: (address: string) => boolean;
}

const NicknameContext = createContext<NicknameContextValue | null>(null);

function load(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(NICKNAME_STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

export function NicknameProvider({ children }: { children: ReactNode }) {
  const [nicknames, setNicknames] = useState<Record<string, string>>(load);

  const setNickname = useCallback((address: string, name: string) => {
    setNicknames(prev => {
      const updated = { ...prev, [address]: name };
      localStorage.setItem(NICKNAME_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const getNickname = useCallback((address: string): string => {
    const n = nicknames[address];
    return n === undefined || n === '' ? 'Anonymous' : n;
  }, [nicknames]);

  const hasEntry = useCallback((address: string) => address in nicknames, [nicknames]);

  return (
    <NicknameContext.Provider value={{ getNickname, setNickname, hasEntry }}>
      {children}
    </NicknameContext.Provider>
  );
}

export function useNicknames() {
  const ctx = useContext(NicknameContext);
  if (!ctx) throw new Error('useNicknames must be inside NicknameProvider');
  return ctx;
}
