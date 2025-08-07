import React, { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { PlayerActionsProps, ReportData } from './types';

export const PlayerActions: React.FC<PlayerActionsProps> = ({
  playerId,
  playerName,
  onMute,
  onBlock,
  onReport,
  onClose,
  isMuted,
  isBlocked,
  position,
  showMuteDuration = false,
  confirmBeforeBlock = false,
}) => {
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [reportReason, setReportReason] = useState<ReportData['reason'] | null>(null);
  const [reportDetails, setReportDetails] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const firstButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Focus first button on mount
    firstButtonRef.current?.focus();

    // Handle click outside
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose?.();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    // Handle escape key
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleMute = () => {
    onMute(playerId);
    setAnnouncement(`${playerName} has been ${isMuted ? 'unmuted' : 'muted'}`);
  };

  const handleBlock = () => {
    if (confirmBeforeBlock && !isBlocked && !showBlockConfirm) {
      setShowBlockConfirm(true);
      return;
    }
    onBlock(playerId);
    setShowBlockConfirm(false);
    setAnnouncement(`${playerName} has been ${isBlocked ? 'unblocked' : 'blocked'}`);
  };

  const handleReport = () => {
    if (reportReason) {
      onReport(playerId, {
        reason: reportReason,
        details: reportDetails.trim() || undefined,
      });
      setShowReportDialog(false);
      setReportReason(null);
      setReportDetails('');
      setAnnouncement(`Report submitted for ${playerName}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    const buttons = menuRef.current?.querySelectorAll('button:not(:disabled)');
    if (!buttons) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (index + 1) % buttons.length;
      (buttons[nextIndex] as HTMLElement).focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (index - 1 + buttons.length) % buttons.length;
      (buttons[prevIndex] as HTMLElement).focus();
    }
  };

  if (showReportDialog) {
    return (
      <div
        ref={menuRef}
        data-testid="player-actions-menu"
        className="absolute bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-4 z-50"
        style={{ left: position.x, top: position.y }}
      >
        <h3 className="text-white font-semibold mb-3">Report {playerName}</h3>
        <p className="text-gray-300 text-sm mb-3">Select a reason:</p>
        
        <div className="space-y-2 mb-3">
          {[
            { value: 'inappropriate-language', label: 'Inappropriate language' },
            { value: 'cheating', label: 'Cheating' },
            { value: 'harassment', label: 'Harassment' },
            { value: 'spam', label: 'Spam' },
            { value: 'other', label: 'Other' },
          ].map((option) => (
            <label key={option.value} className="flex items-center text-gray-300 cursor-pointer">
              <input
                type="radio"
                name="report-reason"
                value={option.value}
                checked={reportReason === option.value}
                onChange={(e) => setReportReason(e.target.value as ReportData['reason'])}
                className="mr-2"
                aria-label={option.label}
              />
              {option.label}
            </label>
          ))}
        </div>

        <textarea
          placeholder="Additional details (optional)"
          value={reportDetails}
          onChange={(e) => setReportDetails(e.target.value)}
          className="w-full p-2 bg-gray-700 text-white rounded border border-gray-600 mb-3"
          rows={3}
        />

        <div className="flex space-x-2">
          <button
            onClick={handleReport}
            disabled={!reportReason}
            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Submit report"
          >
            Submit report
          </button>
          <button
            onClick={() => setShowReportDialog(false)}
            className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (showBlockConfirm) {
    return (
      <div
        ref={menuRef}
        data-testid="player-actions-menu"
        className="absolute bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-4 z-50"
        style={{ left: position.x, top: position.y }}
      >
        <p className="text-white mb-3">Are you sure you want to block {playerName}?</p>
        <div className="flex space-x-2">
          <button
            onClick={handleBlock}
            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
            aria-label="Confirm"
          >
            Confirm
          </button>
          <button
            onClick={() => setShowBlockConfirm(false)}
            className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700"
            aria-label="Cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={menuRef}
        data-testid="player-actions-menu"
        role="menu"
        aria-label="Player actions"
        className="absolute bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-2 z-50"
        style={{ left: position.x, top: position.y }}
      >
        <div className="text-white font-semibold px-3 py-1 mb-1 border-b border-gray-600">
          {playerName}
          {isMuted && <span data-testid="muted-indicator" className="ml-2 text-xs text-yellow-400">(Muted)</span>}
          {isBlocked && <span data-testid="blocked-indicator" className="ml-2 text-xs text-red-400">(Blocked)</span>}
        </div>

        {!isBlocked && (
          <>
            <button
              ref={firstButtonRef}
              role="menuitem"
              onClick={handleMute}
              onKeyDown={(e) => handleKeyDown(e, 0)}
              className="w-full text-left px-3 py-2 text-gray-300 hover:bg-gray-700 rounded transition-colors"
              aria-label={isMuted ? 'Unmute player' : 'Mute player'}
            >
              {isMuted ? '🔊 Unmute' : '🔇 Mute'}
            </button>
            
            <button
              role="menuitem"
              onClick={() => setShowReportDialog(true)}
              onKeyDown={(e) => handleKeyDown(e, 2)}
              className="w-full text-left px-3 py-2 text-gray-300 hover:bg-gray-700 rounded transition-colors"
              aria-label="Report player"
            >
              ⚠️ Report
            </button>
          </>
        )}

        <button
          ref={isBlocked ? firstButtonRef : undefined}
          role="menuitem"
          onClick={handleBlock}
          onKeyDown={(e) => handleKeyDown(e, isBlocked ? 0 : 1)}
          className={clsx(
            'w-full text-left px-3 py-2 rounded transition-colors',
            isBlocked
              ? 'text-green-400 hover:bg-gray-700'
              : 'text-red-400 hover:bg-gray-700'
          )}
          aria-label={isBlocked ? 'Unblock player' : 'Block player'}
        >
          {isBlocked ? '✓ Unblock' : '🚫 Block'}
        </button>
      </div>

      {announcement && (
        <div role="status" className="sr-only">
          {announcement}
        </div>
      )}
    </>
  );
};