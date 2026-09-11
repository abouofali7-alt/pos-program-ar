$bytes = [byte[]](10,10,10,27,100,4,29,86,66,0)
$path = Join-Path $PSScriptRoot "cut.bin"
[System.IO.File]::WriteAllBytes($path, $bytes)
Get-Content -Path $path -Encoding Byte | Out-Printer -Name "XP-80"
