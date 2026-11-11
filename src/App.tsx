import React, { useCallback, useEffect, useState } from 'react';
import { DisplaySettings, GameTelemetry, HardwareStats, MonitorInfo, UpdateCheckInfo } from './types/stats';
import { DEFAULT_DISPLAY_SETTINGS, THEME_OPTIONS } from './utils/defaultSpecs';
import { StatsView } from './components/StatsView';
import { ControlToolbar } from './components/ControlToolbar';
import { SidebarSettingsWindow } from './components/SidebarSettingsWindow';

const OLED_PROTECTION_OFFSETS = [
  { x: 0, y: 0 },
  { x: 2, y: 0 },
  { x: 2, y: 2 },
  { x: 0, y: 2 },
  { x: -2, y: 2 },
  { x: -2, y: 0 },
  { x: -2, y: -2 },
  { x: 0, y: -2 },
  { x: 2, y: -2 },
];

interface ShellBridge {
  setRunAtStartup: (enabled: boolean) => void;
  setFpsMonitor: (monitor: string) => void;
  setPollingInterval: (intervalMs: number) => void;
  refreshHardware: () => void;
  setWidgetLayout: (layout: Pick<DisplaySettings, 'displayId' | 'fillDisplay' | 'displayPosition' | 'widthPercent' | 'heightPercent' | 'autoScale' | 'scalePercent'>) => void;
  getDisplays: () => Promise<MonitorInfo[]>;
  getAppVersion: () => Promise<string>;
  checkForUpdates: () => Promise<UpdateCheckInfo>;
  openLatestRelease: () => Promise<void>;
  getOntConfig: () => Promise<{ endpoint: string; username: string; configured: boolean }>;
  saveOntConfig: (config: { endpoint: string; username: string; password: string }) => Promise<{ configured: boolean }>;
  onDisplays: (callback: (displays: MonitorInfo[]) => void) => () => void;
  onHardwareStats: (callback: (data: HardwareStats) => void) => () => void;
  onHardwareError: (callback: () => void) => () => void;
  onRefreshState: (callback: (refreshing: boolean) => void) => () => void;
  onGameFps: (callback: (data: GameTelemetry) => void) => () => void;
}

declare global {
  interface Window {
    monitorStatsShell?: ShellBridge;
  }
}

function loadSettings(): DisplaySettings {
  try {
    const stored = JSON.parse(localStorage.getItem('monitorstats_settings') || '{}') as Partial<DisplaySettings>;
    return {
      theme: THEME_OPTIONS.some((option) => option.id === stored.theme)
        ? stored.theme as DisplaySettings['theme'] : DEFAULT_DISPLAY_SETTINGS.theme,
      runAtStartup: stored.runAtStartup ?? DEFAULT_DISPLAY_SETTINGS.runAtStartup,
      showFpsBox: stored.showFpsBox ?? DEFAULT_DISPLAY_SETTINGS.showFpsBox,
      fpsMonitor: typeof stored.fpsMonitor === 'string' && /^\d+$/.test(stored.fpsMonitor) ? stored.fpsMonitor : '1',
      showCoreDetails: stored.showCoreDetails ?? DEFAULT_DISPLAY_SETTINGS.showCoreDetails,
      customNames: stored.customNames && typeof stored.customNames === 'object' ? stored.customNames : {},
      networkSpeedUnit: stored.networkSpeedUnit === 'MB/s' ? 'MB/s' : 'Mbps',
      pollingIntervalMs: [1000, 2000, 3000, 5000, 10000].includes(stored.pollingIntervalMs ?? 3000) ? stored.pollingIntervalMs ?? 3000 : 3000,
      displayId: typeof stored.displayId === 'string' ? stored.displayId : '',
      fillDisplay: stored.fillDisplay ?? true,
      displayPosition: stored.displayPosition === 'left' || stored.displayPosition === 'right' ? stored.displayPosition : 'center',
      widthPercent: Math.max(40, Math.min(100, stored.widthPercent ?? 75)),
      heightPercent: Math.max(40, Math.min(100, stored.heightPercent ?? 75)),
      autoScale: stored.autoScale ?? DEFAULT_DISPLAY_SETTINGS.autoScale,
      scalePercent: Math.max(70, Math.min(130, stored.scalePercent ?? 100)),
      oledShiftIntervalMs: [180000, 300000, 600000].includes(stored.oledShiftIntervalMs ?? 300000)
        ? stored.oledShiftIntervalMs ?? 300000 : DEFAULT_DISPLAY_SETTINGS.oledShiftIntervalMs,
    };
  } catch {
    return DEFAULT_DISPLAY_SETTINGS;
  }
}

