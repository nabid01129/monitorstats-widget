const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, safeStorage, shell } = require('electron');
const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const https = require('node:https');
const http = require('node:http');
const dns = require('node:dns').promises;
const net = require('node:net');
const dgram = require('node:dgram');

// The widget has no crash-reporting service; don't keep Chromium's unused
// breakpad handler process running alongside the sensor readers.
app.commandLine.appendSwitch('disable-breakpad');
const hasSingleInstanceLock = app.requestSingleInstanceLock();

let mainWindow;
let foregroundPid = null;
let foregroundMonitorNumber = 1;
let selectedFpsMonitor = '1';
let foregroundMonitor;
let foregroundMonitorRestartTimer;
let hardwareCollector;
let hardwareCollectorRestartTimer;
let hardwarePollingIntervalMs = 3000;
let hardwareCollectorRestartDelayMs = 5000;
const allowedPollingIntervals = new Set([1000, 2000, 3000, 5000, 10000]);
let fanControlCollector;
let fanControlCollectorRestartDelayMs = 5000;
let fanControlCollectorRestartTimer;
let fanControlCollectorWanted = false;
let fanControlReaderPathResolved = false;
let fanControlReaderPath = null;
let latestFanControlSensors = [];
let latestFanControlSignature = '[]';
let cachedOwnProcessIds;
let ownProcessIdsCachedAt = 0;
let latestHardwarePayload = null;
let widgetLayout = { displayId: '', fillDisplay: true, displayPosition: 'center', widthPercent: 75, heightPercent: 75, autoScale: true, scalePercent: 100 };
let windowMaximizeOverride = null;
let tray;
let rtssReading = null;
let lastPublishedFpsSignature = '';
let lastRtsSampleSignature = '';
let latestHardwareStats = null;
let publicNetworkDetails = { publicIP: null, publicIPv4: null, publicIPv6: null, provider: null };
publicNetworkDetails.dnsResolver = null;
let routerNetworkDetails = { routerManufacturer: null, routerModel: null, routerWanIPv4: null, ipv4Type: null };
let routerLookupInFlight = false;
let routerRefreshTimer;
let routerDiscoveryFailures = 0;
let publicLookupInFlight = false;
let publicLookupTimer;
let publicLookupPending = false;
let publicNetworkGeneration = 0;
const publicLookupRequests = new Set();
const updateCheckRequests = new Set();
const GITHUB_RELEASES_LATEST_API = 'https://api.github.com/repos/nabid01129/monitorstats-widget/releases/latest';
const GITHUB_RELEASES_LATEST_PAGE = 'https://github.com/nabid01129/monitorstats-widget/releases/latest';
let dnsResolverLookupInFlight = false;
let dnsResolverLookupPending = false;
let dnsResolverRefreshTimer;
const knownDnsProviders = new Map([
  ['8.8.8.8', 'Google DNS'], ['8.8.4.4', 'Google DNS'], ['2001:4860:4860::8888', 'Google DNS'], ['2001:4860:4860::8844', 'Google DNS'],
  ['1.1.1.1', 'Cloudflare DNS'], ['1.0.0.1', 'Cloudflare DNS'], ['2606:4700:4700::1111', 'Cloudflare DNS'], ['2606:4700:4700::1001', 'Cloudflare DNS'],
  ['94.140.14.14', 'AdGuard DNS'], ['94.140.15.15', 'AdGuard DNS'], ['94.140.14.15', 'AdGuard DNS'], ['94.140.15.16', 'AdGuard DNS'],
  ['94.140.14.140', 'AdGuard DNS'], ['94.140.14.141', 'AdGuard DNS'],
  ['2a10:50c0::ad1:ff', 'AdGuard DNS'], ['2a10:50c0::ad2:ff', 'AdGuard DNS'], ['2a10:50c0::bad1:ff', 'AdGuard DNS'], ['2a10:50c0::bad2:ff', 'AdGuard DNS'], ['2a10:50c0::1:ff', 'AdGuard DNS'], ['2a10:50c0::2:ff', 'AdGuard DNS'],
  ['9.9.9.9', 'Quad9'], ['149.112.112.112', 'Quad9'], ['2620:fe::fe', 'Quad9'], ['2620:fe::9', 'Quad9'],
  ['208.67.222.222', 'OpenDNS'], ['208.67.220.220', 'OpenDNS'], ['2620:119:35::35', 'OpenDNS'], ['2620:119:53::53', 'OpenDNS'],
]);
let networkInterfaceMonitor;
let networkInterfaceFingerprint = null;
let networkChangeDebounceTimer;
let networkChangeRetries = 0;
let latestGameFps = null;
let hardwareRefreshInProgress = false;
let hardwareRefreshTimeout;
let gamePublishTimer;
let isQuitting = false;
// ONU configuration is deliberately user-local; never commit device addresses or credentials.
let ontOpticalEndpoint = process.env.MONITORSTATS_ONT_ENDPOINT?.trim().replace(/\/+$/, '') || '';
let ontUsername = process.env.MONITORSTATS_ONT_USERNAME || '';
let ontPassword = process.env.MONITORSTATS_ONT_PASSWORD || '';
let ontOpticalData = { rxOpticalPowerDbm: null, opticalStatus: 'connecting', opticalError: null, opticalUpdatedAt: null };
let ontOpticalRefreshTimer;
let ontOpticalLookupInFlight = false;
let ontOpticalRetryAttempt = 0;

function getOntConfigPath() {
  return path.join(app.getPath('userData'), 'ont-config.bin');
}

async function loadOntConfig() {
  if (ontOpticalEndpoint && ontUsername && ontPassword) return;
  try {
    if (!safeStorage.isEncryptionAvailable()) return;
    const encrypted = await fs.readFile(getOntConfigPath());
    const saved = JSON.parse(safeStorage.decryptString(encrypted));
    if (!ontOpticalEndpoint && typeof saved.endpoint === 'string') ontOpticalEndpoint = saved.endpoint;
    if (!ontUsername && typeof saved.username === 'string') ontUsername = saved.username;
    if (!ontPassword && typeof saved.password === 'string') ontPassword = saved.password;
  } catch { /* First run or unreadable saved credentials; configure from Settings. */ }
}

async function saveOntConfig(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid ONT settings.');
  const endpoint = typeof config.endpoint === 'string' ? config.endpoint.trim().replace(/\/+$/, '') : '';
  const username = typeof config.username === 'string' ? config.username.trim() : '';
  const password = typeof config.password === 'string' ? config.password : '';
  let endpointUrl;
  try { endpointUrl = new URL(endpoint); } catch { throw new Error('Enter a valid ONT address.'); }
  if (endpointUrl.protocol !== 'http:' || !isPrivateIPv4(endpointUrl.hostname)) throw new Error('Use the ONT’s local HTTP address on your private network.');
  if (!username || username.length > 128) throw new Error('Enter the ONT username.');
  if (password.length > 512) throw new Error('ONT password is too long.');
  if (!password && !ontPassword) throw new Error('Enter the ONT password.');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows secure credential storage is unavailable.');
  const savedPassword = password || ontPassword;
  const encrypted = safeStorage.encryptString(JSON.stringify({ endpoint, username, password: savedPassword }));
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(getOntConfigPath(), encrypted);
  ontOpticalEndpoint = endpoint;
  ontUsername = username;
  ontPassword = savedPassword;
  ontOpticalRetryAttempt = 0;
  refreshOntOpticalPower();
  return { configured: true };
}

