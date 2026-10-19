import { useEffect, useRef, useState, useId } from "react";
import { Link } from "react-router-dom";
import { Eye, MoreHorizontal, Trash2 } from "lucide-react";
import { IconAction } from "../../components/IconAction";
import type { Race } from "../../types/domain";
export function RaceActions({
  race,
  onDelete,
}: {
  race: Race;
  onDelete?: () => void;
}) {
  const hintId = useId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const item = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    item.current?.focus();
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div
      className="compact-actions"
      ref={root}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <span className="icon-action">
        <Link
          className="button icon-button"
          to={`/races/${race.race_id}`}
          aria-label={`Mở giải ${race.name}`}
          aria-describedby={hintId}
        >
          <Eye size={18} />
        </Link>
        <span id={hintId} className="action-tooltip" role="tooltip">
          Mở giải {race.name}
        </span>
      </span>
      {onDelete && (
        <>
          <IconAction
            label={`Thao tác khác: ${race.name}`}
            aria-expanded={open}
            aria-haspopup="menu"
            onClick={(e) => {
              trigger.current = e.currentTarget;
              setOpen(!open);
            }}
          >
            <MoreHorizontal size={19} />
          </IconAction>
          {open && (
            <div
              className="race-popover"
              role="menu"
              aria-label={`Thao tác cho ${race.name}`}
            >
              <button
                ref={item}
                role="menuitem"
                className="button danger"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                  onDelete();
                }}
              >
                <Trash2 size={16} /> Xóa giải
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
