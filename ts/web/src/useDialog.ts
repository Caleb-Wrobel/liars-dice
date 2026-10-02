import { useEffect, useRef } from "react";

/**
 * What every dialog needs: focus moves to its close button when it opens, Escape closes it, and focus
 * goes back to wherever it was when it closes. Put the returned ref on the close button.
 */
export function useDialog(onClose: () => void) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.(); // put focus back where it was
    };
  }, []);

  return closeButton;
}
