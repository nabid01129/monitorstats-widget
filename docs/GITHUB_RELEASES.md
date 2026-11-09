# Create the GitHub repository and publish releases

## 1. Create the repository

Sign in to GitHub and choose **New repository**. Use these values:

- **Owner:** your GitHub account
- **Repository name:** `monitorstats-widget`
- **Description:** `Lightweight Windows hardware monitor widget for a second display, with live sensors, game FPS, and a system tray UI.`
- **Visibility:** Public
- **Initialize with README:** leave unchecked (this project already has one)
- **Add .gitignore:** leave unselected (the project includes one)
- **Choose a license:** leave unselected (the project includes the MIT License)

Create the repository. Do not add secrets or hardware screenshots to it.

## 2. Install Git if needed and upload this source folder

Install **Git for Windows** if `git --version` is not recognized. Open PowerShell in this project folder, then run:

```powershell
git init -b main
git add .
git status --short
```

Review the status before committing. Confirm it does not list `.env` files, `HANDOFF.md`, screenshots under `public/assets/aistudio/`, `node_modules`, `dist`, or release/build folders. Those are ignored intentionally.

Then commit and connect the new repository. Replace `YOUR_GITHUB_NAME` with your account name:

```powershell
git commit -m "Prepare MonitorStats Widget for open source"
git remote add origin https://github.com/YOUR_GITHUB_NAME/monitorstats-widget.git
git push -u origin main
```

GitHub may ask you to sign in through a browser or credential manager. Do not put a password or personal access token in the remote URL or command history.

## 3. Check repository settings

On GitHub, confirm the repository is public. In **Settings → General → Features**, enable Issues and Discussions if you want user feedback and design conversations. In **Settings → Actions → General**, allow GitHub Actions and set the workflow token permission to **Read and write** so the release workflow can create a Release and upload the installer. In **Settings → Security**, enable private vulnerability reporting if available. The included issue forms and contribution guide are already in the source.

## 4. Publish a downloadable Windows installer

The repository includes `.github/workflows/windows-release.yml`. A version tag starts a clean Windows build, runs TypeScript checks, builds the NSIS installer, and attaches the installer to a GitHub Release.

The current source version is `1.3.36`. To publish its first release:

```powershell
git tag v1.3.36
git push origin v1.3.36
```

Open the repository's **Actions** page to watch the build. When the workflow succeeds, open **Releases** and verify the `MonitorStats-Setup-1.3.36.exe` asset is attached. Visitors can download the installer from that release page without installing Node.js or the sensor source applications.

For the next release, update the version in `package.json`, commit and push the change, then create and push a matching `v<version>` tag. The workflow uses the lockfile and builds the C# helpers on the Windows runner.

## 5. What users need

Users only need 64-bit Windows 10/11 to install the release. MSI Afterburner, RTSS, Fan Control, and `nvidia-smi` are optional sensor sources; each adds only the readings it provides. Basic Windows telemetry works without them. ONU optical power is also optional and requires per-user environment variables; it is not preconfigured for contributors or users.

The installer is not code-signed, so Windows may show an unknown-publisher/SmartScreen warning. Once published, add a SHA-256 checksum to the release notes by running:

```powershell
Get-FileHash .\MonitorStats-Setup-1.3.36.exe -Algorithm SHA256
```
