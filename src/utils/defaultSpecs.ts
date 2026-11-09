import { DisplaySettings } from '../types/stats';

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  runAtStartup: true,
  showFpsBox: true,
  fpsMonitor: '1',
  showCoreDetails: true,
  customNames: {},
  networkSpeedUnit: 'Mbps',
  pollingIntervalMs: 3000,
  displayId: '',
  fillDisplay: true,
  displayPosition: 'center',
  widthPercent: 75,
  heightPercent: 75,
  autoScale: true,
  scalePercent: 100,
};
