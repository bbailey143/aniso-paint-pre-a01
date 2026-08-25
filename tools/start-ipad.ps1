[CmdletBinding()]
param(
  [int]$Port = 5173,
  [switch]$Help
)

if ($Help) {
  Write-Host 'Starts a temporary iPad test link for aniso-paint.'
  Write-Host 'Run: npm.cmd run ipad'
  exit 0
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$localUrl = "http://127.0.0.1:$Port"
$cloudflared = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'

if (-not (Test-Path -LiteralPath $cloudflared)) {
  throw 'Cloudflare Tunnel is not installed. Install cloudflared, then run this command again.'
}

try {
  Invoke-WebRequest -UseBasicParsing $localUrl -TimeoutSec 1 | Out-Null
  Write-Host "Using the app server already running at $localUrl."
} catch {
  Write-Host 'Starting the local painting app...'
  Start-Process -FilePath 'npm.cmd' `
    -ArgumentList 'run', 'dev', '--', '--host', '127.0.0.1', '--port', $Port `
    -WorkingDirectory $projectRoot | Out-Null

  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
      Invoke-WebRequest -UseBasicParsing $localUrl -TimeoutSec 1 | Out-Null
      $ready = $true
      break
    } catch {
      # The local server is still starting.
    }
  }
  if (-not $ready) {
    throw "The local app did not start at $localUrl. Run npm.cmd run dev to see its message."
  }
}

Write-Host ''
Write-Host 'Creating a temporary iPad link...'
Write-Host ''

# Cloudflare hands out a different random name every session, and typing one of
# those on an iPad by hand is miserable. Catch the address as it appears and put
# a QR code on screen instead: point the iPad camera at the terminal and tap.
$log = Join-Path $env:TEMP ("aniso-tunnel-" + $PID + ".log")
$errLog = "$log.err"
Remove-Item $log, $errLog -ErrorAction SilentlyContinue

$proc = Start-Process -FilePath $cloudflared `
  -ArgumentList 'tunnel', '--url', $localUrl, '--no-autoupdate' `
  -RedirectStandardOutput $log -RedirectStandardError $errLog `
  -PassThru -NoNewWindow

try {
  $url = $null
  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Milliseconds 500
    $text = ((Get-Content $log, $errLog -Raw -ErrorAction SilentlyContinue) -join "`n")
    $m = [regex]::Match($text, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($m.Success) { $url = $m.Value; break }
    if ($proc.HasExited) { break }
  }

  if (-not $url) {
    Write-Host 'Cloudflare did not hand back a link. Its own output follows:' -ForegroundColor Yellow
    Get-Content $log, $errLog -ErrorAction SilentlyContinue | Select-Object -Last 20
    return
  }

  Write-Host ''
  Write-Host '  Open this on the iPad:' -ForegroundColor Cyan
  Write-Host "  $url" -ForegroundColor White
  Write-Host ''
  try {
    # Not a dependency: npx fetches it once and caches it. If there is no
    # network for that, the address above is still perfectly usable.
    # It reads the text from stdin; passed as an argument it prints nothing.
    $url | & npx.cmd --yes qrcode-terminal
    Write-Host '  ...or point the iPad camera at that square.' -ForegroundColor DarkGray
  } catch {
    Write-Host '  (no QR this time - use the address above)' -ForegroundColor DarkGray
  }
  Write-Host ''
  Write-Host '  WebGPU needs this https:// address. A plain http:// LAN address will not work.' -ForegroundColor DarkGray
  Write-Host '  Keep this window open while testing. Ctrl+C closes the link.' -ForegroundColor DarkGray
  Write-Host ''

  Wait-Process -Id $proc.Id
} finally {
  if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  Remove-Item $log, $errLog -ErrorAction SilentlyContinue
}
