import React, { useEffect, useState } from 'react';
import { DisplaySettings, GameTelemetry, HardwareStats } from '../types/stats';

interface Props {
  stats: HardwareStats | null;
  settings: DisplaySettings;
}

const number = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: digits });

const present = (value: number | null | undefined): value is number => value !== null && value !== undefined && Number.isFinite(value);
const percent = (value: number | null) => present(value) ? `${number(value)}%` : '—';
const speed = (value: number | null) => !present(value) ? '—' : value >= 1024 ? `${number(value / 1024, 2)} MB/s` : `${number(value)} KB/s`;
const networkSpeed = (value: number | null, unit: DisplaySettings['networkSpeedUnit']) => {
  if (!present(value)) return '—';
  const valueInMBps = value * 0.001024;
  return unit === 'Mbps' ? `${number(valueInMBps * 8, 2)} Mbps` : `${number(valueInMBps, 2)} MB/s`;
};
const customName = (settings: DisplaySettings, key: string, detected: string) => settings.customNames[key]?.trim() || detected;

const Panel: React.FC<{ title: string; children: React.ReactNode; className?: string; headerAction?: React.ReactNode }> = ({ title, children, className = '', headerAction }) => (
  <section className={`theme-panel min-w-0 rounded-md border border-slate-800 bg-slate-950/85 p-3 ${className}`}>
    <div className="mb-2 flex items-center justify-between gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-cyan-300">{title}</h2>
      {headerAction}
    </div>
    {children}
  </section>
);

const Bar: React.FC<{ value: number | null }> = ({ value }) => (
  <div className="h-1.5 w-full overflow-hidden rounded bg-slate-800" aria-label={percent(value)}>
    {value !== null && <div className="h-full rounded bg-cyan-400" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />}
  </div>
);

const Reading: React.FC<{ label: React.ReactNode; value: string; detail?: string; className?: string; valueClassName?: string; truncateValue?: boolean }> = ({ label, value, detail, className = '', valueClassName = 'text-sm', truncateValue = true }) => {
  if (!value || value === '—') return null;
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className={`${truncateValue ? 'truncate' : 'whitespace-normal break-all'} ${valueClassName} font-semibold tabular-nums text-slate-100`}>{value}</div>
      {detail && <div className="truncate text-[10px] text-slate-500">{detail}</div>}
    </div>
  );
};

