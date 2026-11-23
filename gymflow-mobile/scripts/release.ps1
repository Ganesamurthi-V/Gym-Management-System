<#
.SYNOPSIS
  Builds the signed GymFlow Admin Android APK on this PC and publishes it as a GitHub release.

.DESCRIPTION
  Version is 1.1.<build>: one more than the highest existing release, and also the Android versionCode, so it only
  goes up. Tag admin-v1.1.<build>, title "Admin v1.1.<build>", notes built from the commits that touched
  gymflow-mobile/ since the previous release (gymflow-mobile/scripts/mobile_release.py).

  The release is built from the commit you have checked out, and that commit must already be on origin/main, so
  the tag points at code other people can see. Nothing is committed or pushed by this script.

  One-time setup: put the release key in %USERPROFILE%\.gradle\gradle.properties (never in the repo):
    GYMFLOW_RELEASE_STORE_FILE=C:/path/to/release.keystore
    GYMFLOW_RELEASE_STORE_PASSWORD=...
    GYMFLOW_RELEASE_KEY_ALIAS=...
    GYMFLOW_RELEASE_KEY_PASSWORD=...
  It must be the SAME key as earlier releases, or Android refuses to update an installed app. Without it Gradle
  silently signs with the public debug key, so the script refuses to publish in that case.

.PARAMETER DryRun
  Build and verify, print the release notes, but publish nothing. Works without the release key (warns instead).

.PARAMETER Clean
  Delete the native build caches (android/app/.cxx and android/app/build) first. Use it when Gradle fails with
  "Imported target ReactAndroid::jsi includes non-existent path". Do not run "gradlew clean": that task is what
  fails on stale caches.

.PARAMETER Notes
  Extra text to add to the release notes.

.PARAMETER Ask
  Show the release notes and ask "Publish? [y/N]" before uploading. Without it, a verified build is published
  straight away.

.EXAMPLE
  .\gymflow-mobile\scripts\release.ps1            # build, verify, publish: nothing else to do
  .\gymflow-mobile\scripts\release.ps1 -DryRun    # build and verify only
#>
[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$Clean,
  [switch]$Ask,
  [string]$Notes = ''
)

# 'Continue' on purpose: Windows PowerShell 5.1 turns any text a native tool writes to stderr into a fatal error under
# 'Stop' (gh prints "release not found" for a tag that does not exist yet, Gradle prints warnings). Every native
# call is checked through $LASTEXITCODE instead, and the cmdlets that must not fail say -ErrorAction Stop.
$ErrorActionPreference = 'Continue'

function Fail([string]$message) { Write-Host "ERROR: $message" -ForegroundColor Red; exit 1 }
function Write-Utf8([string]$path, [string]$text) {
  try { [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding($false))) } catch { Fail "Could not write ${path}: $($_.Exception.Message)" }
}
function Step([string]$message) { Write-Host "`n== $message" -ForegroundColor Cyan }
function Run-Native([string]$what, [scriptblock]$command) {
  & $command
  if ($LASTEXITCODE -ne 0) { Fail "$what failed (exit code $LASTEXITCODE)." }
}

$repoRoot = (git -C $PSScriptRoot rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { Fail 'Not inside the git repository.' }
Set-Location $repoRoot
$mobile = Join-Path $repoRoot 'gymflow-mobile'
$android = Join-Path $mobile 'android'
$helper = Join-Path $mobile 'scripts\mobile_release.py'
$apkDir = Join-Path $android 'app\build\outputs\apk\release'

# --- 1. Preconditions -----------------------------------------------------------------------------------------
Step 'Checking the setup'
foreach ($tool in 'git', 'gh', 'python', 'node') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Fail "'$tool' is not installed or not on PATH." }
}
if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) { Fail 'ANDROID_HOME is not set to your Android SDK folder.' }
$buildTools = Get-ChildItem (Join-Path $env:ANDROID_HOME 'build-tools') -Directory -ErrorAction SilentlyContinue |
  Where-Object { Test-Path (Join-Path $_.FullName 'apksigner.bat') } | Sort-Object Name | Select-Object -Last 1
if (-not $buildTools) { Fail 'No Android build-tools with apksigner found in the SDK.' }
if (-not (Test-Path (Join-Path $android 'app\google-services.json'))) {
  Fail 'gymflow-mobile/android/app/google-services.json is missing (Firebase push config; it is gitignored).'
}

gh auth status 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) { Fail 'GitHub CLI is not signed in. Run: gh auth login' }
# This clone has two GitHub remotes (origin and gm), so gh has no default repository and "gh release create" stops
# with "No default remote repository has been set". Name the repository from origin and hand it to every gh call.
$originUrl = (git remote get-url origin).Trim()
if ($originUrl -notmatch 'github\.com[:/](?<repo>[^/]+/[^/]+?)(\.git)?$') { Fail "Cannot read the GitHub repository from the origin remote: $originUrl" }
$repo = $Matches['repo']
$env:GH_REPO = $repo
$env:GITHUB_REPOSITORY = $repo

$gradleProps = Join-Path $env:USERPROFILE '.gradle\gradle.properties'
$hasKey = (Test-Path $gradleProps) -and ((Get-Content $gradleProps -Raw) -match '(?m)^\s*GYMFLOW_RELEASE_STORE_FILE\s*=')
if (-not $hasKey) {
  if ($DryRun) { Write-Host 'WARNING: no release key configured, so this build is debug-signed. Fine for a dry run, never for a release.' -ForegroundColor Yellow }
  else { Fail "No release signing key. Add the four GYMFLOW_RELEASE_* properties to $gradleProps (see the notes at the top of this script)." }
}

