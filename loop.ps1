# loop.ps1 — Auto-loop para Claude Code
# Reinicia automaticamente quando o Claude para
# Uso: .\loop.ps1
# Uso com prompt inicial: .\loop.ps1 "implemente a fase X"

param(
    [string]$InitialPrompt = "",
    [int]$MaxIterations = 50,
    [string]$StopPhrase = "FASE COMPLETA",
    [int]$DelaySeconds = 3
)

$iteration = 0
$firstRun = $true

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Claude Auto-Loop" -ForegroundColor Cyan
Write-Host "  Max iteracoes : $MaxIterations" -ForegroundColor Cyan
Write-Host "  Stop phrase   : '$StopPhrase'" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

while ($iteration -lt $MaxIterations) {
    $iteration++

    Write-Host ""
    Write-Host "----------------------------------------" -ForegroundColor Yellow
    Write-Host "  Iteracao $iteration / $MaxIterations" -ForegroundColor Yellow
    Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Yellow
    Write-Host "----------------------------------------" -ForegroundColor Yellow
    Write-Host ""

    # Captura output para verificar stop phrase
    $outputFile = [System.IO.Path]::GetTempFileName()

    if ($firstRun -and $InitialPrompt -ne "") {
        Write-Host "Iniciando com prompt: $InitialPrompt" -ForegroundColor Green
        $firstRun = $false

        # Primeira execucao com prompt inicial
        claude --print "$InitialPrompt" | Tee-Object -FilePath $outputFile
    } else {
        $firstRun = $false

        # Continuacoes subsequentes
        Write-Host "Continuando sessao anterior..." -ForegroundColor Green
        claude --continue --print "continue exatamente de onde voce parou, sem repetir o que ja foi feito. Se terminou tudo, escreva: $StopPhrase" | Tee-Object -FilePath $outputFile
    }

    $exitCode = $LASTEXITCODE
    $output = Get-Content $outputFile -Raw -ErrorAction SilentlyContinue
    Remove-Item $outputFile -ErrorAction SilentlyContinue

    Write-Host ""

    # Verifica se Claude sinalizou conclusao
    if ($output -and $output -match [regex]::Escape($StopPhrase)) {
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "  CONCLUIDO: '$StopPhrase' detectado!" -ForegroundColor Green
        Write-Host "  Total de iteracoes: $iteration" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        exit 0
    }

    # Verifica erro fatal (nao apenas pausa normal)
    if ($exitCode -ne 0 -and $exitCode -ne 1) {
        Write-Host "ERRO: Claude retornou exit code $exitCode" -ForegroundColor Red
        Write-Host "Abortando loop." -ForegroundColor Red
        exit $exitCode
    }

    # Aguarda antes de continuar
    if ($iteration -lt $MaxIterations) {
        Write-Host "Aguardando $DelaySeconds segundos antes de continuar..." -ForegroundColor DarkGray
        Start-Sleep -Seconds $DelaySeconds
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  LIMITE ATINGIDO: $MaxIterations iteracoes" -ForegroundColor Magenta
Write-Host "  Execute novamente para continuar." -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
exit 0
