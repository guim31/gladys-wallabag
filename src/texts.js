// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface, with the words of the Wallabag interface (en "Unread",
// "Starred", "Archive"; fr "Non lus", "Favoris", "Lus"; de "Ungelesen",
// "Favoriten", "Archiv"; es "Sin leer", "Favoritos", "Archivo").
// German says "du", Spanish "usted" (test/i18n.test.js).
// -----------------------------------------------------------------------------

// Feature names (frozen by Gladys at creation).
export const NAMES = {
  en: {
    unread: 'Unread articles',
    starred: 'Starred articles',
    read_today: 'Read today',
    reading_time: 'Reading time (unread)',
  },
  fr: {
    unread: 'Articles non lus',
    starred: 'Articles favoris',
    read_today: "Lus aujourd'hui",
    reading_time: 'Temps de lecture (non lus)',
  },
  de: {
    unread: 'Ungelesene Artikel',
    starred: 'Favorisierte Artikel',
    read_today: 'Heute gelesen',
    reading_time: 'Lesezeit (ungelesen)',
  },
  es: {
    unread: 'Artículos sin leer',
    starred: 'Artículos favoritos',
    read_today: 'Leídos hoy',
    reading_time: 'Tiempo de lectura (sin leer)',
  },
};

export const STATUS_TEXT = {
  en: {
    none: 'Enter the address of Wallabag, an API client and your login in the configuration.',
    invalid: 'The Wallabag address is not valid: enter an address like 192.168.1.50:8080.',
    client: 'Enter the client ID and secret of an API client (Wallabag → API clients management).',
    login: 'Enter your Wallabag username and password.',
    client_refused:
      'Wallabag refused the API client: check the client ID and secret, or create a new client.',
    unauthorized: 'Wallabag refused the username or the password.',
    unreachable: 'Wallabag does not answer: check its address and that it is running.',
    error: 'Wallabag answered with an error: see the logs of the integration.',
    invalid_answer: 'This address does not answer like Wallabag: check the address and the port.',
  },
  fr: {
    none: "Saisissez l'adresse de Wallabag, un client d'API et vos identifiants dans la configuration.",
    invalid:
      "L'adresse de Wallabag n'est pas valide : saisissez une adresse comme 192.168.1.50:8080.",
    client: "Saisissez l'ID et le secret d'un client d'API (Wallabag → Gestion des clients API).",
    login: "Saisissez votre nom d'utilisateur et votre mot de passe Wallabag.",
    client_refused:
      "Wallabag a refusé le client d'API : vérifiez l'ID et le secret, ou créez un nouveau client.",
    unauthorized: "Wallabag a refusé le nom d'utilisateur ou le mot de passe.",
    unreachable: "Wallabag ne répond pas : vérifiez son adresse et qu'il est démarré.",
    error: "Wallabag a répondu par une erreur : consultez les journaux de l'intégration.",
    invalid_answer: "Cette adresse ne répond pas comme Wallabag : vérifiez l'adresse et le port.",
  },
  de: {
    none: 'Gib in der Konfiguration die Adresse von Wallabag, einen API-Client und deine Zugangsdaten ein.',
    invalid: 'Die Wallabag-Adresse ist ungültig: Gib eine Adresse wie 192.168.1.50:8080 ein.',
    client:
      'Gib die Client-ID und das Secret eines API-Clients ein (Wallabag → API-Client-Verwaltung).',
    login: 'Gib deinen Wallabag-Benutzernamen und dein Passwort ein.',
    client_refused:
      'Wallabag hat den API-Client abgelehnt: Prüfe Client-ID und Secret oder erstelle einen neuen Client.',
    unauthorized: 'Wallabag hat den Benutzernamen oder das Passwort abgelehnt.',
    unreachable: 'Wallabag antwortet nicht: Prüfe die Adresse und ob es läuft.',
    error: 'Wallabag hat mit einem Fehler geantwortet: Sieh dir die Logs der Integration an.',
    invalid_answer: 'Diese Adresse antwortet nicht wie Wallabag: Prüfe Adresse und Port.',
  },
  es: {
    none: 'Introduzca la dirección de Wallabag, un cliente de API y sus credenciales en la configuración.',
    invalid:
      'La dirección de Wallabag no es válida: introduzca una dirección como 192.168.1.50:8080.',
    client:
      'Introduzca el ID y el secreto de un cliente de API (Wallabag → Configuración de clientes API).',
    login: 'Introduzca su nombre de usuario y su contraseña de Wallabag.',
    client_refused:
      'Wallabag rechazó el cliente de API: compruebe el ID y el secreto, o cree un nuevo cliente.',
    unauthorized: 'Wallabag rechazó el nombre de usuario o la contraseña.',
    unreachable: 'Wallabag no responde: compruebe su dirección y que esté en marcha.',
    error: 'Wallabag respondió con un error: consulte los registros de la integración.',
    invalid_answer: 'Esta dirección no responde como Wallabag: compruebe la dirección y el puerto.',
  },
};