const SystemPanel = React.memo(({ stats }: { stats: HardwareStats | null }) => {
  const [clockNow, setClockNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: number | undefined;
    const updateClock = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      setClockNow(now);
      timer = window.setTimeout(updateClock, Math.max(4, 1000 - (now % 1000)));
    };
    const onVisibilityChange = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      if (document.visibilityState === 'visible') updateClock();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    updateClock();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
  const date = new Date(clockNow);
  const timeText = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const sampleAgeSeconds = stats ? Math.max(0, Math.floor((clockNow - stats.clock.timestamp) / 1000)) : null;
  const sampleAgeText = sampleAgeSeconds === null
    ? 'Waiting for first sensor sample'
    : sampleAgeSeconds === 0
      ? 'Sensors updated just now'
      : `Sensors updated ${sampleAgeSeconds}s ago`;
  return (
    <Panel title="System">
      <div className="flex items-end justify-between gap-3">
        <div className="text-2xl font-bold tabular-nums text-white">{timeText}</div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-400">
        <span>{date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</span>
        <span className={`shrink-0 tabular-nums ${stats?.status === 'live' ? 'text-emerald-400' : 'text-amber-300'}`} aria-live="off">{sampleAgeText}</span>
      </div>
    </Panel>
  );
});

const GameFrameRatePanel = React.memo(({ monitor }: { monitor: string }) => {
  const [gameTelemetry, setGameTelemetry] = useState<GameTelemetry>({
    fps: null, appName: null, frameTimeMs: null, status: 'starting',
  });
  const [frameHistory, setFrameHistory] = useState<number[]>([]);
  useEffect(() => window.monitorStatsShell?.onGameFps(setGameTelemetry), []);
  useEffect(() => {
    if (gameTelemetry.status !== 'tracking' || gameTelemetry.frameTimeMs === null) {
      setFrameHistory((history) => history.length ? [] : history);
      return;
    }
    setFrameHistory((history) => [...history, gameTelemetry.frameTimeMs as number].slice(-60));
  }, [gameTelemetry.at, gameTelemetry.status, gameTelemetry.frameTimeMs]);

  const graphMax = Math.max(33.3, ...frameHistory);
  const graphPoints = frameHistory.map((value, index) => {
    const x = frameHistory.length < 2 ? 0 : (index / (frameHistory.length - 1)) * 200;
    const y = 38 - Math.min(1, value / graphMax) * 34;
    return `${x},${y}`;
  }).join(' ');
  return (
    <Panel title="Game frame rate">
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-400">
        <span>Game monitor</span><span>Monitor {monitor}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        {present(gameTelemetry.fps) && <div className="text-4xl font-bold tabular-nums text-white">{number(gameTelemetry.fps, 0)} <span className="text-sm font-medium text-cyan-300">FPS</span></div>}
      </div>
      <svg className="mt-2 h-12 w-full rounded border border-slate-800 bg-slate-900/60" viewBox="0 0 200 42" preserveAspectRatio="none" role="img" aria-label="Recent frame-time graph; taller peaks indicate longer frames">
        <line x1="0" y1="38" x2="200" y2="38" stroke="#334155" strokeWidth="1" />
        <line x1="0" y1={38 - (16.7 / graphMax) * 34} x2="200" y2={38 - (16.7 / graphMax) * 34} stroke="#475569" strokeWidth="0.5" strokeDasharray="2 3" />
        {frameHistory.length > 1 && <polyline points={graphPoints} fill="none" stroke="#22d3ee" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />}
      </svg>
      <p className="mt-1 truncate text-[10px] text-slate-500" title={gameTelemetry.appName || undefined}>
        {gameTelemetry.status === 'tracking'
          ? `${gameTelemetry.appName?.replace(/\.exe$/i, '') || 'Game'} · ${gameTelemetry.source || 'RTSS'}`
          : gameTelemetry.status === 'unavailable'
            ? 'Start RTSS to read game FPS.'
            : 'Waiting for game frames from RTSS.'}
      </p>
    </Panel>
  );
});

const ProcessPanel = React.memo(({ ram }: { ram: HardwareStats['ram'] | undefined }) => {
  if (!ram || (!present(ram.processCount) && !ram.topProcesses.length)) return null;
  return <Panel title="Processes">
    {present(ram.processCount) && <div className="mb-2 flex items-center justify-between gap-2 text-xs">
      <span className="text-slate-400">Running processes</span>
      <span className="tabular-nums text-white">{ram.processCount}</span>
    </div>}
    {ram.topProcesses.length > 0 && <div className="space-y-1">
      {ram.topProcesses.map((process, index) => (
        <div key={`${process.name}-${index}`} className="flex min-w-0 items-center justify-between gap-2 text-xs">
          <span className="truncate text-slate-300" title={process.name}>{index + 1}. {process.name}</span>
          <span className="shrink-0 tabular-nums text-slate-400">{process.workingSetMB >= 1024 ? `${number(process.workingSetMB / 1024, 2)} GB` : `${number(process.workingSetMB, 0)} MB`}</span>
        </div>
      ))}
    </div>}
  </Panel>;
}, (previous, next) => {
  const previousTop = previous.ram?.topProcesses ?? [];
  const nextTop = next.ram?.topProcesses ?? [];
  return previous.ram?.processCount === next.ram?.processCount
    && previousTop.length === nextTop.length
    && previousTop.every((process, index) => process.name === nextTop[index]?.name
      && process.workingSetMB === nextTop[index]?.workingSetMB);
});

const StatsViewComponent: React.FC<Props> = ({ stats, settings }) => {
  const [showNetworkIPs, setShowNetworkIPs] = useState(true);
  const cpuFans = stats?.fans.filter((fan) => /CPU.*fan|fan.*CPU/i.test(fan.name)) ?? [];
  const ram = stats?.ram;
  const ramStickCapacities = ram?.stickCapacitiesGB ?? [];
  const sameStickSize = ramStickCapacities.length > 0 && ramStickCapacities.every((size) => size === ramStickCapacities[0]);
  const ramStickSummary = ram?.stickCount
    ? `${ram.stickCount} stick${ram.stickCount === 1 ? '' : 's'}${sameStickSize
      ? ` · ${number(ramStickCapacities[0], 2)} GB each`
      : ramStickCapacities.length
        ? ` · ${ramStickCapacities.map((size) => `${number(size, 2)} GB`).join(' + ')}`
        : ''}`
    : null;
  const ramDetails = [
    ramStickSummary,
    ram?.generation && !/unavailable|not reported/i.test(ram.generation) ? ram.generation : null,
    present(ram?.speedMTs) ? `${number(ram.speedMTs, 0)} MT/s` : null,
    ram?.channelMode && !/unavailable|not reported/i.test(ram.channelMode) ? ram.channelMode : null,
  ]
    .filter(Boolean).join(' · ');
  return (
    <div className="grid h-full min-h-0 grid-cols-2 gap-2 overflow-hidden text-sm">
      <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
        <SystemPanel stats={stats} />

        {settings.showFpsBox && <GameFrameRatePanel monitor={settings.fpsMonitor} />}

        <Panel title="Processor">
          <div className="mb-2 truncate text-sm font-semibold text-white" title={stats?.cpu.model}>{customName(settings, 'cpu', stats?.cpu.model || 'Detecting processor…')}</div>
          <div className="grid grid-cols-3 gap-2">
            <Reading label="Usage" value={percent(stats?.cpu.loadPercent ?? null)} />
            <Reading label="Clock" value={stats?.cpu.clockMHz === null || !stats ? '—' : `${number(stats.cpu.clockMHz, 0)} MHz`} />
            <Reading label="Temp" value={stats?.cpu.tempC === null || !stats ? '—' : `${number(stats.cpu.tempC)}°C`} />
            <Reading label="Power" value={stats?.cpu.powerW === null || !stats ? '—' : `${number(stats.cpu.powerW)} W`} />
            <Reading label="Max core" value={stats?.cpu.coreTempsC.length ? `${number(Math.max(...stats.cpu.coreTempsC))}°C` : '—'} />
            {cpuFans.map((fan) => <Reading key={fan.name} label={fan.name} value={`${number(fan.value)}${fan.units ? ` ${fan.units}` : ''}`} />)}
          </div>
          {present(stats?.cpu.loadPercent) && <div className="mt-2"><Bar value={stats.cpu.loadPercent} /></div>}
          {settings.showCoreDetails && Boolean(stats?.cpu.cores.length) && (
            <div className="mt-3 grid grid-cols-6 gap-x-2 gap-y-1">
              {stats?.cpu.cores.map((load, index) => (
                <div key={index} title={`Thread ${index + 1}: ${number(load)}%`}>
                  <div className="mb-0.5 text-[9px] text-slate-500">{index + 1}</div>
                  <Bar value={load} />
                  {stats?.cpu.coreTempsC[index] !== undefined && <div className="mt-0.5 text-[8px] tabular-nums text-slate-400">{number(stats.cpu.coreTempsC[index], 0)}°</div>}
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Graphics">
          <div className="mb-2 truncate text-sm font-semibold text-white" title={stats?.gpu.model}>{customName(settings, 'gpu', stats?.gpu.model || 'Detecting graphics device…')}</div>
          {present(stats?.gpu.coreLoadPercent) && <div className="mb-2"><Bar value={stats.gpu.coreLoadPercent} /></div>}
          <div className="grid grid-cols-3 gap-2">
            <Reading label="GPU load" value={percent(stats?.gpu.coreLoadPercent ?? null)} />
            <Reading label="Temperature" value={stats?.gpu.tempC === null || !stats ? '—' : `${number(stats.gpu.tempC)}°C`} />
            <Reading label="Power" value={stats?.gpu.watt === null || !stats ? '—' : `${number(stats.gpu.watt)} W`} />
            <Reading label="Core clock" value={stats?.gpu.coreMHz === null || !stats ? '—' : `${number(stats.gpu.coreMHz, 0)} MHz`} />
            <Reading label="Memory clock" value={stats?.gpu.vramMHz === null || !stats ? '—' : `${number(stats.gpu.vramMHz, 0)} MHz`} />
            <Reading label="Fan" value={stats?.gpu.fanPercent === null || !stats ? '—' : `${number(stats.gpu.fanPercent)}%`} />
            <Reading label="Fan RPM" value={stats?.gpu.fanRPM === null || !stats ? '—' : `${number(stats.gpu.fanRPM, 0)} RPM`} />
          </div>
          {(present(stats?.gpu.vramUsedGB) || present(stats?.gpu.vramTotalGB)) && <div className="mt-2 border-t border-slate-800 pt-2 text-xs text-slate-400">
            VRAM: {present(stats?.gpu.vramUsedGB) ? `${number(stats.gpu.vramUsedGB, 2)} GB` : ''}{present(stats?.gpu.vramUsedGB) && present(stats?.gpu.vramTotalGB) ? ' / ' : ''}{present(stats?.gpu.vramTotalGB) ? `${number(stats.gpu.vramTotalGB, 2)} GB` : ''}
          </div>}
        </Panel>

        <ProcessPanel ram={stats?.ram} />

      </div>

      <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
        <Panel title="Memory">
          <div className="mb-2">
            {stats?.ram.spec && <div className="text-sm font-semibold text-white">{customName(settings, 'ram', stats.ram.spec)}</div>}
            {ramDetails && <div className="mt-0.5 text-[10px] text-slate-400" title={ramDetails}>{ramDetails}</div>}
          </div>
          {present(stats?.ram.loadPercent) && <div className="mb-2"><Bar value={stats.ram.loadPercent} /></div>}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Reading label="Used" value={stats?.ram.usedGB === null || !stats ? '—' : `${number(stats.ram.usedGB, 2)} GB`} />
            <Reading label="Free" value={stats?.ram.freeGB === null || !stats ? '—' : `${number(stats.ram.freeGB, 2)} GB`} />
            <Reading label="Total" value={stats?.ram.totalGB === null || !stats ? '—' : `${number(stats.ram.totalGB, 2)} GB`} />
          </div>
        </Panel>

        {Boolean(stats?.drives.length) && <Panel title={`Storage volumes · ${stats?.drives.length ?? 0}`} className="min-h-0 flex-1 overflow-hidden">
          <div className="space-y-2">
            {stats?.drives.map((drive) => (
              <div key={drive.id} className="rounded border border-slate-800 bg-slate-900/70 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-xs font-medium text-white" title={drive.name}>{customName(settings, `drive:${drive.id}`, drive.name)}</div>
                  <span className="shrink-0 text-[10px] text-cyan-300">{drive.type}</span>
                </div>
                {present(drive.loadPercent) && <div className="my-1.5"><Bar value={drive.loadPercent} /></div>}
                {(present(drive.usedGB) || present(drive.freeGB) || present(drive.totalGB)) && <div className="grid grid-cols-3 gap-1 text-[10px] text-slate-400">
                  {present(drive.usedGB) && <span>Used {number(drive.usedGB)} GB</span>}
                  {present(drive.freeGB) && <span>Free {number(drive.freeGB)} GB</span>}
                  {present(drive.totalGB) && <span>Total {number(drive.totalGB)} GB</span>}
                </div>}
                {(present(drive.readKBps) || present(drive.writeKBps)) && <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                  {present(drive.readKBps) && <span>Read {speed(drive.readKBps)}</span>}
                  {present(drive.writeKBps) && <span>Write {speed(drive.writeKBps)}</span>}
                </div>}
                {(drive.health || present(drive.tempC) || present(drive.wearPercent) || present(drive.powerOnHours) || present(drive.hostWritesTB)) && <div className="mt-1 flex flex-wrap gap-x-3 text-[10px] text-slate-400">
                  {drive.health && <span className={drive.health.startsWith('Healthy') ? 'text-emerald-400' : 'text-amber-300'}>Drive health {drive.health}</span>}
                  {present(drive.tempC) && <span>Temp {number(drive.tempC)}°C</span>}
                  {present(drive.wearPercent) && <span>Wear used {number(drive.wearPercent)}%</span>}
                  {present(drive.powerOnHours) && <span>Power-on {number(drive.powerOnHours, 0)} h</span>}
                  {present(drive.hostWritesTB) && <span>Host writes {number(drive.hostWritesTB, 2)} TB</span>}
                </div>}
              </div>
            ))}
          </div>
        </Panel>}

        <Panel title="Network" headerAction={<button type="button" onClick={() => setShowNetworkIPs((visible) => !visible)} aria-label={showNetworkIPs ? 'Hide IP addresses' : 'Show IP addresses'} className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300 hover:border-cyan-500 hover:text-cyan-200">{showNetworkIPs ? 'Hide IPs' : 'Show IPs'}</button>}>
          {stats?.network.name && <div className="truncate text-xs font-semibold text-white" title={stats.network.adapter || undefined}>{stats.network.name}</div>}
          {[stats?.network.adapter, stats?.network.profile, stats?.network.linkSpeed].filter(Boolean).length > 0 && <div className="mb-2 truncate text-[10px] text-slate-500">{[stats?.network.adapter, stats?.network.profile, stats?.network.linkSpeed].filter(Boolean).join(' · ')}</div>}
          {(stats?.network.routerManufacturer || stats?.network.routerModel) && <div className="mb-2 truncate text-[10px] text-slate-400" title={[stats.network.routerManufacturer, stats.network.routerModel].filter(Boolean).join(' ')}>Router · {[stats.network.routerManufacturer, stats.network.routerModel].filter(Boolean).join(' ')}</div>}
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {present(stats?.network.inKBps) && <Reading label="Received" value={networkSpeed(stats.network.inKBps, settings.networkSpeedUnit)} />}
            {present(stats?.network.outKBps) && <Reading label="Sent" value={networkSpeed(stats.network.outKBps, settings.networkSpeedUnit)} />}
            {stats?.network.localIP && <Reading label="Local IP" value={showNetworkIPs ? stats.network.localIP : 'Hidden'} />}
            {stats?.network.publicIPv4 && <Reading label={<span className="inline-flex items-center gap-1">Public IPv4{stats.network.ipv4Type && <span className={`rounded px-1 py-px text-[9px] font-semibold normal-case tracking-normal ${stats.network.ipv4Type === 'shared' ? 'bg-red-950 text-red-300' : 'bg-emerald-950 text-emerald-300'}`}>{stats.network.ipv4Type === 'shared' ? 'Shared IP' : 'Real IP'}</span>}</span>} value={showNetworkIPs ? stats.network.publicIPv4 : 'Hidden'} />}
            {stats?.network.publicIPv6 && <Reading label="Public IPv6" value={showNetworkIPs ? stats.network.publicIPv6 : 'Hidden'} className="col-span-2" valueClassName="text-[10px] leading-tight" truncateValue={false} />}
            {stats?.network.provider && !/detecting/i.test(stats.network.provider) && <Reading label="ISP" value={stats.network.provider} />}
            {present(stats?.network.rxOpticalPowerDbm) && <Reading
              label="RX Optical Power"
              value={`${number(stats.network.rxOpticalPowerDbm, 2)} dBm`}
              detail={stats.network.opticalUpdatedAt ? `${stats.network.opticalStatus === 'live' ? 'Updated' : `Last value · ${stats.network.opticalError || 'ONT unavailable'}`} ${new Date(stats.network.opticalUpdatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : undefined}
            />}
          </div>
          {stats?.network.dnsResolver && <>
            {(stats.network.dnsResolver.name || present(stats.network.dnsResolver.pingMs)) && <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
              {stats.network.dnsResolver.name && <span className="truncate text-cyan-300" title={showNetworkIPs ? `${stats.network.dnsResolver.ip}${stats.network.dnsResolver.hostname ? ` · ${stats.network.dnsResolver.hostname}` : ''}` : undefined}>Active DNS {stats.network.dnsResolver.name}{stats.network.dnsResolver.country ? ` · ${stats.network.dnsResolver.country}` : ''}</span>}
              {present(stats.network.dnsResolver.pingMs) && <span className="shrink-0 text-slate-400">Ping {stats.network.dnsResolver.pingMs} ms</span>}
            </div>}
            {stats.network.dnsResolver.location && <div className="truncate text-[10px] text-slate-500">Server {stats.network.dnsResolver.location}</div>}
          </>}
        </Panel>
      </div>
    </div>
  );
};

export const StatsView = React.memo(StatsViewComponent);
