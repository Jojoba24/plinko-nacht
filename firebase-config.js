// Firebase-Konfiguration für Online-Räume und die weltweite Bestenliste.
// Solange hier null steht, läuft das Spiel offline: lokales Spiel geht, die Bestenliste
// wird nur im Browser gespeichert, und "Online spielen" ist ausgegraut.
//
// So trägst du deine Werte ein (Details in README.md):
// Firebase-Konsole -> Projekteinstellungen -> Deine Apps -> Web-App -> SDK-Konfiguration.
// Diese Werte sind nicht geheim; geschützt wird die Datenbank über database.rules.json.
window.PLINKO_FIREBASE = null;

/* Beispiel:
window.PLINKO_FIREBASE = {
  apiKey: "AIza...",
  authDomain: "dein-projekt.firebaseapp.com",
  databaseURL: "https://dein-projekt-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "dein-projekt",
  appId: "1:1234567890:web:abcdef123456",
};
*/