export default function App() {
  const [settings, setSettings] = useState<DisplaySettings>(loadSettings);
  const [stats, setStats] = useState<HardwareStats | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [displays, setDisplays] = useState<MonitorInfo[]>([]);
  const [oledShiftIndex, setOledShiftIndex] = useState(0);
  const [appVersion, setAppVersion] = useState('');
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckInfo | null>(null);

  useEffect(() => {
    const shell = window.monitorStatsShell;
    if (!shell) return;
    let active = true;
    shell.getAppVersion().then((version) => { if (active) setAppVersion(version); }).catch(() => {});
    shell.checkForUpdates().then((info) => { if (active) setUpdateInfo(info); }).catch(() => {
      if (active) setUpdateInfo({ currentVersion: '', latestVersion: null, status: 'unavailable' });
    });
    const stopStats = shell.onHardwareStats(setStats);
    const stopError = shell.onHardwareError(() => {
      setStats((current) => current ? { ...current, status: 'unavailable' } : null);
    });
    const stopRefresh = shell.onRefreshState(setIsRefreshing);
    const stopDisplays = shell.onDisplays(setDisplays);
    shell.getDisplays().then(setDisplays).catch(() => setDisplays([]));
    return () => { active = false; stopStats(); stopError(); stopRefresh(); stopDisplays(); };
  }, []);

  useEffect(() => {
    window.monitorStatsShell?.setRunAtStartup(settings.runAtStartup);
  }, [settings.runAtStartup]);

  useEffect(() => {
    window.monitorStatsShell?.setFpsMonitor(settings.fpsMonitor);
  }, [settings.fpsMonitor]);

  useEffect(() => {
    window.monitorStatsShell?.setPollingInterval(settings.pollingIntervalMs);
  }, [settings.pollingIntervalMs]);

  useEffect(() => {
    window.monitorStatsShell?.setWidgetLayout({
      displayId: settings.displayId, fillDisplay: settings.fillDisplay, displayPosition: settings.displayPosition,
      widthPercent: settings.widthPercent, heightPercent: settings.heightPercent,
      autoScale: settings.autoScale, scalePercent: settings.scalePercent,
    });
  }, [settings.displayId, settings.fillDisplay, settings.displayPosition, settings.widthPercent, settings.heightPercent, settings.autoScale, settings.scalePercent]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setOledShiftIndex((index) => (index + 1) % OLED_PROTECTION_OFFSETS.length);
    }, settings.oledShiftIntervalMs);
    return () => window.clearInterval(timer);
  }, [settings.oledShiftIntervalMs]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setStats((current) => {
        if (!current || current.status !== 'live') return current;
        const staleAfterMs = Math.max(15000, settings.pollingIntervalMs * 3);
        return Date.now() - current.clock.timestamp > staleAfterMs
          ? { ...current, status: 'unavailable' }
          : current;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [settings.pollingIntervalMs]);

  useEffect(() => {
    if (!displays.length) return;
    if (!displays.some((display) => display.id === settings.displayId)) {
      updateSettings({ displayId: (displays.find((display) => !display.primary) || displays[0]).id });
    }
  }, [displays, settings.displayId]);

  useEffect(() => {
    if (displays.length && !displays.some((display) => String(display.fpsIndex) === settings.fpsMonitor)) {
      updateSettings({ fpsMonitor: '1' });
    }
  }, [displays, settings.fpsMonitor]);

  const saveSettings = useCallback((next: DisplaySettings) => {
    setSettings(next);
    try { localStorage.setItem('monitorstats_settings', JSON.stringify(next)); } catch { /* Storage is optional. */ }
  }, []);

  const updateSettings = useCallback((partial: Partial<DisplaySettings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...partial };
      try { localStorage.setItem('monitorstats_settings', JSON.stringify(next)); } catch { /* Storage is optional. */ }
      return next;
    });
  }, []);

  const oledOffset = OLED_PROTECTION_OFFSETS[oledShiftIndex];
  const openLatestRelease = useCallback(() => {
    window.monitorStatsShell?.openLatestRelease().catch(() => {});
  }, []);

  return (
    <div className="theme-shell relative h-screen overflow-hidden text-white font-sans" data-theme={settings.theme}>
      <div className="relative h-full w-full" style={{ left: oledOffset.x, top: oledOffset.y }}>
        <ControlToolbar
          onOpenSettings={() => setIsSettingsOpen(true)}
          onRefresh={() => window.monitorStatsShell?.refreshHardware()}
          isRefreshing={isRefreshing}
          updateAvailable={updateInfo?.status === 'available'}
          latestVersion={updateInfo?.latestVersion || null}
          onOpenLatestRelease={openLatestRelease}
        />
        <main className="h-full w-full overflow-hidden p-3">
          <StatsView
            stats={stats}
            settings={settings}
          />
        </main>
      </div>
      <SidebarSettingsWindow
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        stats={stats}
        displays={displays}
        onSaveSettings={saveSettings}
        shell={window.monitorStatsShell}
        appVersion={appVersion}
        updateInfo={updateInfo}
        onOpenLatestRelease={openLatestRelease}
      />
    </div>
  );
}
