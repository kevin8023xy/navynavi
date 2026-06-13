$sourceDir = 'e:\term\navi_navy'
$files = Get-ChildItem -Path $sourceDir -Filter '*.html' | Where-Object { $_.Name -match '14：56：54' }
$targetFile = $files[0].FullName
$content = [System.IO.File]::ReadAllText($targetFile, [System.Text.Encoding]::UTF8)

# Write content to a temp file for analysis
$tempFile = 'e:\term\navi_navy\console_content.txt'
[System.IO.File]::WriteAllText($tempFile, $content, [System.Text.Encoding]::UTF8)

# Extract text content between tags (visible text)
$regexText = New-Object System.Text.RegularExpressions.Regex('>([^<]{2,80})<', [System.Text.RegularExpressions.RegexOptions]::None)
$matchesText = $regexText.Matches($content)
$textSeen = @{}
foreach ($m in $matchesText) {
    $text = $m.Groups[1].Value.Trim()
    if ($text.Length -gt 2 -and $text.Length -lt 80 -and -not $textSeen.ContainsKey($text) -and $text -notmatch '^\s*$') {
        # Filter out CSS values
        if ($text -notmatch '^(0|1|none|auto|solid|relative|absolute|hidden|visible|static|inherit|initial|unset|#?[0-9a-f]{3,8}|rgba?\(|var\(--|[\d\.]+px|[\d\.]+em|[\d\.]+rem|[\d\.]+%|[\d\.]+deg|[\d\.]+s|[\d\.]+ms)$') {
            $textSeen[$text] = $true
        }
    }
}

Write-Host "=== Visible Text Content ==="
foreach ($t in ($textSeen.Keys | Sort-Object)) {
    Write-Host $t
}

# Extract all href/src links
Write-Host "`n=== Links ==="
$regexLink = New-Object System.Text.RegularExpressions.Regex('(?:href|src)=["\']?([^"\'>\s]+)["\']?', [System.Text.RegularExpressions.RegexOptions]::None)
$matchesLink = $regexLink.Matches($content)
$linkSeen = @{}
foreach ($m in $matchesLink) {
    $url = $m.Groups[1].Value
    if ($url.Length -gt 5 -and $url -notmatch '^data:' -and -not $linkSeen.ContainsKey($url)) {
        $linkSeen[$url] = $true
        Write-Host $url
    }
}
