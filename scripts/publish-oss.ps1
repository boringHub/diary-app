param(
    [string]$ManifestPath = (Join-Path $PSScriptRoot '..\release\update.json'),
    [string]$ApkPath = (Join-Path $PSScriptRoot '..\release\shiguangjian-android.apk')
)

$ErrorActionPreference = 'Stop'

function Get-ReleaseEnvironmentValue {
    param([Parameter(Mandatory = $true)][string]$Name, [string]$DefaultValue)

    $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if ([string]::IsNullOrWhiteSpace($value)) {
        $value = [Environment]::GetEnvironmentVariable($Name, 'User')
    }
    if ([string]::IsNullOrWhiteSpace($value)) {
        $value = [Environment]::GetEnvironmentVariable($Name, 'Machine')
    }
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }
    return $value.Trim()
}

function ConvertTo-OssObjectUrl {
    param([string]$BaseUrl, [string]$ObjectKey)

    $escapedPath = ($ObjectKey.Split('/') | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
    return "$($BaseUrl.TrimEnd('/'))/$escapedPath"
}

function Send-OssObject {
    param(
        [string]$FilePath,
        [string]$ObjectKey,
        [string]$ContentType,
        [string]$CacheControl
    )

    $date = [DateTime]::UtcNow.ToString('R', [Globalization.CultureInfo]::InvariantCulture)
    $canonicalHeaders = "x-oss-object-acl:public-read`n"
    $canonicalResource = "/$script:Bucket/$ObjectKey"
    $stringToSign = "PUT`n`n$ContentType`n$date`n$canonicalHeaders$canonicalResource"
    $hmac = [Security.Cryptography.HMACSHA1]::new([Text.Encoding]::UTF8.GetBytes($script:AccessKeySecret))
    try {
        $signature = [Convert]::ToBase64String($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($stringToSign)))
    } finally {
        $hmac.Dispose()
    }

    $headers = @{
        Date = $date
        Authorization = "OSS $($script:AccessKeyId):$signature"
        'x-oss-object-acl' = 'public-read'
        'Cache-Control' = $CacheControl
    }
    $url = ConvertTo-OssObjectUrl -BaseUrl $script:PublicBaseUrl -ObjectKey $ObjectKey
    Invoke-WebRequest -Uri $url -Method Put -InFile $FilePath -ContentType $ContentType -Headers $headers -UseBasicParsing | Out-Null
    Write-Host "Uploaded $ObjectKey"
}

$script:AccessKeyId = Get-ReleaseEnvironmentValue -Name 'OSS_ACCESS_KEY_ID'
$script:AccessKeySecret = Get-ReleaseEnvironmentValue -Name 'OSS_ACCESS_KEY_SECRET'
$script:Bucket = Get-ReleaseEnvironmentValue -Name 'OSS_BUCKET' -DefaultValue 'diary-app'
$endpoint = Get-ReleaseEnvironmentValue -Name 'OSS_ENDPOINT' -DefaultValue 'oss-cn-hangzhou.aliyuncs.com'
$script:PublicBaseUrl = Get-ReleaseEnvironmentValue -Name 'OSS_PUBLIC_BASE_URL' -DefaultValue "https://$($script:Bucket).$endpoint"

if ($script:AccessKeyId -notmatch '^LTAI[A-Za-z0-9]{12,36}$' -or $script:AccessKeyId -match '\s') {
    throw 'OSS_ACCESS_KEY_ID is missing or malformed. Set it in the Windows User environment without quotes or extra text.'
}
if ($script:AccessKeySecret -notmatch '^[A-Za-z0-9]{24,64}$' -or $script:AccessKeySecret -match '\s') {
    throw 'OSS_ACCESS_KEY_SECRET is missing or malformed. Set it in the Windows User environment without quotes or extra text.'
}
if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) { throw "Manifest not found: $ManifestPath" }
if (-not (Test-Path -LiteralPath $ApkPath -PathType Leaf)) { throw "APK not found: $ApkPath" }

