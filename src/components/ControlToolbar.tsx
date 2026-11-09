import React from 'react';

interface Props {
  onOpenSettings: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const ControlToolbar: React.FC<Props> = ({ onOpenSettings, onRefresh, isRefreshing }) => (
  <div className="fixed right-3 top-3 z-40 flex gap-1 opacity-35 transition-opacity hover:opacity-100 focus-within:opacity-100">
    <button
      type="button"
      onClick={onRefresh}
      disabled={isRefreshing}
      className="rounded border border-slate-700 bg-slate-950/90 p-2 text-slate-300 hover:bg-slate-800 disabled:cursor-wait disabled:text-cyan-300"
      title={isRefreshing ? 'Refreshing hardware readings…' : 'Refresh hardware readings now'}
      aria-label={isRefreshing ? 'Refreshing hardware readings' : 'Refresh hardware readings now'}
    >
      <svg className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-cyan-300' : ''}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 7v5h-5M4 17v-5h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
    <button
      type="button"
      onClick={onOpenSettings}
      className="rounded border border-slate-700 bg-slate-950/90 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
      title="MonitorStats settings"
      aria-label="Open MonitorStats settings"
    >
      Settings
    </button>
  </div>
);
