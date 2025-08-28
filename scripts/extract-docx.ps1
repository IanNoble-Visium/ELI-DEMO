$ErrorActionPreference = 'Stop'
$destDir = "docs/_extract"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null

function Extract-DocxText([string]$docxPath,[string]$outBase) {
  $dest = Join-Path $destDir $outBase
  if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
  $tmpZip = Join-Path $destDir ("$outBase.zip")
  if (Test-Path $tmpZip) { Remove-Item $tmpZip -Force }
  Copy-Item -Path $docxPath -Destination $tmpZip -Force
  Expand-Archive -Path $tmpZip -DestinationPath $dest -Force
  Remove-Item $tmpZip -Force
  $xmlPath = Join-Path $dest 'word/document.xml'
  if (!(Test-Path $xmlPath)) { throw "document.xml not found in $docxPath" }
  $xml = Get-Content $xmlPath -Raw
  $txt = $xml -replace '<w:tab\s*/>', "`t" -replace '</w:p>', "`r`n" -replace '<[^>]+>', ''
  $txt = [System.Net.WebUtility]::HtmlDecode($txt)
  $outPath = Join-Path $destDir ("$outBase.txt")
  $txt | Out-File -FilePath $outPath -Encoding UTF8
  return $outPath
}

$files = @(
  @{ path='docs/External system push.docx'; name='external_system_push' },
  @{ path='docs/ELI Notes 2025 v1.docx'; name='eli_notes_2025_v1' }
)

foreach($f in $files){
  if (Test-Path $f.path) {
    $out = Extract-DocxText -docxPath $f.path -outBase $f.name
    Write-Host "=== Extracted: $($f.path) -> $out ==="
    $content = Get-Content $out -Raw
    if ($content.Length -gt 4000) { $preview = $content.Substring(0,4000) } else { $preview = $content }
    Write-Output $preview
    Write-Host "`n--- End excerpt ---`n"
  } else {
    Write-Host "File not found: $($f.path)"
  }
}

