Param(
    [switch]$SkipInstall
)

Write-Host "=== N-WAVE local bootstrap ===`n"

function Test-Command {
    param([string]$Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Ensure-Node {
    Write-Host "Checking Node.js..."
    if (-not (Test-Command "node")) {
        Write-Error "Node.js is not installed. Please install Node.js v18+ from https://nodejs.org and rerun this script."
        exit 1
    }

    $versionString = node -v 2>$null
    if ($versionString -match "v(\d+)\.(\d+)\.(\d+)") {
        $major = [int]$Matches[1]
        if ($major -lt 18) {
            Write-Error "Node.js v18+ required. Found $versionString. Please upgrade Node."
            exit 1
        } else {
            Write-Host "Node.js version $versionString OK."
        }
    } else {
        Write-Error "Could not parse Node.js version. Found: $versionString"
        exit 1
    }
}

function Ensure-NpmOrPnpm {
    Write-Host "`nChecking npm / pnpm..."
    $hasNpm = Test-Command "npm"
    $hasPnpm = Test-Command "pnpm"

    if (-not $hasNpm -and -not $hasPnpm) {
        Write-Error "Neither npm nor pnpm is installed. Please install Node.js (which includes npm), or install pnpm manually."
        exit 1
    }

    if (-not $hasPnpm -and $hasNpm) {
        Write-Host "pnpm not found. You can install it later with: npm install -g pnpm"
    }

    if ($hasPnpm) {
        Write-Host "pnpm available."
    } elseif ($hasNpm) {
        Write-Host "Using npm."
    }
}

function Ensure-Mongo {
    Write-Host "`nChecking MongoDB..."

    $hasMongosh = Test-Command "mongosh"
    $hasMongo = Test-Command "mongo"

    if (-not $hasMongosh -and -not $hasMongo) {
        Write-Warning "MongoDB shell not found (mongosh/mongo)."
        Write-Warning "Make sure MongoDB server is installed and running on localhost:27017."
        Write-Warning "Download MongoDB: https://www.mongodb.com/try/download/community"
        return
    }

    # Try to start MongoDB service if it exists
    $service = Get-Service -Name "MongoDB" -ErrorAction SilentlyContinue
    if ($service -and $service.Status -ne "Running") {
        Write-Host "MongoDB service found but not running. Attempting to start..."
        try {
            Start-Service "MongoDB"
            Write-Host "MongoDB service started."
        } catch {
            Write-Warning "Failed to start MongoDB service automatically. Please start it manually."
        }
    }

    # Quick connectivity test (ping admin DB)
    try {
        if ($hasMongosh) {
            mongosh "mongodb://localhost:27017/admin" --eval "db.runCommand({ ping: 1 })" | Out-Null
        } else {
            mongo "mongodb://localhost:27017/admin" --eval "db.runCommand({ ping: 1 })" | Out-Null
        }
        Write-Host "MongoDB connection OK (localhost:27017)."
    } catch {
        Write-Warning "Could not connect to MongoDB on localhost:27017."
        Write-Warning "Make sure MongoDB is installed, configured, and running."
    }
}

function Run-App {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [string]$InstallCommand,
        [string]$StartCommand
    )

    if (-not (Test-Path $WorkingDirectory)) {
        Write-Error "$Name directory '$WorkingDirectory' not found. Adjust the script paths."
        exit 1
    }

    Write-Host "`n=== $Name ==="

    # 1) Install dependencies inside that directory (if not skipping)
    Push-Location $WorkingDirectory
    if (-not $SkipInstall) {
        Write-Host "Installing dependencies for $Name..."
        Invoke-Expression $InstallCommand
    } else {
        Write-Host "Skipping dependency installation for $Name (SkipInstall set)."
    }
    Pop-Location

    # 2) Start the app in a new PowerShell window *with that folder as WorkingDirectory*
    Write-Host "Starting $Name in a new PowerShell window..."
    $psExe = (Get-Process -Id $PID).Path  # current powershell/pwsh path

    # IMPORTANT: no more `cd frontend` here – we just set -WorkingDirectory
    $commandLine = "$StartCommand; Read-Host 'Press Enter to close this window'"

    Start-Process $psExe `
        -WorkingDirectory $WorkingDirectory `
        -ArgumentList "-NoExit", "-Command", $commandLine
}


# === Main ===

Ensure-Node
Ensure-NpmOrPnpm
Ensure-Mongo

# Decide whether to use pnpm or npm
$usePnpm = Test-Command "pnpm"

if ($usePnpm) {
    $frontendInstall = "pnpm install"
    $backendInstall  = "pnpm install"
} else {
    $frontendInstall = "npm install"
    $backendInstall  = "npm install"
}

# Adjust commands if your package.json uses different scripts
$frontendStart = "npm run dev"
$backendStart  = "npm run dev"

Run-App -Name "Backend" -WorkingDirectory "backend" -InstallCommand $backendInstall -StartCommand $backendStart
Run-App -Name "Frontend" -WorkingDirectory "frontend" -InstallCommand $frontendInstall -StartCommand $frontendStart

Write-Host "`nAll done. Backend and frontend should now be running in separate windows."
