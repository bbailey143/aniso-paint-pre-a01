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
Write-Host 'Cloudflare will print the link below. Open it on the iPad.'
Write-Host 'Keep this window open while testing. Press Ctrl+C here when you are done.'
Write-Host ''
& $cloudflared tunnel --url $localUrl
