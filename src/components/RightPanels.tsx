import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";

type Panels = {
  target: HTMLDivElement | null;
  active: string | null;
  setActive: Dispatch<SetStateAction<string | null>>;
  railAvailable: boolean;
};
const PanelContext = createContext<Panels | null>(null);
export function RightPanels({
  children,
  active,
  setActive,
  railAvailable,
}: Omit<Panels, "target"> & { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  return (
    <PanelContext.Provider value={{ target, active, setActive, railAvailable }}>
      {children}
      <div
        className="right-panels"
        aria-label="Map layer panels"
        ref={setTarget}
      />
    </PanelContext.Provider>
  );
}
export function RightPanel({
  id,
  title,
  children,
  className = "",
  autoOpen = false,
  reveal,
  ...props
}: {
  id: string;
  title: string;
  children: ReactNode;
  className?: string;
  autoOpen?: boolean;
  reveal?: unknown;
  "aria-label"?: string;
}) {
  const context = useContext(PanelContext)!;
  const { target, active, setActive, railAvailable } = context;
  useEffect(() => {
    if (!autoOpen) return;
    setActive(id);
    return () => {
      setActive((previous) => (previous === id ? "rail" : previous));
    };
  }, [id, autoOpen, railAvailable, setActive]);
  useEffect(() => {
    if (reveal) setActive(id);
  }, [reveal, id, setActive]);
  const open = active === id;
  return target
    ? createPortal(
        <section
          {...props}
          className={`right-panel ${className}`}
          data-panel={id}
          style={{ order: id === "rail" ? 0 : 1 }}
        >
          <h2 className="right-panel-heading">
            <button
              aria-expanded={open}
              aria-controls={`panel-${id}`}
              aria-label={
                id === "rail"
                  ? `${open ? "Collapse" : "Expand"} rail controls`
                  : undefined
              }
              onClick={() => setActive(open ? null : id)}
            >
              {title}
              <span aria-hidden="true">{open ? "−" : "+"}</span>
            </button>
          </h2>
          <div id={`panel-${id}`} className="right-panel-body" hidden={!open}>
            {children}
          </div>
        </section>,
        target,
      )
    : null;
}

// A repeated click on an already-selected object must still reopen its section.
export function usePanelSelection<T>(id: string, select: Dispatch<SetStateAction<T | null>>) {
  const { setActive } = useContext(PanelContext)!;
  return useCallback((value: T | null) => {
    select(value);
    if (value) setActive(id);
  }, [id, select, setActive]);
}
