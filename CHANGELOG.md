# Changelog

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

## Privacy and setup

- No user-specific public IP, ISP, router identity, screenshots, or ONU credentials are included in the source or installer.
- Router/ONU local addresses and credentials must be configured on each user's own system. ONU passwords are not embedded in the project.
- Router identification uses local UPnP. IPv4 classification is omitted when the router WAN/public address comparison is unavailable or ambiguous.
