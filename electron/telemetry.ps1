param(
  [switch]$Once,
  [ValidateSet(1000, 2000, 3000, 5000, 10000)]
  [int]$IntervalMs = 3000
)

$ErrorActionPreference = 'SilentlyContinue'
try { [Diagnostics.Process]::GetCurrentProcess().PriorityClass = [Diagnostics.ProcessPriorityClass]::BelowNormal } catch { }
$invariant = [Globalization.CultureInfo]::InvariantCulture

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
public static class MonitorStatsMemory {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  public struct StatusEx {
    public uint Length; public uint Load; public ulong TotalPhys; public ulong AvailPhys;
    public ulong TotalPageFile; public ulong AvailPageFile; public ulong TotalVirtual;
    public ulong AvailVirtual; public ulong AvailExtendedVirtual;
  }
  [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
  public static extern bool GlobalMemoryStatusEx(ref StatusEx status);
  public static StatusEx Read() {
    StatusEx status = new StatusEx(); status.Length = (uint)Marshal.SizeOf(typeof(StatusEx));
    GlobalMemoryStatusEx(ref status); return status;
  }
  public static ProcessSnapshot ReadProcesses() {
    Process[] processes;
    try { processes = Process.GetProcesses(); } catch { return new ProcessSnapshot(); }
    var totals = new Dictionary<string, long>(StringComparer.OrdinalIgnoreCase);
    foreach (Process process in processes) {
      try {
        string name = process.ProcessName;
        long bytes = process.WorkingSet64;
        long previous;
        totals.TryGetValue(name, out previous);
        totals[name] = previous + Math.Max(0, bytes);
      } catch { } finally { process.Dispose(); }
    }
    return new ProcessSnapshot {
      Count = processes.Length,
      Top = totals.OrderByDescending(item => item.Value).Take(5)
        .Select(item => new ProcessMemoryItem { Name = item.Key, WorkingSetBytes = item.Value }).ToArray()
    };
  }
}
public sealed class ProcessSnapshot {
  public int Count { get; set; }
  public ProcessMemoryItem[] Top { get; set; }
  public ProcessSnapshot() { Count = 0; Top = new ProcessMemoryItem[0]; }
}
public sealed class ProcessMemoryItem {
  public string Name { get; set; }
  public long WorkingSetBytes { get; set; }
}
'@ | Out-Null

# Read-only NVMe SMART/health log query via Windows storage protocol pass-through.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MonitorStatsNvmeSmart {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern IntPtr CreateFile(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool DeviceIoControl(IntPtr handle, uint code, byte[] input, uint inputLength, byte[] output, uint outputLength, out uint returned, IntPtr overlapped);
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool CloseHandle(IntPtr handle);

  // Returns temperature C, percentage used, data units written, power-on hours, critical warnings.
  public static double[] Read(int diskNumber) {
    IntPtr handle = CreateFile("\\\\.\\PhysicalDrive" + diskNumber, 0, 3, IntPtr.Zero, 3, 0, IntPtr.Zero);
    if (handle == new IntPtr(-1)) return null;
    try {
      byte[] buffer = new byte[560];
      BitConverter.GetBytes(50).CopyTo(buffer, 0); // StorageDeviceProtocolSpecificProperty
      BitConverter.GetBytes(0).CopyTo(buffer, 4); // PropertyStandardQuery
      BitConverter.GetBytes(3).CopyTo(buffer, 8); // ProtocolTypeNvme
      BitConverter.GetBytes(2).CopyTo(buffer, 12); // NVMeDataTypeLogPage
      BitConverter.GetBytes(2).CopyTo(buffer, 16); // SMART/health information log page
      BitConverter.GetBytes(40).CopyTo(buffer, 24); // data offset within protocol descriptor
      BitConverter.GetBytes(512).CopyTo(buffer, 28);
      uint returned;
      if (!DeviceIoControl(handle, 0x002D1400, buffer, (uint)buffer.Length, buffer, (uint)buffer.Length, out returned, IntPtr.Zero)) return null;
      int data = 48;
      if (returned < data + 192) return null;
      int kelvin = BitConverter.ToUInt16(buffer, data + 1);
      double temperature = kelvin >= 273 && kelvin < 700 ? kelvin - 273.15 : -1;
      double used = buffer[data + 5]; // NVMe Percentage Used can legitimately exceed 100.
      ulong low = BitConverter.ToUInt64(buffer, data + 48);
      ulong high = BitConverter.ToUInt64(buffer, data + 56);
      double dataUnitsWritten = low + high * 18446744073709551616.0;
      ulong powerOnHours = BitConverter.ToUInt64(buffer, data + 128);
      double criticalWarnings = buffer[data];
      return new double[] { temperature, used, dataUnitsWritten, powerOnHours, criticalWarnings };
    } finally { CloseHandle(handle); }
  }

}
'@ | Out-Null

function Convert-Number($value) {
  if ($null -eq $value) { return $null }
  $parsed = 0.0
  if ([double]::TryParse([string]$value, [Globalization.NumberStyles]::Float, $invariant, [ref]$parsed)) { return $parsed }
  return $null
}

