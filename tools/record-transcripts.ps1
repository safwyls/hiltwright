# Records raw serial transcripts from a running Proffieboard for @hiltwright/core protocol tests.
# Usage: powershell -NoProfile -File tools/record-transcripts.ps1 -Port COM8 -Commands version,battery -OutDir packages/core/test/transcripts
# Each command's exact response bytes (as text, CRLF preserved) are written to <OutDir>/<NN>-<command>.txt
# and an index.json records order, timing and byte counts. One serial session is used for all commands.
param(
  [string]$Port = 'COM8',
  [string[]]$Commands = @('version'),
  [string]$OutDir = 'packages/core/test/transcripts',
  [int]$WaitMs = 1500,
  [int]$Baud = 115200,
  [int]$StartIndex = 1
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $OutDir | Out-Null
$OutDir = (Resolve-Path $OutDir).Path
$p = New-Object System.IO.Ports.SerialPort $Port, $Baud, 'None', 8, 'One'
$p.ReadTimeout = 200
$p.NewLine = "`n"
$p.DtrEnable = $true
$p.RtsEnable = $true
$p.Encoding = [System.Text.Encoding]::GetEncoding('iso-8859-1')  # byte-transparent
$p.Open()
Start-Sleep -Milliseconds 300
try { $null = $p.ReadExisting() } catch {}
$index = @()
$i = $StartIndex
try {
foreach ($cmd in $Commands) {
  $sb = New-Object System.Text.StringBuilder
  $t0 = Get-Date
  $p.Write("$cmd`n")
  $deadline = $t0.AddMilliseconds($WaitMs)
  $lastData = $t0
  while ((Get-Date) -lt $deadline) {
    try {
      $chunk = $p.ReadExisting()
      if ($chunk.Length -gt 0) { $null = $sb.Append($chunk); $lastData = Get-Date; $deadline = (Get-Date).AddMilliseconds(600) }
    } catch {}
    Start-Sleep -Milliseconds 30
  }
  $text = $sb.ToString()
  $safe = ($cmd -replace '[^A-Za-z0-9_.-]', '_')
  $name = ('{0:D2}-{1}.txt' -f $i, $safe)
  [System.IO.File]::WriteAllText((Join-Path $OutDir $name), $text, [System.Text.Encoding]::GetEncoding('iso-8859-1'))
  $index += [pscustomobject]@{ n = $i; command = $cmd; file = $name; bytes = $text.Length; firstByteMs = [int]($lastData - $t0).TotalMilliseconds; lines = ($text -split "`n").Count }
  Write-Host ('{0}  {1,-40} {2,6} bytes  {3,3} lines' -f $name, $cmd, $text.Length, ($text -split "`n").Count)
  $i++
}
} finally { $p.Close(); $p.Dispose() }
$indexPath = Join-Path $OutDir 'index.json'
$existing = @()
if (Test-Path $indexPath) { $existing = @(Get-Content $indexPath -Raw | ConvertFrom-Json) }
($existing + $index) | ConvertTo-Json -Depth 3 | Set-Content -Encoding utf8 $indexPath
