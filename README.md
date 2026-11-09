# MonitorStats Widget

MonitorStats Widget is a lightweight Windows desktop hardware monitor designed to sit across a display behind other windows. Use it on a second monitor while gaming, or select any detected display.

## Features

- CPU, RAM, GPU, storage, network, and fan readings with detected hardware names and optional custom labels.
- RAM module count, per-stick capacity, DDR generation, configured speed, channel mode, process count, and the top five applications by resident working set.
- Game FPS and a frame-time graph from RTSS, associated with a selectable monitor.
- Drive capacity and activity. NVMe health, temperature, wear, power-on time, and host writes are read from the device where supported.
- Local/public IP and ISP, active DNS resolver, DNS ping, and optional ONU RX optical power.
- Monitor selection, full-screen or positioned layout, display scaling, polling interval, startup option, manual refresh, and Mbps/MB/s selection.
- A tray icon for showing or hiding the widget. It stays out of the taskbar and Alt+Tab list.

Unavailable readings are shown as unavailable instead of being estimated. HDD/SATA SMART fields vary by drive and controller. Process RAM is the sum of resident working sets grouped by executable name; shared pages can be counted in more than one process, so this may differ from Task Manager's private-memory column.

## Install

Download the latest `MonitorStats-Setup-<version>.exe` from the project's **GitHub Releases** page and run it. The installer creates Start Menu and desktop shortcuts. The application is currently unsigned, so Windows may show an unknown-publisher or SmartScreen warning. Review the release notes and checksum before running it.

## Requirements

### To run the installed app

- 64-bit Windows 10 or Windows 11.
- No extra sensor service is required for basic Windows CPU, memory, drive-capacity, disk-activity, and network-adapter readings.
- Optional applications provide additional readings:
  - **MSI Afterburner**: CPU/GPU sensors through its shared-memory interface.
  - **RivaTuner Statistics Server (RTSS)**: live game FPS and frame-time data. Start RTSS and enable its statistics server; a game must expose data for an FPS reading to appear.
  - **Fan Control**: configured fan names and RPM through its local sensor IPC. Keep Fan Control running.
  - **NVIDIA driver / `nvidia-smi`**: additional NVIDIA GPU readings when available.

These integrations are optional. If a source is missing or a device does not expose a value, the corresponding reading remains blank.

### To build from source

- 64-bit Windows 10/11.
- Node.js 22 or newer and pnpm 10.
- The .NET Framework C# compiler (`csc.exe`), normally available under the Windows .NET Framework installation.
- Internet access on the first package build so Electron Builder can download Electron.

## Build and run from source

Install Node.js 22+, then open PowerShell in the repository folder:

```powershell
corepack enable
corepack prepare pnpm@10 --activate
pnpm install --frozen-lockfile
pnpm run lint
pnpm run package:win
```

The installer is written to `release-installer/`. `package:win` builds the UI, compiles the small C# sensor helpers, and creates the NSIS installer. For UI-only development, run `pnpm run dev`; hardware telemetry and Electron integration need the desktop app.

## Readings and accuracy

| Reading | Source and limitations |
| --- | --- |
| CPU and RAM identity, memory layout, basic usage | Windows system APIs and WMI/ CIM. Sensor-dependent CPU temperature, clock, and power require a supported Afterburner sensor. |
| GPU | NVIDIA driver (`nvidia-smi`) and/or Afterburner shared memory. Availability depends on GPU and driver support. |
| Fans | Fan Control local IPC and supported Afterburner sensors. Names and values depend on the sensor app's configuration. |
| Process count and top five | Windows process enumeration. RAM ranking uses resident working set, grouped by process name, refreshed every five seconds. |
| Volume size and activity | Windows volume and performance counters. SMART health details are read directly where the storage device/controller supports the Windows interfaces used by the app. |
| FPS and frame time | RTSS shared memory. It reports only applications that RTSS tracks; the selected monitor is matched against the foreground game's display. |
| Local network and throughput | Windows adapter configuration and byte counters. Throughput is sampled over the configured polling interval and can be zero when idle. |
| Public IP and ISP | The public IP is sent to [ipwho.is](https://ipwho.is/) for ISP information. This needs Internet access. |
| Active DNS provider/location/ping | A diagnostic DNS TXT query to `whoami.ds.akahelp.net` identifies the active recursive resolver; its address is looked up and pinged about every 30 minutes. VPNs, firewalls, or DNS providers may block this. |
| ONU RX optical power | Optional authenticated read-only query to the ONU configured by the user; refreshed every 30 minutes after a successful read. |

Hardware polling is configurable in Settings. Process memory is sampled every five seconds; public-network details refresh on network changes and periodically; DNS and ONU lookups run at low frequency. No sensor values are guaranteed when Windows, drivers, firmware, or optional sources do not provide them.

## Optional ONU optical power

ONU credentials are not stored in this repository. To enable optical-power reading, set Windows **user** environment variables for your ONU and router setup. Replace the sample username and password with your own values. Run these commands in PowerShell; do not commit real values or paste them into an issue:

```powershell
[Environment]::SetEnvironmentVariable('MONITORSTATS_ONT_ENDPOINT', 'http://192.168.100.1', 'User')
[Environment]::SetEnvironmentVariable('MONITORSTATS_ONT_USERNAME', 'your-username', 'User')
[Environment]::SetEnvironmentVariable('MONITORSTATS_ONT_PASSWORD', 'your-password', 'User')
```

Restart MonitorStats (or sign out and back in if it was started by Windows at login) so it inherits the new variables. The ONU connection uses local HTTP; only use this on a trusted home network. If you do not configure the variables, ONU data stays unavailable and the rest of the widget works normally.

## Privacy

Hardware samples are read locally. Public-IP/ISP and DNS resolver lookups disclose network information to the services listed above. ONU credentials are read from the current user's environment and sent only to the configured local ONU. Do not attach screenshots or logs containing IP addresses, device identifiers, or credentials to public issues.

## Contribute

Bug reports, fixes, and improvements are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md). Review [SECURITY.md](SECURITY.md) before reporting a security issue. The project uses the MIT License; see [LICENSE](LICENSE).

## Maintainer: publish a GitHub release

Suggested repository details:

- **Repository name:** `monitorstats-widget`
- **Description:** `Lightweight Windows hardware monitor widget for a second display, with live sensors, game FPS, and a system tray UI.`
- **Topics:** `windows`, `hardware-monitor`, `system-monitor`, `electron`, `react`, `typescript`, `gaming`, `rtss`, `nvidia`
- **Visibility:** Public
- **License:** MIT

To create the public repository and the first release, see [docs/GITHUB_RELEASES.md](docs/GITHUB_RELEASES.md). Pushing a version tag such as `v1.3.36` triggers the included Windows workflow, which builds the installer and attaches it to a GitHub Release.
