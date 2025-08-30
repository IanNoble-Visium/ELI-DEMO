$ErrorActionPreference = 'Stop'
$destDir = "docs/_extract"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null

$dest = Join-Path $destDir "webhooks_json_description"
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
$tmpZip = Join-Path $destDir "webhooks_json_description.zip"
if (Test-Path $tmpZip) { Remove-Item $tmpZip -Force }

Copy-Item -Path "docs/Webhooks json description.docx" -Destination $tmpZip -Force
Expand-Archive -Path $tmpZip -DestinationPath $dest -Force
Remove-Item $tmpZip -Force

$xmlPath = Join-Path $dest 'word/document.xml'
if (!(Test-Path $xmlPath)) { throw "document.xml not found" }

$xml = Get-Content $xmlPath -Raw
$txt = $xml -replace '<w:tab\s*/>', "`t" -replace '</w:p>', "`r`n" -replace '<[^>]+>', ''
$txt = [System.Net.WebUtility]::HtmlDecode($txt)

$outPath = Join-Path $destDir "webhooks_json_description.txt"
$txt | Out-File -FilePath $outPath -Encoding UTF8

Write-Host "Extracted to: $outPath"
$content = Get-Content $outPath -Raw
if ($content.Length -gt 2000) { 
    $preview = $content.Substring(0,2000) 
} else { 
    $preview = $content 
}
Write-Output $preview
