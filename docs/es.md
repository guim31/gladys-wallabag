# Wallabag

Conecte Gladys a [Wallabag](https://wallabag.org), la aplicación libre de
lectura diferida: siga sus artículos sin leer y su tiempo de lectura, reaccione
cuando se guarda o se lee un artículo, guarde un enlace desde una escena y
muestre los últimos artículos sin leer en el panel.

Probada con un Wallabag 2.6.14 real (la imagen Docker oficial). Sus comentarios
son bienvenidos en el foro de Gladys.

## Requisitos

- Gladys Assistant 5.1 o posterior.
- Wallabag 2, autoalojado o el servicio alojado
  [wallabag.it](https://wallabag.it), accesible desde la máquina de Gladys.
- Un cliente de API: en Wallabag, abra **Configuración de clientes API → Crear
  un nuevo cliente** (basta con un nombre) y anote su **ID de cliente** y su
  **secreto de cliente**.
- Su nombre de usuario y su contraseña de Wallabag: la API de Wallabag los pide
  para conectarse (OAuth2). La integración ve los artículos de ese usuario.

## Configuración

1. Abra la pestaña **Configuración** de la integración.
2. En **Dirección de Wallabag**, introduzca la dirección del servidor, por
   ejemplo `192.168.1.50:8080`, o una dirección completa como
   `https://wallabag.example.org` o `https://app.wallabag.it`.
3. Pegue el **ID de cliente** y el **secreto de cliente**, y luego su **nombre
   de usuario** y su **contraseña**.
4. Opcional: **Leer Wallabag cada** (5 minutos por defecto).
5. Haga clic en **Probar la conexión**: muestra el usuario, los artículos sin
   leer, su tiempo de lectura y los favoritos.
6. Abra la pestaña **Descubrir** y añada el dispositivo **Wallabag**.

La contraseña sirve para obtener un token de conexión, renovado cada hora sin
volver a pedirla; nunca se escribe en los registros.

## Dispositivo

**Wallabag**, cuatro valores guardados en el historial:

- _Artículos sin leer_: la lista «Sin leer» de Wallabag.
- _Artículos favoritos_: la lista «Favoritos» (leídos o no).
- _Leídos hoy_: los artículos marcados como leídos (archivados) desde
  medianoche, en la zona horaria de Gladys.
- _Tiempo de lectura (sin leer)_: la suma de los tiempos de lectura que
  Wallabag estima para los artículos sin leer, en minutos. A partir de 2000
  artículos sin leer, el resto se estima según la media.

Los valores se leen cada pocos minutos (el ajuste anterior) y justo después de
cada cambio hecho desde Gladys.

## Widget del panel

**Wallabag**: el número de artículos sin leer, su tiempo de lectura, los
artículos leídos hoy, los seis artículos guardados más recientemente y aún sin
leer (sitio, tiempo de lectura, etiquetas, una estrella para los favoritos,
enlaces al artículo y a Wallabag cuando son https) y un botón **Actualizar**
que lee Wallabag al momento. Ajustado a una etiqueta (por ejemplo `cocina` en
la tableta de la cocina), el widget solo muestra los artículos sin leer de esa
etiqueta.

## Disparadores de escena

- **Nuevo artículo**: se ha guardado un artículo en Wallabag (desde la
  extensión del navegador, la aplicación móvil o una escena).
- **Artículo archivado**: se ha marcado un artículo como leído (archivado).

Ambos tienen un filtro opcional, el **sitio** (el dominio del artículo,
exactamente como lo muestra Wallabag, por ejemplo `elpais.com`), y transmiten:
título, enlace, sitio, etiquetas (separadas por comas), tiempo de lectura en
minutos, favorito, id. del artículo.

No se dispara nada en la primera lectura tras la instalación. Se anuncian como
máximo 10 artículos de cada tipo por lectura (una importación masiva no envía
cientos de mensajes).

## Acciones de escena

- **Guardar un enlace en Wallabag**: una dirección web (o una variable que
  contenga una) y etiquetas opcionales, separadas por comas. Wallabag obtiene
  la página antes de responder, lo que puede tardar unos segundos. Un enlace ya
  guardado no se duplica: recibe las nuevas etiquetas. Resultados: id. del
  artículo, título, sitio, tiempo de lectura, ya guardado antes.
- **Marcar un artículo de Wallabag como leído**: el id. del artículo (por
  ejemplo el que da un disparador) o su dirección. Resultados: id. y título.
- **Leer los títulos sin leer de Wallabag**: los artículos guardados más
  recientemente y aún sin leer (1 a 10), de todas las etiquetas o de una.
  Resultados: número leído, artículos sin leer en total, títulos uno por línea
  («Título — sitio»), su tiempo de lectura, título, enlace e id. del más
  reciente.

## Ejemplos de escenas

- **Lectura de la noche**: a las 21:00, _Leer los títulos sin leer de
  Wallabag_ (3 artículos) y luego enviar un mensaje con sus resultados
  _Títulos_ y _Su tiempo de lectura_ (insértelos con el selector de variables).
- **Guardar una receta**: un disparador de otra integración que da un enlace
  (un mensaje recibido, una fuente RSS) → _Guardar un enlace en Wallabag_ con
  la etiqueta `cocina`; el widget de la cocina, ajustado a esa etiqueta, lo
  muestra.
- **Objetivo de lectura**: _Artículo archivado_ → si _Leídos hoy_ vale 5,
  enviar «Objetivo del día cumplido».

## Solución de problemas

- **«Wallabag rechazó el cliente de API»**: el ID o el secreto de cliente es
  incorrecto, o el cliente se ha eliminado: cree uno nuevo.
- **«Wallabag rechazó el nombre de usuario o la contraseña»**: compruebe sus
  credenciales iniciando sesión en Wallabag. Una cuenta que se conecta mediante
  un proveedor externo no tiene una contraseña que la API pueda usar.
- **«Wallabag no responde»**: compruebe la dirección y el puerto desde la
  máquina de Gladys. Detrás de un proxy inverso, introduzca la dirección
  completa, con la ruta.
- **«Esta dirección no responde como Wallabag»**: la dirección lleva a otro
  servicio, o a una página de inicio de sesión (un proxy de autenticación
  delante de Wallabag debe dejar pasar `/oauth/v2/token` y `/api/`).
- **Un artículo guardado sin título**: Wallabag no pudo obtener la página
  (sitio inaccesible desde el servidor Wallabag, página protegida). Así se
  comporta el propio Wallabag.
- Más detalles: ajuste la variable `LOG_LEVEL` de la integración a `debug`.

## Limitaciones

- El filtro de los disparadores solo compara valores exactos: un sitio, no una
  etiqueta (un artículo lleva varias; las etiquetas se transmiten como
  variable).
- Las anotaciones, el contenido de los artículos y los favoritos no se
  gestionan desde Gladys.
- Wallabag no avisa: un artículo se anuncia en la siguiente lectura de la
  integración (5 minutos por defecto). Cada lectura hace unas pocas peticiones
  pequeñas, sin el contenido de los artículos; wallabag.it no publica ninguna
  cuota.
- Los enlaces del widget solo abren direcciones https.
- Sin relación con Wallabag.
