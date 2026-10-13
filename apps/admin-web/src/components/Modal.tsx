import { useEffect, useRef, type ReactNode } from "react";
export function Modal({
  title,
  children,
  onClose,
  variant = "modal",
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  variant?: "modal" | "drawer";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={`detail-drawer dialog-${variant}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="drawer-heading">
        <h2>{title}</h2>
        <button className="button" onClick={onClose}>
          Đóng
        </button>
      </div>
      {children}
    </dialog>
  );
}