function Round-Value($value, $digits = 1) {
  if ($null -eq $value) { return $null }
  return [Math]::Round([double]$value, $digits)
}

function Get-SafeCim($className, $filter = $null) {
  try {
    if ($filter) { return @(Get-CimInstance -ClassName $className -Filter $filter -ErrorAction Stop) }
    return @(Get-CimInstance -ClassName $className -ErrorAction Stop)
  } catch { return @() }
}

function Get-ReliabilityCounter($physicalDisk) {
  if (-not $physicalDisk) { return $null }
  try { return Get-StorageReliabilityCounter -PhysicalDisk $physicalDisk -ErrorAction Stop | Select-Object -First 1 }
  catch { return $null }
}

# Hardware identity is collected once at startup. The actual usage and counter
# values below are sampled continuously, so display names do not depend on the
# optional sensor applications being available.
$processors = Get-SafeCim 'Win32_Processor'
$processor = $processors | Select-Object -First 1
$memoryModules = Get-SafeCim 'Win32_PhysicalMemory'
$videoControllers = Get-SafeCim 'Win32_VideoController'
$memoryTypes = @{
  20 = 'DDR'; 21 = 'DDR2'; 22 = 'DDR2 FB-DIMM'; 24 = 'DDR3'; 26 = 'DDR4'
  27 = 'LPDDR'; 28 = 'LPDDR2'; 29 = 'LPDDR3'; 30 = 'LPDDR4'; 32 = 'HBM'; 33 = 'HBM2'
  34 = 'DDR5'; 35 = 'LPDDR5'; 36 = 'HBM3'
}
$ramGeneration = 'Memory generation unavailable'
$ramStickCount = 0
$ramStickCapacitiesGB = @()
$ramSpeedMTs = $null
$ramChannelMode = 'Channel mode not reported'
$ramSpec = 'Installed memory'
if ($memoryModules.Count -gt 0) {
  $ramStickCount = $memoryModules.Count
  $moduleSizes = @($memoryModules | ForEach-Object { [double]$_.Capacity / 1GB })
  $capacity = ($moduleSizes | Measure-Object -Sum).Sum
  $ramStickCapacitiesGB = @($moduleSizes | ForEach-Object { [Math]::Round($_, 2) })

  $generationNames = @($memoryModules | ForEach-Object {
    $typeCode = [int]$_.SMBIOSMemoryType
    if ($memoryTypes.ContainsKey($typeCode)) { $memoryTypes[$typeCode] }
  } | Where-Object { $_ } | Sort-Object -Unique)
  if ($generationNames.Count -eq 1) { $ramGeneration = $generationNames[0] }
  elseif ($generationNames.Count -gt 1) { $ramGeneration = $generationNames -join ' / ' }

  # ConfiguredClockSpeed is the active SMBIOS speed; Speed is the module's
  # nominal speed and is used only on Windows versions that omit the former.
  $moduleSpeeds = @($memoryModules | ForEach-Object {
    $configuredSpeed = [int]$_.ConfiguredClockSpeed
    if ($configuredSpeed -gt 0) { $configuredSpeed } else { [int]$_.Speed }
  } | Where-Object { $_ -gt 0 } | Sort-Object -Unique)
  if ($moduleSpeeds.Count -eq 1) { $ramSpeedMTs = $moduleSpeeds[0] }

  # Prefer explicit motherboard channel labels. Fall back to populated
  # SMBIOS interleave positions, and report unknown rather than guessing.
  $channelIds = @($memoryModules | ForEach-Object {
    $match = [regex]::Match([string]$_.DeviceLocator, '(?i)\bchannel[\s_-]*([a-z0-9]+)')
    if ($match.Success) { $match.Groups[1].Value.ToUpperInvariant() }
  } | Where-Object { $_ } | Sort-Object -Unique)
  if ($channelIds.Count -gt 0) {
    $channelCount = $channelIds.Count
  } else {
    $interleavePositions = @($memoryModules | ForEach-Object { [int]$_.InterleavePosition } | Where-Object { $_ -gt 0 } | Sort-Object -Unique)
    $interleaveDepths = @($memoryModules | ForEach-Object { [int]$_.InterleaveDataDepth } | Where-Object { $_ -gt 0 } | Sort-Object -Unique)
    $channelCount = if ($interleaveDepths.Count -gt 0 -and $interleavePositions.Count -gt 1) { $interleavePositions.Count } else { 0 }
  }
  if ($channelCount -gt 0) {
    $channelLabel = switch ($channelCount) {
      1 { 'Single channel' }
      2 { 'Dual channel' }
      3 { 'Triple channel' }
      4 { 'Quad channel' }
      default { '{0}-channel' -f $channelCount }
    }
    $ramChannelMode = $channelLabel
  }
  $ramSpec = '{0} - {1}' -f $ramGeneration, $ramChannelMode
}
$gpuController = $videoControllers | Where-Object { $_.Name -notmatch 'Basic Display|Remote Display|Virtual Display' } | Sort-Object { if ($_.Name -match 'NVIDIA') { 0 } else { 1 } } | Select-Object -First 1
$gpuName = if ($gpuController) { [string]$gpuController.Name } else { 'Graphics device not detected' }
$nvidiaSmi = (Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue).Source
if (-not $nvidiaSmi) {
  $candidate = Join-Path $env:ProgramFiles 'NVIDIA Corporation\NVSMI\nvidia-smi.exe'
  if (Test-Path -LiteralPath $candidate) { $nvidiaSmi = $candidate }
}
$script:nvidiaSmiData = $null
$script:nvidiaSmiLastRead = [DateTime]::MinValue
$script:networkInfo = @{ name = 'No active network'; adapter = $null; interfaceName = $null; localIP = $null; gateway = $null; dns = @(); linkSpeed = $null; profile = $null }
$script:lastNetworkSample = $null
function Update-NetworkInventory {
  $activeConfig = @(Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' } | Sort-Object { if ($_.IPv4DefaultGateway -or $_.IPv6DefaultGateway) { 0 } else { 1 } }) | Select-Object -First 1
  if (-not $activeConfig) {
    $adapter = Get-SafeCim 'Win32_NetworkAdapterConfiguration' 'IPEnabled=True' | Select-Object -First 1
    if ($adapter) {
      $script:networkInfo = @{ name = [string]$adapter.Description; adapter = [string]$adapter.Description; interfaceName = $null; localIP = @($adapter.IPAddress | Where-Object { $_ -notmatch ':' } | Select-Object -First 1)[0]; gateway = [string](@($adapter.DefaultIPGateway)[0]); dns = @($adapter.DNSServerSearchOrder); linkSpeed = $null; profile = $null }
    }
    return
  }
  $netAdapter = $activeConfig.NetAdapter
  $profile = Get-NetConnectionProfile -InterfaceIndex $netAdapter.ifIndex | Select-Object -First 1
  $addresses = @($activeConfig.IPv4Address | ForEach-Object { $_.IPAddress })
  if ($addresses.Count -eq 0) { $addresses = @($activeConfig.IPv6Address | ForEach-Object { $_.IPAddress }) }
  $gateway = if ($activeConfig.IPv4DefaultGateway) { [string]$activeConfig.IPv4DefaultGateway.NextHop } elseif ($activeConfig.IPv6DefaultGateway) { [string]$activeConfig.IPv6DefaultGateway.NextHop } else { $null }
  $script:networkInfo = @{
    name = if ($profile -and $profile.Name) { [string]$profile.Name } else { [string]$netAdapter.Name }
    adapter = [string]$netAdapter.InterfaceDescription
    interfaceName = [string]$netAdapter.Name
    localIP = [string](@($addresses | Select-Object -First 1)[0])
    gateway = $gateway
    dns = @($activeConfig.DnsServer.ServerAddresses)
    linkSpeed = if ($netAdapter.LinkSpeed) { [string]$netAdapter.LinkSpeed } else { $null }
    profile = if ($profile) { [string]$profile.NetworkCategory } else { $null }
  }
}

# Read MSI Afterburner's documented MAHM v2 shared-memory table when it is
# running. Sensor polling stays in Afterburner; this process only reads values.
$script:mahMap = $null
$script:mahView = $null
$script:mahAscii = [Text.Encoding]::ASCII
$script:mahNameBytes = New-Object byte[] 260
$script:mahUnitBytes = New-Object byte[] 260
$lastMahmAttempt = [DateTime]::MinValue
$afterburnerCpuLoad = $null
$afterburnerCores = @()
function Close-MahmMap {
  if ($script:mahView) { $script:mahView.Dispose(); $script:mahView = $null }
  if ($script:mahMap) { $script:mahMap.Dispose(); $script:mahMap = $null }
}
function Open-MahmMap {
  try {
    Close-MahmMap
    $script:mahMap = [IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting('MAHMSharedMemory', [IO.MemoryMappedFiles.MemoryMappedFileRights]::Read)
    $script:mahView = $script:mahMap.CreateViewAccessor(0, 0, [IO.MemoryMappedFiles.MemoryMappedFileAccess]::Read)
    if ($script:mahView.ReadUInt32(0) -ne 0x4D41484D -or $script:mahView.ReadUInt32(4) -lt 0x00020000) { Close-MahmMap }
  } catch { Close-MahmMap }
}
function Get-MahmData {
  if (-not $script:mahView) { return @() }
  try {
    $headerSize = [int]$script:mahView.ReadUInt32(8)
    $entryCount = [Math]::Min(512, [int]$script:mahView.ReadUInt32(12))
    $entrySize = [int]$script:mahView.ReadUInt32(16)
    if ($headerSize -lt 28 -or $entrySize -lt 1324 -or $entryCount -lt 1) { Close-MahmMap; return @() }
    $results = [Collections.Generic.List[object]]::new()
    for ($i = 0; $i -lt $entryCount; $i++) {
      $offset = [long]$headerSize + ([long]$i * $entrySize)
      [void]$script:mahView.ReadArray($offset, $script:mahNameBytes, 0, 260)
      [void]$script:mahView.ReadArray($offset + 260, $script:mahUnitBytes, 0, 260)
      $name = $script:mahAscii.GetString($script:mahNameBytes).Trim([char]0, ' ')
      $units = $script:mahAscii.GetString($script:mahUnitBytes).Trim([char]0, ' ')
      $value = [double]$script:mahView.ReadSingle($offset + 1300)
      if (-not $name -or [double]::IsNaN($value) -or [double]::IsInfinity($value) -or [Math]::Abs($value) -ge 3.0e+38) { continue }
      $gpuIndex = [uint32]$script:mahView.ReadUInt32($offset + 1316)
      if ($gpuIndex -ne [uint32]::MaxValue -and $gpuIndex -lt 16 -and $name -notmatch '^GPU\d+') { $name = "GPU$($gpuIndex + 1) $name" }
      $results.Add([pscustomobject]@{ Name = $name; Units = $units; Value = $value; Gpu = $gpuIndex })
    }
    return $results.ToArray()
  } catch { Close-MahmMap; return @() }
}

function Update-StorageInventory {
  $script:storageDisks = @(Get-Disk)
  $script:physicalDisks = @(Get-PhysicalDisk)
  $script:partitions = @(Get-Partition | Where-Object { $_.DriveLetter })
  $script:wmiDisks = Get-SafeCim 'Win32_DiskDrive'
  $script:volumes = Get-SafeCim 'Win32_LogicalDisk' 'DriveType=3'
  # Cache SMART reads with disk inventory; live counters continue at the selected polling rate.
  $script:smartByDisk = @{}
  foreach ($physicalDisk in $script:storageDisks) {
    $diskNumber = [int]$physicalDisk.Number
    $physical = $script:physicalDisks | Where-Object { [string]$_.DeviceId -eq [string]$diskNumber } | Select-Object -First 1
    $busType = [string]$physicalDisk.BusType
    $script:smartByDisk[$diskNumber] = @{
      reliability = Get-ReliabilityCounter $physical
      nvme = if ($busType -eq 'NVMe') { [MonitorStatsNvmeSmart]::Read($diskNumber) } else { $null }
      ata = $null
    }
  }
  Update-NetworkInventory
  $script:lastStorageScan = [DateTime]::Now
}
$script:processSnapshot = @{ count = $null; top = @() }
$script:lastProcessSnapshot = [DateTime]::MinValue
function Update-ProcessSnapshot {
  try {
    $snapshot = [MonitorStatsMemory]::ReadProcesses()
    if ($snapshot) {
      $script:processSnapshot = @{
        count = [int]$snapshot.Count
        top = @($snapshot.Top | ForEach-Object {
          @{ name = [string]$_.Name; workingSetMB = Round-Value ([double]$_.WorkingSetBytes / 1MB) 1 }
        })
      }
    }
  } catch { }
  $script:lastProcessSnapshot = [DateTime]::Now
}
Update-StorageInventory

# Keep a fixed monotonic polling cadence. The first sample runs immediately;
# anchoring later samples to its start time avoids drift without delaying startup
# or manual refresh when the wall clock is near the next boundary.
$intervalStopwatchTicks = [long][Math]::Max(1, [Math]::Round($IntervalMs * [Diagnostics.Stopwatch]::Frequency / 1000.0))
$nextCycleAt = 0L
$firstCycle = $true

do {
  $cycleStartedAt = [Diagnostics.Stopwatch]::GetTimestamp()
  if (([DateTime]::Now - $script:lastProcessSnapshot).TotalSeconds -ge 5) { Update-ProcessSnapshot }
  if (-not $script:mahView -and ([DateTime]::Now - $lastMahmAttempt).TotalSeconds -ge 5) {
    Open-MahmMap
    $lastMahmAttempt = [DateTime]::Now
  }
  $mahmData = @(Get-MahmData)
  $cpuUsageSensors = [Collections.Generic.List[object]]::new()
  $cpuTempSensors = [Collections.Generic.List[object]]::new()
  $gpuSensorList = [Collections.Generic.List[object]]::new()
  $fanSensorList = [Collections.Generic.List[object]]::new()
  $afterburnerCpuLoad = $null; $afterburnerCpuClock = $null; $afterburnerCpuTemp = $null; $afterburnerCpuPower = $null
  foreach ($sensor in $mahmData) {
    $sensorName = [string]$sensor.Name
    if ($sensorName -match '^CPU( total)? usage$') { if (-not $afterburnerCpuLoad) { $afterburnerCpuLoad = $sensor } }
    elseif ($sensorName -match '^CPU clock$') { if (-not $afterburnerCpuClock) { $afterburnerCpuClock = $sensor } }
    elseif ($sensorName -match '^CPU( package)? temperature$') { if (-not $afterburnerCpuTemp) { $afterburnerCpuTemp = $sensor } }
    elseif ($sensorName -match '^CPU\d+ usage$') { $cpuUsageSensors.Add($sensor) }
    elseif ($sensorName -match '^CPU power$') { if (-not $afterburnerCpuPower) { $afterburnerCpuPower = $sensor } }
    elseif ($sensorName -match '^CPU\d+ temperature$') { $cpuTempSensors.Add($sensor) }
    if ($sensorName -match '^GPU\d* ') { $gpuSensorList.Add($sensor) }
    if ($sensorName -match 'fan' -and $sensor.Units -match 'RPM|%') { $fanSensorList.Add($sensor) }
  }
  $afterburnerCores = @($cpuUsageSensors | Sort-Object { [int]([regex]::Match($_.Name, '^CPU(\d+)').Groups[1].Value) })
  $afterburnerCoreTemps = @($cpuTempSensors | Sort-Object { [int]([regex]::Match($_.Name, '^CPU(\d+)').Groups[1].Value) })
  $gpuSensorData = $gpuSensorList.ToArray()
  $fanData = $fanSensorList.ToArray()
  $memoryStatus = [MonitorStatsMemory]::Read()
  $ramTotal = [double]$memoryStatus.TotalPhys / 1GB
  $ramFree = [double]$memoryStatus.AvailPhys / 1GB
  $ramUsed = [Math]::Max(0, $ramTotal - $ramFree)
  $needCpuCounters = (-not $afterburnerCpuLoad) -or ($afterburnerCores.Count -eq 0)
  $cpuCounters = if ($needCpuCounters) { Get-SafeCim 'Win32_PerfFormattedData_PerfOS_Processor' } else { @() }
  $cpuTotal = $cpuCounters | Where-Object { $_.Name -eq '_Total' } | Select-Object -First 1
  $cpuCores = @($cpuCounters | Where-Object { $_.Name -ne '_Total' } | Sort-Object { [int]$_.Name } | ForEach-Object { [Math]::Max(0, [Math]::Min(100, [double]$_.PercentProcessorTime)) })
  if ($afterburnerCores.Count -gt 0) { $cpuCores = @($afterburnerCores | ForEach-Object { [Math]::Max(0, [Math]::Min(100, $_.Value)) }) }
  $cpuLoad = if ($afterburnerCpuLoad) { $afterburnerCpuLoad.Value } elseif ($cpuTotal) { [double]$cpuTotal.PercentProcessorTime } else { $null }
  # CurrentClockSpeed from the startup inventory is cached and not a live sensor value.
  $cpuClock = if ($afterburnerCpuClock) { [int]$afterburnerCpuClock.Value } else { $null }

  $gpu = [ordered]@{
    model = $gpuName; coreMHz = $null; vramMHz = $null; coreLoadPercent = $null
    vramLoadPercent = $null; tempC = $null; fanPercent = $null; fanRPM = $null; watt = $null
    vramUsedGB = $null; vramTotalGB = $null
  }
  if ($nvidiaSmi -and $gpuName -match 'NVIDIA' -and ([DateTime]::Now - $script:nvidiaSmiLastRead).TotalSeconds -ge 10) {
    $script:nvidiaSmiLastRead = [DateTime]::Now
    $smiLine = & $nvidiaSmi '--query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total,clocks.gr,clocks.mem,power.draw,fan.speed' '--format=csv,noheader,nounits' 2>$null | Select-Object -First 1
    if ($smiLine) { $script:nvidiaSmiData = @($smiLine -split ',\s*') }
  }
  if ($script:nvidiaSmiData -and $script:nvidiaSmiData.Count -ge 9) {
    $smi = $script:nvidiaSmiData
    if ($smi[0]) { $gpu.model = $smi[0].Trim() }
    $gpu.tempC = Convert-Number $smi[1]
    $gpu.coreLoadPercent = Convert-Number $smi[2]
    $usedMB = Convert-Number $smi[3]
    $totalMB = Convert-Number $smi[4]
    $gpu.coreMHz = Convert-Number $smi[5]
    $gpu.vramMHz = Convert-Number $smi[6]
    $gpu.watt = Convert-Number $smi[7]
    $gpu.fanPercent = Convert-Number $smi[8]
    if ($null -ne $usedMB) { $gpu.vramUsedGB = Round-Value ($usedMB / 1024) 2 }
    if ($null -ne $totalMB -and $totalMB -gt 0) { $gpu.vramTotalGB = Round-Value ($totalMB / 1024) 2 }
    if ($null -ne $usedMB -and $null -ne $totalMB -and $totalMB -gt 0) { $gpu.vramLoadPercent = Round-Value (100 * $usedMB / $totalMB) 1 }
  }
  if ($gpuSensorData.Count -gt 0) {
    $gpuUsageSensor = $gpuSensorData | Where-Object { $_.Name -match '^GPU1 usage$' } | Select-Object -First 1
    if (-not $gpuUsageSensor) { $gpuUsageSensor = $gpuSensorData | Where-Object { $_.Name -match '^GPU\d* usage$' } | Select-Object -First 1 }
    $gpuSensors = if ($gpuUsageSensor) { @($gpuSensorData | Where-Object { $_.Gpu -eq $gpuUsageSensor.Gpu }) } else { $gpuSensorData }
    $gpuTempSensor = $gpuSensors | Where-Object { $_.Name -match '^GPU\d* temperature$' } | Select-Object -First 1
    $gpuCoreClockSensor = $gpuSensors | Where-Object { $_.Name -match '^GPU\d* (core )?clock$' } | Select-Object -First 1
    $gpuMemoryClockSensor = $gpuSensors | Where-Object { $_.Name -match '^GPU\d* memory clock$' } | Select-Object -First 1
    $gpuMemorySensor = $gpuSensors | Where-Object { $_.Name -match '^GPU\d* memory usage$' } | Select-Object -First 1
    $gpuFanSensor = $gpuSensors | Where-Object { $_.Name -match '^GPU\d* fan speed$' -and $_.Units -match '%' } | Select-Object -First 1
    $gpuFanRpmSensor = $gpuSensors | Where-Object { $_.Name -match '^GPU\d* fan tachometer$' } | Select-Object -First 1
    if (-not $gpuFanRpmSensor) { $gpuFanRpmSensor = $gpuSensorData | Where-Object { $_.Name -match '^GPU\d* fan tachometer$' } | Select-Object -First 1 }
    $gpuPowerSensor = $gpuSensors | Where-Object { $_.Name -match '^GPU\d* power$' } | Select-Object -First 1
    if ($gpuUsageSensor) { $gpu.coreLoadPercent = [Math]::Max(0, [Math]::Min(100, $gpuUsageSensor.Value)) }
    if ($gpuTempSensor) { $gpu.tempC = $gpuTempSensor.Value }
    if ($gpuCoreClockSensor) { $gpu.coreMHz = $gpuCoreClockSensor.Value }
    if ($gpuMemoryClockSensor) { $gpu.vramMHz = $gpuMemoryClockSensor.Value }
    if ($gpuMemorySensor) {
      $gpu.vramUsedGB = if ($gpuMemorySensor.Units -match 'GB') { Round-Value $gpuMemorySensor.Value 2 } else { Round-Value ($gpuMemorySensor.Value / 1024) 2 }
      if ($null -ne $gpu.vramTotalGB -and $gpu.vramTotalGB -gt 0) { $gpu.vramLoadPercent = Round-Value (100 * $gpu.vramUsedGB / $gpu.vramTotalGB) 1 }
    }
    if ($gpuFanSensor) { $gpu.fanPercent = $gpuFanSensor.Value }
    if ($gpuFanRpmSensor) { $gpu.fanRPM = $gpuFanRpmSensor.Value }
    if ($gpuPowerSensor) { $gpu.watt = $gpuPowerSensor.Value }
  }
  # Query Windows' higher-overhead GPU counters only when neither the NVIDIA
  # driver nor Afterburner supplied GPU load.
  if ($null -eq $gpu.coreLoadPercent) {
    $gpuEngines = Get-SafeCim 'Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine'
    $gpu3d = @($gpuEngines | Where-Object { $_.Name -match 'engtype_3D' })
    if ($gpu3d.Count -gt 0) { $gpu.coreLoadPercent = [Math]::Min(100, [double](($gpu3d | Measure-Object -Property UtilizationPercentage -Maximum).Maximum)) }
  }
  $diskCounters = @{}
  foreach ($counter in (Get-SafeCim 'Win32_PerfFormattedData_PerfDisk_LogicalDisk')) { $diskCounters[[string]$counter.Name] = $counter }
  $drives = @()
  foreach ($volume in $volumes) {
    $letter = [string]$volume.DeviceID
    $partition = $partitions | Where-Object { "$($_.DriveLetter):" -eq $letter } | Select-Object -First 1
    $diskNumber = if ($partition) { [int]$partition.DiskNumber } else { -1 }
    $disk = $storageDisks | Where-Object { [int]$_.Number -eq $diskNumber } | Select-Object -First 1
    $physical = $physicalDisks | Where-Object { [string]$_.DeviceId -eq [string]$diskNumber } | Select-Object -First 1
    $wmiDisk = $wmiDisks | Where-Object { [int]$_.Index -eq $diskNumber } | Select-Object -First 1
    $model = if ($physical -and $physical.FriendlyName) { [string]$physical.FriendlyName } elseif ($disk -and $disk.FriendlyName) { [string]$disk.FriendlyName } elseif ($wmiDisk -and $wmiDisk.Model) { [string]$wmiDisk.Model } else { 'Local volume' }
    $busType = if ($disk) { [string]$disk.BusType } elseif ($physical) { [string]$physical.BusType } else { '' }
    $mediaType = if ($physical) { [string]$physical.MediaType } elseif ($wmiDisk) { [string]$wmiDisk.MediaType } else { '' }
    $smart = if ($script:smartByDisk.ContainsKey($diskNumber)) { $script:smartByDisk[$diskNumber] } else { $null }
    $reliability = if ($smart) { $smart.reliability } else { $null }
    $nvmeSmart = if ($smart) { $smart.nvme } else { $null }
    $ataSmart = $null # SATA pass-through varies by controller; do not infer SMART values from unvalidated layouts.
    $driveType = if ($busType -eq 'NVMe' -or $model -match 'NVMe') { 'NVMe' } elseif ($busType -eq 'USB') { 'External' } elseif ($mediaType -match 'SSD' -or $model -match 'SSD') { 'SSD' } elseif ($mediaType -match 'HDD|Hard Disk' -or $model -match 'HDD') { 'HDD' } else { 'Drive' }
    $totalGB = [double]$volume.Size / 1GB
    $freeGB = [double]$volume.FreeSpace / 1GB
    $usedGB = [Math]::Max(0, $totalGB - $freeGB)
    $counter = $diskCounters[$letter]
    $drives += [ordered]@{
      id = $letter; name = "$model ($letter)"; type = $driveType; letter = $letter
      totalGB = Round-Value $totalGB 1; usedGB = Round-Value $usedGB 1; freeGB = Round-Value $freeGB 1
      loadPercent = if ($totalGB -gt 0) { Round-Value (100 * $usedGB / $totalGB) 1 } else { $null }
      readKBps = if ($counter) { Round-Value ([double]$counter.DiskReadBytesPersec / 1KB) 1 } else { $null }
      writeKBps = if ($counter) { Round-Value ([double]$counter.DiskWriteBytesPersec / 1KB) 1 } else { $null }
      tempC = if ($nvmeSmart -and $nvmeSmart[0] -ge 0) { [int]$nvmeSmart[0] } elseif ($ataSmart -and $ataSmart[0] -ge 0) { [int]$ataSmart[0] } elseif ($reliability -and $reliability.Temperature -gt 0) { [int]$reliability.Temperature } else { $null }
      wearPercent = if ($nvmeSmart -and $nvmeSmart[1] -ge 0) { [int]$nvmeSmart[1] } elseif ($ataSmart -and $ataSmart[1] -ge 0) { [int]$ataSmart[1] } elseif ($reliability -and $null -ne $reliability.Wear -and $reliability.Wear -ge 0) { [int]$reliability.Wear } else { $null }
      powerOnHours = if ($nvmeSmart -and $nvmeSmart[3] -gt 0) { [double]$nvmeSmart[3] } elseif ($ataSmart -and $ataSmart[2] -gt 0) { [double]$ataSmart[2] } elseif ($reliability -and $reliability.PowerOnHours -gt 0) { [double]$reliability.PowerOnHours } else { $null }
      hostWritesTB = if ($nvmeSmart -and $nvmeSmart[2] -ge 0) { Round-Value ($nvmeSmart[2] * 512000 / 1000000000000) 2 } elseif ($ataSmart -and $ataSmart[3] -ge 0) { Round-Value $ataSmart[3] 2 } else { $null }
      health = if ($nvmeSmart -and $nvmeSmart[4] -gt 0) { "Warning (NVMe critical flags: $([int]$nvmeSmart[4]))" } elseif ($nvmeSmart -and $nvmeSmart[1] -ge 100) { "Wear limit reached ($([int]$nvmeSmart[1])% used)" } elseif ($nvmeSmart -and $nvmeSmart[1] -ge 0) { "Healthy ($([int](100 - $nvmeSmart[1]))% life remaining)" } elseif ($physical -and $physical.HealthStatus) { [string]$physical.HealthStatus } elseif ($disk -and $disk.HealthStatus) { [string]$disk.HealthStatus } else { $null }
    }
  }

  $receivedBytesPerSecond = $null
  $sentBytesPerSecond = $null
  if ($script:networkInfo.interfaceName) {
    try {
      $netStats = Get-NetAdapterStatistics -Name $script:networkInfo.interfaceName -ErrorAction Stop | Select-Object -First 1
      $sampleAt = [Environment]::TickCount64
      if ($netStats -and $script:lastNetworkSample -and $script:lastNetworkSample.name -eq $script:networkInfo.interfaceName) {
        $elapsedMs = $sampleAt - $script:lastNetworkSample.at
        if ($elapsedMs -gt 0 -and $netStats.ReceivedBytes -ge $script:lastNetworkSample.received -and $netStats.SentBytes -ge $script:lastNetworkSample.sent) {
          $receivedBytesPerSecond = 1000 * ([double]$netStats.ReceivedBytes - $script:lastNetworkSample.received) / $elapsedMs
          $sentBytesPerSecond = 1000 * ([double]$netStats.SentBytes - $script:lastNetworkSample.sent) / $elapsedMs
        }
      }
      if ($netStats) {
        $script:lastNetworkSample = @{ name = $script:networkInfo.interfaceName; at = $sampleAt; received = [double]$netStats.ReceivedBytes; sent = [double]$netStats.SentBytes }
      }
    } catch { $script:lastNetworkSample = $null }
  } else { $script:lastNetworkSample = $null }
  # Some Windows NIC drivers expose interface identity through Get-NetAdapter
  # but fail to return usable cumulative byte counters. Fall back to the matching
  # Windows per-interface performance counter rather than displaying blanks or
  # silently summing unrelated adapters.
  if ($null -eq $receivedBytesPerSecond -or $null -eq $sentBytesPerSecond) {
    $networkCounters = @(Get-SafeCim 'Win32_PerfFormattedData_Tcpip_NetworkInterface' | Where-Object { $_.Name -notmatch 'Loopback|Teredo|isatap' })
    $adapterKey = [regex]::Replace(([string]$script:networkInfo.adapter).ToLowerInvariant(), '[^a-z0-9]', '')
    $matchingCounter = $null
    if ($adapterKey) {
      $matchingCounter = $networkCounters | Where-Object { [regex]::Replace(([string]$_.Name).ToLowerInvariant(), '[^a-z0-9]', '') -eq $adapterKey } | Select-Object -First 1
      if (-not $matchingCounter) {
        $matchingCounter = $networkCounters | Where-Object {
          $counterKey = [regex]::Replace(([string]$_.Name).ToLowerInvariant(), '[^a-z0-9]', '')
          $counterKey.Contains($adapterKey) -or $adapterKey.Contains($counterKey)
        } | Sort-Object { $_.Name.Length } -Descending | Select-Object -First 1
      }
    }
    if (-not $matchingCounter -and $networkCounters.Count -eq 1) { $matchingCounter = $networkCounters[0] }
    if ($matchingCounter) {
      $receivedBytesPerSecond = [double]$matchingCounter.BytesReceivedPersec
      $sentBytesPerSecond = [double]$matchingCounter.BytesSentPersec
    }
  }
  $payload = [ordered]@{
    clock = @{ timestamp = [DateTimeOffset]::Now.ToUnixTimeMilliseconds() }
    cpu = @{
      model = if ($processor) { [string]$processor.Name } else { 'Processor not detected' }
      clockMHz = $cpuClock; tempC = if ($afterburnerCpuTemp) { $afterburnerCpuTemp.Value } else { $null }
      loadPercent = Round-Value $cpuLoad 1; cores = $cpuCores
      powerW = if ($afterburnerCpuPower) { Round-Value $afterburnerCpuPower.Value 1 } else { $null }
      coreTempsC = @($afterburnerCoreTemps | ForEach-Object { Round-Value $_.Value 1 })
    }
    ram = @{
      spec = $ramSpec; generation = $ramGeneration; stickCount = $ramStickCount
      stickCapacitiesGB = @($ramStickCapacitiesGB); speedMTs = $ramSpeedMTs; channelMode = $ramChannelMode
      processCount = $script:processSnapshot.count; topProcesses = @($script:processSnapshot.top)
      totalGB = Round-Value $ramTotal 2; usedGB = Round-Value $ramUsed 2; freeGB = Round-Value $ramFree 2
      loadPercent = if ($null -ne $ramTotal -and $ramTotal -gt 0 -and $null -ne $ramUsed) { Round-Value (100 * $ramUsed / $ramTotal) 1 } else { $null }
    }
    gpu = $gpu; drives = @($drives); fans = @($fanData | ForEach-Object { @{ name = $_.Name; value = Round-Value $_.Value 1; units = $_.Units } }); status = if ($processor -or $ramTotal -gt 0 -or $drives.Count -gt 0) { 'live' } else { 'unavailable' }
    source = if ($mahmData.Count -gt 0) { 'Windows + MSI Afterburner' } else { 'Windows' }
    network = @{
      name = $script:networkInfo.name; adapter = $script:networkInfo.adapter; localIP = $script:networkInfo.localIP
      publicIP = $null; publicIPv4 = $null; publicIPv6 = $null; provider = $null; gateway = $script:networkInfo.gateway
      dns = @($script:networkInfo.dns); linkSpeed = $script:networkInfo.linkSpeed; profile = $script:networkInfo.profile
      inKBps = if ($null -ne $receivedBytesPerSecond) { Round-Value ($receivedBytesPerSecond / 1KB) 1 } else { $null }
      outKBps = if ($null -ne $sentBytesPerSecond) { Round-Value ($sentBytesPerSecond / 1KB) 1 } else { $null }
    }
  }
  $payload | ConvertTo-Json -Depth 6 -Compress

  if ($Once) { break }
  if (([DateTime]::Now - $lastStorageScan).TotalSeconds -ge 30) { Update-StorageInventory }
  $nowTicks = [Diagnostics.Stopwatch]::GetTimestamp()
  if ($firstCycle) {
    # Run the first reading immediately, then measure intervals from its start.
    $nextCycleAt = $cycleStartedAt
    $firstCycle = $false
  }
  $nextCycleAt += $intervalStopwatchTicks
  if ($nextCycleAt -le $nowTicks) {
    # If collection took longer than an interval, skip missed slots instead of
    # running back-to-back scans that would waste CPU and still be stale.
    $missedIntervals = [Math]::Floor(($nowTicks - $nextCycleAt) / [double]$intervalStopwatchTicks) + 1
    $nextCycleAt += [long]($missedIntervals * $intervalStopwatchTicks)
  }
  $remainingTicks = $nextCycleAt - [Diagnostics.Stopwatch]::GetTimestamp()
  $remainingMs = [int][Math]::Floor($remainingTicks * 1000.0 / [Diagnostics.Stopwatch]::Frequency)
  if ($remainingMs -gt 0) { Start-Sleep -Milliseconds $remainingMs }
} while ($true)
