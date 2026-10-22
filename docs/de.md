# Wallabag

Verbinde Gladys mit [Wallabag](https://wallabag.org), der freien
Später-lesen-App: Verfolge deine ungelesenen Artikel und ihre Lesezeit,
reagiere, wenn ein Artikel gespeichert oder gelesen wird, speichere einen Link
aus einer Szene und zeige die neuesten ungelesenen Artikel auf dem Dashboard.

Getestet mit einem echten Wallabag 2.6.14 (das offizielle Docker-Image).
Rückmeldungen sind im Gladys-Forum willkommen.

## Voraussetzungen

- Gladys Assistant 5.1 oder neuer.
- Wallabag 2, selbst gehostet oder der gehostete Dienst
  [wallabag.it](https://wallabag.it), erreichbar vom Gladys-Rechner aus.
- Ein API-Client: Öffne in Wallabag die **API-Client-Verwaltung → Neuen Client
  erstellen** (ein Name genügt) und notiere seine **Client-ID** und sein
  **Client-Secret**.
- Dein Wallabag-Benutzername und dein Passwort: Die Wallabag-API verlangt sie
  zur Anmeldung (OAuth2). Die Integration sieht die Artikel dieses Benutzers.

## Konfiguration

1. Öffne den Reiter **Konfiguration** der Integration.
2. Gib unter **Wallabag-Adresse** die Adresse des Servers ein, zum Beispiel
   `192.168.1.50:8080`, oder eine vollständige Adresse wie
   `https://wallabag.example.org` oder `https://app.wallabag.it`.
3. Füge **Client-ID** und **Client-Secret** ein, dann deinen **Benutzernamen**
   und dein **Passwort**.
4. Optional: **Wallabag lesen alle** (standardmäßig 5 Minuten).
5. Klicke auf **Verbindung testen**: Der Test zeigt den Benutzer, die ungelesenen
   Artikel, ihre Lesezeit und die Favoriten.
6. Öffne den Reiter **Entdecken** und füge das Gerät **Wallabag** hinzu.

Das Passwort dient dazu, ein Anmelde-Token zu erhalten, das stündlich erneuert
wird, ohne erneut danach zu fragen; es wird nie in die Logs geschrieben.

## Gerät

**Wallabag**, vier Werte, die im Verlauf gespeichert werden:

- _Ungelesene Artikel_: die Liste „Ungelesen“ von Wallabag.
- _Favorisierte Artikel_: die Liste „Favoriten“ (gelesen oder nicht).
- _Heute gelesen_: die seit Mitternacht als gelesen markierten (archivierten)
  Artikel, in der Zeitzone von Gladys.
- _Lesezeit (ungelesen)_: die Summe der von Wallabag geschätzten Lesezeiten der
  ungelesenen Artikel, in Minuten. Ab 2.000 ungelesenen Artikeln wird der Rest
  aus dem Durchschnitt geschätzt.

Die Werte werden alle paar Minuten gelesen (die Einstellung oben) und direkt
nach jeder Änderung aus Gladys.

## Dashboard-Widget

**Wallabag**: die Anzahl der ungelesenen Artikel, ihre Lesezeit, die heute
gelesenen Artikel, die sechs zuletzt gespeicherten, noch ungelesenen Artikel
(Website, Lesezeit, Tags, ein Stern für Favoriten, Links zum Artikel und zu
Wallabag, wenn sie https sind) und eine Taste **Aktualisieren**, die Wallabag
sofort liest. Auf einen Tag eingestellt (zum Beispiel `Kochen` auf dem
Küchen-Tablet), zeigt das Widget nur die ungelesenen Artikel dieses Tags.

## Szenen-Auslöser

- **Neuer Artikel**: Ein Artikel wurde in Wallabag gespeichert (über die
  Browser-Erweiterung, die mobile App oder eine Szene).
- **Artikel archiviert**: Ein Artikel wurde als gelesen markiert (archiviert).

Beide haben einen optionalen Filter, die **Website** (die Domain des Artikels,
genau wie Wallabag sie anzeigt, zum Beispiel `www.spiegel.de`), und geben
weiter: Titel, Link, Website, Tags (durch Kommas getrennt), Lesezeit in
Minuten, Favorit, Artikel-ID.

Beim ersten Lesen nach der Installation wird nichts ausgelöst. Pro Lesen werden
höchstens 10 Artikel jeder Art gemeldet (ein Massenimport schickt keine
Hunderte von Nachrichten).

## Szenen-Aktionen

- **Link in Wallabag speichern**: eine Webadresse (oder eine Variable, die eine
  enthält) und optionale Tags, durch Kommas getrennt. Wallabag ruft die Seite
  ab, bevor es antwortet, was einige Sekunden dauern kann. Ein bereits
  gespeicherter Link wird nicht verdoppelt: Er erhält die neuen Tags.
  Ergebnisse: Artikel-ID, Titel, Website, Lesezeit, schon vorher gespeichert.
- **Wallabag-Artikel als gelesen markieren**: die ID des Artikels (zum
  Beispiel die eines Auslösers) oder seine Adresse. Ergebnisse: ID und Titel.
- **Ungelesene Wallabag-Titel lesen**: die zuletzt gespeicherten, noch
  ungelesenen Artikel (1 bis 10), aller Tags oder eines Tags. Ergebnisse:
  Anzahl gelesen, ungelesene Artikel insgesamt, Titel einer pro Zeile („Titel —
  Website“), ihre Lesezeit, Titel, Link und ID des neuesten.

## Szenen-Beispiele

- **Abendlektüre**: um 21 Uhr _Ungelesene Wallabag-Titel lesen_ (3 Artikel),
  dann eine Nachricht mit den Ergebnissen _Titel_ und _Lesezeit dieser Artikel_
  senden (mit der Variablenauswahl einfügen).
- **Ein Rezept aufheben**: ein Auslöser einer anderen Integration, der einen
  Link liefert (eine empfangene Nachricht, ein RSS-Feed) → _Link in Wallabag
  speichern_ mit dem Tag `Kochen`; das Küchen-Widget, auf diesen Tag
  eingestellt, zeigt ihn.
- **Leseziel**: _Artikel archiviert_ → wenn _Heute gelesen_ 5 ist, „Tagesziel
  erreicht“ senden.

## Fehlerbehebung

- **„Wallabag hat den API-Client abgelehnt“**: Client-ID oder Secret sind
  falsch, oder der Client wurde gelöscht: Erstelle einen neuen.
- **„Wallabag hat den Benutzernamen oder das Passwort abgelehnt“**: Prüfe
  deine Zugangsdaten, indem du dich bei Wallabag anmeldest. Ein Konto, das sich
  über einen externen Anbieter anmeldet, hat kein Passwort, das die API nutzen
  kann.
- **„Wallabag antwortet nicht“**: Prüfe Adresse und Port vom Gladys-Rechner
  aus. Hinter einem Reverse Proxy gib die vollständige Adresse samt Pfad ein.
- **„Diese Adresse antwortet nicht wie Wallabag“**: Die Adresse führt zu einem
  anderen Dienst oder zu einer Anmeldeseite (ein Authentifizierungs-Proxy vor
  Wallabag muss `/oauth/v2/token` und `/api/` durchlassen).
- **Ein Artikel ohne Titel gespeichert**: Wallabag konnte die Seite nicht
  abrufen (Website vom Wallabag-Server aus nicht erreichbar, geschützte Seite).
  So verhält sich Wallabag selbst.
- Mehr Details: Setze die Variable `LOG_LEVEL` der Integration auf `debug`.

## Einschränkungen

- Der Filter der Auslöser vergleicht nur exakte Werte: eine Website, keinen Tag
  (ein Artikel trägt mehrere; die Tags werden als Variable weitergegeben).
- Anmerkungen, der Inhalt der Artikel und die Favoriten werden nicht über
  Gladys verwaltet.
- Wallabag meldet nichts von selbst: Ein Artikel wird beim nächsten Lesen der
  Integration gemeldet (standardmäßig 5 Minuten). Jedes Lesen macht einige
  kleine Anfragen ohne den Inhalt der Artikel; wallabag.it veröffentlicht kein
  Kontingent.
- Die Links des Widgets öffnen nur https-Adressen.
- Keine Verbindung zu Wallabag.
