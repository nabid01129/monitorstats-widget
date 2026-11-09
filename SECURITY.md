# Security policy

## Supported versions

Security fixes are made to the latest release. Update to the latest GitHub Release before reporting an issue that may already be fixed.

## Report a vulnerability privately

Please do not open a public issue for an exploitable vulnerability or exposed credential. Use GitHub's **Report a vulnerability** option in the repository's Security tab if private vulnerability reporting is enabled. If it is not enabled, contact the repository owner privately through the contact method on their GitHub profile and include only the minimum details needed to reproduce the issue.

Do not post public IP addresses, ONU credentials, local network details, or unredacted logs/screenshots in a report.

## Data and credential handling

- Hardware telemetry is collected locally from Windows and optional local sensor applications.
- Public-IP/ISP lookup sends the public IP to ipwho.is. DNS resolver identification uses `whoami.ds.akahelp.net`; the resolver IP is then sent to ipwho.is for provider/location lookup.
- ONU credentials are supplied through Windows user environment variables and sent to the configured ONU endpoint. Do not place real credentials in source files, issues, pull requests, screenshots, or logs.
- The optional ONU connection uses HTTP when configured with an `http://` endpoint. Use it only on a trusted local network.