function isPrivateIPv4(address) {
  if (net.isIP(address) !== 4) return false;
  const octets = address.split('.').map(Number);
  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 169 && octets[1] === 254)
    || octets[0] === 127;
}

function localHttpRequest(url, { method = 'GET', headers = {}, body = '' } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    if (target.protocol !== 'http:' || !isPrivateIPv4(target.hostname)) return reject(new Error('Router endpoint is not a private IPv4 HTTP address'));
    const request = http.request(target, { method, headers, timeout: 2500 }, (response) => {
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > 128 * 1024) { request.destroy(new Error('Router response too large')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ statusCode: response.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    request.on('timeout', () => request.destroy(new Error('Router request timed out')));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

function discoverUpnpRouter(gateway) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    let finished = false;
    const locations = new Set();
    const searchTargets = [
      'urn:schemas-upnp-org:device:InternetGatewayDevice:2',
      'urn:schemas-upnp-org:device:InternetGatewayDevice:1',
      'upnp:rootdevice',
    ];
    const complete = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { socket.close(); } catch {}
      resolve([...locations]);
    };
    // Routers can take a little longer to answer immediately after Windows
    // changes networks. Keep one short discovery window for all search targets.
    const timer = setTimeout(complete, 2400);
    socket.on('error', complete);
    socket.on('message', (message) => {
      const response = message.toString('utf8');
      const match = response.match(/^location\s*:\s*(https?:\/\/[^\r\n]+)/im);
      if (!match) return;
      try {
        const location = new URL(match[1].trim());
        // Only accept the UPnP responder at the active default gateway.
        // Security suites can publish their own virtual IGD endpoint and must
        // not be mistaken for the user's physical router.
        if (location.protocol === 'http:' && isPrivateIPv4(location.hostname) && location.hostname === gateway) locations.add(location.href);
      } catch {}
    });
    socket.bind(() => {
      for (const target of searchTargets) {
        const message = [
          'M-SEARCH * HTTP/1.1',
          'HOST: 239.255.255.250:1900',
          'MAN: "ssdp:discover"',
          'MX: 1',
          `ST: ${target}`,
          '', '',
        ].join('\r\n');
        const query = Buffer.from(message);
        socket.send(query, 1900, '239.255.255.250', (error) => { if (error) complete(); });
      }
    });
  });
}

function xmlTag(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}\\s*>`, 'i'));
  return match ? match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() : null;
}

async function inspectUpnpDescription(location) {
  const response = await localHttpRequest(location);
  if (response.statusCode < 200 || response.statusCode >= 300) return null;
  const xml = response.body;
  const manufacturer = xmlTag(xml, 'manufacturer');
  const modelName = xmlTag(xml, 'modelName');
  const modelNumber = xmlTag(xml, 'modelNumber');
  const model = modelName && modelNumber?.toLowerCase().startsWith(modelName.toLowerCase())
    ? modelNumber
    : [modelName, modelNumber].filter(Boolean).join(' ');
  const serviceBlocks = [...xml.matchAll(/<service\b[^>]*>([\s\S]*?)<\/service\s*>/gi)].map((match) => match[1]);
  const service = serviceBlocks.find((block) => /WANIPConnection:|WANPPPConnection:/i.test(xmlTag(block, 'serviceType') || ''));
  const controlPath = service && xmlTag(service, 'controlURL');
  let controlUrl = controlPath ? new URL(controlPath, location) : null;
  const descriptionUrl = new URL(location);
  if (controlUrl && (controlUrl.protocol !== 'http:' || controlUrl.hostname !== descriptionUrl.hostname || controlUrl.port !== descriptionUrl.port)) controlUrl = null;
  return { manufacturer, model, controlUrl, serviceType: service ? xmlTag(service, 'serviceType') : null };
}

async function queryRouterWanIPv4(controlUrl, serviceType) {
  if (!controlUrl || !serviceType) return null;
  const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:GetExternalIPAddress xmlns:u="${serviceType}"/></s:Body></s:Envelope>`;
  const response = await localHttpRequest(controlUrl.href, {
    method: 'POST',
    headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${serviceType}#GetExternalIPAddress"`, 'Content-Length': Buffer.byteLength(body) },
    body,
  });
  const address = xmlTag(response.body, 'NewExternalIPAddress');
  return net.isIP(address || '') === 4 ? address : null;
}

async function refreshRouterNetwork() {
  if (isQuitting || routerLookupInFlight) return;
  routerLookupInFlight = true;
  let discoverySucceeded = false;
  try {
    const gateway = latestHardwarePayload?.network?.gateway;
    let discovered = null;
    // Query the active gateway first. This avoids choosing a virtual UPnP
    // service from security software or another device on the LAN.
    if (isPrivateIPv4(gateway || '')) {
      try {
        const candidate = await inspectUpnpDescription(`http://${gateway}:5000/rootDesc.xml`);
        if (candidate && (candidate.manufacturer || candidate.model || candidate.controlUrl)) discovered = candidate;
      } catch {}
    }
    if (!discovered && isPrivateIPv4(gateway || '')) {
      const locations = await discoverUpnpRouter(gateway);
      for (const location of locations) {
        try {
          const candidate = await inspectUpnpDescription(location);
          if (candidate && (candidate.manufacturer || candidate.model || candidate.controlUrl)) { discovered = candidate; break; }
        } catch {}
      }
    }
    discoverySucceeded = Boolean(discovered?.manufacturer || discovered?.model || discovered?.controlUrl);
    let wanIPv4 = null;
    if (discovered?.controlUrl) {
      try { wanIPv4 = await queryRouterWanIPv4(discovered.controlUrl, discovered.serviceType); } catch {}
    }
    const publicIPv4 = publicNetworkDetails.publicIPv4;
    // A direct router-WAN/public-IP match is a real IP. Any verified mismatch
    // means the public egress is shared or tunneled (including VPN egress).
    // A failed UPnP response is transient. Retain a prior WAN address only
    // when discovery confirms this is still the same router; interface changes
    // clear the address before this refresh is triggered.
    const previousIdentity = [routerNetworkDetails.routerManufacturer, routerNetworkDetails.routerModel].filter(Boolean).join('|').toLowerCase();
    const discoveredIdentity = [discovered?.manufacturer, discovered?.model].filter(Boolean).join('|').toLowerCase();
    const sameRouter = !discoveredIdentity || !previousIdentity || discoveredIdentity === previousIdentity;
    const effectiveWanIPv4 = wanIPv4 || (sameRouter ? routerNetworkDetails.routerWanIPv4 : null);
    const ipv4Type = effectiveWanIPv4 && publicIPv4
      ? (effectiveWanIPv4 === publicIPv4 ? 'real' : 'shared')
      : null;
    const next = {
      routerManufacturer: discovered?.manufacturer || routerNetworkDetails.routerManufacturer || null,
      routerModel: discovered?.model || routerNetworkDetails.routerModel || null,
      routerWanIPv4: effectiveWanIPv4,
      ipv4Type,
    };
    if (JSON.stringify(next) !== JSON.stringify(routerNetworkDetails)) {
      routerNetworkDetails = next;
      if (latestHardwarePayload) sendHardwareStats(latestHardwarePayload);
    }
    routerDiscoveryFailures = discoverySucceeded ? 0 : routerDiscoveryFailures + 1;
  } catch {
    // Discovery is best-effort; a transient router/network error must not
    // become an unhandled rejection from the background timer.
  } finally {
    routerLookupInFlight = false;
    if (routerRefreshTimer) clearTimeout(routerRefreshTimer);
    // Retry startup/network-change discovery failures with bounded backoff;
    // after success, this remains a low-frequency refresh.
    const retryDelays = [5000, 15000, 60000];
    const delay = discoverySucceeded ? 30 * 60 * 1000 : retryDelays[Math.min(routerDiscoveryFailures - 1, retryDelays.length - 1)];
    if (!isQuitting) routerRefreshTimer = setTimeout(refreshRouterNetwork, delay);
  }
}

