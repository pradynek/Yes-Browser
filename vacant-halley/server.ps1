# Yes Browser Backend
$port = 8080
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()

Write-Host "Yes Browser Server listening on http://localhost:$port"
Write-Host "Press Ctrl+C to stop."

$clientDir = Join-Path $PSScriptRoot "client"

while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    $path = $request.Url.LocalPath
    $method = $request.HttpMethod

    Write-Host "$method $path"

    if ($method -eq "POST" -and $path -eq "/api/launch") {
        try {
            $reader = New-Object System.IO.StreamReader($request.InputStream)
            $body = $reader.ReadToEnd() | ConvertFrom-Json
            
            $command = $body.command
            $args = $body.args

            if (-not $command) {
                throw "Command is required"
            }

            Write-Host "Launching: $command"
            
            # Start the process
            if ($args) {
                Start-Process -FilePath $command -ArgumentList $args -ErrorAction Stop
            } else {
                Start-Process -FilePath $command -ErrorAction Stop
            }

            $responseData = @{ success = $true; message = "Launched $command" } | ConvertTo-Json
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($responseData)
            $response.ContentType = "application/json"
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        }
        catch {
            Write-Host "Error: $_" -ForegroundColor Red
            $responseData = @{ success = $false; error = $_.ToString() } | ConvertTo-Json
            $buffer = [System.Text.Encoding]::UTF8.GetBytes($responseData)
            $response.StatusCode = 500
            $response.ContentType = "application/json"
            $response.ContentLength64 = $buffer.Length
            $response.OutputStream.Write($buffer, 0, $buffer.Length)
        }
    }
    else {
        # Serve Static Files
        if ($path -eq "/") { $path = "/index.html" }
        
        $localPath = Join-Path $clientDir $path.TrimStart("/")
        
        if (Test-Path $localPath -PathType Leaf) {
            $content = [System.IO.File]::ReadAllBytes($localPath)
            $extension = [System.IO.Path]::GetExtension($localPath)
            
            switch ($extension) {
                ".html" { $response.ContentType = "text/html" }
                ".css"  { $response.ContentType = "text/css" }
                ".js"   { $response.ContentType = "application/javascript" }
                ".png"  { $response.ContentType = "image/png" }
                ".jpg"  { $response.ContentType = "image/jpeg" }
                ".svg"  { $response.ContentType = "image/svg+xml" }
                Default { $response.ContentType = "application/octet-stream" }
            }
            
            $response.ContentLength64 = $content.Length
            $response.OutputStream.Write($content, 0, $content.Length)
        }
        else {
            $response.StatusCode = 404
        }
    }

    $response.Close()
}