/** "Test the connection" once Wallabag answered. */
export const TEST_TEXT = {
  en: (user, unread, starred, minutes) =>
    `Connected to Wallabag as ${user}: ${unread} unread article(s) (${minutes} min of reading), ${starred} starred.`,
  fr: (user, unread, starred, minutes) =>
    `Connecté à Wallabag en tant que ${user} : ${unread} article(s) non lu(s) (${minutes} min de lecture), ${starred} favori(s).`,
  de: (user, unread, starred, minutes) =>
    `Mit Wallabag verbunden als ${user}: ${unread} ungelesene(r) Artikel (${minutes} Min. Lesezeit), ${starred} Favorit(en).`,
  es: (user, unread, starred, minutes) =>
    `Conectado a Wallabag como ${user}: ${unread} artículo(s) sin leer (${minutes} min de lectura), ${starred} favorito(s).`,
};

export const INIT_FAILED = {
  en: 'The integration could not start: see its logs.',
  fr: "L'intégration n'a pas pu démarrer : consultez ses journaux.",
  de: 'Die Integration konnte nicht starten: Sieh dir ihre Logs an.',
  es: 'La integración no pudo iniciarse: consulte sus registros.',
};

// Errors of the scene actions and of the widget button. `{detail}` is the
// reason Wallabag gave.
export const COMMAND_ERRORS = {
  en: {
    timeout: 'Wallabag answered too late: the change may have been made anyway.',
    http: 'Wallabag could not do it: {detail}',
    read: 'Wallabag could not be read: {detail}',
    unreachable: 'Wallabag does not answer: nothing was done.',
    unauthorized: 'Wallabag refused the login: nothing was done.',
    url: 'Enter a web address starting with http:// or https://.',
    entry: 'Enter the id of an article (the entry id of a trigger) or its address.',
    missing: 'This article is not in Wallabag.',
  },
  fr: {
    timeout: 'Wallabag a répondu trop tard : la modification a peut-être été faite quand même.',
    http: "Wallabag n'a pas pu le faire : {detail}",
    read: "Wallabag n'a pas pu être lu : {detail}",
    unreachable: "Wallabag ne répond pas : rien n'a été fait.",
    unauthorized: "Wallabag a refusé les identifiants : rien n'a été fait.",
    url: 'Saisissez une adresse web commençant par http:// ou https://.',
    entry: "Saisissez l'identifiant d'un article (celui donné par un déclencheur) ou son adresse.",
    missing: "Cet article n'est pas dans Wallabag.",
  },
  de: {
    timeout: 'Wallabag hat zu spät geantwortet: Die Änderung wurde vielleicht trotzdem gemacht.',
    http: 'Wallabag konnte es nicht ausführen: {detail}',
    read: 'Wallabag konnte nicht gelesen werden: {detail}',
    unreachable: 'Wallabag antwortet nicht: Es wurde nichts getan.',
    unauthorized: 'Wallabag hat die Zugangsdaten abgelehnt: Es wurde nichts getan.',
    url: 'Gib eine Webadresse ein, die mit http:// oder https:// beginnt.',
    entry: 'Gib die ID eines Artikels (die Artikel-ID eines Auslösers) oder seine Adresse ein.',
    missing: 'Dieser Artikel ist nicht in Wallabag.',
  },
  es: {
    timeout:
      'Wallabag respondió demasiado tarde: puede que el cambio se haya hecho de todos modos.',
    http: 'Wallabag no pudo hacerlo: {detail}',
    read: 'No se pudo leer Wallabag: {detail}',
    unreachable: 'Wallabag no responde: no se ha hecho nada.',
    unauthorized: 'Wallabag rechazó las credenciales: no se ha hecho nada.',
    url: 'Introduzca una dirección web que empiece por http:// o https://.',
    entry:
      'Introduzca el id. de un artículo (el id. del artículo de un disparador) o su dirección.',
    missing: 'Este artículo no está en Wallabag.',
  },
};

/** The toast of the widget button. */
export const DONE_TEXT = {
  en: { refresh: 'Wallabag read again.' },
  fr: { refresh: 'Wallabag relu.' },
  de: { refresh: 'Wallabag neu gelesen.' },
  es: { refresh: 'Wallabag leído de nuevo.' },
};

/** A coded message in every language, details filled in. */
export function commandMessage(code, values = {}) {
  return Object.fromEntries(
    Object.entries(COMMAND_ERRORS).map(([language, table]) => [
      language,
      (table[code] ?? table.unreachable).replace('{detail}', values.detail ?? '').slice(0, 200),
    ]),
  );
}

/** Every language of a table entry: `{ en: table.en[key], ... }`. */
export const each = (table, key) =>
  Object.fromEntries(Object.entries(table).map(([language, entries]) => [language, entries[key]]));

export const pick = (table, language) => table[language] ?? table.en;