function scheduleOntOpticalRefresh(delayMs) {
  if (ontOpticalRefreshTimer) clearTimeout(ontOpticalRefreshTimer);
  ontOpticalRefreshTimer = null;
  if (!isQuitting) ontOpticalRefreshTimer = setTimeout(refreshOntOpticalPower, delayMs);
}

function sendGameFps(payload) {
  latestGameFps = payload;
  const signature = JSON.stringify(payload);
  if (signature === lastPublishedFpsSignature) return;
  lastPublishedFpsSignature = signature;
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    mainWindow.webContents.send('monitorstats:game-fps', payload);
  }
}

function queryIpInfo(address = null, family) {
  return new Promise((resolve) => {
    const request = https.get({ hostname: 'ipwho.is', path: address ? `/${encodeURIComponent(address)}` : '/', family, timeout: 8000, headers: { 'User-Agent': `MonitorStatsWidget/${app.getVersion()}` } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        try {
          const data = JSON.parse(body);
          finish(response.statusCode >= 200 && response.statusCode < 300 && data.success === true ? data : null);
        } catch { finish(null); }
      });
    });
    publicLookupRequests.add(request);
    request.on('timeout', () => request.destroy());
    request.on('error', () => finish(null));
    function finish(data) {
      publicLookupRequests.delete(request);
      resolve(data);
    }
  });
}

function compareVersionStrings(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function checkLatestRelease() {
  const currentVersion = app.getVersion();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve({ currentVersion, ...result });
    };
    const request = https.get(GITHUB_RELEASES_LATEST_API, {
      timeout: 7000,
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `MonitorStatsWidget/${currentVersion}`,
      },
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        finish({ status: 'unavailable', latestVersion: null });
        return;
      }
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
        if (body.length > 128 * 1024) {
          request.destroy();
          finish({ status: 'unavailable', latestVersion: null });
        }
      });
      response.on('end', () => {
        if (settled) return;
        try {
          const release = JSON.parse(body);
          const latestVersion = typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/i, '') : '';
          if (!/^\d+\.\d+\.\d+$/.test(latestVersion)) {
            finish({ status: 'unavailable', latestVersion: null });
            return;
          }
          finish({
            status: compareVersionStrings(latestVersion, currentVersion) > 0 ? 'available' : 'current',
            latestVersion,
          });
        } catch {
          finish({ status: 'unavailable', latestVersion: null });
        }
      });
    });
    updateCheckRequests.add(request);
    request.on('timeout', () => request.destroy(new Error('GitHub update check timed out')));
    request.on('error', () => finish({ status: 'unavailable', latestVersion: null }));
    request.on('close', () => updateCheckRequests.delete(request));
  });
}

function requestOnt(pathname, method = 'GET', form = null, cookies = [], refererPath = '/') {
  const body = form ? new URLSearchParams(form).toString() : '';
  return new Promise((resolve, reject) => {
    const request = http.request(new URL(pathname, ontOpticalEndpoint), {
      method,
      timeout: 8000,
      headers: {
        Accept: '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Referer: new URL(refererPath, ontOpticalEndpoint).toString(),
        ...(cookies.length ? { Cookie: cookies.join('; ') } : {}),
        ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    }, (response) => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode || 0, text, setCookies: response.headers['set-cookie'] || [] }));
    });
    request.on('timeout', () => request.destroy(new Error('ONT request timed out')));
    request.on('error', reject);
    request.end(body || undefined);
  });
}

function appendOntCookies(cookies, response) {
  for (const cookie of response.setCookies) {
    const firstPart = cookie.split(';', 1)[0];
    if (firstPart) cookies.set(firstPart.split('=', 1)[0], firstPart);
  }
}

function parseRxOpticalPower(text) {
  const row = text.match(/new\s+stOpticInfo\s*\(([^)]*)\)/i);
  if (!row) return null;
  const values = [...row[1].matchAll(/"((?:\\.|[^"\\])*)"/g)].map((match) => match[1].trim());
  const rx = Number(values[2]?.replace(',', '.'));
  return Number.isFinite(rx) && rx >= -100 && rx <= 20 ? rx : null;
}

async function fetchOntRxPower() {
  const cookies = new Map();
  const getCookieHeader = () => [...cookies.values()].join('; ');
  // Load the login page, then mirror its cookie reset before requesting a nonce.
  const landing = await requestOnt('/', 'GET');
  appendOntCookies(cookies, landing);
  cookies.clear();
  let challenge = await requestOnt('/asp/GetRandCount.asp', 'POST');
  appendOntCookies(cookies, challenge);
  let token = challenge.text.replace(/^\uFEFF/, '').trim().match(/[a-f\d]{32}$/i)?.[0];
  if (!token) {
    challenge = await requestOnt('/asp/GetRandCount.asp', 'GET');
    appendOntCookies(cookies, challenge);
    token = challenge.text.replace(/^\uFEFF/, '').trim().match(/[a-f\d]{32}$/i)?.[0];
  }
  if (!token) throw new Error('ONT token unavailable');
  const encodedPassword = Buffer.from(ontPassword, 'utf8').toString('base64');
  cookies.set('Cookie', `Cookie=UserName:${ontUsername}:PassWord:${encodedPassword}:Language:english:id=-1`);
  const login = await requestOnt('/login.cgi', 'POST', { 'x.X_HW_Token': token }, [getCookieHeader()]);
  appendOntCookies(cookies, login);
  // The HG8010H only exposes the optical page after its normal index/frame
  // navigation initializes the authenticated UI session.
  const index = await requestOnt('/index.asp', 'GET', null, [getCookieHeader()]);
  appendOntCookies(cookies, index);
  const frame = await requestOnt('/frame.asp', 'GET', null, [getCookieHeader()], '/index.asp');
  appendOntCookies(cookies, frame);
  const cookieHeader = getCookieHeader();
  const paths = ['/html/status/opticinfo.asp', '/html/amp/opticinfo/opticinfo.asp'];
  let rx = null;
  let lastPage = null;
  for (const pathName of paths) {
    // HG8010H serves this page from its frame UI and returns 404 when the
    // referrer is the bare root, even with a valid authenticated session.
    const page = await requestOnt(pathName, 'GET', null, [cookieHeader], '/frame.asp');
    lastPage = page;
    rx = parseRxOpticalPower(page.text);
    if (rx !== null) break;
  }
  try { await requestOnt('/logout.cgi?RequestFile=html/logout.html', 'POST', null, [cookieHeader], '/frame.asp'); } catch { /* Best-effort session cleanup. */ }
  if (rx === null) {
    if (lastPage?.text.match(/txt_Username|txt_Password|login\.asp/i) || !login.setCookies.some((cookie) => /sid=/i.test(cookie))) throw new Error('ONT login rejected');
    throw new Error('ONT optical data missing');
  }
  return rx;
}

