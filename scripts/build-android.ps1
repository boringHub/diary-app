param(
    [ValidateSet('stable', 'internal')]
    [string]$Channel = 'internal',
    [long]$InternalVersionCode,
    [string]$InternalVersionName,
    [switch]$SkipWebSync
)

$ErrorActionPreference = 'Stop'
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$stableCertificateSha256 = 'c6ef39d7955b402a7bfce9e9e9ce3a1a1bbcfa87c2cca4356c29eec7e9845d01'
$internalCertificateSha256 = 'a490f52e123093f27b88d3c53b4a363798868f5d9808f366b134d1d13a29553c'

function Get-EnvironmentValue {
    param([Parameter(Mandatory = $true)][string]$Name, [string]$DefaultValue)

    foreach ($target in @('Process', 'User', 'Machine')) {
        $value = [Environment]::GetEnvironmentVariable($Name, $target)
        if (-not [string]::IsNullOrWhiteSpace($value)) { return $value.Trim() }
    }
    return $DefaultValue
}

function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments, [string]$WorkingDirectory)

    Push-Location $WorkingDirectory
    try {
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $Command $($Arguments -join ' ')"
        }
    } finally {
        Pop-Location
    }
}

if (-not $SkipWebSync) {
    Invoke-Checked -Command 'npm.cmd' -Arguments @('run', 'build') -WorkingDirectory $projectRoot
    Invoke-Checked -Command 'npx.cmd' -Arguments @('cap', 'sync', 'android') -WorkingDirectory $projectRoot
}

$gradleArguments = @()
if ($Channel -eq 'internal') {
    $internalKeystoreFile = Get-EnvironmentValue -Name 'INTERNAL_KEYSTORE_FILE' -DefaultValue (Join-Path $HOME '.android\diary-internal.keystore')
    if (-not (Test-Path -LiteralPath $internalKeystoreFile -PathType Leaf)) {
        throw "Internal keystore not found: $internalKeystoreFile"
    }
    $env:INTERNAL_KEYSTORE_FILE = (Resolve-Path -LiteralPath $internalKeystoreFile).Path
    $env:INTERNAL_KEYSTORE_PASSWORD = Get-EnvironmentValue -Name 'INTERNAL_KEYSTORE_PASSWORD' -DefaultValue 'android'
    $env:INTERNAL_KEY_ALIAS = Get-EnvironmentValue -Name 'INTERNAL_KEY_ALIAS' -DefaultValue 'androiddebugkey'
    $env:INTERNAL_KEY_PASSWORD = Get-EnvironmentValue -Name 'INTERNAL_KEY_PASSWORD' -DefaultValue 'android'
    if ($InternalVersionCode -le 0) {
        $InternalVersionCode = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    }
    if ([string]::IsNullOrWhiteSpace($InternalVersionName)) {
        $packageJson = [IO.File]::ReadAllText((Join-Path $projectRoot 'package.json'), [Text.Encoding]::UTF8) | ConvertFrom-Json
        $baseVersion = $packageJson.version
        $stamp = [DateTime]::Now.ToString('yyyyMMdd.HHmmss')
        $InternalVersionName = "$baseVersion-internal.$stamp"
    }
    if ($InternalVersionCode -gt 2100000000) {
        throw 'Internal versionCode exceeds the Android supported range.'
    }
    $gradleArguments = @(
        'assembleDebug',
        "-PINTERNAL_VERSION_CODE=$InternalVersionCode",
        "-PINTERNAL_VERSION_NAME=$InternalVersionName"
    )
} else {
    $stableKeystoreFile = Get-EnvironmentValue -Name 'STABLE_KEYSTORE_FILE'
    if ([string]::IsNullOrWhiteSpace($stableKeystoreFile)) {
        throw "STABLE_KEYSTORE_FILE is required. Restore the keystore for certificate $stableCertificateSha256 before building the stable app."
    }
    if (-not (Test-Path -LiteralPath $stableKeystoreFile -PathType Leaf)) {
        throw "Stable keystore not found: $stableKeystoreFile"
    }
    $env:STABLE_KEYSTORE_FILE = (Resolve-Path -LiteralPath $stableKeystoreFile).Path
    $env:STABLE_KEYSTORE_PASSWORD = Get-EnvironmentValue -Name 'STABLE_KEYSTORE_PASSWORD' -DefaultValue 'android'
    $env:STABLE_KEY_ALIAS = Get-EnvironmentValue -Name 'STABLE_KEY_ALIAS' -DefaultValue 'androiddebugkey'
    $env:STABLE_KEY_PASSWORD = Get-EnvironmentValue -Name 'STABLE_KEY_PASSWORD' -DefaultValue 'android'
    $gradleArguments = @('assembleRelease')
}

