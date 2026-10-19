import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
export function IconAction({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <span className="icon-action">
      <button
        type="button"
        {...props}
        className={`button icon-button ${props.className ?? ""}`}
        aria-label={label}
        aria-describedby={id}
      >
        {children}
      </button>
      <span id={id} role="tooltip" className="action-tooltip">
        {label}
      </span>
    </span>
  );
}
