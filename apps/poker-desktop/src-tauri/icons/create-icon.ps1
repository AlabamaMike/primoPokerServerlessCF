# PowerShell script to create Windows icon
# This will be run in the GitHub Actions environment

# Create a simple icon using .NET Framework
Add-Type -AssemblyName System.Drawing

# Create a 256x256 bitmap
$bitmap = New-Object System.Drawing.Bitmap 256, 256

# Create graphics object
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)

# Fill with purple background
$purpleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(107, 70, 193))
$graphics.FillRectangle($purpleBrush, 0, 0, 256, 256)

# Draw "PP" text in gold
$font = New-Object System.Drawing.Font("Arial", 120, [System.Drawing.FontStyle]::Bold)
$goldBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 158, 11))
$stringFormat = New-Object System.Drawing.StringFormat
$stringFormat.Alignment = [System.Drawing.StringAlignment]::Center
$stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
$graphics.DrawString("PP", $font, $goldBrush, 128, 128, $stringFormat)

# Save as PNG first
$bitmap.Save("icon-256.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Create icon
$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$fileStream = [System.IO.File]::Create("icon.ico")
$icon.Save($fileStream)
$fileStream.Close()

# Clean up
$graphics.Dispose()
$bitmap.Dispose()
$purpleBrush.Dispose()
$goldBrush.Dispose()
$font.Dispose()

Write-Host "Icon created successfully"