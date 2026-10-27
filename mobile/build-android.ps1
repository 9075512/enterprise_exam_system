param(
    [ValidateSet('Release', 'Debug')]
    [string]$Configuration = 'Release',
    [string]$ServerUrl = 'https://139.9.134.68'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $PSScriptRoot 'android'
$localTools = Join-Path $projectRoot '.android-tools'

if (-not $env:JAVA_HOME) {
    $bundledJdk = Get-ChildItem (Join-Path $localTools 'jdk') -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($bundledJdk) { $env:JAVA_HOME = $bundledJdk.FullName }
}
if (-not $env:JAVA_HOME -or -not (Test-Path (Join-Path $env:JAVA_HOME 'bin/java.exe'))) {
    throw '需要 JDK 17：请设置 JAVA_HOME 后重试。'
}
if (-not $env:ANDROID_HOME) {
    if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_HOME = $env:ANDROID_SDK_ROOT }
    elseif (Test-Path (Join-Path $localTools 'sdk')) { $env:ANDROID_HOME = Join-Path $localTools 'sdk' }
    elseif (Test-Path "$env:LOCALAPPDATA\Android\Sdk") { $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk" }
}
if (-not $env:ANDROID_HOME) { throw '需要 Android SDK：请设置 ANDROID_HOME 后重试。' }
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
# 将 TEMP/TMP 统一为完整路径，供 Windows/JDK 构建工具使用。
# 仅影响本构建进程及其子进程。
if ($env:TEMP -match '~' -and $env:LOCALAPPDATA) {
    $env:TEMP = Join-Path $env:LOCALAPPDATA 'Temp'
    $env:TMP = $env:TEMP
}
# 部分 Windows 运行环境能绑定 AF_UNIX 却无法连接，JDK Selector 因而启动失败。
# 指向不存在的 socket 目录，使 JDK 按其实现回退 TCP loopback（不修改系统设置）。
$unavailableSocketDir = Join-Path $env:LOCALAPPDATA ('ZhuodaLearner/no-uds-' + [Guid]::NewGuid().ToString('N'))
$env:JAVA_TOOL_OPTIONS = ($env:JAVA_TOOL_OPTIONS + ' -Djdk.net.unixdomain.tmpdir="' + $unavailableSocketDir + '"').Trim()

if ($Configuration -eq 'Release') {
    $signingPath = Join-Path $androidRoot 'signing.properties'
    $keyPath = Join-Path $androidRoot 'learner-release.keystore'
    if (-not (Test-Path $signingPath)) {
        if (Test-Path $keyPath) { throw '发现已有签名密钥，请恢复对应 signing.properties；不会覆盖已有密钥。' }
        $randomBytes = New-Object byte[] 32
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $rng.GetBytes($randomBytes)
        $rng.Dispose()
        $keyPassword = ([BitConverter]::ToString($randomBytes)).Replace('-', '').ToLowerInvariant()
        & "$env:JAVA_HOME\bin\keytool.exe" -genkeypair -noprompt -keystore $keyPath -storetype PKCS12 -alias zhuoda-learner -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Zhuoda Learner, O=Zhuoda, C=CN' -storepass $keyPassword -keypass $keyPassword
        if ($LASTEXITCODE -ne 0) { throw '创建签名密钥失败。' }
        @(
            'storeFile=learner-release.keystore'
            "storePassword=$keyPassword"
            'keyAlias=zhuoda-learner'
            "keyPassword=$keyPassword"
        ) | Set-Content -LiteralPath $signingPath -Encoding ascii
        Write-Host '已创建本地发布签名，请妥善备份 mobile/android/learner-release.keystore 和 signing.properties。'
    }
}

# Android 部分 Windows 工具无法可靠处理中文参数文件；从 ASCII 缓存目录构建。
$buildRoot = $androidRoot
if ($androidRoot -match '[^\x00-\x7F]' -or $env:ANDROID_HOME -match '[^\x00-\x7F]') {
    $cacheRoot = Join-Path $env:LOCALAPPDATA 'ZhuodaLearner'
    if ($cacheRoot -match '[^\x00-\x7F]') { throw '请在英文路径下构建，或将 LOCALAPPDATA 指向可写的英文路径。' }
    $buildRoot = Join-Path $cacheRoot ('builds/' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $buildRoot | Out-Null
    foreach ($name in @('build.gradle', 'settings.gradle', 'gradle.properties', 'gradlew', 'gradlew.bat', 'gradle')) {
        Copy-Item -LiteralPath (Join-Path $androidRoot $name) -Destination $buildRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $buildRoot 'app') | Out-Null
    Copy-Item -LiteralPath (Join-Path $androidRoot 'app/build.gradle') -Destination (Join-Path $buildRoot 'app')
    Copy-Item -LiteralPath (Join-Path $androidRoot 'app/src') -Destination (Join-Path $buildRoot 'app') -Recurse
    foreach ($name in @('signing.properties', 'learner-release.keystore')) {
        $source = Join-Path $androidRoot $name
        if (Test-Path $source) { Copy-Item -LiteralPath $source -Destination $buildRoot }
    }
    if ($env:ANDROID_HOME -match '[^\x00-\x7F]') {
        $asciiSdk = Join-Path $cacheRoot 'sdk'
        foreach ($name in @('platforms/android-35', 'build-tools/35.0.0', 'platform-tools', 'licenses')) {
            $target = Join-Path $asciiSdk $name
            if (-not (Test-Path $target)) {
                New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
                Copy-Item -LiteralPath (Join-Path $env:ANDROID_HOME $name) -Destination $target -Recurse
            }
        }
        $env:ANDROID_HOME = $asciiSdk
    }
    Write-Host "Android build directory: $buildRoot"
}

Push-Location $buildRoot
try {
    & .\gradlew.bat --no-daemon testDebugUnitTest lintRelease "assemble$Configuration" "-PserverUrl=$ServerUrl"
    if ($LASTEXITCODE -ne 0) { throw 'Android 构建或检查失败。' }
    $variant = $Configuration.ToLowerInvariant()
    $apk = Join-Path $buildRoot "app/build/outputs/apk/$variant/app-$variant.apk"
    if (-not (Test-Path $apk)) { throw "没有找到已签名 APK：$apk" }
    $outputDir = Join-Path $PSScriptRoot 'releases'
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
    $metadataPath = Join-Path $buildRoot "app/build/outputs/apk/$variant/output-metadata.json"
    $metadata = Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json
    $appVersion = $metadata.elements[0].versionName
    $outputApk = Join-Path $outputDir "zhuoda-learner-$appVersion-$variant.apk"
    Copy-Item -LiteralPath $apk -Destination $outputApk -Force
    $signer = Join-Path $env:ANDROID_HOME 'build-tools/35.0.0/apksigner.bat'
    & $signer verify --verbose $outputApk
    if ($LASTEXITCODE -ne 0) { throw 'APK 签名验证失败。' }
    $hashAlgorithm = [System.Security.Cryptography.SHA256]::Create()
    $apkStream = [System.IO.File]::OpenRead($outputApk)
    try { $sha256 = ([BitConverter]::ToString($hashAlgorithm.ComputeHash($apkStream))).Replace('-', '').ToLowerInvariant() }
    finally { $apkStream.Dispose(); $hashAlgorithm.Dispose() }
    "$sha256  $([System.IO.Path]::GetFileName($outputApk))" | Set-Content -LiteralPath "$outputApk.sha256" -Encoding ascii
    Write-Host "SHA256: $sha256"
    Write-Host "APK: $outputApk"
} finally { Pop-Location }
