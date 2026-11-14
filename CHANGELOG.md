# Changelog

Cumulative history starts with the first public release, v1.3.37, and includes the available notes for later builds. Pre-1.3.37 local builds have no preserved per-version notes.

## 1.3.64 — 2026-11-14

Changes since the latest GitHub release, v1.3.58:

- Add minimize and maximize controls, plus the detected Windows version and build beside the clock.
- Add a total system power estimate with live CPU/GPU readings where available and clearly labeled estimates for components Windows cannot meter directly. Move the detailed breakdown to Settings.
- Detect motherboard and connected USB/HID device information to improve the optional power estimate.
- Reduce repeated sensor filtering and drive-inventory searches during hardware polling while preserving sensor priority and displayed readings.
- Publish Fan Control fallback readings with the shared hardware snapshot, avoiding an extra dashboard update between samples.
- Keep the accurate one-second clock and responsive game/network monitoring independent from hardware polling.

## 1.3.63 — 2026-11-14 (local build)

- Keep the dashboard's total power card compact by removing its component list.
- Move the detailed wattage breakdown to Settings, where it can be expanded when needed.

## 1.3.62 — 2026-11-14 (local build)

- Correct the power panel's compact scale and keep the dashboard readable on shorter displays.
- Detect motherboard identity and connected USB/HID peripherals through Windows hardware inventory.
- Expand the watt breakdown for CPU, GPU, memory modules, each physical drive, cooling, motherboard, USB peripherals, displays, and estimated PSU conversion loss.
- Use component-class power estimates and label inferred values and ranges clearly.

## 1.3.61 — 2026-11-14 (local build)

- Add a low-overhead total system power estimate below Processes, including detected displays.
- Prefer available CPU, GPU, or whole-system watt sensors and estimate only components without direct readings.
- Show the estimate range and clearly distinguish live readings from modeled power.

## 1.3.60 — 2026-11-14 (local build)

- Add minimize-to-tray and maximize/restore controls beside refresh and settings.
- Show the detected Windows edition, feature version, and full OS build beside the clock.

## 1.3.58 — 2026-11-11

- Show the installed app version in Settings and add a GitHub releases shortcut for manual update checks.
- Check GitHub’s latest stable release once on app launch and show an update button in the toolbar when a newer version exists.
- Keep update checking lightweight with one bounded HTTPS request and a short timeout.

## 1.3.57 — 2026-11-11

- Add a low-overhead 2 px OLED burn-in protection shift for the dashboard and toolbar across every theme, adjustable to 3, 5, or 10 minutes.

## 1.3.56 — 2026-11-11

- Restored the 1.3.54 desktop behavior selected as the stable baseline.
- Start the Fan Control reader only when primary sensors do not provide CPU or GPU fan RPM, and stop it when those readings become available.
- Query NVIDIA SMI only to fill GPU values that Afterburner does not provide.

## 1.3.55 — 2026-11-11

- Keep the desktop widget visible when Windows runs Show desktop; ordinary application windows can still appear above it, and the taskbar remains usable.

## 1.3.54 — 2026-11-10

- Prefer the active default gateway for router identification and WAN-IP checks.
- Ignore UPnP responses from other LAN devices, including virtual gateways published by security software, so router details and Real IP/Shared IP status use the correct device.
- Start the Fan Control reader only when primary sensors do not provide CPU and GPU fan RPM, and query NVIDIA SMI only for GPU values missing from Afterburner.

## 1.3.53 — 2026-11-10

- Restored reliable router make/model and Real IP/Shared IP detection by querying UPnP gateway versions 1 and 2, with the active gateway's local UPnP description as a fallback.
- Kept previously confirmed router details through brief SSDP/WAN-query failures and added bounded retries after startup or network changes.
- Improved handling when a router delays or omits UPnP discovery responses.

## 1.3.52 — 2026-11-10

- Removed the Transparent HUD theme and its native window recreation path.
- Keep the widget within each monitor's Windows work area so it no longer covers the taskbar when filling the monitor.

## 1.3.51 — 2026-11-10

- Made native transparency theme changes replace the widget window only after the replacement has loaded, keeping the existing widget alive during the switch.
- Restore the previous window and transparency mode if the replacement window fails to load.
- Checked that all 21 themes have matching theme types and CSS definitions; theme styling remains static with no added polling or animation.

## 1.3.50 — 2026-11-10

- Reused the Afterburner shared-memory buffers between samples to avoid allocating two temporary sensor buffers on every poll.
- Excluded build scripts, source files, and helper duplicates from the app archive; required collectors remain shipped once as runtime resources.

## 1.3.49 — 2026-11-10

- Sensor merge order now preserves Windows/BIOS, NVIDIA, and MSI Afterburner fan readings first; Fan Control only fills missing fan readings and no longer overrides an available GPU fan RPM value.

## 1.3.48 — 2026-11-10

- Hide unavailable readings and their labels instead of showing empty dashes. This includes optional CPU/GPU/RAM, drive SMART, network, DNS, process, and ONU optical-power fields.
- Hide the storage and process panels when their inventories contain no detected items.

## 1.3.47 — 2026-11-10

- Reworked the theme picker with 10 game-inspired themes and 10 aesthetic themes.
- Added OLED Black and a fully transparent HUD option. Theme changes are static CSS; no monitoring timers or collectors are added.

## 1.3.46 — 2026-11-10

- Added ten optional visual themes in Settings: five gamer styles and five aesthetic styles, plus Classic.
- Themes use static colors and card styling only; sensor polling, monitoring processes, and telemetry behavior are unchanged.

## 1.3.42 — 2026-11-10

Changes since 1.3.37:

- Added router make/model detection through local UPnP and a conservative IPv4 status badge: **Real IP** when the router WAN address matches the public address, **Shared IP** when the WAN address is private/CGNAT, and no classification when the result could be ambiguous (such as through a VPN).
- Added a quick control to hide or show local/public IP addresses in the Network panel. Removed the Gateway and Configured DNS rows while retaining active DNS details.
- Added ONU optical power configuration in Settings. The password is encrypted with Windows secure storage for the current account; ONU reads remain local and refresh every 30 minutes.
- Made the IPv6 address easier to read by using the full Network panel width and a smaller font.
- Removed the extra System source, frame-graph, and Top 5 RAM captions to reduce visual clutter.
- Prevented duplicate app instances and disabled the unused Chromium breakpad handler process to trim background process overhead.

## 1.3.43–1.3.45

- Separate change notes for these intermediate builds were not preserved.

## 1.3.37 — 2026-11-09

- First public Windows installer release. The original release record did not contain detailed per-feature notes; v1.3.42 records the accumulated changes since this baseline.

## Privacy and setup

- No user-specific public IP, ISP, router identity, screenshots, or ONU credentials are included in the source or installer.
- Router/ONU local addresses and credentials must be configured on each user's own system. ONU passwords are not embedded in the project.
- Router identification uses local UPnP. IPv4 classification is omitted when the router WAN/public address comparison is unavailable or ambiguous.