async function refreshOntOpticalPower() {
  if (isQuitting) return;
  if (ontOpticalLookupInFlight) return;
  if (ontOpticalRefreshTimer) clearTimeout(ontOpticalRefreshTimer);
  ontOpticalRefreshTimer = null;
  if (!ontOpticalEndpoint || !ontUsername || !ontPassword) {
    ontOpticalData = { ...ontOpticalData, opticalStatus: 'unavailable', opticalError: 'ONU not configured' };
    if (latestHardwarePayload) sendHardwareStats(latestHardwarePayload);
    scheduleOntOpticalRefresh(30 * 60 * 1000);
    return;
  }
  ontOpticalLookupInFlight = true;
  try {
    const rxOpticalPowerDbm = await fetchOntRxPower();
    ontOpticalData = { rxOpticalPowerDbm, opticalStatus: 'live', opticalError: null, opticalUpdatedAt: Date.now() };
    ontOpticalRetryAttempt = 0;
  } catch (error) {
    const code = error?.code;
    const message = String(error?.message || '');
    const opticalError = code === 'ECONNREFUSED' ? 'connection refused'
      : code === 'ENETUNREACH' || code === 'EHOSTUNREACH' ? 'no route to ONT'
        : code === 'ECONNRESET' ? 'connection reset by ONT'
        : code === 'ETIMEDOUT' || /timed out/i.test(message) ? 'connection timed out'
          : /token/i.test(message) ? 'login token unavailable'
            : /login rejected/i.test(message) ? 'login rejected'
              : 'optical data unavailable';
    ontOpticalData = { ...ontOpticalData, opticalStatus: 'unavailable', opticalError };
    ontOpticalRetryAttempt += 1;
  } finally {
    ontOpticalLookupInFlight = false;
    if (latestHardwarePayload) sendHardwareStats(latestHardwarePayload);
    // The ONT's secondary router connection can come up well after Windows.
    // Retry failures with a capped backoff; once live, return to a 30-minute poll.
    const retryDelaysMs = [15_000, 30_000, 60_000, 120_000, 300_000];
    const delayMs = ontOpticalData.opticalStatus === 'live'
      ? 30 * 60 * 1000
      : retryDelaysMs[Math.min(ontOpticalRetryAttempt - 1, retryDelaysMs.length - 1)];
    scheduleOntOpticalRefresh(delayMs);
  }
}

function ownProcessIds() {
  const now = Date.now();
  if (!cachedOwnProcessIds || now - ownProcessIdsCachedAt >= 5000) {
    cachedOwnProcessIds = new Set([process.pid, ...app.getAppMetrics().map((metric) => metric.pid)]);
    ownProcessIdsCachedAt = now;
  }
  return cachedOwnProcessIds;
}

function updateFanControlSensors(payload) {
  const sensors = payload.filter((fan) => fan && typeof fan.name === 'string' && Number.isFinite(fan.value));
  const signature = JSON.stringify(sensors);
  if (signature === latestFanControlSignature) return;
  latestFanControlSignature = signature;
  latestFanControlSensors = sensors;
  // Publish fallback fan data with the next hardware snapshot. This keeps the
  // dashboard on one update cadence and avoids a second renderer update between
  // sensor samples; the helper already polls at the selected hardware interval.
}

function fanNameKey(name) {
  return typeof name === 'string' ? name.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

function needsFanControlFallback(payload) {
  const fans = Array.isArray(payload?.fans) ? payload.fans : [];
  const hasCpuFanRpm = fans.some((fan) => /CPU.*fan|fan.*CPU/i.test(fanNameKey(fan.name)) && /rpm/i.test(fan.units || ''));
  const hasGpuFanRpm = Number.isFinite(payload?.gpu?.fanRPM)
    || fans.some((fan) => /gpu|nvidia/i.test(fanNameKey(fan.name)) && /rpm/i.test(fan.units || ''));
  return !hasCpuFanRpm || !hasGpuFanRpm;
}

function resolveFanControlReaderPath() {
  if (fanControlReaderPathResolved) return fanControlReaderPath;
  fanControlReaderPathResolved = true;
  if (process.platform !== 'win32') return null;

  const installRoots = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs') : null,
  ].filter(Boolean);
  const isFanControlInstalled = installRoots.some((root) => fsSync.existsSync(path.join(root, 'FanControl', 'FanControl.IPC.dll')));
  if (!isFanControlInstalled) return null;

  const candidate = app.isPackaged
    ? path.join(process.resourcesPath, 'FanControlReader.exe')
    : path.join(__dirname, 'FanControlReader.exe');
  fanControlReaderPath = fsSync.existsSync(candidate) ? candidate : null;
  return fanControlReaderPath;
}

function sendHardwareStats(payload) {
  latestHardwarePayload = payload;
  const wantsFanControlFallback = needsFanControlFallback(payload);
  if (fanControlCollectorWanted !== wantsFanControlFallback) {
    fanControlCollectorWanted = wantsFanControlFallback;
    if (!fanControlCollectorWanted) {
      if (fanControlCollectorRestartTimer) clearTimeout(fanControlCollectorRestartTimer);
      fanControlCollectorRestartTimer = null;
      if (fanControlCollector && !fanControlCollector.killed) fanControlCollector.kill();
      latestFanControlSensors = [];
      latestFanControlSignature = '[]';
    }
  }
  if (fanControlCollectorWanted && !fanControlCollector && !fanControlCollectorRestartTimer) startFanControlCollector();

  const preferredFans = Array.isArray(payload.fans) ? payload.fans : [];
  const preferredFanNames = new Set(preferredFans.map((fan) => fanNameKey(fan.name)));
  // Fan Control is a last-resort source: keep Windows/BIOS or Afterburner
  // values first, and only fill in fan names that those sources did not report.
  const fallbackFans = latestFanControlSensors.filter((fan) => !preferredFanNames.has(fanNameKey(fan.name)));
  const gpuFanFallback = payload.gpu?.fanRPM === null || payload.gpu?.fanRPM === undefined
    ? fallbackFans.find((fan) => /gpu|nvidia/i.test(fan.name))
    : null;
  latestHardwareStats = {
    ...payload,
    gpu: gpuFanFallback ? { ...payload.gpu, fanRPM: gpuFanFallback.value } : payload.gpu,
    fans: [...preferredFans, ...fallbackFans],
    network: { ...payload.network, ...publicNetworkDetails, ...routerNetworkDetails, ...ontOpticalData },
  };
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) mainWindow.webContents.send('monitorstats:hardware', latestHardwareStats);
}

