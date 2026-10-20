param([string]$FilePath)
$heldFile = [System.IO.File]::Open($FilePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read)
try {
    [Console]::Out.WriteLine('ready')
    [Console]::Out.Flush()
    [void][Console]::In.ReadLine()
} finally {
    $heldFile.Dispose()
}
