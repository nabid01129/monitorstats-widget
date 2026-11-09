# Contributing

Thanks for helping improve MonitorStats Widget. Bug reports, documentation fixes, and code contributions are welcome.

## Before you start

- Search existing issues and pull requests to avoid duplicating work.
- For a large feature or a change to sensor behavior, open an issue first so the approach can be discussed.
- Keep changes focused. Avoid adding a sensor service or dependency when Windows APIs or the supported local sensor integrations can provide the reading.

## Set up a development build

Requirements: 64-bit Windows 10/11, Node.js 22+, pnpm 10, and the .NET Framework C# compiler. In PowerShell at the project root:

```powershell
corepack enable
corepack prepare pnpm@10 --activate
pnpm install --frozen-lockfile
pnpm run lint
pnpm run package:win
```

The installer is generated under `release-installer/`; generated installers and helper executables are intentionally ignored by Git. For UI-only work, `pnpm run dev` starts Vite, but it does not run the Electron telemetry collectors.

## Pull requests

- Use a short branch name such as `fix/disk-counter-null` or `docs/install-guide`.
- Explain the user-visible change and the reason for it.
- List the checks you ran and any checks you could not run.
- For sensor changes, state the exact source/API, units, sampling interval, and what the app shows when the source is absent. Do not invent or silently reuse stale values.
- Do not commit installer binaries, generated output, screenshots, local settings, personal IP addresses, machine identifiers, or credentials.
- Avoid including logs or screenshots with private network data. If a screenshot is needed, redact it first.

## Reporting a bug

Include the app version, Windows version, steps to reproduce, expected behavior, and actual behavior. For hardware readings, include the sensor source and units when known. Redact IP addresses, serial numbers, usernames, and ONU credentials. Use the bug-report issue form when available.

By submitting a contribution, you agree that it may be distributed under this repository's MIT License.
