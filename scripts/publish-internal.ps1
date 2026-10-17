param([string]$ReleaseNotes = '')

$ErrorActionPreference = 'Stop'
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$outputRoot = Join-Path $projectRoot 'release\internal'
$apkPath = Join-Path $outputRoot 'shiguangjian-internal.apk'
$zipPath = Join-Path $outputRoot 'shiguangjian-internal.zip'
$manifestPath = Join-Path $outputRoot 'update.json'
$releaseNotesPath = Join-Path $outputRoot 'release-notes.md'
$versionCode = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$packageJson = [IO.File]::ReadAllText((Join-Path $projectRoot 'package.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
$baseVersion = $packageJson.version
$versionStamp = [DateTime]::Now.ToString('yyyyMMdd.HHmmss')

function Get-ReleaseEnvironmentValue {
    param([Parameter(Mandatory = $true)][string]$Name, [string]$DefaultValue)

    foreach ($target in @('Process', 'User', 'Machine')) {
        $value = [Environment]::GetEnvironmentVariable($Name, $target)
        if (-not [string]::IsNullOrWhiteSpace($value)) { return $value.Trim() }
    }
    return $DefaultValue
}

function ConvertTo-OssObjectUrl {
    param([string]$BaseUrl, [string]$ObjectKey)

    $escapedPath = ($ObjectKey.Split('/') | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
    return "$($BaseUrl.TrimEnd('/'))/$escapedPath"
}

function Get-Sha256Hex {
    param([Parameter(Mandatory = $true)][string]$FilePath)

    $stream = [IO.File]::OpenRead($FilePath)
    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    } finally {
        $sha256.Dispose()
        $stream.Dispose()
    }
}

function Send-OssObject {
    param([string]$FilePath, [string]$ObjectKey, [string]$ContentType, [string]$CacheControl)

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
    throw 'OSS_ACCESS_KEY_ID is missing or malformed. Set it in the Windows User environment.'
}
if ($script:AccessKeySecret -notmatch '^[A-Za-z0-9]{24,64}$' -or $script:AccessKeySecret -match '\s') {
    throw 'OSS_ACCESS_KEY_SECRET is missing or malformed. Set it in the Windows User environment.'
}

$latestManifestUrl = ConvertTo-OssObjectUrl -BaseUrl $script:PublicBaseUrl -ObjectKey 'internal/latest/update.json'
try {
    $latestManifest = Invoke-RestMethod -Uri $latestManifestUrl -Method Get -Headers @{ 'Cache-Control' = 'no-cache' }
    if ($latestManifest.versionCode -is [ValueType] -and [long]$latestManifest.versionCode -ge $versionCode) {
        $versionCode = [long]$latestManifest.versionCode + 1
    }
} catch {
    Write-Host 'No existing internal manifest was found; starting from the current Unix timestamp.'
}
if ($versionCode -gt 2100000000) { throw 'Internal versionCode exceeds the Android supported range.' }
$buildId = "$versionStamp-$versionCode"
$versionName = "$baseVersion-internal.$versionStamp"
$releaseNotesFromChangelog = [string]::IsNullOrWhiteSpace($ReleaseNotes)
if ($releaseNotesFromChangelog) {
    & node (Join-Path $PSScriptRoot 'release-channel.mjs') internal-notes --output $releaseNotesPath
    if ($LASTEXITCODE -ne 0) { throw 'Failed to generate internal release notes.' }
    $ReleaseNotes = [IO.File]::ReadAllText($releaseNotesPath, [Text.Encoding]::UTF8).Trim()
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
& (Join-Path $PSScriptRoot 'build-android.ps1') `
    -Channel internal `
    -InternalVersionCode $versionCode `
    -InternalVersionName $versionName

$builtApk = Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
if (-not (Test-Path -LiteralPath $builtApk -PathType Leaf)) { throw "Internal APK not found: $builtApk" }
Copy-Item -LiteralPath $builtApk -Destination $apkPath -Force
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
Compress-Archive -LiteralPath $apkPath -DestinationPath $zipPath -CompressionLevel Optimal

$sha256 = Get-Sha256Hex -FilePath $apkPath
$apkSize = (Get-Item -LiteralPath $apkPath).Length
$buildPrefix = "internal/builds/$buildId"
$latestPrefix = 'internal/latest'
$zipUrl = ConvertTo-OssObjectUrl -BaseUrl $script:PublicBaseUrl -ObjectKey "$buildPrefix/shiguangjian-internal.zip"
$manifestJson = [ordered]@{
    versionCode = $versionCode
    versionName = $versionName
    apk = 'shiguangjian-internal.apk'
    apkSize = $apkSize
    sha256 = $sha256
    ossUrl = $zipUrl
    ossFormat = 'zip'
    releaseNotes = $ReleaseNotes
} | ConvertTo-Json
[IO.File]::WriteAllText($manifestPath, $manifestJson, [Text.UTF8Encoding]::new($false))

$immutableCache = 'public, max-age=31536000, immutable'
$latestCache = 'public, max-age=60, must-revalidate'
Send-OssObject -FilePath $apkPath -ObjectKey "$buildPrefix/shiguangjian-internal.apk" -ContentType 'application/vnd.android.package-archive' -CacheControl $immutableCache
Send-OssObject -FilePath $zipPath -ObjectKey "$buildPrefix/shiguangjian-internal.zip" -ContentType 'application/zip' -CacheControl $immutableCache
Send-OssObject -FilePath $manifestPath -ObjectKey "$buildPrefix/update.json" -ContentType 'application/json; charset=utf-8' -CacheControl $immutableCache
Send-OssObject -FilePath $apkPath -ObjectKey "$latestPrefix/shiguangjian-internal.apk" -ContentType 'application/vnd.android.package-archive' -CacheControl $latestCache
Send-OssObject -FilePath $zipPath -ObjectKey "$latestPrefix/shiguangjian-internal.zip" -ContentType 'application/zip' -CacheControl $latestCache
Send-OssObject -FilePath $manifestPath -ObjectKey "$latestPrefix/update.json" -ContentType 'application/json; charset=utf-8' -CacheControl $latestCache

$verificationRoot = Join-Path ([IO.Path]::GetTempPath()) ("diary-app-internal-verify-" + [Guid]::NewGuid().ToString('N'))
$downloadedManifest = Join-Path $verificationRoot 'update.json'
$downloadedZip = Join-Path $verificationRoot 'shiguangjian-internal.zip'
$extractedRoot = Join-Path $verificationRoot 'extracted'
New-Item -ItemType Directory -Path $extractedRoot -Force | Out-Null
try {
    Invoke-WebRequest -Uri (ConvertTo-OssObjectUrl -BaseUrl $script:PublicBaseUrl -ObjectKey "$latestPrefix/update.json") -OutFile $downloadedManifest -UseBasicParsing
    Invoke-WebRequest -Uri (ConvertTo-OssObjectUrl -BaseUrl $script:PublicBaseUrl -ObjectKey "$latestPrefix/shiguangjian-internal.zip") -OutFile $downloadedZip -UseBasicParsing
    Expand-Archive -LiteralPath $downloadedZip -DestinationPath $extractedRoot -Force
    $downloadedApks = @(Get-ChildItem -LiteralPath $extractedRoot -File -Recurse -Filter '*.apk')
    if ($downloadedApks.Count -ne 1) { throw 'Internal OSS ZIP verification expected exactly one APK.' }
    $downloadedHash = Get-Sha256Hex -FilePath $downloadedApks[0].FullName
    $publicManifest = Get-Content -LiteralPath $downloadedManifest -Raw | ConvertFrom-Json
    if ($downloadedHash -ne $sha256 -or [string]$publicManifest.sha256 -ne $sha256) {
        throw 'Public internal OSS artifact verification failed: APK hash mismatch.'
    }
    if ([long]$publicManifest.versionCode -ne $versionCode -or [string]$publicManifest.ossUrl -ne $zipUrl) {
        throw 'Public internal OSS manifest does not match the uploaded build.'
    }
} finally {
    if (Test-Path -LiteralPath $verificationRoot) { Remove-Item -LiteralPath $verificationRoot -Recurse -Force }
}

Write-Host "Internal OSS publish verified: $versionName ($versionCode)."
if ($releaseNotesFromChangelog) {
    & node (Join-Path $PSScriptRoot 'release-channel.mjs') archive-internal --version $versionName --date ([DateTime]::Now.ToString('yyyy-MM-dd'))
    if ($LASTEXITCODE -ne 0) { throw 'Internal build was published, but changelog archival failed.' }
}
