# Appcombinada · app (Expo)

> **En fusión.** Esta carpeta es la base de la app combinada con SnapCal (ver `../fusion/PLAN-FUSION.md` y
> `docs/ESTADO.md`). Fase 2 hecha: tema claro y oscuro, y sistema de traducciones. Lo que sigue describe la app de
> partida y se irá actualizando en cada fase.

Versión para móvil de Smart Fitness Coach: entrenador personal de hipertrofia con
rutina generada por reglas, modo entrenamiento, seguimiento corporal, revisiones semanales y mensuales,
análisis de puntos fuertes y débiles y evaluación de bloques. Se publica como web en el VPS de Hostinger
(`tudominio.com/app`, con la presentación de IKYNDO en `tudominio.com`; ver [`../DESPLIEGUE.md`](../DESPLIEGUE.md)),
sin cuenta: los datos se guardan en el navegador o en el teléfono (SQLite).

La **nutrición está a medias a propósito**: la app calcula el objetivo diario (calorías y macros) y si hay que
ajustarlo, pero el registro de lo que se come lo aportará la app de fotos de comida. Ver
[`docs/INTEGRACION-NUTRICION.md`](docs/INTEGRACION-NUTRICION.md).

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run web` | La app en el navegador del ordenador, para desarrollar (SQLite en web es experimental) |
| `npm run check` | Tipos, lint y pruebas |
| `npm test` | Solo las pruebas (dominio y base de datos, con `node:sqlite`) |
| `npm run i18n` | Textos que faltan en los catálogos de inglés, francés y alemán |

La versión publicada (presentación y app juntas en el VPS de Hostinger) se monta con Docker: ver [`../DESPLIEGUE.md`](../DESPLIEGUE.md).

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
