param([string]$Architectures = 'x86_64')
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
if (-not $env:JAVA_HOME) { throw 'Set JAVA_HOME to the verified JDK 21 installation first.' }
if ($Architectures -notmatch '^(x86_64|arm64-v8a)(,(x86_64|arm64-v8a))?$') { throw 'Unsupported demo architectures.' }
$manifest = Get-Content android/app/src/main/AndroidManifest.xml -Raw
if ($manifest -notmatch 'ACCESS_BACKGROUND_LOCATION' -or $manifest -notmatch 'FOREGROUND_SERVICE_LOCATION') {
  throw 'Generate the native project with EXPO_PUBLIC_BACKGROUND_GPS=true before this build.'
}
if (-not (Test-Path android/app/debug.keystore)) { throw 'Existing local debug signing key is required; no key will be generated or overwritten.' }
$env:PATH = "$env:JAVA_HOME/bin;$env:ANDROID_HOME/platform-tools;$env:PATH"
$env:EXPO_PUBLIC_SERVICE_MODE = 'mock'
$env:EXPO_PUBLIC_GPS_MODE = 'device'
$env:EXPO_PUBLIC_BACKGROUND_GPS = 'true'
$env:NODE_ENV = 'production'
New-Item -ItemType Directory -Force test-results/demo | Out-Null
Push-Location android
try {
  & ./gradlew.bat :app:assembleRelease "-PreactNativeArchitectures=$Architectures" --console=plain 2>&1 | Tee-Object ../test-results/demo/build.log
  if ($LASTEXITCODE -ne 0) { throw 'Native release build failed.' }
} finally { Pop-Location }
$apk = Get-Item android/app/build/outputs/apk/release/app-release.apk
$target = Join-Path (Get-Location) "test-results/demo/neu-run-demo-$($Architectures.Replace(',','-')).apk"
Copy-Item -LiteralPath $apk.FullName -Destination $target
$metadata = @{
  builtAt = (Get-Date -Format o); variant = 'release'; signing = 'existing local debug key (internal demo only)'
  architectures = $Architectures; backend = 'mock'; gps = 'device'; background = $true
  apk = $target; bytes = $apk.Length; sha256 = (Get-FileHash $target -Algorithm SHA256).Hash
}
$metadata | ConvertTo-Json | Set-Content test-results/demo/build.json
$metadata | ConvertTo-Json