Invoke-Checked -Command '.\gradlew.bat' -Arguments $gradleArguments -WorkingDirectory (Join-Path $projectRoot 'android')

$apkPath = if ($Channel -eq 'internal') {
    Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
} else {
    Join-Path $projectRoot 'android\app\build\outputs\apk\release\app-release.apk'
}
if (-not (Test-Path -LiteralPath $apkPath -PathType Leaf)) {
    throw "Android build completed without the expected APK: $apkPath"
}

$androidSdk = Get-EnvironmentValue -Name 'ANDROID_HOME'
if ([string]::IsNullOrWhiteSpace($androidSdk)) {
    $androidSdk = Get-EnvironmentValue -Name 'ANDROID_SDK_ROOT'
}
if ([string]::IsNullOrWhiteSpace($androidSdk)) {
    throw 'ANDROID_HOME or ANDROID_SDK_ROOT is required to verify the APK.'
}
$aapt2 = Get-ChildItem (Join-Path $androidSdk 'build-tools') -Recurse -Filter 'aapt2.exe' | Sort-Object FullName -Descending | Select-Object -First 1
$apksigner = Get-ChildItem (Join-Path $androidSdk 'build-tools') -Recurse -Filter 'apksigner.bat' | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $aapt2 -or -not $apksigner) {
    throw "Android build-tools are incomplete under $androidSdk."
}

$badging = (& $aapt2.FullName dump badging $apkPath | Select-String '^package:').Line
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($badging)) {
    throw 'Unable to read APK package metadata.'
}
$expectedPackage = if ($Channel -eq 'internal') { 'xyz.shiguangjian.app.debug' } else { 'xyz.shiguangjian.app' }
if ($badging -notmatch "name='$([regex]::Escape($expectedPackage))'") {
    throw "Unexpected APK package. Expected $expectedPackage; metadata: $badging"
}
if ($Channel -eq 'internal' -and ($badging -notmatch "versionCode='$InternalVersionCode'" -or $badging -notmatch "versionName='$([regex]::Escape($InternalVersionName))'")) {
    throw "Internal APK version metadata does not match the requested build: $badging"
}

$certificateLine = (& $apksigner.FullName verify --print-certs $apkPath | Select-String 'Signer #1 certificate SHA-256 digest:').Line
if ($LASTEXITCODE -ne 0 -or $certificateLine -notmatch 'digest:\s*([0-9a-fA-F]{64})') {
    throw 'Unable to verify the APK signing certificate.'
}
$certificateSha256 = $Matches[1].ToLowerInvariant()
$expectedCertificateSha256 = if ($Channel -eq 'internal') { $internalCertificateSha256 } else { $stableCertificateSha256 }
if ($certificateSha256 -ne $expectedCertificateSha256) {
    throw "Unexpected APK signing certificate. Expected $expectedCertificateSha256, got $certificateSha256."
}

[pscustomobject]@{
    Channel = $Channel
    ApkPath = (Resolve-Path $apkPath).Path
    VersionCode = if ($Channel -eq 'internal') { $InternalVersionCode } else { $null }
    VersionName = if ($Channel -eq 'internal') { $InternalVersionName } else { $null }
    PackageName = $expectedPackage
    CertificateSha256 = $certificateSha256
} | Format-List
