import React from 'react';
import { useToggle } from '../../hooks/common';

export interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  ariaLabel?: string;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultOpen = true,
  className = '',
  headerClassName = '',
  contentClassName = '',
  ariaLabel
}) => {
  const [isOpen, { toggle }] = useToggle(defaultOpen);
  const sectionId = `section-${title.toLowerCase().replace(/\s/g, '-')}`;

  return (
    <div className={`border-b border-slate-700/50 pb-4 last:border-0 ${className}`}>
      <button
        onClick={toggle}
        className={`w-full flex items-center justify-between text-sm font-semibold text-slate-400 mb-3 tracking-wider hover:text-purple-400 transition-colors ${headerClassName}`}
        aria-expanded={isOpen}
        aria-controls={sectionId}
      >
        <span>{title}</span>
        <span 
          className="text-xs transition-transform duration-200"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▼
        </span>
      </button>
      <div
        id={sectionId}
        className={`space-y-2 transition-all ${isOpen ? 'block' : 'hidden'} ${contentClassName}`}
        role="region"
        aria-label={ariaLabel || title}
      >
        {children}
      </div>
    </div>
  );
};