Run-Native 'git fetch' { git fetch --quiet origin --tags }
$head = (git rev-parse HEAD).Trim()
$short = $head.Substring(0, 7)
$problems = @()
if ((git branch --show-current).Trim() -ne 'main') { $problems += 'You are not on the main branch.' }
if (git status --porcelain -- gymflow-mobile) { $problems += 'There are uncommitted changes in gymflow-mobile/. Commit them (and push) first.' }
if ($head -ne (git rev-parse origin/main).Trim()) { $problems += 'HEAD is not the same as origin/main. Push (or pull) first, so the release points at published code.' }
if ($problems.Count -gt 0) {
  # A real release must come from published code; a dry run may build whatever is on disk.
  if ($DryRun) { $problems | ForEach-Object { Write-Host "WARNING: $_" -ForegroundColor Yellow } }
  else { Fail ($problems -join "`n") }
}

# --- 2. Version -----------------------------------------------------------------------------------------------
Step 'Working out the version'
$build = (python $helper next).Trim()
if ($LASTEXITCODE -ne 0 -or $build -notmatch '^\d+$') { Fail 'Could not work out the next build number.' }
$version = "1.1.$build"
$tag = "admin-v$version"
Write-Host "Version $version (versionCode $build), tag $tag, commit $short"
gh release view $tag 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { Fail "Release $tag already exists." }

# --- 3. Build -------------------------------------------------------------------------------------------------
Step 'Type-checking'
Push-Location $mobile
try { Run-Native 'TypeScript check' { npx tsc --noEmit } } finally { Pop-Location }

if ($Clean) {
  Step 'Removing native build caches'
  foreach ($dir in 'app\.cxx', 'app\build') {
    $path = Join-Path $android $dir
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop }
  }
}

Step 'Building the release APK (this takes several minutes)'
if (Test-Path -LiteralPath $apkDir) { Remove-Item -LiteralPath $apkDir -Recurse -Force -ErrorAction Stop }
Push-Location $android
try {
  Run-Native 'Gradle build' { .\gradlew.bat assembleRelease "-PGYMFLOW_VERSION_CODE=$build" "-PGYMFLOW_VERSION_NAME=$version" }
} finally { Pop-Location }

# --- 4. Verify ------------------------------------------------------------------------------------------------
Step 'Verifying the APK'
$built = Join-Path $apkDir 'app-release.apk'
if (-not (Test-Path $built)) { Fail "$built was not produced." }

$certs = (& (Join-Path $buildTools.FullName 'apksigner.bat') verify --print-certs $built) -join "`n"
if ($LASTEXITCODE -ne 0) { Fail 'apksigner could not verify the APK.' }
$debugSigned = $certs -match 'Android Debug'
if ($debugSigned -and -not $DryRun) { Fail 'The APK is signed with the debug key, not the release key. Refusing to publish.' }
if ($debugSigned) { Write-Host 'Signed with the debug key (dry run only).' -ForegroundColor Yellow }
else { Write-Host (($certs -split "`n" | Select-String 'certificate DN|SHA-256 digest' | Select-Object -First 2) -join "`n") }

$badging = (& (Join-Path $buildTools.FullName 'aapt2.exe') dump badging $built | Select-Object -First 1)
if ($badging -notmatch "versionCode='$build'") { Fail "versionCode inside the APK is not $build.`n$badging" }
if ($badging -notmatch "versionName='$([regex]::Escape($version))'") { Fail "versionName inside the APK is not $version.`n$badging" }
Write-Host $badging

$outDir = Join-Path $env:TEMP "gymflow-release-$version"
New-Item -ItemType Directory -Force -Path $outDir -ErrorAction Stop | Out-Null
$apk = Join-Path $outDir "GymFlow-Admin-v$version.apk"
Copy-Item -LiteralPath $built -Destination $apk -Force -ErrorAction Stop
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $apk -ErrorAction Stop).Hash.ToLower()
$sumFile = "$apk.sha256"
Write-Utf8 $sumFile "$hash  $(Split-Path $apk -Leaf)`n"
$sizeMb = [math]::Round((Get-Item $apk).Length / 1MB, 1)
Write-Host "APK: $apk ($sizeMb MB)"

# --- 5. Notes and publish -------------------------------------------------------------------------------------
Step 'Release description'
$env:GITHUB_SHA = $head
$env:EXTRA_NOTES = $Notes
$notesFile = Join-Path $outDir 'notes.md'
$text = (python $helper notes $version $build $apk) -join "`n"
if ($LASTEXITCODE -ne 0) { Fail 'Could not generate the release notes.' }
Write-Utf8 $notesFile $text
Write-Host $text

if ($DryRun) {
  Write-Host "`nDRY RUN: nothing was published. The APK and notes are in $outDir" -ForegroundColor Yellow
  exit 0
}

if ($Ask) {
  $answer = Read-Host "`nPublish release '$tag' (Admin v$version) to $repo? [y/N]"
  if ($answer -notmatch '^(y|yes)$') { Write-Host 'Cancelled. Nothing was published.'; exit 0 }
}

Step 'Publishing to GitHub'
Run-Native 'gh release create' {
  gh release create $tag "$apk#Admin v$version (Android APK)" "$sumFile#SHA-256 checksum" `
    -R $repo --target $head --title "Admin v$version" --notes-file $notesFile --latest
}
Write-Host "`nReleased: https://github.com/$repo/releases/tag/$tag" -ForegroundColor Green
