$loginRes = Invoke-WebRequest -Uri 'http://localhost:3000/api/auth/login' -Method POST -ContentType 'application/json' -Body '{"username":"admin","password":"admin123"}'
$token = ($loginRes.Content | ConvertFrom-Json).data.token
Write-Host "Token: $($token.Substring(0,20))..."
$headers = @{ 'Authorization' = "Bearer $token" }
$res = Invoke-WebRequest -Uri 'http://localhost:3000/api/storage-locations?page=1&limit=2' -Headers $headers
Write-Host "Response:"
Write-Host $res.Content.Substring(0, [Math]::Min(1000, $res.Content.Length))
