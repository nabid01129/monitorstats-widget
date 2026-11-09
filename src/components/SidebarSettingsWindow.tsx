import React, { useEffect, useState } from 'react';
import { DisplaySettings, HardwareStats, MonitorInfo } from '../types/stats';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: DisplaySettings;
  stats: HardwareStats | null;
  displays: MonitorInfo[];
  onSaveSettings: (settings: DisplaySettings) => void;
}

export const SidebarSettingsWindow: React.FC<Props> = ({ isOpen, onClose, settings, stats, displays, onSaveSettings }) => {
  const [draft, setDraft] = useState(settings);

  useEffect(() => {
    if (isOpen) setDraft(settings);
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const toggleClass = 'h-4 w-4 accent-cyan-400';
  const rowClass = 'flex items-center justify-between gap-4 rounded border border-slate-700 bg-slate-950 px-3 py-3';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="max-h-full w-full max-w-sm overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-xl" aria-label="MonitorStats settings">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">MonitorStats settings</h2>
          <button className="rounded px-2 py-1 text-slate-300 hover:bg-slate-800" onClick={onClose} aria-label="Close settings">✕</button>
        </header>

        <div className="space-y-2 text-sm">
          <div className="rounded border border-slate-700 bg-slate-950 p-3">
            <strong className="mb-2 block">Displays and layout</strong>
            <label className="mb-3 block text-xs text-slate-400">Show on
              <select className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white" value={draft.displayId} onChange={(event) => setDraft({ ...draft, displayId: event.target.value })}>
                {displays.map((display) => <option key={display.id} value={display.id}>{display.label}</option>)}
              </select>
            </label>
            <label className="mb-3 block text-xs text-slate-400">Game monitor for FPS
              <select className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white" value={draft.fpsMonitor} onChange={(event) => setDraft({ ...draft, fpsMonitor: event.target.value })}>
                {displays.map((display) => <option key={display.id} value={String(display.fpsIndex)}>{display.label}</option>)}
              </select>
            </label>
            <label className="mb-3 flex items-center justify-between text-xs text-slate-300">Fill the entire monitor
              <input type="checkbox" className={toggleClass} checked={draft.fillDisplay} onChange={(event) => setDraft({ ...draft, fillDisplay: event.target.checked })} />
            </label>
            {!draft.fillDisplay && <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-400">Width {draft.widthPercent}%<input type="range" min="40" max="100" step="5" value={draft.widthPercent} onChange={(event) => setDraft({ ...draft, widthPercent: Number(event.target.value) })} className="mt-1 block w-full accent-cyan-400" /></label>
              <label className="text-xs text-slate-400">Height {draft.heightPercent}%<input type="range" min="40" max="100" step="5" value={draft.heightPercent} onChange={(event) => setDraft({ ...draft, heightPercent: Number(event.target.value) })} className="mt-1 block w-full accent-cyan-400" /></label>
              <label className="col-span-2 text-xs text-slate-400">Position
                <select className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white" value={draft.displayPosition} onChange={(event) => setDraft({ ...draft, displayPosition: event.target.value as DisplaySettings['displayPosition'] })}>
                  <option value="center">Center</option><option value="left">Left side</option><option value="right">Right side</option>
                </select>
              </label>
            </div>}
            <label className="mt-3 flex items-center justify-between text-xs text-slate-300">Automatically scale to monitor size
              <input type="checkbox" className={toggleClass} checked={draft.autoScale} onChange={(event) => setDraft({ ...draft, autoScale: event.target.checked })} />
            </label>
            <label className="mt-3 block text-xs text-slate-400">{draft.autoScale ? 'Scale adjustment' : 'Manual UI scale'} · {draft.scalePercent}%
              <input type="range" min="70" max="130" step="5" value={draft.scalePercent} onChange={(event) => setDraft({ ...draft, scalePercent: Number(event.target.value) })} className="mt-1 block w-full accent-cyan-400" />
            </label>
          </div>
          <label className={rowClass}>
            <span><strong className="block">Start with Windows</strong><small className="text-slate-400">Launch when you sign in.</small></span>
            <input type="checkbox" className={toggleClass} checked={draft.runAtStartup} onChange={(event) => setDraft({ ...draft, runAtStartup: event.target.checked })} />
          </label>
          <div className="rounded border border-slate-700 bg-slate-950 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <strong>Custom device names</strong>
              <button
                type="button"
                className="rounded px-2 py-1 text-xs text-cyan-300 hover:bg-slate-800 disabled:text-slate-600"
                disabled={Object.keys(draft.customNames).length === 0}
                onClick={() => setDraft({ ...draft, customNames: {} })}
              >
                Reset names
              </button>
            </div>
            <p className="mb-3 text-xs text-slate-400">Leave blank to use the detected hardware name. Changes apply when you save.</p>
            <div className="space-y-2">
              {[
                { key: 'cpu', label: 'Processor', detected: stats?.cpu.model || 'Detected processor' },
                { key: 'gpu', label: 'Graphics', detected: stats?.gpu.model || 'Detected graphics device' },
                { key: 'ram', label: 'Memory', detected: stats?.ram.spec || 'Detected memory' },
                ...(stats?.drives || []).map((drive) => ({ key: `drive:${drive.id}`, label: drive.letter, detected: drive.name })),
              ].map((device) => (
                <label key={device.key} className="block text-xs text-slate-400">
                  <span className="mb-1 block">{device.label} <span className="text-slate-600">· {device.detected}</span></span>
                  <input
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white"
                    value={draft.customNames[device.key] || ''}
                    placeholder={device.detected}
                    onChange={(event) => setDraft({ ...draft, customNames: { ...draft.customNames, [device.key]: event.target.value } })}
                  />
                </label>
              ))}
            </div>
          </div>
          <label className={rowClass}>
            <span><strong className="block">Show game FPS</strong><small className="text-slate-400">Reads the selected game monitor from RTSS.</small></span>
            <input type="checkbox" className={toggleClass} checked={draft.showFpsBox} onChange={(event) => setDraft({ ...draft, showFpsBox: event.target.checked })} />
          </label>
          <label className={rowClass}>
            <span><strong className="block">Per-core CPU load</strong><small className="text-slate-400">Hide the core bars to simplify the view.</small></span>
            <input type="checkbox" className={toggleClass} checked={draft.showCoreDetails} onChange={(event) => setDraft({ ...draft, showCoreDetails: event.target.checked })} />
          </label>
          <label className={rowClass}>
            <span><strong className="block">Network speed unit</strong><small className="text-slate-400">Choose megabits or megabytes per second.</small></span>
            <select className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-white" value={draft.networkSpeedUnit} onChange={(event) => setDraft({ ...draft, networkSpeedUnit: event.target.value as 'Mbps' | 'MB/s' })}>
              <option value="Mbps">Mbps</option><option value="MB/s">MB/s</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 rounded border border-slate-700 bg-slate-950 px-3 py-3">
            <span><strong className="block">Polling interval</strong><small className="text-slate-400">Faster updates use more CPU.</small></span>
            <select className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-white" value={draft.pollingIntervalMs} onChange={(event) => setDraft({ ...draft, pollingIntervalMs: Number(event.target.value) })}>
              <option value={1000}>1 second</option><option value={2000}>2 seconds</option><option value={3000}>3 seconds</option><option value={5000}>5 seconds · lower impact</option><option value={10000}>10 seconds · lowest impact</option>
            </select>
          </label>
          <p className="px-1 pt-2 text-xs leading-relaxed text-slate-400">Device names and available readings are detected automatically. Unsupported readings show as an em dash.</p>
        </div>

        <footer className="mt-5 flex justify-end gap-2">
          <button className="rounded border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800" onClick={onClose}>Cancel</button>
          <button className="rounded bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300" onClick={() => { onSaveSettings(draft); onClose(); }}>Save</button>
        </footer>
      </section>
    </div>
  );
};
