import React from 'react';

interface Props {
  onOpenSettings: () => void;
  onRefresh: () => void;
  onMinimize: () => void;
  onToggleMaximize: () => void;
  isMaximized: boolean;
  isRefreshing: boolean;
  updateAvailable: boolean;
  latestVersion: string | null;
  onOpenLatestRelease: () => void;
}

export const ControlToolbar: React.FC<Props> = ({ onOpenSettings, onRefresh, onMinimize, onToggleMaximize, isMaximized, isRefreshing, updateAvailable, latestVersion, onOpenLatestRelease }) => (
  <div className={`absolute right-3 top-3 z-40 flex gap-1 transition-opacity hover:opacity-100 focus-within:opacity-100 ${updateAvailable ? 'opacity-100' : 'opacity-35'}`}>
    {updateAvailable && <button
      type="button"
      onClick={onOpenLatestRelease}
      className="rounded border border-cyan-700 bg-slate-950/90 px-2 py-2 text-xs font-semibold text-cyan-300 hover:bg-slate-800"
      title={`Version ${latestVersion} is available on GitHub`}
      aria-label={`Version ${latestVersion} is available. Open the GitHub release page`}
    >Update · v{latestVersion}</button>}
    <button
      type="button"
      onClick={onMinimize}
      className="rounded border border-slate-700 bg-slate-950/90 p-2 text-slate-300 hover:bg-slate-800"
      title="Minimize MonitorStats to the notification area"
      aria-label="Minimize MonitorStats to the notification area"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 18h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
    <button
      type="button"
      onClick={onToggleMaximize}
      className="rounded border border-slate-700 bg-slate-950/90 p-2 text-slate-300 hover:bg-slate-800"
      title={isMaximized ? 'Restore widget size' : 'Maximize widget to the monitor work area'}
      aria-label={isMaximized ? 'Restore widget size' : 'Maximize widget to the monitor work area'}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {isMaximized
          ? <path d="M8 5h11v11M16 8H5v11h11V8Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          : <path d="M5 5h14v14H5z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />}
      </svg>
    </button>
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
