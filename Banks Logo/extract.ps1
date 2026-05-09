$files = Get-ChildItem -Filter "*.svg"
foreach ($f in $files) {
    if ($f.Name -match "^extracted_") { continue }
    $content = Get-Content $f.FullName -Raw
    
    $defs = ""
    if ($content -match "(?s)<defs>.*?</defs>") {
        $defs = $matches[0]
    }
    
    $pattern = "(?s)<g clip-path=`"url\([^`"]+\)`">(.*?)</g>"
    $matchesAll = [regex]::Matches($content, $pattern)
    
    $i = 1
    foreach ($m in $matchesAll) {
        $gContent = $m.Groups[0].Value
        if ($gContent -match "<rect\s+x=`"(\d+)`"\s+y=`"(\d+)`"\s+width=`"(\d+)`"\s+height=`"(\d+)`"") {
            $x = $matches[1]
            $y = $matches[2]
            $w = $matches[3]
            $h = $matches[4]
            
            $newSvg = @"
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="$x $y $w $h" width="100%" height="100%">
$defs
$gContent
</svg>
"@
            $outName = "extracted_$($f.BaseName)_$i.svg"
            Set-Content -Path $outName -Value $newSvg -Encoding UTF8
            Write-Host "Created $outName"
            $i++
        }
    }
}
