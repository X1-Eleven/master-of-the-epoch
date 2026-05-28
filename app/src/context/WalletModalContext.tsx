import { createContext, useContext, useState, type ReactNode } from 'react';

interface WalletModalContextState {
  visible: boolean;
  setVisible: (visible: boolean) => void;
}

const WalletModalContext = createContext<WalletModalContextState>({
  visible: false,
  setVisible: () => {},
});

export function WalletModalProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <WalletModalContext.Provider value={{ visible, setVisible }}>
      {children}
    </WalletModalContext.Provider>
  );
}

export function useWalletModal(): WalletModalContextState {
  return useContext(WalletModalContext);
}
