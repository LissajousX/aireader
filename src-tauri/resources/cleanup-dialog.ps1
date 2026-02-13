# Aireader - Uninstall Cleanup Dialog
# Called by NSIS uninstaller to let user select custom data directories to remove.
# Only shows paths that are OUTSIDE the default app data directory (those are
# already handled by the standard NSIS uninstaller).
#
# Usage: powershell.exe -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden
#        -File cleanup-dialog.ps1 "C:\Users\xxx\AppData\Roaming\com.aireader.app"

param(
    [Parameter(Position=0)]
    [string]$AppDataDir
)

if (-not $AppDataDir -or -not (Test-Path $AppDataDir)) { exit 0 }

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

# ---------------------------------------------------------------------------
# Read cleanup manifest
# ---------------------------------------------------------------------------
$manifestPath = Join-Path $AppDataDir "cleanup-manifest.json"
if (-not (Test-Path $manifestPath)) { exit 0 }

try {
    $raw = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8)
    $manifest = $raw | ConvertFrom-Json
} catch {
    exit 0
}

$appDataNorm = $AppDataDir.TrimEnd('\', '/').ToLower()

# ---------------------------------------------------------------------------
# Collect external paths (not under app_data_dir) that actually exist on disk
# ---------------------------------------------------------------------------
$items = @()
foreach ($p in $manifest.paths) {
    $pathNorm = $p.path.TrimEnd('\', '/').ToLower()
    # Skip paths inside app_data_dir  they are auto-cleaned by NSIS
    if ($pathNorm.StartsWith($appDataNorm + '\') -or $pathNorm -eq $appDataNorm) {
        continue
    }
    if (-not (Test-Path $p.path)) { continue }

    # Calculate directory size
    try {
        $bytes = (Get-ChildItem -LiteralPath $p.path -Recurse -Force -ErrorAction SilentlyContinue |
                  Measure-Object -Property Length -Sum -ErrorAction SilentlyContinue).Sum
        if ($null -eq $bytes) { $bytes = 0 }
    } catch { $bytes = 0 }

    if     ($bytes -ge 1073741824) { $sizeStr = "{0:N1} GB" -f ($bytes / 1073741824) }
    elseif ($bytes -ge 1048576)    { $sizeStr = "{0:N1} MB" -f ($bytes / 1048576) }
    elseif ($bytes -ge 1024)       { $sizeStr = "{0:N1} KB" -f ($bytes / 1024) }
    else                           { $sizeStr = "$bytes B" }

    $items += [PSCustomObject]@{
        Path    = $p.path
        LabelCN = $p.label_cn
        LabelEN = $p.label_en
        Size    = $sizeStr
    }
}

# Nothing to clean outside app_data_dir
if ($items.Count -eq 0) { exit 0 }

# ---------------------------------------------------------------------------
# Build the WinForms dialog
# ---------------------------------------------------------------------------
$rowH       = 56
$panelH     = [Math]::Min($items.Count * $rowH + 12, 300)
$formW      = 580
$pad        = 16

# -- Form ------------------------------------------------------------------
$form = New-Object System.Windows.Forms.Form
$form.Text            = "Aireader"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox     = $false
$form.MinimizeBox     = $false
$form.StartPosition   = "CenterScreen"
$form.TopMost         = $true
$form.Font            = New-Object System.Drawing.Font("Segoe UI", 9)
try { $form.Icon = [System.Drawing.SystemIcons]::Information } catch {}

# -- Header label -----------------------------------------------------------
$y = $pad
$header = New-Object System.Windows.Forms.Label
$header.Location = New-Object System.Drawing.Point($pad, $y)
$header.Size     = New-Object System.Drawing.Size(($formW - $pad * 2), 40)
$header.Text     = "The following data directories are outside the default location`nand will NOT be removed automatically during uninstallation:"
$form.Controls.Add($header)
$y += 44

# -- Checkbox panel ---------------------------------------------------------
$panel = New-Object System.Windows.Forms.Panel
$panel.Location    = New-Object System.Drawing.Point($pad, $y)
$panel.Size        = New-Object System.Drawing.Size(($formW - $pad * 2), $panelH)
$panel.AutoScroll  = $true
$panel.BorderStyle = "FixedSingle"
$panel.BackColor   = [System.Drawing.SystemColors]::Window

$py  = 6
$cbs = @()
foreach ($item in $items) {
    $cb = New-Object System.Windows.Forms.CheckBox
    $cb.Location = New-Object System.Drawing.Point(8, $py)
    $cb.Size     = New-Object System.Drawing.Size(($formW - $pad * 2 - 30), ($rowH - 8))
    $cb.Text     = "$($item.LabelEN) / $($item.LabelCN)`n$($item.Path)    [$($item.Size)]"
    $cb.Tag      = $item.Path
    $cb.Checked  = $false
    $panel.Controls.Add($cb)
    $cbs += $cb
    $py += $rowH
}
$form.Controls.Add($panel)
$y += $panelH + 8

# -- Select-all checkbox ----------------------------------------------------
$selAll = New-Object System.Windows.Forms.CheckBox
$selAll.Location = New-Object System.Drawing.Point($pad, $y)
$selAll.Size     = New-Object System.Drawing.Size(200, 22)
$selAll.Text     = "Select all / 全选"
$selAll.Add_CheckedChanged({
    foreach ($c in $cbs) { $c.Checked = $selAll.Checked }
})
$form.Controls.Add($selAll)
$y += 28

# -- Warning label ----------------------------------------------------------
$warn = New-Object System.Windows.Forms.Label
$warn.Location  = New-Object System.Drawing.Point($pad, $y)
$warn.Size      = New-Object System.Drawing.Size(380, 18)
$warn.Text      = "Checked directories will be permanently deleted"
$warn.ForeColor = [System.Drawing.Color]::FromArgb(200, 60, 20)
$warn.Font      = New-Object System.Drawing.Font("Segoe UI", 8)
$form.Controls.Add($warn)
$y += 24

# -- Buttons ----------------------------------------------------------------
$delBtn = New-Object System.Windows.Forms.Button
$delBtn.Size         = New-Object System.Drawing.Size(100, 30)
$delBtn.Location     = New-Object System.Drawing.Point(($formW - 230), $y)
$delBtn.Text         = "Delete"
$delBtn.DialogResult = [System.Windows.Forms.DialogResult]::OK
$form.Controls.Add($delBtn)

$skipBtn = New-Object System.Windows.Forms.Button
$skipBtn.Size         = New-Object System.Drawing.Size(100, 30)
$skipBtn.Location     = New-Object System.Drawing.Point(($formW - 120), $y)
$skipBtn.Text         = "Skip"
$skipBtn.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($skipBtn)

$form.AcceptButton = $skipBtn   # Enter = Skip (safe default)
$form.CancelButton = $skipBtn
$y += 40

# -- Finalize form size -----------------------------------------------------
$form.ClientSize = New-Object System.Drawing.Size($formW, $y)

# ---------------------------------------------------------------------------
# Show dialog and process result
# ---------------------------------------------------------------------------
$result = $form.ShowDialog()

if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
    foreach ($cb in $cbs) {
        if ($cb.Checked -and $cb.Tag -and (Test-Path $cb.Tag)) {
            try {
                Remove-Item -LiteralPath $cb.Tag -Recurse -Force -ErrorAction Stop
            } catch {
                # silently continue if deletion fails (e.g. permission denied)
            }
        }
    }
}

$form.Dispose()
