param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectRoot,
  [Parameter(Mandatory = $true)]
  [string]$ServerEnvPath,
  [Parameter(Mandatory = $true)]
  [string]$ClientEnvPath,
  [Parameter(Mandatory = $true)]
  [string]$FrontendOrigin,
  [Parameter(Mandatory = $true)]
  [string]$BackendApiBaseUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-Lines {
  param(
    [string]$Path
  )
  if (-not (Test-Path -LiteralPath $Path)) {
    return @()
  }
  $content = Get-Content -LiteralPath $Path -Raw -ErrorAction Stop
  if ([string]::IsNullOrWhiteSpace($content)) {
    return @()
  }
  $split = $content -split "`r?`n"
  if ($split.Length -gt 0 -and $split[$split.Length - 1] -eq '') {
    return $split[0..($split.Length - 2)]
  }
  return $split
}

function Save-Lines {
  param(
    [string]$Path,
    [string[]]$Lines
  )
  $parent = Split-Path -Parent $Path
  if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -Path $parent -ItemType Directory -Force | Out-Null
  }
  $payload = if ($Lines.Count -gt 0) { ($Lines -join "`r`n") + "`r`n" } else { '' }
  Set-Content -LiteralPath $Path -Value $payload -NoNewline
}

function Ensure-ParentDirectory {
  param(
    [string]$Path
  )
  $parent = Split-Path -Parent $Path
  if ($parent -and -not (Test-Path -LiteralPath $parent)) {
    New-Item -Path $parent -ItemType Directory -Force | Out-Null
  }
}

function Set-Or-AppendEnvKey {
  param(
    [string[]]$Lines,
    [string]$Key,
    [string]$Value
  )
  $pattern = '^\s*' + [regex]::Escape($Key) + '\s*='
  $result = @()
  $found = $false
  foreach ($line in $Lines) {
    if (-not $found -and $line -match $pattern) {
      $result += "$Key=$Value"
      $found = $true
      continue
    }
    $result += $line
  }
  if (-not $found) {
    $result += "$Key=$Value"
  }
  return $result
}

function Ensure-EnvKey {
  param(
    [string[]]$Lines,
    [string]$Key
  )
  $pattern = '^\s*' + [regex]::Escape($Key) + '\s*='
  foreach ($line in $Lines) {
    if ($line -match $pattern) {
      return $Lines
    }
  }
  return $Lines + "$Key="
}

function Extract-UniqueMatches {
  param(
    [string]$RootPath,
    [string]$Pattern,
    [int]$GroupIndex = 1
  )
  if (-not (Test-Path -LiteralPath $RootPath)) {
    return @()
  }

  $values = New-Object System.Collections.Generic.HashSet[string]([System.StringComparer]::Ordinal)
  $files = Get-ChildItem -LiteralPath $RootPath -Recurse -File -Include *.ts,*.tsx,*.js,*.mjs,*.cjs
  foreach ($file in $files) {
    $content = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($null -eq $content) {
      continue
    }
    $matches = [regex]::Matches($content, $Pattern)
    foreach ($match in $matches) {
      if ($match.Groups.Count -le $GroupIndex) {
        continue
      }
      $value = [string]$match.Groups[$GroupIndex].Value
      if (-not [string]::IsNullOrWhiteSpace($value)) {
        [void]$values.Add($value.Trim())
      }
    }
  }
  return @($values) | Sort-Object
}

$serverTemplate = Join-Path $ProjectRoot '.env.example'
$clientTemplate = Join-Path $ProjectRoot '.env.client.example'

if (Test-Path -LiteralPath $serverTemplate) {
  Ensure-ParentDirectory -Path $ServerEnvPath
  Copy-Item -LiteralPath $serverTemplate -Destination $ServerEnvPath -Force
} else {
  Save-Lines -Path $ServerEnvPath -Lines @('PORT=3000', 'NODE_ENV=production')
}

if (Test-Path -LiteralPath $clientTemplate) {
  Ensure-ParentDirectory -Path $ClientEnvPath
  Copy-Item -LiteralPath $clientTemplate -Destination $ClientEnvPath -Force
} else {
  Save-Lines -Path $ClientEnvPath -Lines @('VITE_API_BASE_URL=')
}

$serverLines = Get-Lines -Path $ServerEnvPath
$clientLines = Get-Lines -Path $ClientEnvPath
$primaryFrontendOrigin = ($FrontendOrigin -split ',')[0].Trim()
if ([string]::IsNullOrWhiteSpace($primaryFrontendOrigin)) {
  $primaryFrontendOrigin = $FrontendOrigin
}

$serverEnvKeysFromCode = Extract-UniqueMatches -RootPath (Join-Path $ProjectRoot 'src\server') -Pattern 'process\.env\.([A-Z0-9_]+)'
$clientEnvKeysFromCode = Extract-UniqueMatches -RootPath (Join-Path $ProjectRoot 'src\client') -Pattern '\b(VITE_[A-Z0-9_]+)\b'

foreach ($key in $serverEnvKeysFromCode) {
  $serverLines = Ensure-EnvKey -Lines $serverLines -Key $key
}

foreach ($key in $clientEnvKeysFromCode) {
  $clientLines = Ensure-EnvKey -Lines $clientLines -Key $key
}

$serverLines = Set-Or-AppendEnvKey -Lines $serverLines -Key 'NODE_ENV' -Value 'production'
$serverLines = Set-Or-AppendEnvKey -Lines $serverLines -Key 'SERVE_CLIENT' -Value 'false'
$serverLines = Set-Or-AppendEnvKey -Lines $serverLines -Key 'CORS_ORIGIN' -Value $FrontendOrigin
$serverLines = Set-Or-AppendEnvKey -Lines $serverLines -Key 'FRONTEND_URL' -Value $primaryFrontendOrigin

$clientLines = Set-Or-AppendEnvKey -Lines $clientLines -Key 'VITE_API_BASE_URL' -Value $BackendApiBaseUrl
if (($clientEnvKeysFromCode -contains 'VITE_API_URL') -or (($clientLines | Where-Object { $_ -match '^\s*VITE_API_URL\s*=' }).Count -gt 0)) {
  $clientLines = Set-Or-AppendEnvKey -Lines $clientLines -Key 'VITE_API_URL' -Value $BackendApiBaseUrl
}
if (($clientEnvKeysFromCode -contains 'VITE_SITE_URL') -or (($clientLines | Where-Object { $_ -match '^\s*VITE_SITE_URL\s*=' }).Count -gt 0)) {
  $clientLines = Set-Or-AppendEnvKey -Lines $clientLines -Key 'VITE_SITE_URL' -Value $primaryFrontendOrigin
}

Save-Lines -Path $ServerEnvPath -Lines $serverLines
Save-Lines -Path $ClientEnvPath -Lines $clientLines

Write-Host "Prepared server env template: $ServerEnvPath"
Write-Host "Prepared client env template: $ClientEnvPath"
