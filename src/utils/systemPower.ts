import { DriveData, HardwareStats, MonitorInfo, PeripheralData } from '../types/stats';

type PowerSource = 'Live sensor' | 'Estimate';

interface PowerPart {
  watts: number;
  low: number;
  high: number;
  source: PowerSource;
}

export interface SystemPowerComponent {
  name: string;
  watts: number;
  low: number;
  high: number;
  source: PowerSource;
  detail: string;
}

export interface SystemPowerEstimate {
  watts: number;
  low: number;
  high: number;
  mode: 'estimated' | 'mixed' | 'measured';
  components: SystemPowerComponent[];
  explanation: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const validWatts = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 2000;

function loadValue(value: number | null | undefined, fallback = 18) {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0, 100) : fallback;
}

function cpuTdp(model: string) {
  const name = model.toLowerCase();
  const series = name.match(/i([3579])[- ](\d{4,5})/);
  if (series) {
    const tier = Number(series[1]);
    const generation = Number(series[2].slice(0, -3));
    return tier === 3 ? 55 : tier === 5 ? 65 : tier === 7 ? (generation >= 12 ? 125 : 95) : 125;
  }
  if (/ryzen\s*3/.test(name)) return 65;
  if (/ryzen\s*5/.test(name)) return /x\b/.test(name) ? 95 : 65;
  if (/ryzen\s*7/.test(name)) return 105;
  if (/ryzen\s*9/.test(name)) return 170;
  return 65;
}

function gpuTgp(model: string) {
  const name = model.toLowerCase();
  if (/uhd|iris|integrated|apu|radeon graphics|radeon [567]\d{2}m/.test(name)) return 12;
  if (/not detected|unavailable|unknown/.test(name)) return 15;
  const nvidia = name.match(/rtx\s*(\d{4})\s*(ti)?/);
  if (nvidia) {
    const tier = Number(nvidia[1]);
    const ti = Boolean(nvidia[2]);
    const known: Record<number, number> = { 3050: 130, 3060: ti ? 200 : 170, 3070: ti ? 290 : 220, 3080: ti ? 350 : 320, 3090: ti ? 450 : 350, 4060: ti ? 160 : 115, 4070: ti ? 285 : 200, 4080: 320, 4090: 450, 5060: ti ? 180 : 145, 5070: ti ? 300 : 250, 5080: 360, 5090: 575 };
    if (known[tier]) return known[tier];
  }
  const rx = name.match(/rx\s*(\d{4})/);
  if (rx) {
    const tier = Number(rx[1]);
    if (tier >= 7900) return tier === 7900 ? 300 : 350;
    if (tier >= 7800) return 260;
    if (tier >= 7700) return 245;
    if (tier >= 7600) return 165;
    if (tier >= 6800) return 250;
    if (tier >= 6700) return 220;
  }
  if (/gtx\s*16/.test(name)) return 125;
  if (/gtx\s*10/.test(name)) return 150;
  return 85;
}

function estimated(watts: number, lowFactor = 0.7, highFactor = 1.35): PowerPart {
  const safeWatts = Math.max(0, watts);
  return { watts: safeWatts, low: safeWatts * lowFactor, high: safeWatts * highFactor, source: 'Estimate' };
}

function estimatedRange(watts: number, low: number, high: number): PowerPart {
  return { watts: Math.max(0, watts), low: Math.max(0, low), high: Math.max(watts, high), source: 'Estimate' };
}

function live(value: number): PowerPart {
  return { watts: value, low: Math.max(0, value * 0.96), high: value * 1.04, source: 'Live sensor' };
}

function utilizationPower(rated: number, load: number, idleRatio: number, uncertainty = 0.3): PowerPart {
  const watts = Math.max(4, rated * (idleRatio + (1 - idleRatio) * load / 100));
  return estimated(watts, 1 - uncertainty, 1 + uncertainty);
}

function component(name: string, part: PowerPart, detail: string): SystemPowerComponent {
  return { name, watts: part.watts, low: part.low, high: part.high, source: part.source, detail };
}

