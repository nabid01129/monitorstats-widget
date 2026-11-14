import React, { useEffect, useState } from 'react';
import { DisplaySettings, HardwareStats, MonitorInfo, UpdateCheckInfo } from '../types/stats';
import { THEME_OPTIONS } from '../utils/defaultSpecs';
import { estimateSystemPower } from '../utils/systemPower';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: DisplaySettings;
  stats: HardwareStats | null;
  displays: MonitorInfo[];
  onSaveSettings: (settings: DisplaySettings) => void;
  appVersion: string;
  updateInfo: UpdateCheckInfo | null;
  onOpenLatestRelease: () => void;
  shell?: {
    getOntConfig: () => Promise<{ endpoint: string; username: string; configured: boolean }>;
    saveOntConfig: (config: { endpoint: string; username: string; password: string }) => Promise<{ configured: boolean }>;
  };
}

export const SidebarSettingsWindow: React.FC<Props> = ({ isOpen, onClose, settings, stats, displays, onSaveSettings, appVersion, updateInfo, onOpenLatestRelease, shell }) => {
  const [draft, setDraft] = useState(settings);
  const [ontDraft, setOntDraft] = useState({ endpoint: '', username: '', password: '', configured: false });
  const [ontMessage, setOntMessage] = useState('');
  const [savingOnt, setSavingOnt] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDraft(settings);
    setOntMessage('');
    let active = true;
    shell?.getOntConfig().then((config) => {
      if (active) setOntDraft((previous) => ({ ...previous, ...config, password: '' }));
    }).catch(() => {});
    return () => { active = false; };
  }, [isOpen, settings, shell]);

  if (!isOpen) return null;

  const toggleClass = 'h-4 w-4 accent-cyan-400';
  const rowClass = 'flex items-center justify-between gap-4 rounded border border-slate-700 bg-slate-950 px-3 py-3';
  const powerEstimate = estimateSystemPower(stats, displays);
  const formatWatts = (value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} W`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="theme-settings-window max-h-full w-full max-w-sm overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-xl" aria-label="MonitorStats settings">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">MonitorStats settings</h2>
          <button className="rounded px-2 py-1 text-slate-300 hover:bg-slate-800" onClick={onClose} aria-label="Close settings">✕</button>
        </header>

        <div className="space-y-2 text-sm">
          <div className="rounded border border-slate-700 bg-slate-950 p-3" aria-live="polite">
            <div className="flex items-center justify-between gap-2">
              <strong>Current version</strong><span className="font-mono text-cyan-300">{appVersion ? `v${appVersion}` : 'Loading…'}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {!updateInfo ? 'Checking GitHub for updates…' : updateInfo.status === 'available'
                ? `Version ${updateInfo.latestVersion} is available.`
                : updateInfo.status === 'unavailable'
                  ? 'Automatic update check could not reach GitHub.'
                  : updateInfo.latestVersion && updateInfo.latestVersion !== updateInfo.currentVersion
                    ? `Latest GitHub release: v${updateInfo.latestVersion}.`
                    : 'You are using the latest GitHub release.'}
            </p>
            <button type="button" className="mt-2 rounded border border-cyan-700 px-2 py-1 text-xs text-cyan-200 hover:bg-slate-800" onClick={onOpenLatestRelease}>
              Check for updates on GitHub
            </button>
          </div>
          <label className="block rounded border border-slate-700 bg-slate-950 p-3 text-xs text-slate-400">Color theme
            <select className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-2 text-sm text-white" value={draft.theme} onChange={(event) => setDraft({ ...draft, theme: event.target.value as DisplaySettings['theme'] })}>
              <option value="classic">Classic · original cyan</option>
              {(['Gamer style', 'Aesthetic style'] as const).map((group) => (
                <optgroup key={group} label={group}>
                  {THEME_OPTIONS.filter((theme) => theme.group === group).map((theme) => (
                    <option key={theme.id} value={theme.id}>{theme.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <small className="mt-1 block">Static styles only; no animation, blur, or extra polling. OLED Black is pure black.</small>
          </label>
          <label className={rowClass}>
            <span><strong className="block">OLED burn-in protection</strong><small className="text-slate-400">Shift the dashboard by 2 px; applies to every theme.</small></span>
            <select className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-white" value={draft.oledShiftIntervalMs} onChange={(event) => setDraft({ ...draft, oledShiftIntervalMs: Number(event.target.value) })}>
              <option value={180000}>Every 3 minutes</option><option value={300000}>Every 5 minutes</option><option value={600000}>Every 10 minutes</option>
            </select>
          </label>
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
          <div className="rounded border border-slate-700 bg-slate-950 p-3">
            <div className="flex items-center justify-between gap-2">
              <strong>System power estimate</strong>
              {powerEstimate && <span className="text-xs font-semibold tabular-nums text-cyan-300">{powerEstimate.mode === 'measured' ? '' : '≈'}{formatWatts(powerEstimate.watts)}</span>}
            </div>
            {powerEstimate ? <>
              <p className="mt-1 text-xs text-slate-400">Expected range {formatWatts(powerEstimate.low)}–{formatWatts(powerEstimate.high)}. Detailed values update with the hardware poll.</p>
              <details className="mt-2 text-xs">
                <summary className="cursor-pointer select-none text-cyan-300">View component wattage · {powerEstimate.components.length} parts</summary>
                <div className="mt-2 max-h-[45vh] space-y-1 overflow-y-auto pr-1">
                  {powerEstimate.components.map((part) => <div key={part.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t border-slate-800 pt-1">
                    <div className="min-w-0">
                      <div className="truncate text-slate-200" title={part.name}>{part.name}</div>
                      <div className="text-[10px] leading-tight text-slate-500">{part.detail}</div>
                    </div>
                    <div className="whitespace-nowrap text-right tabular-nums">
                      <div className={part.source === 'Live sensor' ? 'text-emerald-300' : 'text-slate-300'}>{part.source === 'Estimate' ? '≈' : ''}{formatWatts(part.watts)}</div>
                      <div className="text-[10px] text-slate-500">{formatWatts(part.low)}–{formatWatts(part.high)}</div>
                    </div>
                  </div>)}
                </div>
                <p className="mt-2 text-[10px] leading-tight text-slate-500">{powerEstimate.explanation} USB device draw, monitor brightness, and PSU efficiency are modeled. A wall power meter is needed for an exact total.</p>
              </details>
            </> : <p className="mt-1 text-xs text-slate-400">Waiting for live hardware data.</p>}
          </div>
          <label className={rowClass}>
            <span><strong className="block">Start with Windows</strong><small className="text-slate-400">Launch when you sign in.</small></span>
            <input type="checkbox" className={toggleClass} checked={draft.runAtStartup} onChange={(event) => setDraft({ ...draft, runAtStartup: event.target.checked })} />
          </label>
          <div className="rounded border border-slate-700 bg-slate-950 p-3">
            <strong className="mb-2 block">ONU optical power</strong>
            <p className="mb-3 text-xs text-slate-400">Credentials are encrypted for this Windows account. Optical power refreshes every 30 minutes.</p>
            <div className="space-y-2">
              <label className="block text-xs text-slate-400">Local ONU address
                <input className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white" value={ontDraft.endpoint} onChange={(event) => setOntDraft({ ...ontDraft, endpoint: event.target.value })} placeholder="http://your-ont-local-ip" />
              </label>
              <label className="block text-xs text-slate-400">Username
                <input autoComplete="username" className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white" value={ontDraft.username} onChange={(event) => setOntDraft({ ...ontDraft, username: event.target.value })} placeholder="ONT username" />
              </label>
              <label className="block text-xs text-slate-400">Password {ontDraft.configured && <span className="text-emerald-400">· saved</span>}
                <input autoComplete="new-password" type="password" className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-white" value={ontDraft.password} onChange={(event) => setOntDraft({ ...ontDraft, password: event.target.value })} placeholder={ontDraft.configured ? 'Leave blank to keep saved password' : 'Enter ONU password'} />
              </label>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-400" role="status">{ontMessage || (ontDraft.configured ? 'Configured' : 'Not configured')}</span>
                <button type="button" disabled={savingOnt || !shell} className="rounded border border-cyan-700 px-2 py-1 text-xs text-cyan-200 hover:bg-slate-800 disabled:opacity-50" onClick={async () => {
                  if (!shell) return;
                  setSavingOnt(true);
                  setOntMessage('Saving…');
                  try {
                    await shell.saveOntConfig(ontDraft);
                    setOntDraft((previous) => ({ ...previous, password: '', configured: true }));
                    setOntMessage('Saved · checking ONU…');
                  } catch (error) {
                    setOntMessage(error instanceof Error ? error.message : 'Could not save ONU settings');
                  } finally { setSavingOnt(false); }
                }}>{savingOnt ? 'Saving…' : 'Save ONU'}</button>
              </div>
            </div>
          </div>
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
