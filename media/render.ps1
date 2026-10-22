# Renders the media pages to images with Microsoft Edge (Windows only):
#   powershell -ExecutionPolicy Bypass -File media/render.ps1
# window.png is rendered first, because the social preview shows it.
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
$media = $PSScriptRoot
$installer = Join-Path $media "..\src-tauri\installer"
New-Item -ItemType Directory -Force $installer | Out-Null
$userData = Join-Path $env:TEMP "octavo-media-render"

function Render($page, $w, $h, $out, $scale = 1) {
  $url = "file:///" + (Join-Path $media $page).Replace("\", "/")
  $flags = @("--headless=new", "--disable-gpu", "--hide-scrollbars", "--user-data-dir=$userData", "--force-device-scale-factor=$scale",
    "--window-size=$w,$h", "--virtual-time-budget=5000", "--screenshot=$out", $url)
  Start-Process -FilePath $edge -ArgumentList $flags -Wait -WindowStyle Hidden
}

# NSIS needs 24-bit bitmaps.
function ToBmp($png, $bmp) {
  $src = [System.Drawing.Image]::FromFile($png)
  $dst = New-Object System.Drawing.Bitmap $src.Width, $src.Height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($dst)
  $g.DrawImage($src, 0, 0, $src.Width, $src.Height)
  $g.Dispose(); $src.Dispose()
  $dst.Save($bmp, [System.Drawing.Imaging.ImageFormat]::Bmp)
  $dst.Dispose()
  Remove-Item $png
}

Render "window.html" 1200 760 (Join-Path $media "window.png") 2
Render "social.html" 1280 640 (Join-Path $media "social.png")
Render "social.html" 1280 640 (Join-Path $media "social-2k.png") 2
foreach ($image in @(@("nsis-sidebar", 164, 314), @("nsis-header", 150, 57), @("wix-banner", 493, 58), @("wix-dialog", 493, 312))) {
  $png = Join-Path $installer "$($image[0]).png"
  Render "$($image[0]).html" $image[1] $image[2] $png
  ToBmp $png (Join-Path $installer "$($image[0]).bmp")
}