function setHardwareRefreshState(refreshing) {
  hardwareRefreshInProgress = refreshing;
  if (hardwareRefreshTimeout) clearTimeout(hardwareRefreshTimeout);
  hardwareRefreshTimeout = refreshing ? setTimeout(() => setHardwareRefreshState(false), 30000) : null;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('monitorstats:refresh-state', refreshing);
}

function restartHardwareCollector(delay = 250) {
  if (isQuitting) return;
  hardwareCollectorRestartDelayMs = delay;
  if (hardwareCollector && !hardwareCollector.killed) {
    hardwareCollector.kill();
    return;
  }
  if (hardwareCollectorRestartTimer) clearTimeout(hardwareCollectorRestartTimer);
  hardwareCollectorRestartTimer = setTimeout(() => {
    hardwareCollectorRestartTimer = null;
    startHardwareCollector();
  }, delay);
}

function startFanControlCollector() {
  if (process.platform !== 'win32' || isQuitting || !fanControlCollectorWanted || fanControlCollector) return;
  if (fanControlCollectorRestartTimer) {
    clearTimeout(fanControlCollectorRestartTimer);
    fanControlCollectorRestartTimer = null;
  }
  const readerPath = resolveFanControlReaderPath();
  if (!readerPath) return;
  const collector = spawn(readerPath, [String(hardwarePollingIntervalMs)], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  fanControlCollector = collector;
  let outputBuffer = '';
  collector.stdout.setEncoding('utf8');
  collector.stdout.on('data', (chunk) => {
    outputBuffer += chunk;
    const lines = outputBuffer.split(/\r?\n/);
    outputBuffer = lines.pop() || '';
    for (const line of lines) {
      try {
        const payload = JSON.parse(line);
        if (Array.isArray(payload.fans)) {
          updateFanControlSensors(payload.fans);
        }
      } catch { /* Ignore incomplete helper output lines. */ }
    }
  });
  collector.on('error', () => {});
  collector.on('close', () => {
    if (fanControlCollector !== collector) return;
    fanControlCollector = null;
    if (latestFanControlSensors.length) updateFanControlSensors([]);
    if (!isQuitting && fanControlCollectorWanted && !fanControlCollector && !fanControlCollectorRestartTimer) {
      const delay = fanControlCollectorRestartDelayMs;
      fanControlCollectorRestartDelayMs = 5000;
      fanControlCollectorRestartTimer = setTimeout(() => {
        fanControlCollectorRestartTimer = null;
        startFanControlCollector();
      }, delay);
    }
  });
}

function orderedDisplays() {
  const primary = screen.getPrimaryDisplay();
  const others = screen.getAllDisplays().filter((display) => display.id !== primary.id)
    .sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  return [primary, ...others];
}

function listDisplays() {
  const displays = orderedDisplays();
  return displays.map((display, index) => ({
    id: String(display.id),
    fpsIndex: index + 1,
    label: `Monitor ${index + 1}${display.id === screen.getPrimaryDisplay().id ? ' · Primary' : ''} · ${Math.round(display.bounds.width * display.scaleFactor)}×${Math.round(display.bounds.height * display.scaleFactor)} · ${display.bounds.width === display.bounds.height ? 'Square' : display.bounds.width > display.bounds.height ? 'Landscape' : 'Portrait'}`,
    model: typeof display.label === 'string' && display.label.trim() ? display.label.trim() : null,
    primary: display.id === screen.getPrimaryDisplay().id,
    width: Math.round(display.bounds.width * display.scaleFactor),
    height: Math.round(display.bounds.height * display.scaleFactor),
    refreshRate: Number.isFinite(display.displayFrequency) && display.displayFrequency > 0 ? display.displayFrequency : null,
    orientation: display.bounds.width === display.bounds.height ? 'Square' : display.bounds.width > display.bounds.height ? 'Landscape' : 'Portrait',
  }));
}

function resolveWidgetDisplay() {
  const displays = orderedDisplays();
  return displays.find((display) => String(display.id) === widgetLayout.displayId)
    || displays.find((display) => display.id !== screen.getPrimaryDisplay().id)
    || screen.getPrimaryDisplay();
}

function getWidgetBounds(forceMaximized = false, forceWindowed = false) {
  // Keep the widget inside the usable desktop area so the Windows taskbar
  // remains outside its bounds even when Fill the entire monitor is enabled.
  const area = resolveWidgetDisplay().workArea;
  const fillDisplay = forceMaximized || (!forceWindowed && widgetLayout.fillDisplay);
  const width = fillDisplay ? area.width : Math.min(area.width, Math.max(1, Math.round(area.width * widgetLayout.widthPercent / 100)));
  const height = fillDisplay ? area.height : Math.min(area.height, Math.max(1, Math.round(area.height * widgetLayout.heightPercent / 100)));
  const margin = fillDisplay || width >= area.width ? 0 : Math.max(8, Math.round(area.width * 0.02));
  const x = widgetLayout.displayPosition === 'left'
    ? area.x + margin
    : widgetLayout.displayPosition === 'right'
      ? area.x + area.width - width - margin
      : area.x + Math.round((area.width - width) / 2);
  const y = area.y + Math.round((area.height - height) / 2);
  return { x: Math.max(area.x, x), y, width, height };
}

function isWidgetMaximized() {
  return windowMaximizeOverride === null ? widgetLayout.fillDisplay : windowMaximizeOverride;
}

function applyWidgetLayout() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const area = resolveWidgetDisplay().workArea;
  mainWindow.setBounds(getWidgetBounds(isWidgetMaximized(), !isWidgetMaximized()));
  if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
    const autoScale = widgetLayout.autoScale ? Math.min(1.5, Math.max(0.7, Math.min(area.width / 768, area.height / 1366))) : 1;
    const userScale = Math.max(70, Math.min(130, widgetLayout.scalePercent)) / 100;
    mainWindow.webContents.setZoomFactor(Math.max(0.5, Math.min(2, autoScale * userScale)));
  }
}

function toggleWidgetMaximized() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  windowMaximizeOverride = !isWidgetMaximized();
  applyWidgetLayout();
  return isWidgetMaximized();
}

