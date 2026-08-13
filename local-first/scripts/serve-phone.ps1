# Everything needed to open the planner on a phone, in one place.
#
# Run from serve-phone.cmd. It stays in the foreground on purpose: the server
# lives as long as this window is open, and closing the window stops it. That is
# the whole contract, and it is easier to reason about than a background job
# nobody can find later.

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$RuleName = "Smart Planner LAN preview (5175)"

function Write-Step($text) { Write-Host "`n$text" -ForegroundColor Cyan }

# ---- 1. the firewall ------------------------------------------------------
# Windows blocks inbound 5175 on a private network by default, which looks
# exactly like "the server is not running" from a phone. Adding the rule needs
# administrator, so this asks for it rather than failing later with a timeout
# that says nothing about why.
Write-Step "Checking the firewall rule..."
$rule = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($rule) {
  Write-Host "  Already there." -ForegroundColor Green
} else {
  Write-Host "  Missing. Asking for administrator to add it (one time)."
  $inner = "New-NetFirewallRule -DisplayName '$RuleName' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5175 -Profile Private | Out-Null"
  try {
    Start-Process powershell -Verb RunAs -Wait -ArgumentList "-NoProfile", "-Command", $inner
    if (Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue) {
      Write-Host "  Added." -ForegroundColor Green
    } else {
      Write-Host "  Not added. The laptop link will still work; the phone will not." -ForegroundColor Yellow
    }
  } catch {
    Write-Host "  Declined. The laptop link will still work; the phone will not." -ForegroundColor Yellow
  }
}

# ---- 2. the certificate ---------------------------------------------------
# Not security. The database is SQLite in OPFS, browsers only expose OPFS to a
# cross-origin-isolated page, and isolation needs a secure context - which a
# bare http://192.168.x.x is not. Without this the app would run on the phone
# and lose everything on the first refresh.
if (-not (Test-Path "certs/lan.key")) {
  Write-Step "Making a certificate for this network..."
  npm run certs
} else {
  Write-Step "Certificate already present."
}

# ---- 3. the build ---------------------------------------------------------
if (-not (Test-Path "dist/index.html")) {
  Write-Step "Building..."
  npm run build
} else {
  Write-Step "Build already present. Delete local-first\dist to force a rebuild."
}

# ---- 4. the addresses -----------------------------------------------------
Write-Step "Open this on your phone, on the same Wi-Fi:"
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { -not $_.IPAddress.StartsWith("127.") -and -not $_.IPAddress.StartsWith("169.254.") } |
  ForEach-Object {
    $tag = if ($_.InterfaceAlias -match "Wi-Fi|WLAN") { "  <- most likely this one" } else { "" }
    Write-Host ("  https://" + $_.IPAddress + ":5175" + $tag) -ForegroundColor Green
  }
Write-Host "`n  On this laptop:  https://localhost:5175" -ForegroundColor Green
Write-Host "`nThe phone will warn that the certificate is not trusted. That is expected -"
Write-Host "it is self-signed. Tap Advanced, then proceed. Once per device."
Write-Host "`nLeave this window open. Closing it stops the server.`n"

# ---- 5. serve -------------------------------------------------------------
npm run preview:lan