$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$version = [string]$manifest.versionName
if ([string]::IsNullOrWhiteSpace($version) -or [string]$manifest.apk -ne 'shiguangjian-android.apk') {
    throw 'release/update.json is missing a valid versionName or APK file name.'
}

$actualHash = (Get-FileHash -LiteralPath $ApkPath -Algorithm SHA256).Hash.ToLowerInvariant()
$actualSize = (Get-Item -LiteralPath $ApkPath).Length
if ([string]$manifest.sha256 -ne $actualHash) { throw 'APK SHA-256 does not match release/update.json.' }
if ([long]$manifest.apkSize -ne $actualSize) { throw 'APK size does not match release/update.json.' }

$zipPath = Join-Path (Split-Path -Parent $ApkPath) 'shiguangjian-android.zip'
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -LiteralPath $ApkPath -DestinationPath $zipPath -CompressionLevel Optimal

$versionPrefix = "releases/v$version"
$latestPrefix = 'releases/latest'
$immutableCache = 'public, max-age=31536000, immutable'
$latestCache = 'public, max-age=60, must-revalidate'

Send-OssObject -FilePath $ApkPath -ObjectKey "$versionPrefix/shiguangjian-android.apk" -ContentType 'application/vnd.android.package-archive' -CacheControl $immutableCache
Send-OssObject -FilePath $zipPath -ObjectKey "$versionPrefix/shiguangjian-android.zip" -ContentType 'application/zip' -CacheControl $immutableCache
Send-OssObject -FilePath $ManifestPath -ObjectKey "$versionPrefix/update.json" -ContentType 'application/json; charset=utf-8' -CacheControl $immutableCache
Send-OssObject -FilePath $ApkPath -ObjectKey "$latestPrefix/shiguangjian-android.apk" -ContentType 'application/vnd.android.package-archive' -CacheControl $latestCache
Send-OssObject -FilePath $zipPath -ObjectKey "$latestPrefix/shiguangjian-android.zip" -ContentType 'application/zip' -CacheControl $latestCache
Send-OssObject -FilePath $ManifestPath -ObjectKey "$latestPrefix/update.json" -ContentType 'application/json; charset=utf-8' -CacheControl $latestCache

$verificationRoot = Join-Path ([IO.Path]::GetTempPath()) ("diary-app-oss-verify-" + [Guid]::NewGuid().ToString('N'))
$downloadedManifest = Join-Path $verificationRoot 'update.json'
$downloadedZip = Join-Path $verificationRoot 'shiguangjian-android.zip'
$extractedRoot = Join-Path $verificationRoot 'extracted'
New-Item -ItemType Directory -Path $extractedRoot -Force | Out-Null
try {
    Invoke-WebRequest -Uri (ConvertTo-OssObjectUrl -BaseUrl $script:PublicBaseUrl -ObjectKey "$latestPrefix/update.json") -OutFile $downloadedManifest -UseBasicParsing
    Invoke-WebRequest -Uri (ConvertTo-OssObjectUrl -BaseUrl $script:PublicBaseUrl -ObjectKey "$latestPrefix/shiguangjian-android.zip") -OutFile $downloadedZip -UseBasicParsing
    Expand-Archive -LiteralPath $downloadedZip -DestinationPath $extractedRoot -Force
    $downloadedApks = @(Get-ChildItem -LiteralPath $extractedRoot -File -Recurse -Filter '*.apk')
    if ($downloadedApks.Count -ne 1) { throw 'OSS ZIP verification expected exactly one APK.' }
    $downloadedHash = (Get-FileHash -LiteralPath $downloadedApks[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $publicManifest = Get-Content -LiteralPath $downloadedManifest -Raw | ConvertFrom-Json
    if ($downloadedHash -ne $actualHash -or [string]$publicManifest.sha256 -ne $actualHash) {
        throw 'Public OSS artifact verification failed: APK hash mismatch.'
    }
} finally {
    if (Test-Path -LiteralPath $verificationRoot) { Remove-Item -LiteralPath $verificationRoot -Recurse -Force }
}

Write-Host "OSS publish verified for v$version."