function getWindowsBuildInfo() {
  if (process.platform !== 'win32') return null;
  const releaseMatch = os.release().match(/^\d+\.\d+\.(\d+)/);
  let registry = '';
  try {
    registry = execFileSync('reg.exe', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'], {
      encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch { /* Use the OS version reported by Node if the registry is unavailable. */ }
  const registryValue = (name) => registry.match(new RegExp(`^\\s*${name}\\s+REG_SZ\\s+([^\\r\\n]+)`, 'im'))?.[1]?.trim() || null;
  const build = registryValue('CurrentBuildNumber') || registryValue('CurrentBuild') || releaseMatch?.[1] || null;
  const ubrValue = registry.match(/^\s*UBR\s+REG_DWORD\s+(0x[\da-f]+|\d+)\s*$/im)?.[1];
  const ubr = ubrValue ? Number.parseInt(ubrValue, ubrValue.toLowerCase().startsWith('0x') ? 16 : 10) : null;
  const productName = registryValue('ProductName') || '';
  const edition = productName.match(/\b(Pro|Home|Enterprise|Education)\b/i)?.[1] || '';
  const windowsName = build && Number(build) >= 22000 ? 'Windows 11' : 'Windows 10';
  const version = registryValue('DisplayVersion');
  return {
    name: `${windowsName}${edition ? ` ${edition}` : ''}`,
    version,
    build: `${build || 'Unknown'}${Number.isFinite(ubr) ? `.${ubr}` : ''}`,
  };
}

function handleDisplayChange() {
  applyWidgetLayout();
  publishDisplays();
}

function publishDisplays() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('monitorstats:displays', listDisplays());
}

function queryPublicIpFamily(family) {
  return queryIpInfo(null, family);
}

function pingDnsServer(address) {
  if (process.platform !== 'win32') return Promise.resolve(null);
  return new Promise((resolve) => {
    let output = '';
    let finished = false;
    const child = spawn('ping.exe', ['-n', '1', '-w', '1500', address], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    const timeout = setTimeout(() => { child.kill(); finish(null); }, 2500);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.on('error', () => finish(null));
    child.on('close', () => {
      const match = output.match(/time\s*[=<]\s*(\d+)\s*ms/i);
      finish(match ? Number(match[1]) : null);
    });
    function finish(value) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve(value);
    }
  });
}

function identifyDnsProvider(address, hostnames, connection) {
  const known = knownDnsProviders.get(address.toLowerCase());
  if (known) return known;
  const hostname = hostnames.find(Boolean)?.replace(/\.$/, '') || '';
  const reverseName = hostname.toLowerCase();
  if (/(^|\.)adguard(-dns)?\.com$/.test(reverseName) || reverseName.includes('adguard')) return 'AdGuard DNS';
  if (reverseName.includes('cloudflare')) return 'Cloudflare DNS';
  if (reverseName.includes('google')) return 'Google DNS';
  if (reverseName.includes('quad9')) return 'Quad9';
  if (reverseName.includes('opendns') || reverseName.includes('cisco')) return 'OpenDNS';
  if (reverseName.includes('nextdns')) return 'NextDNS';
  return connection.org || connection.isp || connection.domain || address;
}

async function refreshDnsResolver() {
  if (isQuitting) return;
  if (dnsResolverLookupInFlight) {
    dnsResolverLookupPending = true;
    return;
  }
  dnsResolverLookupInFlight = true;
  const lookupGeneration = publicNetworkGeneration;
  let dnsLookupTimeout;
  try {
    // Akamai's diagnostic TXT record reveals the public recursive resolver
    // that actually queried it, including a router's upstream/VPN resolver.
    const records = await Promise.race([
      dns.resolveTxt('whoami.ds.akahelp.net'),
      new Promise((_, reject) => { dnsLookupTimeout = setTimeout(() => reject(new Error('DNS lookup timed out')), 8000); }),
    ]);
    if (isQuitting) return;
    const fields = records.flat();
    let resolverIp = null;
    for (let i = 0; i < fields.length; i += 1) {
      const pair = String(fields[i]).match(/^ns\s+(.+)$/i);
      if (pair && net.isIP(pair[1].trim())) { resolverIp = pair[1].trim(); break; }
      if (String(fields[i]).toLowerCase() === 'ns' && net.isIP(String(fields[i + 1] || '').trim())) {
        resolverIp = String(fields[i + 1]).trim();
        break;
      }
    }
    if (lookupGeneration !== publicNetworkGeneration) return;
    if (!resolverIp) throw new Error('DNS resolver was not present in the diagnostic response');

    const [geo, pingMs, hostnames] = await Promise.all([
      queryIpInfo(resolverIp, net.isIP(resolverIp)),
      pingDnsServer(resolverIp),
      dns.reverse(resolverIp).catch(() => []),
    ]);
    if (isQuitting || lookupGeneration !== publicNetworkGeneration) return;
    const connection = geo?.connection || {};
    const resolver = {
      ip: resolverIp,
      name: identifyDnsProvider(resolverIp, hostnames, connection),
      hostname: hostnames[0] || null,
      country: geo?.country || null,
      location: [geo?.city, geo?.region].filter(Boolean).join(', ') || null,
      pingMs,
    };
    publicNetworkDetails = { ...publicNetworkDetails, dnsResolver: resolver };
    if (latestHardwarePayload) sendHardwareStats(latestHardwarePayload);
  } catch {
    if (!isQuitting && lookupGeneration === publicNetworkGeneration) {
      publicNetworkDetails = { ...publicNetworkDetails, dnsResolver: null };
      if (latestHardwarePayload) sendHardwareStats(latestHardwarePayload);
    }
  } finally {
    if (dnsLookupTimeout) clearTimeout(dnsLookupTimeout);
    dnsResolverLookupInFlight = false;
    if (dnsResolverRefreshTimer) clearTimeout(dnsResolverRefreshTimer);
    dnsResolverRefreshTimer = null;
    if (!isQuitting) {
      dnsResolverRefreshTimer = setTimeout(() => {
        dnsResolverRefreshTimer = null;
        refreshDnsResolver();
      }, dnsResolverLookupPending ? 500 : 30 * 60 * 1000);
    }
    dnsResolverLookupPending = false;
  }
}

function getPublicLookupRetryDelay(complete) {
  if (complete) {
    networkChangeRetries = 0;
    return 30 * 60 * 1000;
  }
  if (networkChangeRetries > 0) {
    networkChangeRetries -= 1;
    return 5000;
  }
  return 5 * 60 * 1000;
}

async function refreshPublicNetwork() {
  if (isQuitting) return;
  if (publicLookupInFlight) {
    publicLookupPending = true;
    return;
  }
  publicLookupInFlight = true;
  const lookupGeneration = publicNetworkGeneration;
  try {
    const [v4, v6] = await Promise.all([queryPublicIpFamily(4), queryPublicIpFamily(6)]);
    if (isQuitting || lookupGeneration !== publicNetworkGeneration) return;
    const next = {
      publicIP: v4?.ip || v6?.ip || null,
      publicIPv4: v4?.ip || null,
      publicIPv6: v6?.ip || null,
      provider: v4?.connection?.isp || v6?.connection?.isp || null,
      dnsResolver: publicNetworkDetails.dnsResolver || null,
    };
    const changed = JSON.stringify(next) !== JSON.stringify(publicNetworkDetails);
    publicNetworkDetails = next;
    if (changed && latestHardwarePayload) sendHardwareStats(latestHardwarePayload);
    // Re-read the router WAN address after the current public IP lookup. This
    // keeps VPN transitions from being classified against a stale address.
    setTimeout(refreshRouterNetwork, 300);
    // Retry partial/failed lookups periodically without repeatedly contacting the provider.
    const complete = Boolean(next.publicIPv4 && next.publicIPv6 && next.provider);
    if (publicLookupTimer) clearTimeout(publicLookupTimer);
    publicLookupTimer = null;
    if (!isQuitting) publicLookupTimer = setTimeout(() => {
      publicLookupTimer = null;
      refreshPublicNetwork();
    }, getPublicLookupRetryDelay(complete));
  } catch {
    if (isQuitting) return;
    if (publicLookupTimer) clearTimeout(publicLookupTimer);
    publicLookupTimer = setTimeout(() => {
      publicLookupTimer = null;
      refreshPublicNetwork();
    }, getPublicLookupRetryDelay(false));
  } finally {
    publicLookupInFlight = false;
    if (publicLookupPending && !isQuitting) {
      publicLookupPending = false;
      if (publicLookupTimer) clearTimeout(publicLookupTimer);
      publicLookupTimer = setTimeout(() => {
        publicLookupTimer = null;
        refreshPublicNetwork();
      }, 500);
    }
  }
}

function getNetworkInterfaceFingerprint() {
  const interfaces = os.networkInterfaces();
  return Object.entries(interfaces).flatMap(([name, addresses]) =>
    (addresses || []).map((entry) => `${name}|${entry.family}|${entry.address}|${entry.internal ? 1 : 0}`),
  ).sort().join('\n');
}

function invalidatePublicNetwork() {
  publicNetworkGeneration += 1;
  for (const request of publicLookupRequests) request.destroy();
  publicNetworkDetails = { publicIP: null, publicIPv4: null, publicIPv6: null, provider: null, dnsResolver: null };
  routerNetworkDetails = { ...routerNetworkDetails, routerWanIPv4: null, ipv4Type: null };
  if (latestHardwarePayload) sendHardwareStats(latestHardwarePayload);
}

function checkNetworkInterfaceChange() {
  if (isQuitting) return;
  let nextFingerprint;
  try { nextFingerprint = getNetworkInterfaceFingerprint(); } catch { return; }
  if (networkInterfaceFingerprint === null) {
    networkInterfaceFingerprint = nextFingerprint;
    return;
  }
  if (nextFingerprint === networkInterfaceFingerprint) return;
  networkInterfaceFingerprint = nextFingerprint;
  if (networkChangeDebounceTimer) clearTimeout(networkChangeDebounceTimer);
  if (publicLookupTimer) clearTimeout(publicLookupTimer);
  publicLookupTimer = null;
  networkChangeRetries = 6;
  invalidatePublicNetwork();
  networkChangeDebounceTimer = setTimeout(() => {
    networkChangeDebounceTimer = null;
    if (publicLookupTimer) clearTimeout(publicLookupTimer);
    publicLookupTimer = null;
    refreshPublicNetwork();
    refreshDnsResolver();
    // VPN/router interface changes can briefly interrupt the route to the ONT.
    // Refresh after the same debounce used for IP/DNS so a new route can settle.
    refreshOntOpticalPower();
  }, 700);
}

function publishBestGame() {
  const now = Date.now();
  if (rtssReading && rtssReading.processId === foregroundPid && String(foregroundMonitorNumber) === selectedFpsMonitor && now - rtssReading.at < 2500) {
    sendGameFps({ ...rtssReading, status: 'tracking', source: 'RTSS' });
    return;
  }
  sendGameFps({ fps: null, appName: null, frameTimeMs: null, status: 'no-game' });
}

function startForegroundMonitor() {
  if (process.platform !== 'win32' || isQuitting || foregroundMonitor) return;
  const readerPath = app.isPackaged
    ? path.join(process.resourcesPath, 'ForegroundMonitor.exe')
    : path.join(__dirname, 'ForegroundMonitor.exe');
  if (!fsSync.existsSync(readerPath)) return;
  foregroundMonitor = spawn(readerPath, ['1000'], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const monitor = foregroundMonitor;
  foregroundMonitor.on('error', () => {});
  let pidBuffer = '';
  foregroundMonitor.stdout.setEncoding('utf8');
  foregroundMonitor.stdout.on('data', (chunk) => {
    pidBuffer += chunk;
    const lines = pidBuffer.split(/\r?\n/);
    pidBuffer = lines.pop() || '';
    for (const line of lines) {
      const [pidText, monitorText, fpsText, frameTimeText, t0Text, t1Text, framesText, processName = ''] = line.trim().split(',');
      const pid = Number(pidText);
      if (!Number.isInteger(pid) || pid < 0) continue;
      if (pid === 0) {
        foregroundPid = null;
        continue;
      }
      const detectedMonitorNumber = Number(monitorText);
      foregroundMonitorNumber = Number.isInteger(detectedMonitorNumber) && detectedMonitorNumber > 0 ? detectedMonitorNumber : 1;
      const fps = Number(fpsText);
      const frameTimeMs = Number(frameTimeText);
      const signature = `${pid}:${t0Text}:${t1Text}:${framesText}`;
      if (fps >= 1 && fps <= 1000 && frameTimeMs > 0 && frameTimeMs <= 1000 && signature !== lastRtsSampleSignature) {
        rtssReading = { processId: pid, fps, frameTimeMs: Number(frameTimeMs.toFixed(2)), appName: processName || null, at: Date.now() };
        lastRtsSampleSignature = signature;
      }
      const ownPids = ownProcessIds();
      if (!ownPids.has(pid)) foregroundPid = pid;
      else foregroundPid = null;
    }
  });
  foregroundMonitor.on('close', () => {
    if (foregroundMonitor !== monitor) return;
    foregroundMonitor = null;
    foregroundPid = null;
    rtssReading = null;
    lastRtsSampleSignature = '';
    if (isQuitting || foregroundMonitorRestartTimer) return;
    foregroundMonitorRestartTimer = setTimeout(() => {
      foregroundMonitorRestartTimer = null;
      startForegroundMonitor();
    }, 5000);
  });
}

function createWindow() {
  const display = resolveWidgetDisplay();
  const area = display.workArea;
  const width = area.width;

  const window = new BrowserWindow({
    x: area.x,
    y: area.y,
    width,
    height: area.height,
    minWidth: 320,
    minHeight: 320,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    title: 'MonitorStats Widget',
    icon: path.join(__dirname, '..', 'assets', 'monitorstats.ico'),
    backgroundColor: '#06070a',
    hasShadow: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  mainWindow = window;

  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });

  window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  window.webContents.once('did-finish-load', () => {
    if (window.isDestroyed()) return;
    applyWidgetLayout();
    window.showInactive();
    if (latestHardwareStats) sendHardwareStats(latestHardwareStats);
    if (latestGameFps) window.webContents.send('monitorstats:game-fps', latestGameFps);
  });
  return window;
}

function startHardwareCollector() {
  if (process.platform !== 'win32' || isQuitting) return;
  // PowerShell cannot open a .ps1 through Electron's virtual app.asar path.
  // electron-builder copies this read-only probe to resources/telemetry.ps1.
  const scriptPath = app.isPackaged
    ? path.join(process.resourcesPath, 'telemetry.ps1')
    : path.join(__dirname, 'telemetry.ps1');
  if (!fsSync.existsSync(scriptPath)) {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('monitorstats:hardware-error');
    return;
  }
  hardwareCollector = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-IntervalMs', String(hardwarePollingIntervalMs)], {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let outputBuffer = '';
  hardwareCollector.stdout.setEncoding('utf8');
  hardwareCollector.stdout.on('data', (chunk) => {
    outputBuffer += chunk;
    const lines = outputBuffer.split(/\r?\n/);
    outputBuffer = lines.pop() || '';
    for (const line of lines) {
      try {
        const payload = JSON.parse(line);
        if (payload && payload.error) {
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('monitorstats:hardware-error');
        } else if (payload && payload.cpu && payload.ram && payload.gpu && payload.network) {
          sendHardwareStats(payload);
          if (hardwareRefreshInProgress) setHardwareRefreshState(false);
        }
      } catch { /* Ignore incomplete PowerShell output lines. */ }
    }
  });
  hardwareCollector.on('error', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('monitorstats:hardware-error');
  });
  hardwareCollector.on('close', () => {
    hardwareCollector = null;
    if (hardwareRefreshInProgress && !isQuitting) setHardwareRefreshState(false);
    if (!isQuitting) {
      const delay = hardwareCollectorRestartDelayMs;
      hardwareCollectorRestartDelayMs = 5000;
      if (hardwareCollectorRestartTimer) clearTimeout(hardwareCollectorRestartTimer);
      hardwareCollectorRestartTimer = setTimeout(() => {
        hardwareCollectorRestartTimer = null;
        startHardwareCollector();
      }, delay);
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'monitorstats.ico');
  tray = new Tray(nativeImage.createFromPath(iconPath));
  tray.setToolTip('MonitorStats Widget');
  const toggleWidget = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) mainWindow.hide();
    else {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.showInactive();
      if (latestHardwareStats) mainWindow.webContents.send('monitorstats:hardware', latestHardwareStats);
      if (latestGameFps) mainWindow.webContents.send('monitorstats:game-fps', latestGameFps);
    }
  };
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show / Hide MonitorStats', click: toggleWidget },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
  tray.on('click', toggleWidget);
}

ipcMain.on('monitorstats:set-run-at-startup', (_event, enabled) => {
  if (typeof enabled === 'boolean' && process.platform === 'win32') {
    app.setLoginItemSettings({ openAtLogin: enabled });
  }
});

ipcMain.on('monitorstats:set-fps-monitor', (_event, monitor) => {
  selectedFpsMonitor = typeof monitor === 'string' && /^\d+$/.test(monitor) ? monitor : '1';
});

ipcMain.on('monitorstats:set-polling-interval', (_event, intervalMs) => {
  if (!allowedPollingIntervals.has(intervalMs) || intervalMs === hardwarePollingIntervalMs) return;
  hardwarePollingIntervalMs = intervalMs;
  restartHardwareCollector(250);
  if (fanControlCollector && !fanControlCollector.killed) {
    fanControlCollectorRestartDelayMs = 250;
    fanControlCollector.kill();
  }
});

ipcMain.on('monitorstats:refresh-hardware', () => {
  if (hardwareRefreshInProgress) return;
  setHardwareRefreshState(true);
  restartHardwareCollector(150);
  refreshPublicNetwork();
  refreshDnsResolver();
  refreshOntOpticalPower();
});

ipcMain.handle('monitorstats:get-displays', () => listDisplays());
ipcMain.handle('monitorstats:get-app-version', () => app.getVersion());
ipcMain.handle('monitorstats:get-windows-build-info', () => getWindowsBuildInfo());
ipcMain.handle('monitorstats:toggle-window-maximized', () => toggleWidgetMaximized());
ipcMain.handle('monitorstats:check-for-updates', () => checkLatestRelease());
ipcMain.handle('monitorstats:open-latest-release', () => shell.openExternal(GITHUB_RELEASES_LATEST_PAGE));
ipcMain.handle('monitorstats:get-ont-config', async () => {
  await loadOntConfig();
  return {
    endpoint: ontOpticalEndpoint || '',
    username: ontUsername || '',
    configured: Boolean(ontOpticalEndpoint && ontUsername && ontPassword),
  };
});
ipcMain.handle('monitorstats:save-ont-config', (_event, config) => saveOntConfig(config));

ipcMain.on('monitorstats:minimize-window', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
});

