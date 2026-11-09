$ErrorActionPreference = 'Stop'
$compilerCandidates = @(
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
  (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compiler) { throw 'The .NET Framework C# compiler was not found.' }

$source = Join-Path $PSScriptRoot 'FanControlReader.cs'
$output = Join-Path $PSScriptRoot 'FanControlReader.exe'
& $compiler /nologo /target:exe "/out:$output" /r:System.Web.Extensions.dll $source
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
