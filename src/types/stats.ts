export interface ClockData {
  timestamp: number;
}

export interface CpuData {
  model: string;
  clockMHz: number | null;
  tempC: number | null;
  loadPercent: number | null;
  powerW: number | null;
  cores: number[];
  coreTempsC: number[];
}

export interface RamData {
  spec: string;
  generation: string;
  stickCount: number;
  stickCapacitiesGB: number[];
  speedMTs: number | null;
  channelMode: string;
  processCount: number | null;
  topProcesses: { name: string; workingSetMB: number }[];
  totalGB: number | null;
  usedGB: number | null;
  freeGB: number | null;
  loadPercent: number | null;
}

export interface GpuData {
  model: string;
  coreMHz: number | null;
  vramMHz: number | null;
  coreLoadPercent: number | null;
  vramLoadPercent: number | null;
  tempC: number | null;
  fanPercent: number | null;
  fanRPM: number | null;
  watt: number | null;
  vramUsedGB: number | null;
  vramTotalGB: number | null;
}

export interface DriveData {
  id: string;
  deviceId: string;
  name: string;
  type: string;
  letter: string;
  totalGB: number | null;
  usedGB: number | null;
  freeGB: number | null;
  loadPercent: number | null;
  readKBps: number | null;
  writeKBps: number | null;
  health: string | null;
  tempC: number | null;
  wearPercent: number | null;
  powerOnHours: number | null;
  hostWritesTB: number | null;
}

export interface NetworkData {
  name: string;
  adapter: string | null;
  localIP: string | null;
  publicIP: string | null;
  publicIPv4: string | null;
  publicIPv6: string | null;
  provider: string | null;
  routerManufacturer: string | null;
  routerModel: string | null;
  routerWanIPv4: string | null;
  ipv4Type: 'shared' | 'real' | null;
  gateway: string | null;
  dns: string[];
  dnsResolver: {
    ip: string;
    name: string;
    hostname: string | null;
    country: string | null;
    location: string | null;
    pingMs: number | null;
  } | null;
  rxOpticalPowerDbm: number | null;
  opticalStatus: 'connecting' | 'live' | 'unavailable';
  opticalError: string | null;
  opticalUpdatedAt: number | null;
  linkSpeed: string | null;
  profile: string | null;
  inKBps: number | null;
  outKBps: number | null;
}

export interface FanData {
  name: string;
  value: number;
  units: string;
}

export interface MotherboardData {
  manufacturer: string | null;
  model: string | null;
  product: string | null;
}

export interface PeripheralData {
  id: string;
  name: string;
  manufacturer: string | null;
  category: string;
  quantity: number;
}

export interface MonitorInfo {
  id: string;
  fpsIndex: number;
  label: string;
  model: string | null;
  primary: boolean;
  width: number;
  height: number;
  refreshRate: number | null;
  orientation: 'Landscape' | 'Portrait' | 'Square';
}

export interface GameTelemetry {
  fps: number | null;
  appName: string | null;
  frameTimeMs: number | null;
  source?: string;
  status: 'starting' | 'tracking' | 'no-game' | 'unavailable';
  at?: number;
}

export interface UpdateCheckInfo {
  currentVersion: string;
  latestVersion: string | null;
  status: 'available' | 'current' | 'unavailable';
}

export interface WindowsBuildInfo {
  name: string;
  version: string | null;
  build: string;
}

export interface HardwareStats {
  clock: ClockData;
  cpu: CpuData;
  ram: RamData;
  gpu: GpuData;
  systemPowerW: number | null;
  systemPowerSource: string | null;
  systemPowerKind: 'pc-output' | 'pc-input' | 'whole-system' | null;
  motherboard: MotherboardData;
  peripherals: PeripheralData[];
  peripheralCount: number;
  drives: DriveData[];
  fans: FanData[];
  network: NetworkData;
  status: 'starting' | 'live' | 'unavailable';
  source: string;
}

export type ThemeId = 'classic' | 'valorant' | 'cyberpunk2077' | 'minecraft' | 'fortnite' | 'gtav' | 'apex' | 'league' | 'counterstrike' | 'overwatch' | 'callofduty' | 'oledblack' | 'aurora' | 'sakura' | 'lavender' | 'forest' | 'amber' | 'ocean' | 'sepia' | 'monochrome';

export interface DisplaySettings {
  theme: ThemeId;
  runAtStartup: boolean;
  showFpsBox: boolean;
  fpsMonitor: string;
  showCoreDetails: boolean;
  customNames: Record<string, string>;
  networkSpeedUnit: 'Mbps' | 'MB/s';
  pollingIntervalMs: number;
  displayId: string;
  fillDisplay: boolean;
  displayPosition: 'left' | 'center' | 'right';
  widthPercent: number;
  heightPercent: number;
  autoScale: boolean;
  scalePercent: number;
  oledShiftIntervalMs: number;
}
