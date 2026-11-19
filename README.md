# Plinko Nacht

Ein Kugel-und-Laternen-Spiel für den Browser: Schieß Leuchtkugeln zwischen die Laternen und lösch alle orangen Ziellaternen. Retro-Desktop-Optik, DVD-Menü, sechs Charaktere mit Fähigkeiten, Lootboxen am Rundenende und erfundene Werbepausen.

- **Lokal:** 1 bis 4 Personen spielen abwechselnd am selben Gerät.
- **Online:** 2 bis 4 Personen spielen auf eigenen Geräten in einem Raum, dem man mit Raumname und Passwort beitritt.
- **Bestenliste:** weltweit über Firebase, ohne Firebase nur auf dem jeweiligen Gerät.

Das ganze Spiel steckt in `index.html`. Es gibt keinen Build-Schritt.

## Steuerung

| | Zielen | Schießen | Fähigkeit |
|---|---|---|---|
| Maus | Bewegen | Klicken | Knopf „Fähigkeit“ |
| Touch | Finger ziehen | Loslassen (über den Werfer ziehen bricht ab) | Knopf „Fähigkeit“ |
| Tastatur | ← → (mit Umschalt fein) | Leertaste | F |

Im DVD-Menü wählen die Pfeiltasten aus, Enter bestätigt, Esc geht zurück. Mit Tab erreichst du alle Knöpfe.

## Lokal ausprobieren

`index.html` im Browser öffnen reicht für lokale Spiele. Für Online-Räume braucht es einen Webserver, zum Beispiel:

```bash
python3 -m http.server 8000
```

Dann `http://localhost:8000` öffnen.

**Testmodus ohne Firebase:** `http://localhost:8000/?net=local` öffnen, dann gehen Online-Räume zwischen mehreren Tabs desselben Browsers. Praktisch zum Ausprobieren, aber nicht zwischen verschiedenen Geräten.

## Firebase einrichten (für Online-Räume und weltweite Bestenliste)

1. Auf <https://console.firebase.google.com> ein neues Projekt anlegen (Google Analytics wird nicht gebraucht).
2. **Authentication** → Jetzt starten → Anbieter **Anonym** aktivieren.
3. **Realtime Database** → Datenbank erstellen → Standort z. B. `europe-west1` → im **gesperrten Modus** starten.
4. In der Realtime Database unter **Regeln** den Inhalt von [`database.rules.json`](database.rules.json) einfügen und veröffentlichen.
5. **Projekteinstellungen** → Allgemein → Deine Apps → Web-App (`</>`) hinzufügen. Firebase Hosting wird nicht gebraucht.
6. Die angezeigte Konfiguration in [`firebase-config.js`](firebase-config.js) eintragen (statt `null`). Wichtig ist auch `databaseURL`. Falls sie fehlt, steht sie oben auf der Seite der Realtime Database.
7. **Authentication** → Einstellungen → **Autorisierte Domains**: die Domain eintragen, unter der das Spiel läuft (z. B. `deinname.github.io` oder `spiel.jonathanbatkowski.de`).

Die Werte in `firebase-config.js` sind nicht geheim und dürfen ins öffentliche Repo. Geschützt wird die Datenbank durch die Regeln.

Der kostenlose Spark-Tarif reicht für Freundesrunden locker.

## Auf GitHub Pages veröffentlichen

1. Auf GitHub ein neues, **öffentliches** Repository anlegen, z. B. `plinko-nacht`, ohne README, Lizenz und `.gitignore`. Für GitHub Pages im kostenlosen Tarif muss es öffentlich sein.
2. In diesem Ordner:

   ```bash
   git remote add origin https://github.com/DEIN-NAME/plinko-nacht.git
   git push -u origin main
   ```

3. Auf GitHub: **Settings** → **Pages** → Source: *Deploy from a branch* → Branch `main`, Ordner `/ (root)` → Save.
4. Nach ein bis zwei Minuten läuft das Spiel unter `https://DEIN-NAME.github.io/plinko-nacht/`.

## Unter der eigenen Domain (z. B. jonathanbatkowski.de)

Die WordPress-Seite bleibt dabei unberührt. Es gibt drei Wege:

**A) Subdomain auf GitHub Pages (empfohlen)**, z. B. `spiel.jonathanbatkowski.de`:

1. Beim Domain-Anbieter einen DNS-Eintrag anlegen: Typ `CNAME`, Name `spiel`, Ziel `DEIN-NAME.github.io`.
2. Auf GitHub: Settings → Pages → **Custom domain** `spiel.jonathanbatkowski.de` eintragen, nach der DNS-Prüfung **Enforce HTTPS** anhaken.
3. Die Subdomain in Firebase unter *Autorisierte Domains* eintragen.

**B) Unterordner auf dem WordPress-Webspace**, z. B. `jonathanbatkowski.de/spiel/`: Die Dateien `index.html` und `firebase-config.js` per FTP oder Dateimanager des Hosters in einen neuen Ordner `spiel` neben WordPress laden. Die Domain in Firebase eintragen. Das Spiel ist rein statisch und braucht kein PHP.

**C) In eine WordPress-Seite einbetten**: Auf einer Seite einen *Benutzerdefiniertes HTML*-Block einfügen:

```html
<iframe src="https://spiel.jonathanbatkowski.de/" style="width:100%;height:90vh;border:0" allow="autoplay" title="Plinko Nacht"></iframe>
```

## Grenzen

- Die Punkte werden im Browser berechnet. Wer sich auskennt, kann sich Fantasiepunkte in die Bestenliste schreiben. Für eine Freundesrunde reicht das.
- Raumname und Passwort bilden zusammen den geheimen Pfad des Raums. Ohne Passwort lässt sich ein Raum weder finden noch auflisten. Wer das Passwort kennt, kann aber alles im Raum lesen und schreiben.
- Verlässt der Host den Raum, wird der Raum geschlossen. Hängt eine Person mitten im Spiel fest, kann der Host ihren Zug überspringen.
- Alte Räume bleiben in der Datenbank liegen, bis du sie in der Firebase-Konsole löschst.
