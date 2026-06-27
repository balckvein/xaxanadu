# Generates the XAXANADU launcher icon as PNG mipmaps for the Android app.
# Run: powershell -ExecutionPolicy Bypass -File tools\make-icon.ps1
Add-Type -AssemblyName System.Drawing

function New-Stroke($g, $x1, $y1, $x2, $y2, $color, $w) {
    $pen = New-Object System.Drawing.Pen($color, [single]$w)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($pen, [single]$x1, [single]$y1, [single]$x2, [single]$y2)
    $pen.Dispose()
}

function Make-Icon($size, $path) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    # rounded dark background
    $r = [single]($size * 0.20); $d = $r * 2
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddArc(0, 0, $d, $d, 180, 90)
    $gp.AddArc($size - $d, 0, $d, $d, 270, 90)
    $gp.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
    $gp.AddArc(0, $size - $d, $d, $d, 90, 90)
    $gp.CloseFigure()
    $bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 11, 18, 38))
    $g.FillPath($bg, $gp)
    $border = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(190, 44, 245, 214), [single]($size * 0.03))
    $g.DrawPath($border, $gp)

    # neon "X" with glow (cyan + magenta)
    $a = $size * 0.28; $b = $size * 0.72
    $cyan  = [System.Drawing.Color]::FromArgb(255, 44, 245, 214)
    $mag   = [System.Drawing.Color]::FromArgb(255, 255, 46, 136)
    $cyanG = [System.Drawing.Color]::FromArgb(80, 44, 245, 214)
    $magG  = [System.Drawing.Color]::FromArgb(80, 255, 46, 136)
    New-Stroke $g $a $a $b $b $cyanG ($size * 0.22)
    New-Stroke $g $b $a $a $b $magG  ($size * 0.22)
    New-Stroke $g $a $a $b $b $cyan  ($size * 0.11)
    New-Stroke $g $b $a $a $b $mag   ($size * 0.11)

    $g.Dispose()
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
}

$root = Split-Path -Parent $PSScriptRoot
$res  = Join-Path $root "android\app\src\main\res"
$sizes = @{ "mipmap-mdpi" = 48; "mipmap-hdpi" = 72; "mipmap-xhdpi" = 96; "mipmap-xxhdpi" = 144; "mipmap-xxxhdpi" = 192 }
foreach ($k in $sizes.Keys) {
    $dir = Join-Path $res $k
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    Make-Icon $sizes[$k] (Join-Path $dir "ic_launcher.png")
    Make-Icon $sizes[$k] (Join-Path $dir "ic_launcher_round.png")
    Write-Host "wrote $k ($($sizes[$k])px)"
}
Write-Host "Icon mipmaps generated."
