import { useRef, useContext } from "react";

import { createContext } from "react";

const HapticsContext = createContext<{
  vibrate: () => void;
}>({
  vibrate: () => {},
});

export function HapticsProvider({ children }: { children: React.ReactNode }) {
  const labelRef = useRef<HTMLLabelElement>(null);

  const vibrate = () => {
    if (!labelRef.current) {
      window?.navigator?.vibrate(100);
    } else {
      labelRef.current.click();
    }
  };

  return (
    <HapticsContext.Provider value={{ vibrate }}>
      {children}
      <label ref={labelRef} htmlFor="haptics-vibrate" className="hidden" />
      <input
        type="checkbox"
        id="haptics-vibrate"
        className="hidden"
        // @ts-expect-error switch is nonstandard
        switch="true"
      />
    </HapticsContext.Provider>
  );
}

export function useHaptics() {
  return useContext(HapticsContext);
}
