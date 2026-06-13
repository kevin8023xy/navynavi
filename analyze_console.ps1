$sourceDir = 'e:\term\navi_navy'
$files = Get-ChildItem -Path $sourceDir -Filter '*.html' | Where-Object { $_.Name -match '14：56：54' }
if ($files.Count -eq 0) {
    Write-Host "File not found"
    exit
}
$targetFile = $files[0].FullName
Write-Host "Found file: $targetFile"
$content = [System.IO.File]::ReadAllText($targetFile, [System.Text.Encoding]::UTF8)
$lines = $content.Split([char]10)
Write-Host "Total lines: $($lines.Count)"
for ($i = 0; $i -lt [Math]::Min($lines.Count, 10); $i++) {
    Write-Host "Line $($i+1) length: $($lines[$i].Length)"
}

# Extract title
$regexTitle = New-Object System.Text.RegularExpressions.Regex('<title>(.*?)</title>', [System.Text.RegularExpressions.RegexOptions]::None)
$mTitle = $regexTitle.Match($content)
if ($mTitle.Success) {
    Write-Host "`n=== Title ==="
    Write-Host $mTitle.Groups[1].Value
}

# Extract headings
Write-Host "`n=== Headings ==="
$regexH = New-Object System.Text.RegularExpressions.Regex('<h[1-6][^>]*>(.*?)</h[1-6]>', [System.Text.RegularExpressions.RegexOptions]::None)
$matchesH = $regexH.Matches($content)
foreach ($m in $matchesH) {
    $text = $m.Groups[1].Value
    if ($text.Length -gt 0 -and $text.Length -lt 200) {
        Write-Host $text
    }
}

# Extract button text
Write-Host "`n=== Buttons ==="
$regexBtn = New-Object System.Text.RegularExpressions.Regex('<button[^>]*>(.*?)</button>', [System.Text.RegularExpressions.RegexOptions]::None)
$matchesBtn = $regexBtn.Matches($content)
$btnSeen = @{}
foreach ($m in $matchesBtn) {
    $text = $m.Groups[1].Value.Trim()
    if ($text.Length -gt 0 -and $text.Length -lt 100 -and -not $btnSeen.ContainsKey($text)) {
        $btnSeen[$text] = $true
        Write-Host $text
    }
}

# Extract labels
Write-Host "`n=== Labels / Form text ==="
$regexLabel = New-Object System.Text.RegularExpressions.Regex('<label[^>]*>(.*?)</label>', [System.Text.RegularExpressions.RegexOptions]::None)
$matchesLabel = $regexLabel.Matches($content)
$labelSeen = @{}
foreach ($m in $matchesLabel) {
    $text = $m.Groups[1].Value.Trim()
    if ($text.Length -gt 0 -and $text.Length -lt 100 -and -not $labelSeen.ContainsKey($text)) {
        $labelSeen[$text] = $true
        Write-Host $text
    }
}

# Extract table headers
Write-Host "`n=== Table headers ==="
$regexTh = New-Object System.Text.RegularExpressions.Regex('<th[^>]*>(.*?)</th>', [System.Text.RegularExpressions.RegexOptions]::None)
$matchesTh = $regexTh.Matches($content)
$thSeen = @{}
foreach ($m in $matchesTh) {
    $text = $m.Groups[1].Value.Trim()
    if ($text.Length -gt 0 -and $text.Length -lt 100 -and -not $thSeen.ContainsKey($text)) {
        $thSeen[$text] = $true
        Write-Host $text
    }
}

# Extract input placeholders
Write-Host "`n=== Input placeholders ==="
$regexPl = New-Object System.Text.RegularExpressions.Regex('placeholder="([^"]*)"', [System.Text.RegularExpressions.RegexOptions]::None)
$matchesPl = $regexPl.Matches($content)
foreach ($m in $matchesPl) {
    Write-Host $m.Groups[1].Value
}

# Extract data attributes or IDs that might indicate component names
Write-Host "`n=== IDs ==="
$regexId = New-Object System.Text.RegularExpressions.Regex('id="([^"]*)"', [System.Text.RegularExpressions.RegexOptions]::None)
$matchesId = $regexId.Matches($content)
$idSeen = @{}
foreach ($m in $matchesId) {
    $id = $m.Groups[1].Value
    if ($id.Length -gt 3 -and $id.Length -lt 50 -and -not $idSeen.ContainsKey($id)) {
        $idSeen[$id] = $true
        if ($idSeen.Count -le 30) {
            Write-Host $id
        }
    }
}

# Extract class names for layout
Write-Host "`n=== Layout classes ==="
$regexClass = New-Object System.Text.RegularExpressions.Regex('class="([^"]*)"', [System.Text.RegularExpressions.RegexOptions]::None)
$matchesClass = $regexClass.Matches($content)
$classSeen = @{}
foreach ($m in $matchesClass) {
    $classes = $m.Groups[1].Value -split ' '
    foreach ($c in $classes) {
        $c = $c.Trim()
        if ($c -match 'sidebar|header|toolbar|panel|menu|nav|content|main|footer|card|modal|drawer|split' -and -not $classSeen.ContainsKey($c)) {
            $classSeen[$c] = $true
            Write-Host $c
        }
    }
}

# Look for AIS or playback related text
Write-Host "`n=== AIS / Playback related ==="
$regexAis = New-Object System.Text.RegularExpressions.Regex('(?i)(ais|playback|track|vessel|ship|recording|replay)', [System.Text.RegularExpressions.RegexOptions]::None)
$matchesAis = $regexAis.Matches($content)
$aisSeen = @{}
foreach ($m in $matchesAis) {
    $word = $m.Value.ToLower()
    if (-not $aisSeen.ContainsKey($word)) {
        $aisSeen[$word] = $true
    }
}
foreach ($k in $aisSeen.Keys) {
    Write-Host $k
}
