Param(
    [switch]$SkipInstall
)

Write-Host "=== N-WAVE local bootstrap (Windows) ===`n"

function Test-Command {
    param([string]$Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Ensure-Node {
    Write-Host "Checking Node.js..."
    if (-not (Test-Command "node")) {
        Write-Error "Node.js is not installed. Please install Node.js v18+ from https://nodejs.org and rerun this script."
        Read-Host "Press Enter to exit"
        exit 1
    }

    $versionString = node -v 2>$null
    if ($versionString -match "v(\d+)\.(\d+)\.(\d+)") {
        $major = [int]$Matches[1]
        if ($major -lt 18) {
            Write-Error "Node.js v18+ required. Found $versionString. Please upgrade Node."
            Read-Host "Press Enter to exit"
            exit 1
        } else {
            Write-Host "Node.js version $versionString OK."
        }
    } else {
        Write-Error "Could not parse Node.js version. Found: $versionString"
        Read-Host "Press Enter to exit"
        exit 1
    }
}

function Ensure-Pnpm {
    Write-Host "`nChecking pnpm..."

    if (Test-Command "pnpm") {
        Write-Host "pnpm available."
        return
    }

    Write-Host "pnpm not found. Attempting to install globally using npm..."

    if (-not (Test-Command "npm")) {
        Write-Error "npm is not available, cannot install pnpm automatically."
        Write-Host "Please install pnpm manually: https://pnpm.io/installation"
        Read-Host "Press Enter to exit"
        exit 1
    }

    try {
        npm install -g pnpm
        if (-not (Test-Command "pnpm")) {
            Write-Error "pnpm installation via npm completed, but pnpm is still not found in PATH."
            Write-Host "Please ensure your global npm bin directory is in PATH or install pnpm manually."
            Read-Host "Press Enter to exit"
            exit 1
        }
        Write-Host "pnpm installed successfully."
    } catch {
        Write-Error "Failed to install pnpm via npm."
        Write-Host "Please install pnpm manually: https://pnpm.io/installation"
        Read-Host "Press Enter to exit"
        exit 1
    }
}

function Ensure-Mongo {
    Write-Host "`nChecking MongoDB (port check on localhost:27017)..."

    if (Get-Command "Test-NetConnection" -ErrorAction SilentlyContinue) {
        $result = Test-NetConnection -ComputerName "localhost" -Port 27017 -WarningAction SilentlyContinue

        if (-not $result.TcpTestSucceeded) {
            Write-Error "No service is listening on localhost:27017. MongoDB does not seem to be running."
            Write-Host "Make sure MongoDB Community Server is installed and its service is started."
            Read-Host "Press Enter to exit"
            exit 1
        }

        Write-Host "Port 27017 is open on localhost (assuming MongoDB is running)."
    }
    else {
        # Fallback: basic .NET socket check
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $async  = $client.BeginConnect("localhost", 27017, $null, $null)
            $wait   = $async.AsyncWaitHandle.WaitOne(2000, $false)  # 2s timeout

            if (-not $wait -or -not $client.Connected) {
                Write-Error "No service is listening on localhost:27017. MongoDB does not seem to be running."
                Write-Host "Make sure MongoDB Community Server is installed and its service is started."
                Read-Host "Press Enter to exit"
                exit 1
            }

            $client.Close()
            Write-Host "Port 27017 is open on localhost (assuming MongoDB is running)."
        } catch {
            Write-Error "Failed to connect to localhost:27017. MongoDB does not seem to be running."
            Read-Host "Press Enter to exit"
            exit 1
        }
    }
}

function Ensure-BackendEnv {
    Write-Host "`nEnsuring backend .env exists..."

    $backendDir = "backend"
    $envPath = Join-Path $backendDir ".env"

    if (-not (Test-Path $backendDir)) {
        Write-Error "Backend directory '$backendDir' not found. Adjust paths in start-nwave.ps1."
        Read-Host "Press Enter to exit"
        exit 1
    }

    if (-not (Test-Path $envPath)) {
        Write-Host "Creating default backend .env at $envPath"
        "MONGODB_URI=mongodb://localhost:27017/nwave" | Out-File -FilePath $envPath -Encoding UTF8
    } else {
        Write-Host ".env already exists at $envPath (leaving it as-is)."
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
        Read-Host "Press Enter to exit"
        exit 1
    }

    Write-Host "`n=== $Name ==="

    # Install dependencies in that directory
    Push-Location $WorkingDirectory
    if (-not $SkipInstall) {
        Write-Host "Installing dependencies for $Name..."
        Invoke-Expression $InstallCommand
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Dependency installation for $Name failed with exit code $LASTEXITCODE."
            Pop-Location
            Read-Host "Press Enter to exit"
            exit 1
        }
    } else {
        Write-Host "Skipping dependency installation for $Name (SkipInstall set)."
    }
    Pop-Location

    Write-Host "Starting $Name in a new PowerShell window..."
    $psExe = (Get-Process -Id $PID).Path
    $commandLine = "$StartCommand; Read-Host 'Press Enter to close this window'"

    Start-Process $psExe `
        -WorkingDirectory $WorkingDirectory `
        -ArgumentList "-NoExit", "-Command", $commandLine
}

# === Main ===

Ensure-Node
Ensure-Pnpm
Ensure-Mongo
Ensure-BackendEnv

# Always use pnpm now
$frontendInstall = "pnpm install"
$backendInstall  = "pnpm install"

# Adjust commands if your package.json uses different scripts
$frontendStart = "pnpm dev"
$backendStart  = "pnpm dev"

Run-App -Name "Backend" -WorkingDirectory "backend" -InstallCommand $backendInstall -StartCommand $backendStart
Run-App -Name "Frontend" -WorkingDirectory "frontend" -InstallCommand $frontendInstall -StartCommand $frontendStart

Write-Host "`nAll done. Backend and frontend should now be running in separate windows."
