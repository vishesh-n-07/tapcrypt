$B = "http://127.0.0.1:8000"
$file = Join-Path $PSScriptRoot "dev-locks.json"

function Get-Store {
  if (Test-Path $file) { @(Get-Content $file -Raw | ConvertFrom-Json) } else { @() }
}

function Add-DevLock([string]$Name, [string]$Code) {
  $Code = $Code.Trim().PadLeft(6, "0")
  $reg = Invoke-RestMethod -Method Post -Uri "$B/devices/register" -ContentType "application/json" -Body (@{ role = "lock"; name = $Name } | ConvertTo-Json)
  $h = @{ Authorization = "Bearer $($reg.token)" }
  try {
    $res = Invoke-RestMethod -Method Post -Uri "$B/pair/claim" -Headers $h -ContentType "application/json" -Body (@{ code = $Code } | ConvertTo-Json) -ErrorAction Stop
  } catch {
    "Pairing failed: $($_.ErrorDetails.Message)"
    return
  }
  $items = @(Get-Store) + [pscustomobject]@{ name = $Name; token = $reg.token }
  ConvertTo-Json -InputObject @($items) | Set-Content $file
  "Paired '$Name' with Key '$($res.key_name)'"
}

function Request-DevLock($Name) {
  $l = Get-Store | Where-Object { $_.name -eq $Name } | Select-Object -First 1
  if (-not $l) { "No dev lock named '$Name'"; return }
  $h = @{ Authorization = "Bearer $($l.token)" }
  try {
    Invoke-RestMethod -Method Post -Uri "$B/access/request" -Headers $h -ErrorAction Stop | Out-Null
  } catch {
    "Request failed: $($_.ErrorDetails.Message)"
    return
  }
  "'$Name' asked to open. Look at the Key."
}
