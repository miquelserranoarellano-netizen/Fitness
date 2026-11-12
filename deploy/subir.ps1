# Sube IKYNDO al VPS desde este PC por SSH, sin pasar por GitHub: empaqueta lo último confirmado (HEAD), lo copia
# al VPS y lo instala o actualiza con deploy/instalar.sh. La primera vez prepara el VPS y crea el .env; las
# siguientes solo actualiza (el .env y los códigos se conservan). En la raíz del repositorio:
#   powershell -ExecutionPolicy Bypass -File deploy\subir.ps1 -Ip 1.2.3.4 -Dominio tudominio.com -Correo tu@correo.com
# Opcional: -Personas "miquel,marc" (un código de acceso para cada uno; solo la primera vez) y -Clave <ruta>.
param(
  [Parameter(Mandatory)] [string] $Ip,
  [Parameter(Mandatory)] [string] $Dominio,
  [Parameter(Mandatory)] [string] $Correo,
  [string] $Personas = "miquel",
  [string] $Clave = "$env:USERPROFILE\.ssh\ikyndo_vps"
)
$ErrorActionPreference = "Stop"

function Fallo([string] $mensaje) {
  Write-Host $mensaje -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $Clave)) { Fallo "No encuentro la clave SSH $Clave (DESPLIEGUE.md, «Subirlo desde el PC»)." }
# Van dentro de la orden que se ejecuta en el VPS: solo caracteres seguros, y dominio y nombres en minúsculas.
$Dominio = $Dominio.Trim().ToLowerInvariant()
$Personas = $Personas.Trim().ToLowerInvariant()
if ($Ip -notmatch '^[0-9a-fA-F.:]+$') { Fallo "IP no válida: $Ip" }
if ($Dominio -notmatch '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$') { Fallo "Dominio no válido: $Dominio (sin https ni www)." }
if ($Correo -notmatch "^[^\s@'|&\\]+@[^\s@'|&\\]+\.[^\s@'|&\\]+$") { Fallo "Correo no válido: $Correo" }
if ($Personas -notmatch '^[a-z0-9_.-]+(,[a-z0-9_.-]+)*$') { Fallo "Personas no válidas: $Personas (nombres en minúsculas separados por comas)." }

# git: el del PATH o el de GitHub Desktop.
$git = (Get-Command git -ErrorAction SilentlyContinue).Source
if (-not $git) {
  $git = Get-ChildItem "$env:LOCALAPPDATA\GitHubDesktop" -Recurse -Filter git.exe -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -like "*\cmd\git.exe" } | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $git) { Fallo "No encuentro git (ni en el PATH ni el de GitHub Desktop)." }

$raiz = Split-Path $PSScriptRoot -Parent
$cambios = & $git -C $raiz status --porcelain --untracked-files=no
if ($cambios) { Write-Host "Ojo: hay cambios sin confirmar; se sube lo último confirmado (HEAD)." -ForegroundColor Yellow }

$paquete = Join-Path $env:TEMP "ikyndo.tar.gz"
# Saltos de línea tal cual están en el repositorio (LF): los scripts del VPS no funcionan con CRLF.
& $git -C $raiz -c core.autocrlf=false archive --format=tar.gz -o $paquete HEAD
if ($LASTEXITCODE -ne 0) { Fallo "No se ha podido empaquetar el código." }

$opciones = @("-i", $Clave, "-o", "StrictHostKeyChecking=accept-new", "-o", "BatchMode=yes")
Write-Host "==> Copiando el código al VPS ($Ip)"
& scp @opciones $paquete "root@${Ip}:/tmp/ikyndo.tar.gz"
if ($LASTEXITCODE -ne 0) { Fallo "No se ha podido copiar al VPS. ¿Está la clave pública en hPanel y el VPS encendido?" }
Remove-Item $paquete

Write-Host "==> Instalando en el VPS"
& ssh @opciones "root@$Ip" "mkdir -p /opt/fitness && tar -xzf /tmp/ikyndo.tar.gz -C /opt/fitness && rm /tmp/ikyndo.tar.gz && bash /opt/fitness/deploy/instalar.sh '$Dominio' '$Correo' '$Personas'"
if ($LASTEXITCODE -ne 0) { Fallo "La instalación ha fallado: mira los mensajes de arriba." }
Write-Host "Hecho. Portada: https://$Dominio  ·  App: https://app.$Dominio" -ForegroundColor Green
