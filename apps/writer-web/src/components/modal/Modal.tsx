import { XIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type ModalProps = {
  className?: string;
  children: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
};

export const Modal = ({
  className,
  children,
  isOpen,
  onClose
}: ModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null);

  // Stop site overflow when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Tab focus trap + Escape to close
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const focusableElements = modalRef.current.querySelectorAll(
      'a, button, input, textarea, select, details, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (firstElement) firstElement.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal card */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className={cn(
          "relative z-50 w-full max-w-md rounded-xl border border-[#e5e7eb] bg-white shadow-xl dark:border-[#374151] dark:bg-[#1a1a1a]",
          className
        )}
      >
        {children}

        <button
          type="button"
          aria-label="Close Modal"
          className="absolute top-3 right-3 rounded-md p-1 text-[#6b7280] transition-colors hover:bg-[#f5f5f5] hover:text-[#0a0a0a] dark:hover:bg-[#374151]"
          onClick={onClose}
        >
          <XIcon size={16} />
        </button>
      </div>
    </div>
  );
};
