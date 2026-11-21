# Small JPEG thumbnails for the voice pack catalogue. Called by scripts/voicepacks.ts with a list file of
# "<source image>`t<thumbnail>" lines. Windows only (System.Drawing), like the release build.
param([Parameter(Mandatory)][string]$ListFile, [int]$Height = 96)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, [long]82)
foreach ($line in Get-Content -LiteralPath $ListFile) {
  if (-not $line) { continue }
  $src, $dst = $line -split "`t", 2
  $img = [System.Drawing.Image]::FromFile($src)
  try {
    $w = [Math]::Max(1, [int][Math]::Round($img.Width * $Height / $img.Height))
    $bmp = New-Object System.Drawing.Bitmap $w, $Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $w, $Height)
    $g.Dispose()
    $bmp.Save($dst, $codec, $params)
    $bmp.Dispose()
  } finally { $img.Dispose() }
}
