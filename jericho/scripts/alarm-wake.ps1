# Run by the "Jericho Alarm <id>" scheduled tasks, about 2 minutes before an alarm.
# It only does two things: starts the Jericho server if it isn't running, and opens the
# Jericho page in the default browser. It takes no input and contains no secrets.
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$port = 3000
try { $port = [int]((Get-Content -Raw (Join-Path $root 'settings.json') | ConvertFrom-Json).port) } catch { }
$url = "http://localhost:$port/"

function Test-Jericho {
  try { Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 | Out-Null; return $true } catch { return $false }
}

if (-not (Test-Jericho)) {
  # npm start, in its own minimized window, from the jericho folder
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm', 'start' -WorkingDirectory $root -WindowStyle Minimized
  for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Jericho) { break }
  }
}

Start-Process ($url + '?alarm=1')