ipcMain.on('monitorstats:set-widget-layout', (_event, layout) => {
  if (!layout || typeof layout !== 'object') return;
  const validIds = new Set(screen.getAllDisplays().map((display) => String(display.id)));
  const displayId = typeof layout.displayId === 'string' && validIds.has(layout.displayId) ? layout.displayId : '';
  widgetLayout = {
    displayId,
    fillDisplay: layout.fillDisplay !== false,
    displayPosition: ['left', 'center', 'right'].includes(layout.displayPosition) ? layout.displayPosition : 'center',
    widthPercent: Math.max(40, Math.min(100, Number(layout.widthPercent) || 75)),
    heightPercent: Math.max(40, Math.min(100, Number(layout.heightPercent) || 75)),
    autoScale: layout.autoScale !== false,
    scalePercent: Math.max(70, Math.min(130, Number(layout.scalePercent) || 100)),
  };
  windowMaximizeOverride = null;
  applyWidgetLayout();
});

if (!hasSingleInstanceLock) app.quit();
else app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.showInactive();
});

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;
  await loadOntConfig();
  createWindow();
  createTray();
  startForegroundMonitor();
  startHardwareCollector();
  refreshPublicNetwork();
  refreshDnsResolver();
  refreshOntOpticalPower();
  networkInterfaceMonitor = setInterval(checkNetworkInterfaceChange, 1000);
  checkNetworkInterfaceChange();
  gamePublishTimer = setInterval(publishBestGame, 1000);
  screen.on('display-added', handleDisplayChange);
  screen.on('display-removed', handleDisplayChange);
  screen.on('display-metrics-changed', handleDisplayChange);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  if (publicLookupTimer) clearTimeout(publicLookupTimer);
  if (dnsResolverRefreshTimer) clearTimeout(dnsResolverRefreshTimer);
  if (ontOpticalRefreshTimer) clearTimeout(ontOpticalRefreshTimer);
  if (routerRefreshTimer) clearTimeout(routerRefreshTimer);
  if (networkChangeDebounceTimer) clearTimeout(networkChangeDebounceTimer);
  if (networkInterfaceMonitor) clearInterval(networkInterfaceMonitor);
  if (gamePublishTimer) clearInterval(gamePublishTimer);
  if (fanControlCollectorRestartTimer) clearTimeout(fanControlCollectorRestartTimer);
  if (foregroundMonitorRestartTimer) clearTimeout(foregroundMonitorRestartTimer);
  for (const request of publicLookupRequests) request.destroy();
  for (const request of updateCheckRequests) request.destroy();
  if (hardwareCollectorRestartTimer) clearTimeout(hardwareCollectorRestartTimer);
  if (hardwareRefreshTimeout) clearTimeout(hardwareRefreshTimeout);
  if (foregroundMonitor && !foregroundMonitor.killed) foregroundMonitor.kill();
  if (hardwareCollector && !hardwareCollector.killed) hardwareCollector.kill();
  if (fanControlCollector && !fanControlCollector.killed) fanControlCollector.kill();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