function uniqueDrives(drives: DriveData[]) {
  const seen = new Set<string>();
  return drives.filter((drive) => {
    const key = drive.deviceId || drive.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function drivePart(drive: DriveData): PowerPart {
  const activityKBps = (drive.readKBps || 0) + (drive.writeKBps || 0);
  const active = activityKBps > 128;

  const type = drive.type.toLowerCase();
  if (type === 'hdd') return estimated(active ? 6 : 4.5, 0.75, 1.45);
  if (type === 'nvme') return estimated(active ? 3.5 : 0.65, 0.5, active ? 1.7 : 2.8);
  if (type === 'ssd') return estimated(active ? 1.5 : 0.25, 0.5, active ? 1.8 : 2.8);
  return estimated(active ? 3 : 1.2, 0.5, 1.8);
}

function driveDetail(drive: DriveData, part: PowerPart) {
  const activity = (drive.readKBps || 0) + (drive.writeKBps || 0);
  const state = activity > 128 ? 'active sample' : 'idle sample';
  return `${drive.type}${drive.letter ? ` · ${drive.letter}` : ''} · ${state} · ${part.source.toLowerCase()}`;
}

function motherboardPower(stats: HardwareStats) {
  const board = stats.motherboard;
  const identity = [board.manufacturer, board.product || board.model].filter(Boolean).join(' ');
  const model = identity.toLowerCase();
  let typical = 27;
  if (/\b(z\d{3}|x\d{3}|trx\d+|wrx\d+)\b/.test(model)) typical = 34;
  else if (/\b(b\d{3}|h\d{3}|a\d{3})\b/.test(model)) typical = 25;
  const part = estimated(typical, 0.7, 1.4);
  const detail = identity ? `${identity} · estimated board, chipset and VRM draw` : 'Board model not exposed by firmware; generic desktop estimate';
  return component('Motherboard', part, detail);
}

function memoryPower(stats: HardwareStats) {
  const ram = stats.ram;
  const count = Math.max(0, ram.stickCount);
  const capacity = ram.stickCapacitiesGB.reduce((sum, size) => sum + size, 0) || ram.totalGB || 0;
  const sticks = count || (capacity ? Math.ceil(capacity / 16) : 2);
  const generation = ram.generation.toLowerCase();
  const ddr5 = generation.includes('ddr5');
  const perStick = ddr5 ? 1.9 : generation.includes('ddr4') ? 1.45 : 1.6;
  const perGB = ddr5 ? 0.065 : 0.05;
  const speedAdjustment = clamp(((ram.speedMTs || 2666) - 2666) / 1000, -0.25, 0.75) * 0.25 * sticks;
  const watts = Math.max(0.5, sticks * perStick + capacity * perGB + speedAdjustment);
  const part = estimated(watts, 0.65, 1.45);
  const sizeText = ram.stickCapacitiesGB.length
    ? ram.stickCapacitiesGB.map((size) => `${size} GB`).join(' + ')
    : `${capacity || sticks * 16} GB total`;
  const detail = `${sticks}× module${sticks === 1 ? '' : 's'} (${sizeText}) · ${ram.generation}${ram.speedMTs ? ` · ${ram.speedMTs} MT/s` : ''}`;
  return component('Memory modules', part, detail);
}

function fanPower(stats: HardwareStats) {
  const sensors = [...new Map(stats.fans
    .filter((fan) => !/gpu|graphics|video/i.test(fan.name))
    .map((fan) => [fan.name.toLowerCase(), fan])).values()];
  const fanCount = Math.max(3, sensors.length);
  const watts = fanCount * 1.25;
  const labels = sensors.map((fan) => fan.name);
  const detail = labels.length
    ? `${fanCount} cooling fans modeled · ${labels.slice(0, 3).join(', ')}${labels.length > 3 ? ', …' : ''} tachometer only; fan watts not exposed`
    : 'No fan watt sensors · assumed three ordinary case/cooler fans';
  return component('Cooling fans', estimated(watts, 0.45, 2), detail);
}

function peripheralPart(peripheral: PeripheralData): PowerPart {
  const count = Math.max(1, peripheral.quantity || 1);
  const name = peripheral.name.toLowerCase();
  let perDevice = 0.8;
  if (peripheral.category === 'Keyboard') perDevice = /gaming|mechanical|rgb|corsair|razer|steelseries/.test(name) ? 1.5 : 0.4;
  else if (peripheral.category === 'Mouse') perDevice = /gaming|rgb|corsair|razer|steelseries/.test(name) ? 0.8 : 0.25;
  else if (peripheral.category === 'Camera') perDevice = 2.2;
  else if (peripheral.category === 'USB audio') perDevice = 1.4;
  else if (peripheral.category === 'Controller') perDevice = 1.1;
  else if (peripheral.category === 'Phone / portable device') perDevice = 3;
  else if (peripheral.category === 'Wireless adapter') perDevice = 0.45;
  else if (peripheral.category === 'Printer / scanner') perDevice = 0.3;
  return estimated(perDevice * count, 0.4, 2.2);
}

function peripheralComponents(stats: HardwareStats): SystemPowerComponent[] {
  const peripherals = stats.peripherals || [];
  const visible = peripherals.map((peripheral) => {
    const part = peripheralPart(peripheral);
    const quantity = Math.max(1, peripheral.quantity || 1);
    const name = quantity > 1 ? `${quantity}× ${peripheral.name}` : peripheral.name;
    return component(`USB · ${name}`, part, `${peripheral.manufacturer ? `${peripheral.manufacturer} · ` : ''}${peripheral.category} · modeled USB bus draw`);
  });
  const remainder = Math.max(0, (stats.peripheralCount || 0) - peripherals.reduce((sum, item) => sum + (item.quantity || 1), 0));
  if (remainder) visible.push(component(`${remainder} additional USB devices`, estimated(remainder * 0.8, 0.3, 2.5), 'Model list capped to keep telemetry compact'));
  return visible;
}

function displayPower(display: MonitorInfo): PowerPart {
  const pixels = Math.max(480 * 800, display.width * display.height);
  const refresh = clamp(display.refreshRate ?? 60, 60, 240);
  const watts = clamp(18 * Math.sqrt(pixels / (1920 * 1080)) * (1 + (refresh - 60) / 1200), 10, 65);
  return estimated(watts, 0.55, 1.65);
}

function sumParts(parts: PowerPart[]) {
  return parts.reduce((sum, part) => ({
    watts: sum.watts + part.watts,
    low: sum.low + part.low,
    high: sum.high + part.high,
    source: parts.every((item) => item.source === 'Live sensor') ? 'Live sensor' as const : 'Estimate' as const,
  }), { watts: 0, low: 0, high: 0, source: 'Estimate' as PowerSource });
}

export function estimateSystemPower(stats: HardwareStats | null, displays: MonitorInfo[]): SystemPowerEstimate | null {
  if (!stats || stats.status !== 'live') return null;

  const cpu = validWatts(stats.cpu.powerW)
    ? live(stats.cpu.powerW)
    : utilizationPower(cpuTdp(stats.cpu.model), loadValue(stats.cpu.loadPercent), 0.12, 0.38);
  const gpu = validWatts(stats.gpu.watt)
    ? live(stats.gpu.watt)
    : utilizationPower(gpuTgp(stats.gpu.model), loadValue(stats.gpu.coreLoadPercent, 12), 0.06, 0.35);
  const cpuPart = component('CPU package', cpu, `${stats.cpu.model}${cpu.source === 'Live sensor' ? ' · current sensor reading' : ` · load ${loadValue(stats.cpu.loadPercent)}% and model rating`}`);
  const gpuPart = component('Graphics card', gpu, `${stats.gpu.model}${gpu.source === 'Live sensor' ? ' · board-power sensor (includes GPU cooling)' : ` · load ${loadValue(stats.gpu.coreLoadPercent, 12)}% and model power rating`}`);
  const memory = memoryPower(stats);
  const driveParts = uniqueDrives(stats.drives).map((drive) => {
    const part = drivePart(drive);
    return component(`Storage · ${drive.name}`, part, driveDetail(drive, part));
  });
  const motherboard = motherboardPower(stats);
  const cooling = fanPower(stats);
  const networkTrafficKBps = (stats.network.inKBps || 0) + (stats.network.outKBps || 0);
  const networkWatts = 1.1 + clamp(networkTrafficKBps / 1024 * 0.25, 0, 1.8);
  const network = component('Network adapter', estimated(networkWatts, 0.5, 2), `${stats.network.adapter || stats.network.name || 'Active adapter'} · traffic-based low-power estimate`);
  const usbParts = peripheralComponents(stats);
  const screenParts = displays.map((display) => {
    const part = displayPower(display);
    const model = display.model || display.label;
    return component(`Display · ${model}`, part, `${display.width}×${display.height}${display.refreshRate ? ` · ${display.refreshRate} Hz` : ''} · brightness and backlight draw are not exposed`);
  });

  const pcComponents = [cpuPart, gpuPart, memory, ...driveParts, motherboard, cooling, network, ...usbParts];
  const pcDc = sumParts(pcComponents);
  const displaysPower = sumParts(screenParts.map((item) => ({ watts: item.watts, low: item.low, high: item.high, source: item.source })));
  const loss = estimatedRange(
    pcDc.watts * (1 / 0.88 - 1),
    pcDc.low * (1 / 0.93 - 1),
    pcDc.high * (1 / 0.78 - 1),
  );
  const lossComponent = component('PSU conversion loss', loss, 'Estimated from 88% efficiency (80–93% range); PSU efficiency is not exposed by Windows');
  let components = [...pcComponents, lossComponent, ...screenParts];
  let watts = pcDc.watts / 0.88 + displaysPower.watts;
  let low = pcDc.low / 0.93 + displaysPower.low;
  let high = pcDc.high / 0.78 + displaysPower.high;
  let mode: SystemPowerEstimate['mode'] = cpu.source === 'Live sensor' || gpu.source === 'Live sensor' ? 'mixed' : 'estimated';
  let explanation = 'CPU/GPU readings are live when available. Uninstrumented parts use model-based estimates.';

  if (validWatts(stats.systemPowerW)) {
    if (stats.systemPowerKind === 'whole-system') {
      watts = stats.systemPowerW;
      low = stats.systemPowerW * 0.98;
      high = stats.systemPowerW * 1.02;
      mode = 'measured';
      explanation = `Whole-system watt sensor: ${stats.systemPowerSource || 'hardware sensor'}.`;
      components = [component('Whole-system sensor', live(stats.systemPowerW), stats.systemPowerSource || 'Live total-power sensor')];
    } else if (stats.systemPowerKind === 'pc-input') {
      watts = stats.systemPowerW + displaysPower.watts;
      low = stats.systemPowerW * 0.97 + displaysPower.low;
      high = stats.systemPowerW * 1.03 + displaysPower.high;
      mode = 'mixed';
      explanation = 'Live PC AC-input sensor plus estimated external displays.';
      components = [component('PC AC input', live(stats.systemPowerW), stats.systemPowerSource || 'Live sensor; includes PSU loss'), ...screenParts];
    } else if (stats.systemPowerKind === 'pc-output') {
      const directOutput = live(stats.systemPowerW);
      watts = stats.systemPowerW / 0.88 + displaysPower.watts;
      low = directOutput.low / 0.93 + displaysPower.low;
      high = directOutput.high / 0.78 + displaysPower.high;
      mode = 'mixed';
      explanation = 'Live PC DC-output sensor plus estimated PSU loss and displays.';
      const outputLoss = estimatedRange(
        stats.systemPowerW * (1 / 0.88 - 1),
        stats.systemPowerW * (1 / 0.93 - 1),
        stats.systemPowerW * (1 / 0.78 - 1),
      );
      components = [component('PC DC output', directOutput, stats.systemPowerSource || 'Live sensor'), component('PSU conversion loss', outputLoss, 'Estimated from 88% efficiency'), ...screenParts];
    }
  }

  return {
    watts: Math.max(0, watts),
    low: Math.max(0, Math.min(low, watts)),
    high: Math.max(watts, high),
    mode,
    components,
    explanation,
  };
}
