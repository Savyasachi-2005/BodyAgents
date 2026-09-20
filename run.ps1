# -------------------------------------------------------
#  BodyAgents - Start Frontend + Backend
# -------------------------------------------------------
#  Usage:  powershell -ExecutionPolicy Bypass -File .\run.ps1
#  Stop:   Press Ctrl+C in this window (kills both)
# -------------------------------------------------------

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition

# -- Load .env ------------------------------------------
$envFile = Join-Path $root ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "[ERROR] .env file not found at $envFile" -ForegroundColor Red
    Write-Host "  Copy .env.example to .env and fill in your secrets." -ForegroundColor Yellow
    exit 1
}

# Parse .env into a hashtable (skip comments and blanks)
$envVars = @{}
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line -split "=", 2
        if ($parts.Count -eq 2) {
            $envVars[$parts[0].Trim()] = $parts[1].Trim()
        }
    }
}

# Validate required keys
$missing = @()
foreach ($key in @("GROQ_API_KEY", "MONGODB_URI")) {
    if (-not $envVars[$key]) {
        $missing += $key
    }
}
if ($missing.Count -gt 0) {
    Write-Host "[ERROR] Required .env keys are empty: $($missing -join ', ')" -ForegroundColor Red
    Write-Host "  Fill them in: $envFile" -ForegroundColor Yellow
    exit 1
}

$apiHost = if ($envVars["API_HOST"]) { $envVars["API_HOST"] } else { "0.0.0.0" }
$apiPort = if ($envVars["API_PORT"]) { $envVars["API_PORT"] } else { "8000" }

# -- Backend (FastAPI via uvicorn) ----------------------
$backendDir = Join-Path $root "backend"
$venvPython = Join-Path $backendDir ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    Write-Host "[ERROR] Backend venv not found at $venvPython" -ForegroundColor Red
    Write-Host "  Run:  cd backend && python -m venv .venv && .venv\Scripts\pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}

Write-Host "[STARTING] Backend (FastAPI)..." -ForegroundColor Cyan
$backend = Start-Process -NoNewWindow -PassThru -FilePath $venvPython `
    -ArgumentList "-m", "uvicorn", "app.main:app", "--reload", "--host", $apiHost, "--port", $apiPort `
    -WorkingDirectory $backendDir

# -- Frontend (Vinext / Next.js dev server) -------------
$frontendDir = Join-Path $root "frontend"

if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Host "[INSTALL] Installing frontend dependencies..." -ForegroundColor Yellow
    Start-Process -NoNewWindow -Wait -FilePath "cmd.exe" `
        -ArgumentList "/c", "npm install --prefix `"$frontendDir`"" `
        -WorkingDirectory $frontendDir
}

Write-Host "[STARTING] Frontend (npm run dev)..." -ForegroundColor Cyan
$frontend = Start-Process -NoNewWindow -PassThru -FilePath "cmd.exe" `
    -ArgumentList "/c", "npm run dev --prefix `"$frontendDir`"" `
    -WorkingDirectory $frontendDir

# -- Wait and cleanup ----------------------------------
Write-Host ""
Write-Host "[OK] Both servers are running!" -ForegroundColor Green
Write-Host "  Backend  -> http://localhost:$apiPort" -ForegroundColor White
Write-Host "  Frontend -> http://localhost:3000" -ForegroundColor White
Write-Host "  Press Ctrl+C to stop both." -ForegroundColor DarkGray
Write-Host ""

try {
    while (!$backend.HasExited -and !$frontend.HasExited) {
        Start-Sleep -Milliseconds 500
    }
} finally {
    foreach ($proc in @($backend, $frontend)) {
        if ($proc -and !$proc.HasExited) {
            Write-Host "[STOP] Stopping PID $($proc.Id)..." -ForegroundColor Yellow
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "[DONE] All servers stopped." -ForegroundColor Cyan
}
