# Servidor HTTP local zero-configuración para el Sistema de Control de Obra
# Permite ejecutar módulos ES6 (type="module") sin restricciones CORS

$ErrorActionPreference = "Stop"

$port = 8080
$tcp = $null
$started = $false

while (-not $started -and $port -lt 8100) {
    try {
        $tcp = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
        $tcp.Start()
        $started = $true
    } catch {
        $tcp = $null
        $port++
    }
}

if (-not $started) {
    Write-Host "No se pudo enlazar ningún puerto entre 8080 y 8100." -ForegroundColor Red
    Exit
}

$url = "http://localhost:$port/"
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   SISTEMA DE CONTROL DE OBRA - SERVIDOR LOCAL ACTIVO     " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  URL: $url" -ForegroundColor Yellow
Write-Host "  Modo: Modulos ES6 estandar (type='module')" -ForegroundColor Gray
Write-Host "  Presiona Ctrl+C en esta consola para detener el servidor." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

Start-Process $url

$mimeMap = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".mjs"  = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".ico"  = "image/x-icon"
}

$baseDir = $PSScriptRoot
if ([string]::IsNullOrEmpty($baseDir)) {
    $baseDir = (Get-Location).Path
}

try {
    while ($true) {
        $client = $tcp.AcceptTcpClient()
        $stream = $client.GetStream()
        $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII)
        $line = $reader.ReadLine()

        if (-not [string]::IsNullOrEmpty($line)) {
            $parts = $line.Split(' ')
            if ($parts.Length -ge 2) {
                $rawPath = $parts[1].Split('?')[0].TrimStart('/')
                if ([string]::IsNullOrEmpty($rawPath)) {
                    $rawPath = "index.html"
                }
                
                # Decodificar espacios y caracteres URL (%20, etc.)
                $decodedPath = [System.Uri]::UnescapeDataString($rawPath)
                $filePath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($baseDir, $decodedPath))

                # Protección contra directory traversal
                if ($filePath.StartsWith($baseDir, [System.StringComparison]::OrdinalIgnoreCase) -and [System.IO.File]::Exists($filePath)) {
                    $bytes = [System.IO.File]::ReadAllBytes($filePath)
                    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                    $mime = if ($mimeMap.ContainsKey($ext)) { $mimeMap[$ext] } else { "application/octet-stream" }
                    
                    $header = "HTTP/1.1 200 OK`r`nContent-Type: $mime`r`nContent-Length: $($bytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nCache-Control: no-cache, no-store, must-revalidate`r`nPragma: no-cache`r`nExpires: 0`r`nConnection: close`r`n`r`n"
                    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                    $stream.Write($headerBytes, 0, $headerBytes.Length)
                    $stream.Write($bytes, 0, $bytes.Length)
                } else {
                    $notFoundBody = [System.Text.Encoding]::UTF8.GetBytes("404 No encontrado: $decodedPath")
                    $header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($notFoundBody.Length)`r`nConnection: close`r`n`r`n"
                    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
                    $stream.Write($headerBytes, 0, $headerBytes.Length)
                    $stream.Write($notFoundBody, 0, $notFoundBody.Length)
                }
            }
        }

        $stream.Flush()
        $stream.Close()
        $client.Close()
    }
} finally {
    if ($tcp -ne $null) {
        $tcp.Stop()
    }
}
