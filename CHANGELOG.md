# Changelog

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
