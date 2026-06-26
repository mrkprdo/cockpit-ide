$specDir = 'D:\cockpit_ide\src\specs'
$rootDir = 'D:\cockpit_ide'
$files = Get-ChildItem -LiteralPath $specDir -Filter '*.spec.md' | Where-Object { $_.Name -notmatch '-ui\.spec\.md$' -and $_.Name -ne 'main.spec.md' }

$results = @()

foreach ($f in $files) {
    $content = Get-Content -LiteralPath $f.FullName -Raw
    $lines = $content -split '\r?\n'

    $inFrontmatter = $false
    $sourceFile = $null
    foreach ($line in $lines) {
        if ($line.Trim() -eq '---') {
            if (-not $inFrontmatter) { $inFrontmatter = $true; continue }
            else { break }
        }
        if ($inFrontmatter) {
            if ($line -match '^file:\s*(.+)$') { $sourceFile = $Matches[1].Trim() }
        }
    }

    $inDeps = $false
    $deps = @()
    foreach ($line in $lines) {
        if ($line -match '^## Dependencies') { $inDeps = $true; continue }
        if ($inDeps) {
            if ($line -match '^## ') { break }
            $ms = [regex]::Matches($line, '`([^`]+)`')
            foreach ($m in $ms) {
                $dep = $m.Groups[1].Value.Trim()
                if ($dep -match '^\.' -or $dep -match '^src/') {
                    if ($dep -notin $deps) { $deps += $dep }
                }
            }
        }
    }

    $results += [PSCustomObject]@{
        SpecFile = $f.Name
        SourceFile = $sourceFile
        RawDeps = ($deps -join '; ')
        DepCount = $deps.Count
    }
}

# Build dictionary of all known source files
$knownFiles = @{}
foreach ($r in $results) {
    if ($r.SourceFile) { $knownFiles[$r.SourceFile] = $r.SpecFile }
}

$mismatches = @()
foreach ($r in $results) {
    if (-not $r.SourceFile) { continue }
    $specName = $r.SpecFile
    $baseDir = Split-Path -Path $r.SourceFile -Parent
    $rawDeps = if ($r.RawDeps) { $r.RawDeps -split '; ' } else { @() }

    foreach ($dep in $rawDeps) {
        if (-not $dep) { continue }

        if ($dep -match '^src/') {
            $resolvedCanon = $dep
        } else {
            $combined = Join-Path -Path $baseDir -ChildPath $dep
            $fullPath = [System.IO.Path]::GetFullPath((Join-Path -Path $rootDir -ChildPath $combined))
            $resolvedCanon = $fullPath.Substring($rootDir.Length + 1) -replace '\\', '/'
        }

        if ($resolvedCanon -notmatch '\.(ts|json|css|html|d\.ts)$') {
            $resolvedCanon = "$resolvedCanon.ts"
        }

        if ($knownFiles.ContainsKey($resolvedCanon)) {
            Write-Host "OK: $specName -> $dep -> $resolvedCanon (matches $($knownFiles[$resolvedCanon]))"
        } else {
            Write-Host "MISMATCH: $specName -> $dep -> $resolvedCanon  [NOT FOUND]"
            $mismatches += [PSCustomObject]@{ Spec = $specName; Dep = $dep; Resolved = $resolvedCanon }
        }
    }
}

Write-Host ''
Write-Host '=== SUMMARY ==='
if ($mismatches.Count -eq 0) {
    Write-Host 'PASS: All dependencies resolve to known spec files.'
} else {
    Write-Host "FAIL: $($mismatches.Count) mismatches found:"
    foreach ($m in $mismatches) {
        Write-Host "  $($m.Spec) -> $($m.Dep)  (resolved: $($m.Resolved))"
    }
}
