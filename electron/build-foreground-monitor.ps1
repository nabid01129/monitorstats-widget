$ErrorActionPreference = 'Stop'
$compilerCandidates = @(
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compiler) { throw 'The .NET Framework C# compiler was not found.' }
$source = Join-Path $PSScriptRoot 'ForegroundMonitor.cs'
$output = Join-Path $PSScriptRoot 'ForegroundMonitor.exe'
& $compiler /nologo /target:exe "/out:$output" /r:System.Windows.Forms.dll $source
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
