# Appcombinada · app (Expo)

> **En fusión.** Esta carpeta es la base de la app combinada con SnapCal (ver `../fusion/PLAN-FUSION.md` y
> `docs/ESTADO.md`). Fase 2 hecha: tema claro y oscuro, y sistema de traducciones. Lo que sigue describe la app de
> partida y se irá actualizando en cada fase.

Versión para móvil de Smart Fitness Coach: entrenador personal de hipertrofia con
rutina generada por reglas, modo entrenamiento, seguimiento corporal, revisiones semanales y mensuales,
análisis de puntos fuertes y débiles y evaluación de bloques. Funciona en **Expo Go**, sin cuenta ni servidor:
los datos se guardan en el propio teléfono (SQLite).

La **nutrición está a medias a propósito**: la app calcula el objetivo diario (calorías y macros) y si hay que
ajustarlo, pero el registro de lo que se come lo aportará la app de fotos de comida. Ver
[`docs/INTEGRACION-NUTRICION.md`](docs/INTEGRACION-NUTRICION.md).

## Abrirla en el móvil con Expo Go

1. Instala **Expo Go** en el móvil (App Store o Google Play). Tiene que admitir el **SDK 57**.
2. Si tu móvil es un **iPhone**: Expo Go exige iniciar sesión con una cuenta de Expo (gratuita) en el móvil y
   en el ordenador. En la terminal de Ubuntu: `npx expo login`, y en Expo Go, toca el avatar arriba a la
   derecha y entra con la misma cuenta. En Android no hace falta (por ahora).
3. El móvil tiene que poder llegar al ordenador. Como el proyecto está dentro de WSL, hay dos formas:

   **A. Red «mirrored» de WSL (recomendada, se configura una vez).** WSL comparte la red de Windows y el móvil
   lo ve en la misma wifi.
   1. Crea el archivo `C:\Users\mique\.wslconfig` con este contenido:

      ```ini
      [wsl2]
      networkingMode=mirrored
      ```
   2. En PowerShell **como administrador**: `wsl --shutdown` (cierra Ubuntu; al abrirlo ya usa la red nueva).
   3. En PowerShell **como administrador**, permite que el móvil llegue al puerto de Expo:

      ```powershell
      New-NetFirewallHyperVRule -Name "Expo-Metro" -DisplayName "Expo Metro (8081)" -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -Protocol TCP -LocalPorts 8081
      ```
   4. En Ubuntu: `cd ~/proyectos/smart-fitness-coach-app && npm start`, con el móvil en la misma wifi.

   **B. Túnel de Expo.** `npm run tunnel`. No necesita tocar Windows, pero depende de un servicio externo
   (ngrok). Sin sesión de Expo iniciada falló al probarlo (15/10/2026); con `npx expo login` puede funcionar.
4. Escanea el código QR que aparece: con la cámara en iPhone, desde Expo Go en Android.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm start` | Servidor de desarrollo en la red local (con la red «mirrored» de WSL) |
| `npm run tunnel` | Servidor de desarrollo con túnel de Expo |
| `npm run web` | Vista web para revisar pantallas en el navegador (SQLite en web es experimental) |
| `npm run check` | Tipos, lint y pruebas |
| `npm test` | Solo las pruebas (dominio y base de datos, con `node:sqlite`) |

## Estructura

```
src/
  app/                 Pantallas (Expo Router): (tabs)/ inicio, entrenamiento, nutricion, cuerpo, mas;
                       bienvenida (cuestionario), sesion/[id] (modo entrenamiento), ejercicio/[id],
                       historial, analisis, revisiones, perfil, informe-inicial
  domain/              Motor de reglas copiado de la web (rutinas, progresión, análisis, revisiones). Puro y con pruebas
  data/                Lectura y escritura en SQLite (perfil, cuerpo, bloques, sesiones, nutrición, revisiones),
                       servicios que combinan tablas, `insights` y `coach`, y el proveedor de datos para React
  db/                  Esquema y migraciones (SQLite), adaptador de Expo y adaptador de pruebas (node:sqlite)
  integrations/        nutrition/: contrato y almacenamiento para la app de fotos de comida
  features/            Formularios del perfil y del cuestionario (compartidos con Perfil)
  components/          Interfaz común: tarjetas, botones, formularios, gráficos SVG
  lib/                 Fechas, unidades, formato, ids
docs/                  ESTADO.md, INTEGRACION-NUTRICION.md
```

## Diferencias con la web

- **Sin cuentas ni servidor.** Un usuario por teléfono; los datos no salen del dispositivo salvo que los exportes
  (Perfil → Exportar mis datos, en JSON con las mismas tablas que la web).
- **Nutrición a medias** (ver arriba): sin menús, recetas, lista de la compra ni registro manual de comidas.
- **Sin IA.** La IA de la web necesita un servidor para proteger la clave. Todo lo demás funciona igual.
- **«Hoy» es el día del teléfono**, no el de la zona horaria de Madrid.
