# Inicia o PostgreSQL de desenvolvimento do projeto (cluster próprio, porta 5433).
# Não toca no PostgreSQL instalado como serviço na porta 5432.
$bin = "C:\Program Files\PostgreSQL\17\bin"
$data = "$env:LOCALAPPDATA\pilates-riven-pg"

& "$bin\pg_isready.exe" -h 127.0.0.1 -p 5433 | Out-Null
if ($LASTEXITCODE -eq 0) { Write-Output "Postgres de desenvolvimento já está rodando (porta 5433)."; exit 0 }

Start-Process -FilePath "$bin\pg_ctl.exe" -WindowStyle Hidden -ArgumentList "-D `"$data`" -o `"-p 5433 -c listen_addresses=127.0.0.1`" -l `"$data\server.log`" start"
Start-Sleep -Seconds 4
& "$bin\pg_isready.exe" -h 127.0.0.1 -p 5433
