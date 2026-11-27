/**
 * "Wat is er nieuw" on the Over NEXUS page. Every change that reaches NEXUS gets an entry here,
 * newest first, in the same pull request (see CLAUDE.md). Written for the person using NEXUS:
 * what they can do now, not how it was built.
 */
export interface ChangelogEntry {
  /** Day the change was merged, YYYY-MM-DD. */
  date: string
  title: string
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-11-27',
    title: 'nexus://-links in de Windows- en Linux-app',
    items: [
      'Een link als nexus://app/agenda opent die app in NEXUS, ook vanuit je browser, een snelkoppeling op het bureaublad of een ander programma. Draait NEXUS al, dan komt het naar voren.',
      'nexus://snel?text=… opent Snelle notitie met die tekst al ingevuld; bewaren doe je zelf. nexus://join/<code> en nexus://vriend/<code> vullen een uitnodiging of vriendcode in, die je nog bevestigt.',
    ],
  },
  {
    date: '2026-11-27',
    title: 'Taakbalk 2.0',
    items: [
      'De taakbalk is compacter en rustiger: Start en je snelknoppen, dan je vastgepinde favorieten, dan je geopende vensters, telkens gescheiden door een dun lijntje.',
      'Het venster vooraan valt meer op, en een favoriet die vooraan staat kleurt mee. Geminimaliseerde vensters zijn gedempt.',
      'Meldingen, synchronisatie, een update en de klok staan samen in één statusblok rechts. Een lichtje op de wolk toont of alles gesynchroniseerd is.',
      'Op een smal scherm (768 tot 1000 pixels) worden vensternamen korter en daarna icoontjes, zodat al je vensters zichtbaar blijven.',
    ],
  },
  {
    date: '2026-11-26',
    title: 'Snelle notitie vanuit elk programma',
    items: [
      'In de Windows- en Linux-app opent Ctrl+Shift+Spatie Snelle notitie ook als je in een ander programma bezig bent: NEXUS komt naar voren, jij typt en bewaart. Gebruikt een ander programma die toets al, dan werkt ze zoals vroeger alleen binnen NEXUS.',
    ],
  },
  {
    date: '2026-11-26',
    title: 'Minder SQL voor nieuwe apps',
    items: [
      'Na één laatste stap in Account › Database-check ("Nieuwe apps syncen zonder eigen SQL") syncen nieuwe apps hun gegevens zonder dat je daarvoor nog SQL hoeft uit te voeren.',
    ],
  },
  {
    date: '2026-11-26',
    title: 'Veiligere updates voor de Windows- en Linux-app',
    items: [
      'De Windows- en Linux-app kunnen nu nagaan of een update echt van NEXUS komt: elke installer krijgt een handtekening, en een app met de sleutel installeert alleen een update waarvan de handtekening klopt. Dat werkt zodra de sleutel ingesteld is (zie de README).',
    ],
  },
  {
    date: '2026-11-26',
    title: 'Flows die iets aanmaken',
    items: [
      'In Flow Studio kan een flow nu een notitie maken, een herinnering zetten of een deadline toevoegen. Bijvoorbeeld: een dag voor een deadline een herinnering "Begin aan {titel}" over een uur.',
      'Die acties volgen dezelfde regels als Herinneringen, de Agenda, Ctrl+K en NEXUS AI, dus wat daar niet mag (zoals een tijdstip in het verleden) mag hier ook niet.',
    ],
  },
  {
    date: '2026-11-25',
    title: 'Vensters met het toetsenbord',
    items: [
      'Alt+² (de toets links van 1; Alt+` op een QWERTY-toetsenbord) gaat naar het volgende venster, met Shift erbij naar het vorige. Een geminimaliseerd venster komt zo ook terug.',
      'Alt+Shift+← of → klikt het venster vast aan de linker- of rechterhelft, Alt+Shift+↑ maximaliseert, Alt+Shift+↓ minimaliseert en Alt+Shift+W sluit het. Alle sneltoetsen staan in Snel vastleggen › Sneltoetsen.',
    ],
  },
  {
    date: '2026-11-25',
    title: 'Je vensters komen terug',
    items: [
      'Herlaad je NEXUS of start je de Windows-app opnieuw, dan staan je vensters weer open waar je ze liet, ook geminimaliseerd of gemaximaliseerd, en het venster dat vooraan stond, staat weer vooraan.',
      'Is je scherm nu kleiner, dan schuift NEXUS de vensters zo dat je de titelbalk altijd kunt pakken. Apps die je intussen uitzette, blijven dicht.',
    ],
  },
  {
    date: '2026-11-25',
    title: 'Meteen bijgewerkt op al je apparaten',
    items: [
      'Vink je een gewoonte af op je gsm, of pas je een doel, cijfer of contact aan, dan staat dat binnen enkele seconden op je laptop als NEXUS daar openstaat. Vroeger kon dat tot vijf minuten duren.',
    ],
  },
  {
    date: '2026-11-25',
    title: 'Vensters zonder doorschijnen',
    items: [
      'Vensters op het bureaublad zijn nu helemaal dekkend, in Focus en in Pulse: de tekst van je dashboard schijnt niet meer door wat je aan het lezen bent. Welk venster vooraan staat, zie je aan de titel en het koperen lijntje.',
    ],
  },
  {
    date: '2026-11-25',
    title: 'NEXUS start sneller op je gsm',
    items: [
      'Bij het opstarten laadt NEXUS niet langer de code van Teams, Vrienden en Darts mee; die komt pas als je ze nodig hebt. Op een trage gsm staat je startscherm daardoor ongeveer een tiende sneller klaar.',
    ],
  },
  {
    date: '2026-11-25',
    title: 'Alle apps voelen hetzelfde aan',
    items: [
      'Tabbladen zien er in elke app hetzelfde uit, met het koperen lijntje onder het tabblad waar je bent. Met de pijltjestoetsen ga je van tabblad naar tabblad, met Home en End naar het eerste en laatste.',
      'Apps die een account nodig hebben, zeggen dat overal op dezelfde manier, met een knop naar Account. Lege lijsten zeggen wat je kunt doen, en brede schermen tonen formulieren niet meer uitgerekt over de hele breedte.',
    ],
  },
  {
    date: '2026-11-25',
    title: 'Minimaliseren onthoudt waar je was',
    items: [
      'Minimaliseer je een venster op het bureaublad, dan blijft alles staan zoals je het liet: half getypte tekst, waar je gescrold had en een timer die loopt. Klik het in de taakbalk terug en je gaat verder waar je stopte.',
    ],
  },
  {
    date: '2026-11-25',
    title: 'Je gegevens op dit toestel beter bewaard',
    items: [
      'NEXUS vraagt je browser nu om je gegevens te bewaren, ook als je schijf bijna vol raakt. Chrome en Edge beslissen dat zelf; Firefox vraagt het je één keer.',
      'Zit de opslag van je browser vol, dan zegt NEXUS het meteen in plaats van je wijziging stil te verliezen. In het Offline-centrum zie je hoeveel ruimte NEXUS gebruikt en of je browser alles bewaart.',
    ],
  },
  {
    date: '2026-11-25',
    title: 'Bijwerken met één knop',
    items: [
      'Staat er een nieuwe versie van NEXUS klaar in je browser of op je gsm, dan krijg je onderaan een melding. Met "Bijwerken" schakel je meteen over; zelf vernieuwen hoeft niet meer.',
      'NEXUS herlaadt niet meer vanzelf terwijl je bezig bent. Kies je "Later", dan werk je verder en krijg je de nieuwe versie bij de volgende start.',
    ],
  },
  {
    date: '2026-11-25',
    title: 'Plakken in NEXUS OS in VirtualBox',
    items: [
      'Wat je op je eigen pc kopieert, plak je nu ook in NEXUS OS in VirtualBox, bijvoorbeeld je e-mailadres en wachtwoord bij Account. Zet daarvoor in het VM-venster Apparaten › Gedeeld klembord op Bidirectioneel.',
      'Het werkt ook andersom: wat je in NEXUS kopieert, plak je op je pc. Werk VirtualBox op je pc bij naar de nieuwste versie als het niet meteen lukt.',
    ],
  },
  {
    date: '2026-11-25',
    title: 'Je lessen in Google Agenda',
    items: [
      'In Profielen › Lesrooster maak je onder "In Google Agenda zetten" een geheime agendalink. Voeg die in Google Agenda toe via Andere agenda\'s › + › Via URL, en je lessen uit NEXUS staan ook daar, in een agenda die NEXUS heet.',
      'Wat al in je Google Agenda staat, laat NEXUS weg: je krijgt alleen de lessen die er nog ontbraken, niets dubbel. Kies of ook je afspraken en deadlines uit NEXUS meegaan.',
      'Verandert of komt er een les bij, dan volgt Google vanzelf, al kijkt Google maar om de paar uur. Liever één keer in je eigen agenda? Download dan een .ics-bestand om te importeren.',
    ],
  },
  {
    date: '2026-11-24',
    title: 'Wat moet ik halen op mijn volgende examen?',
    items: [
      'Open een vak in Cijfers en je ziet meteen welk punt je minstens nodig hebt op je volgende examen om je doel te halen, standaard 10/20 (50%). Je doel pas je per vak aan.',
      'Tellen je oefenexamens elk voor 10 tot 20% mee, geef ze dan als onderdeel in met hun eigen percentage. Kies welk onderdeel je volgende examen is en wat je verwacht op de rest.',
      'NEXUS toont ook wat volstaat als je de rest perfect doet, en of je al zeker door bent. Staat een examen op bv. 50 punten, dan krijg je het antwoord op 50.',
    ],
  },
  {
    date: '2026-11-24',
    title: 'Je gamingstatus op Discord',
    items: [
      'Start je de Gaming-timer in Gaming Companion, dan zien je vrienden op Discord wat je speelt en hoe lang al, bv. "Speelt Valorant · op pc". Stop je, dan verdwijnt het. Ook een timer die je op je gsm of horloge start, telt mee.',
      'Dit werkt in de Windows- en Linux-app, zolang Discord op die computer open staat. Je hoeft niet in te loggen bij Discord.',
      'In Instellingen › Discord zet je het aan of uit, of toon je alleen "Aan het gamen" zonder de naam van de game.',
    ],
  },
  {
    date: '2026-11-24',
    title: 'Focusmuziek met Spotify',
    items: [
      'Koppel Spotify in Instellingen › Spotify en kies een playlist om te studeren en een om te gamen, uit je eigen playlists of met een link.',
      'Start je de focustimer in Studie, dan speelt Spotify je studeerplaylist. In een pauze pauzeert de muziek en daarna gaat ze verder. Start je een Gaming-sessie, ook vanaf je horloge, dan komt je gamingplaylist op.',
      'Speelt Spotify nog nergens, dan kiest NEXUS je pc of gsm waar Spotify open staat. Je hebt Spotify Premium nodig.',
      'In de Windows- of Linux-app koppel je met een code die je in de browser krijgt.',
    ],
  },
  {
    date: '2026-11-24',
    title: 'Taken automatisch inplannen',
    items: [
      'Bij elke open deadline in de Agenda staat Inplannen: kies hoeveel tijd je nodig hebt, en NEXUS zoekt vrije momenten voor de deadline, rond je lessen, afspraken en Google Agenda. Met In Agenda zetten staan ze erin als "Werken aan: …", met een melding op je gsm als het begint.',
      'Je kan het ook aan NEXUS AI vragen, bv. "plan 3 uur in voor mijn verslag labo". Je ziet eerst wat het wil doen en kiest zelf of het mag.',
      'NEXUS plant in je studietijden uit Studie › Planning (standaard weekdagen 17 tot 21 uur en in het weekend 10 tot 17 uur). Opnieuw inplannen vervangt de vorige blokken van die taak.',
    ],
  },
  {
    date: '2026-11-24',
    title: 'Mijn dag bovenaan je dashboard',
    items: [
      'Nieuw bovenaan het dashboard: Mijn dag. Je lessen, afspraken en agenda van vandaag staan op een tijdlijn, met een koperen lijn op het uur van nu. Bovenaan staat in één zin wat er straks begint en waar, bijvoorbeeld "Biologie begint over 10 minuten in Labo 2".',
      'Op je telefoon zie je dezelfde dag als lijst, met alleen wat nog komt.',
      'Deadlines en afspraken tonen nu groot hoeveel dagen je nog hebt. Wat morgen of vandaag af moet, valt op in je accentkleur.',
      'Het welkomstformulier neemt geen half scherm meer in: het is een smalle regel die je openklikt wanneer je wil.',
      'Mijn dag kan je via Indeling aanpassen verplaatsen, kleiner maken of verbergen, zoals elke widget.',
    ],
  },
  {
    date: '2026-11-24',
    title: 'Favorieten in de taakbalk',
    items: [
      'Zet je favoriete apps in de taakbalk: open het NEXUS-teken (Start) en klik op de ster bij een app, of klik er met de rechtermuisknop op. Een app die open staat, krijgt er een koperen punt onder.',
      'Op je bureaublad staan nu je favorieten en de apps die je het vaakst opent. Alle apps vind je onder het NEXUS-teken.',
      'Vinkjes, keuzerondjes en schuifjes, zoals bij je gewoontes, staan in de kleur van NEXUS: koper in Pulse, groen in Focus.',
    ],
  },
  {
    date: '2026-11-24',
    title: 'Rustige, vloeiende beweging',
    items: [
      'Vensters, het Start-menu en de rondleiding komen nu zacht tevoorschijn in plaats van plots te verschijnen. Meldingen onderaan schuiven omhoog, het voorstel van Spaces schuift van boven binnen.',
      'Zoeken (Ctrl+K) en Snel vastleggen openen bewust nog altijd meteen: die gebruik je vaak met het toetsenbord.',
      'De schakelaars in Control Center glijden nu, zoals die in Instellingen.',
      'Het Start-menu past altijd op je scherm: met veel apps kan je erin scrollen, en het zoekveld bovenaan blijft zichtbaar.',
      'Vraag je in je systeem om minder beweging, dan gebeurt alles meteen.',
    ],
  },
  {
    date: '2026-11-24',
    title: 'Een donkergroen app-icoon, overal hetzelfde',
    items: [
      'Het icoon van NEXUS is nu een koperen N op donkergroen, de kleuren van NEXUS zelf, op je gsm, je horloge en je laptop. Na de volgende update van de app zie je het nieuwe icoon; soms moet je de app daarvoor opnieuw installeren.',
      'Ook het kleine teken in de statusbalk van je gsm en horloge is het nieuwe NEXUS-teken.',
    ],
  },
  {
    date: '2026-11-24',
    title: 'Een veiligere database en kleine verbeteringen',
    items: [
      'Je database is beter beveiligd en sneller. Draai in Account › Database-check de nieuwe stap "Database veiliger en sneller".',
      'Op een aanraakscherm reageren knoppen meteen, zonder grijze flits. Keuzelijsten volgen nu ook in Pulse het thema.',
      'Codes van vrienden, teams en studiegroepen krijgen geen rode kronkellijn van de spellingcontrole meer.',
    ],
  },
  {
    date: '2026-11-24',
    title: 'De klok loopt gelijk',
    items: [
      'De klok in de taakbalk, op het dashboard en de wereldklok springen nu meteen naar de nieuwe minuut, in plaats van tot een minuut achter te lopen. Kom je terug naar NEXUS na een ander tabblad of slaapstand, dan staat de klok meteen juist.',
    ],
  },
  {
    date: '2026-11-24',
    title: 'Geen zijbalk meer, en een nieuw NEXUS-teken',
    items: [
      'De zijbalk is weg. Je apps staan op je bureaublad, onder de titel, per groep in een rij. Zo hebben je vensters altijd de volle breedte.',
      'Een nieuw NEXUS-teken: een N getekend als koperspoor tussen twee soldeerpunten. Je ziet het bovenaan je bureaublad, op de Start-knop in de taakbalk en als icoon van de app.',
    ],
  },
  {
    date: '2026-11-24',
    title: 'Een nieuw uiterlijk: de werkbank',
    items: [
      'NEXUS ziet er anders uit. Focus is nu een lichte werkbank met soldeermasker-groen, Pulse een donkere printplaat met koperen accenten. Je eigen accentkleur blijft werken.',
      'Een nieuw lettertype dat beter leest op kleine schermen, en rustigere titels zonder hoofdletters.',
      'Wat actief is krijgt een koperen spoor met een soldeerpunt: het venster vooraan, het geopende venster in de taakbalk, de app onder je cursor in de zijbalk en het tabblad onderaan op je telefoon.',
      'Het profiel op je dashboard toont nu met een groen lampje dat het actief is.',
      'Klap je de zijbalk in, dan verdwijnt hij helemaal en staan je apps op je bureaublad, per groep onder de titel. Met de knop links in de taakbalk haal je de zijbalk terug.',
    ],
  },
  {
    date: '2026-11-24',
    title: 'Je agenda open op het dashboard, en een doorzichtige zijbalk',
    items: [
      'Nieuw op het dashboard: Agenda deze week. Je ziet je lessen, afspraken, Google Agenda, deadlines en herinneringen van de komende zeven dagen naast elkaar, met vandaag in de kleur van je profiel. Klik op een dag om de Agenda te openen.',
      'Je krijgt deze widget er vanzelf bij, groot en bovenaan. Via Indeling aanpassen kan je hem verplaatsen, groter of kleiner maken of verbergen.',
      'De zijbalk is nu doorzichtig, zodat je achtergrond erdoor schijnt.',
      'Ingeklapt staan de icoontjes netjes onder elkaar, zonder schuifbalk ernaast. Scrollen kan nog altijd met je muiswiel.',
    ],
  },
  {
    date: '2026-11-24',
    title: 'Een dashboard dat je scherm vult, en dat je zelf indeelt',
    items: [
      'Op een groot scherm vult het dashboard nu de hele ruimte: tot zes kolommen naast elkaar, en de widgets worden hoger tot het scherm vol is. Lege plekken vullen ze vanzelf op.',
      'Met "Indeling aanpassen" (rechtsboven) sleep je widgets naar een andere plek en maak je ze groter of kleiner met de hoek rechtsonder, tot zes breed en vier hoog. Slepen werkt nu ook in de Windows-app en met je vinger. Ook de kaart met je profiel en "Volgende les" kan je nu verplaatsen.',
      'Nieuwe widgets die je zelf kan toevoegen: Klok, Snelle notitie, Snelkoppelingen naar je apps en Gewoontes vandaag. Grote widgets tonen meer deadlines, notities en meldingen.',
      'Vensters kan je aan elke rand en hoek groter of kleiner maken. Sleep een venster naar de linker- of rechterrand om het op de helft van het scherm te zetten, of naar boven om het schermvullend te maken.',
      'NEXUS onthoudt waar je een venster liet en hoe groot het was, en opent het daar de volgende keer weer.',
      'De Agenda (en Project Hub, Flow Studio, Teams en de Browser) openen nu ook op een laptopscherm schermvullend.',
    ],
  },
  {
    date: '2026-11-24',
    title: 'Wijzigingen in Google Agenda komen sneller door',
    items: [
      'Pas je in Google Agenda een afspraak aan, verplaats je ze of verwijder je ze, dan volgt NEXUS nu binnen een kwartier in plaats van na enkele uren. Kom je terug naar NEXUS of open je de Agenda, dan haalt NEXUS je agenda meteen opnieuw op.',
      'Bovenaan de Agenda zie je wanneer je Google Agenda laatst is bijgewerkt, met een knop Vernieuwen. Lukt ophalen niet, dan zie je daar waarom.',
      'Een Google Agenda met jaren geschiedenis is geen probleem meer: NEXUS laat oude afspraken weg en haalt de komende weken gewoon op.',
      'Herhalingen zoals "elke maand op de 24e", "elk jaar" en "elke tweede dinsdag van de maand" verschijnen nu op elke dag, niet alleen de eerste keer.',
    ],
  },
  {
    date: '2026-11-23',
    title: 'Beter op een groot scherm, en een zijbalk die inklapt',
    items: [
      'Zet je NEXUS op volledig scherm (of op een grote monitor), dan gebruikt het nu de hele ruimte: de Agenda, Project Hub, Flow Studio, Teams en de Browser openen schermvullend, en andere apps openen groter en in het midden.',
      'Het dashboard wordt breder en toont de widgets in vier kolommen. In een klein venster en op je gsm blijft alles zoals het was.',
      'Nog meer ruimte nodig? Met de knop bovenaan de zijbalk klap je die in tot een smalle strook met alleen de icoontjes van je apps. NEXUS onthoudt je keuze op dit apparaat.',
    ],
  },
  {
    date: '2026-11-23',
    title: 'Ongelezen berichten op het NEXUS-icoon',
    items: [
      'Het NEXUS-icoon in je taakbalk, dock of op het beginscherm van je gsm toont nu hoeveel teamchat- en privéberichten je nog niet las. Lees je ze, dan verdwijnt het getal vanzelf.',
      'Dat werkt als je NEXUS als app installeerde (bv. via Chrome of Edge: "App installeren"). Staat Teams of Vrienden uit, dan tellen die berichten niet mee.',
    ],
  },
  {
    date: '2026-11-23',
    title: 'Darts: score via foto',
    items: [
      'Weet je niet meer hoeveel je gooide? Tik op "Score via foto" onder het invoerveld en trek een foto van het bord. NEXUS AI leest de pijlen en vult de score in, bv. "T20 · 5 · T20 = 125". Klopt het niet, dan pas je het gewoon aan voor je invoert.',
      'Gooi je zo 100 of meer uit, dan wordt die foto meteen je bewijsfoto bij "Hoge finishes", met het oordeel erbij.',
    ],
  },
  {
    date: '2026-11-23',
    title: 'Darts: bewijsfoto bij hoge finishes',
    items: [
      'Gooi je 100 of meer uit, dan kun je onder het scorebord een foto van het bord trekken als bewijs.',
      'NEXUS AI leest welke pijlen er in het bord zitten en zegt of ze de finish maken, bv. "Klopt volgens NEXUS AI: T20 T11 D14". Daarvoor moet je aangemeld zijn.',
      'De foto blijft op je toestel bij de wedstrijd; het oordeel zie je op al je toestellen, ook later in de samenvatting bij Geschiedenis.',
    ],
  },
  {
    date: '2026-11-23',
    title: 'Darts: spelen tegen een bot',
    items: [
      'Vink bij een nieuwe wedstrijd "Tegen de bot" aan en kies een niveau: Beginner, Gevorderd, Clubspeler, Sterk of Pro (van ongeveer 30 tot 90 gemiddeld).',
      'De bot gooit zelf zijn beurt en je ziet waar zijn pijlen landden, zoals T20 · 5 · T20. Op een finish gooit hij naar de dubbel, en hij kan ook mis gooien of busten.',
      'Ongedaan maken neemt de beurt van de bot en die van jou terug, zodat je meteen opnieuw kunt gooien.',
    ],
  },
  {
    date: '2026-11-21',
    title: 'Darts: geen 0 meer op een dubbel',
    items: ['Sta je op een dubbel (bijvoorbeeld 40 of 32), dan vraagt het scorebord niet meer of er 0 pijlen op een dubbel gingen: je gooit toch altijd naar de dubbel. Je kiest 1, 2 of 3.'],
  },
  {
    date: '2026-11-20',
    title: 'Zoeken in je berichten',
    items: [
      'Zoeken vindt nu ook je teamchat en je privéberichten, onder "Berichten". Klik op een resultaat en je komt meteen in die chat of dat gesprek.',
      'Privéberichten blijven versleuteld: NEXUS opent ze op je eigen toestel en zoekt daar, niet op de server.',
    ],
  },
  {
    date: '2026-11-20',
    title: 'Herinnering voor teamtaken',
    items: [
      'Staat er in Teams een taak op jouw naam die binnen een dag af moet en nog niet klaar is, dan krijg je een herinnering op je pc en op je gsm en horloge, met de naam van het project erbij.',
      'Krijgt de taak een nieuwe datum, dan word je opnieuw herinnerd. Een taak die klaar is, laat je met rust.',
    ],
  },
  {
    date: '2026-11-20',
    title: 'Melding als je een teamtaak krijgt',
    items: [
      'Zet een teamgenoot in Teams een taak op jouw naam, dan krijg je een melding met wie het deed, de taak en het project. Dat gebeurt op je pc als NEXUS openstaat, en op je gsm en horloge ook als NEXUS daar dicht is.',
      'Je zet het uit in Apparaten › Meldingen op dit toestel, met de schakelaar "Teamchat en nieuwe teamtaken voor jou".',
    ],
  },
  {
    date: '2026-11-20',
    title: 'Teamtaken zonder internet',
    items: [
      'Zonder internet kun je in Teams toch een taak toevoegen, ze naar een andere kolom schuiven, een andere persoon of datum kiezen. In Studiegroep kun je een groepsdeadline toevoegen of afvinken.',
      'Die wijzigingen wachten op dit toestel, in de volgorde waarin je ze maakte, en gaan vanzelf door zodra je weer online bent. Onder het bord zie je wat nog wacht, en je kunt het annuleren.',
    ],
  },
  {
    date: '2026-11-19',
    title: 'Opmerkingen zonder internet',
    items: [
      'Schrijf je een opmerking bij een taak in Teams of Studiegroep zonder internet, dan wacht ze op dit toestel en gaat ze vanzelf weg zodra je weer online bent, met je @vermeldingen erbij.',
      'Onder de taak zie je welke opmerkingen nog wachten. Je kunt ze annuleren, en een opmerking die de server weigerde opnieuw proberen.',
    ],
  },
  {
    date: '2026-11-19',
    title: 'NEXUS opent nog sneller',
    items: [
      'Het onderdeel voor je account en synchronisatie (ongeveer een vijfde van wat NEXUS bij het openen laadt) komt nu pas binnen nadat het eerste scherm er staat. Je notities, agenda en apps zijn er dus sneller, vooral op je gsm.',
    ],
  },
  {
    date: '2026-11-19',
    title: 'Geen werk meer kwijt in de Agenda',
    items: [
      'Pas je dezelfde deadline of afspraak aan op twee apparaten voor ze konden synchroniseren, dan blijft de nieuwste versie staan en wordt de andere bewaard met "(conflictkopie)" in de titel. Zo raak je geen titel, tijdstip, plaats of notitie meer kwijt.',
      'Zo\'n kopie stuurt geen herinneringen zolang het origineel er nog staat, zodat je niet twee keer een melding krijgt. Een kopie van een herhaalde afspraak geldt alleen voor dat ene moment.',
    ],
  },
  {
    date: '2026-11-18',
    title: 'Onderdelen bijgewerkt',
    items: [
      'NEXUS draait op nieuwere versies van React, Supabase, Vite en de onderdelen van de Windows-app, met hun bugfixes. Je hoeft niets te doen.',
      'De Windows-app bouwt weer: vier bestanden hadden namen die alleen in hoofdletters verschilden, en Windows haalde die door elkaar.',
    ],
  },
  {
    date: '2026-11-18',
    title: 'NEXUS start sneller',
    items: [
      'Bij het openen laadt NEXUS een kwart minder code voor het eerste scherm. Dat merk je vooral op je gsm en bij een trage verbinding.',
      'Synchroniseren, herinneringen en meldingen starten meteen na het eerste scherm in plaats van ervoor. Zoeken (Ctrl+K), Snelle notitie en "NEXUS is bijgewerkt" laden pas wanneer je ze nodig hebt.',
    ],
  },
  {
    date: '2026-11-18',
    title: 'Berichten versturen zonder internet',
    items: [
      'Schrijf je een privébericht of een bericht in de teamchat zonder internet, dan wacht het op dit toestel en gaat het vanzelf weg zodra je weer online bent, in de volgorde waarin je schreef.',
      'In het gesprek zie je welke berichten nog wachten. Je kunt ze annuleren, en een bericht dat de server weigerde opnieuw proberen.',
      'Het Offline-centrum toont hoeveel berichten wachten, en met Nu syncen gaan ze meteen.',
    ],
  },
  {
    date: '2026-11-18',
    title: 'Geen notitiewerk meer kwijt',
    items: [
      'Bewerk je dezelfde notitie op twee apparaten voor ze konden synchroniseren, dan blijft de nieuwste versie staan en wordt de andere bewaard als een aparte notitie met "(conflictkopie)" in de titel.',
      'Het Offline-centrum meldt wanneer dat gebeurde, zodat je de twee versies kunt vergelijken.',
    ],
  },
  {
    date: '2026-11-18',
    title: 'Verjaardagen',
    items: [
      'Op je verjaardag stuurt NEXUS je om 8 uur een bericht "Gelukkige verjaardag", in Vrienden › Berichten en als melding op je gsm.',
      'In Vrienden zie je wanneer je vrienden jarig zijn, en op de dag zelf krijg je een seintje om ze te feliciteren.',
      'Vrienden zien alleen de dag en de maand, nooit het jaar. Bij Profielen › Over jou kun je dat uitzetten.',
      'Hiervoor is eenmalig een SQL-stap nodig (Account › Database-check).',
    ],
  },
  {
    date: '2026-11-17',
    title: 'Alle accounts in Beheer',
    items: [
      'Beheer toont nu ook wie offline is: elk account met zijn naam (of e-mailadres), wanneer het laatst actief was en sinds wanneer het bestaat.',
      'Van wie Onzichtbaar koos, zie je alleen de laatste aanmelding, niet wanneer NEXUS openstond.',
      'Hiervoor is eenmalig een SQL-stap nodig (Account › Database-check).',
    ],
  },
  {
    date: '2026-11-17',
    title: 'Een naam bij het aanmelden',
    items: [
      'Heb je nog geen naam gekozen, dan vraagt NEXUS na het aanmelden hoe je wilt heten. Je vrienden, je teams en de beheerder zien die naam. Met Later vraagt dit toestel het niet meer.',
      'In Beheer staat wie nog geen naam koos met zijn e-mailadres in plaats van "Zonder naam". Dat ziet alleen de beheerder.',
      'Hiervoor is eenmalig een SQL-stap nodig (Account › Database-check).',
    ],
  },
  {
    date: '2026-11-17',
    title: 'Samen studeren op je horloge',
    items: [
      'De open Samen studeren-sessies van je vrienden en teams staan nu op je horloge, met de timer, wie meedoet en een knop om mee te doen of te verlaten.',
      'Zit je in een sessie, dan trilt je horloge bij elke wissel tussen focus en pauze, op hetzelfde moment als bij de anderen.',
      'Hiervoor is de nieuwe versie van de horloge-app nodig. Er is geen SQL-stap voor nodig.',
    ],
  },
  {
    date: '2026-11-17',
    title: 'Darts-ranglijst met vrienden',
    items: [
      'In Darts › Online staat nu een ranglijst van je afgewerkte online matchen: jij en elke vriend tegen wie je speelde, met gewonnen matchen, gemiddelde en hoogste finish.',
      'Per vriend zie je ook de onderlinge stand. Van een vriend tellen alleen de matchen tegen jou.',
      'Een afgewerkte online match komt nu ook in je Geschiedenis als je Darts › Online niet opende. Er is geen SQL-stap voor nodig.',
    ],
  },
  {
    date: '2026-11-17',
    title: 'Leerkaarten-duel',
    items: [
      'Daag een vriend uit met een van je stapels: open de stapel in Leerkaarten en tik op Daag een vriend uit. NEXUS maakt van hoogstens 10 kaarten meerkeuzevragen.',
      'Jullie beantwoorden dezelfde vragen. Wie de meeste juist heeft, wint, en bij gelijkspel de snelste. De juiste antwoorden zie je pas als je zelf gespeeld hebt.',
      'Hiervoor is eenmalig een SQL-stap nodig (Account › Database-check).',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Samen een vrij moment zoeken',
    items: [
      'Plan je een afspraak met vrienden, tik dan bij Vrienden uitnodigen op Zoek een vrij moment. NEXUS toont momenten in de komende week waarop jullie allemaal vrij zijn, en met één tik verzet je je afspraak daarheen.',
      'Je vrienden zien alleen wanneer je bezet bent, nooit wat er in je agenda staat. Liever niet? Zet het vinkje Vrienden zien wanneer ik bezet ben uit.',
      'Hiervoor is eenmalig een SQL-stap nodig (Account › Database-check).',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Darts online op je horloge',
    items: [
      'Speel je een online match tegen een vriend, dan staat ze ook op je horloge onder Darts online: de stand, wie gooit en een uitgooi-tip.',
      'Ben jij aan de beurt, tik dan je score in op je horloge. Je gsm hoeft niet in je hand.',
      'NEXUS moet daarvoor open en aangemeld zijn op je pc of gsm. Werk ook de horloge-app bij.',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Notities delen',
    items: [
      'Deel een notitie met een vriend of een heel team: tik in Notities op Delen en kies of ze mogen meebewerken of alleen lezen.',
      'Wat anderen met jou delen, staat in Notities onder Gedeeld met mij. Past iemand een gedeelde notitie aan, dan zie je dat meteen.',
      'Hiervoor is eenmalig een SQL-stap nodig (Account › Database-check).',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Afspraak met vrienden',
    items: [
      'Nodig vrienden uit voor een afspraak: tik in de Agenda bij een afspraak op Vrienden uitnodigen. Je ziet wie komt en wie niet.',
      'Een uitnodiging die je krijgt, staat bovenaan in de Agenda. Aanvaard je ze, dan komt de afspraak in je eigen Agenda met meldingen, en ze verandert mee als je vriend ze verzet of afzegt.',
      'Hiervoor is eenmalig een SQL-stap nodig (Account › Database-check).',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Automatische back-up',
    items: [
      'NEXUS maakt nu elke week zelf een back-up van al je gegevens en bewaart die in Bestanden. Met een account staat ze zo ook in je account, en ben je niets kwijt als een toestel stuk gaat.',
      'In Instellingen › Back-up kies je elke dag of elke week, hoeveel back-ups er blijven staan en of je bestanden mee moeten. Daar zet je een automatische back-up ook met één knop terug.',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Sneller opstarten',
    items: [
      'NEXUS start sneller, vooral op je gsm: al je apps halen hun gegevens nu samen op in één keer in plaats van elk apart, en dat ook maar één keer bij het opstarten.',
      'Het deel van NEXUS dat bij het openen geladen wordt, is kleiner.',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Darts online',
    items: [
      'Nieuw tabblad Online in Darts: daag een vriend uit voor een match van 501 (of een ander spel). Jullie gooien elk op je eigen toestel en zien de stand live.',
      'Een afgewerkte online match komt in je Geschiedenis en Statistieken. Hiervoor is eenmalig een SQL-stap nodig (Account › Database-check).',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Vandaag op je horloge',
    items: [
      'Bovenaan de horloge-app staat nu Vandaag: je lessen en afspraken van vandaag, je gewoontes en hoe je doelen ervoor staan.',
      'Vink een gewoonte af met één tik op je horloge. De tegel toont hoeveel gewoontes je vandaag al deed. Werk de horloge-app bij via Bijwerken.',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Examenblok',
    items: [
      'Nieuw tabblad Blok in Studie: NEXUS maakt een blokschema tot je laatste examen, dag per dag, met studieblokken, pauzes en een middagpauze.',
      'De dag voor elk examen is herhaling van dat vak. Je kiest zelf wanneer je blok begint, hoe lang je per dag studeert en welke dagen je rust, en zet het schema met één knop in je Agenda.',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Doelen',
    items: [
      'Nieuwe app Doelen: zet doelen voor je semester, zoals 14/20 gemiddeld, een cijfer voor een vak, 30 studiepunten, 10 uur focus per week of een gewoonte 80 % van de dagen.',
      'Je doelen houden zichzelf bij met je cijfers uit Cijfers, je focustijd uit Studie en je gewoontes uit Gewoontes. Je ziet meteen of je op schema zit en wat je nog nodig hebt.',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Apps per profiel',
    items: [
      'In Profielen › Apps & widgets kies je nu uit al je apps welke een profiel toont en in welke volgorde, ook Darts, Teams, Vrienden en de andere extra apps.',
      'Zo verberg je bijvoorbeeld Gaming en Darts in School, terwijl ze in je andere profielen blijven staan. Een app die je in Instellingen uitzet, is in elk profiel weg.',
    ],
  },
  {
    date: '2026-11-16',
    title: 'Berichten op je gsm en horloge',
    items: [
      'Een nieuw privébericht of teambericht komt nu ook op je gsm en horloge, ook als NEXUS daar dicht is. Zet daarvoor in Apparaten de meldingen op je gsm aan.',
      'Antwoord meteen vanuit de melding met Oké 👍 of Ik reageer straks. Tik je op de melding zelf, dan opent NEXUS bij Vrienden of Teams.',
      'Een privébericht blijft versleuteld tot op je gsm. In Apparaten kies je of privéberichten en de teamchat je gsm wekken.',
    ],
  },
  {
    date: '2026-11-14',
    title: 'Samen studeren',
    items: [
      'In Studie staat de nieuwe tab Samen: start een focussessie of doe mee met die van een vriend of iemand uit je teams. Iedereen ziet dezelfde timer en wie er meestudeert.',
      'Elk focusblok dat je samen afmaakt, komt in je focuslog en telt mee in Studie en Inzichten. Stopt wie de sessie startte, dan stopt ze voor iedereen.',
    ],
  },
  {
    date: '2026-11-14',
    title: 'Darts: Cricket',
    items: [
      'Bij Darts › Spelen kies je nu ook Cricket: gooi 20 tot 15 en de bull dicht, scoor punten op wat de ander nog open heeft, met 1 tot 4 spelers en best of legs.',
      'Tik per pijl Single, Double of Triple en het nummer. Na de wedstrijd zie je een samenvatting met MPR, triples en bull-treffers, en je Cricket-statistieken staan bij Statistieken.',
    ],
  },
  {
    date: '2026-11-14',
    title: 'Darts: samenvatting en training op je horloge',
    items: [
      'Na elke wedstrijd krijg je een samenvatting: gemiddelde, first 9, checkout %, hoogste finish, beste en slechtste leg, 180\'s, 140+, 100+ en 60+ per speler, en elke leg apart. Ook later te openen in Geschiedenis, en de uitslag kopieer je met één tik.',
      'Kun je uitgooien, dan vraagt het scorebord hoeveel pijlen op een dubbel gingen. Zo zie je je checkout-percentage in de samenvatting en bij Statistieken.',
      'Op je horloge kun je nu trainen: Around the Clock, Doubles rond, Bob\'s 27 en Scoring op T20. De rondes komen in Darts › Oefenen.',
    ],
  },
  {
    date: '2026-11-14',
    title: 'Apps aan/uit',
    items: [
      'In Instellingen staat nu Apps aan/uit: één lijst met al je apps en modules, in dezelfde groepen als de zijbalk.',
      'Zet je een app uit, dan verdwijnt ze uit de zijbalk, het zoeken en het dashboard, in elk profiel. Je gegevens blijven bewaard en zijn terug zodra je de app weer aanzet.',
      'Je keuze geldt op al je toestellen. Profielen, Instellingen, Help en Account blijven altijd.',
    ],
  },
  {
    date: '2026-11-14',
    title: 'Eigen AI-sleutel',
    items: [
      'In NEXUS AI staat nu Eigen sleutel: zet je eigen sleutel van Anthropic en gebruik NEXUS AI, de studiesamenvattingen, leerkaarten en het weekoverzicht op je eigen account.',
      'Je sleutel blijft versleuteld op dit apparaat, gaat niet mee met syncen of een back-up, en verdwijnt als je je afmeldt.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Zijbalk in groepen',
    items: [
      'De zijbalk is nu ingedeeld in School, Planning, Samen, Persoonlijk en Systeem. Klap een groep in die je weinig gebruikt; NEXUS onthoudt dat op dit apparaat.',
      'Op je gsm staan de apps onder dezelfde koppen.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Beheer',
    items: [
      'Voor de beheerder van NEXUS staat er nu Beheer in de zijbalk: hoeveel accounts er zijn, wie nu online is, de teams, wat er deze week gebeurde en de laatste foutmeldingen.',
      'Beheer toont alleen tellingen en namen, nooit wat iemand schreef. Wie Onzichtbaar koos, telt niet mee als online.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Wie is er online',
    items: [
      'In Vrienden en bij Teams › Leden zie je wie nu online is, wie bezet is en wanneer iemand laatst online was.',
      'Kies in Vrienden je eigen status: Beschikbaar, Bezet of Onzichtbaar, met een korte zin zoals "Aan het studeren". Onzichtbaar toont je voor iedereen offline.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Privéberichten',
    items: [
      'In Vrienden staat nu Berichten: stuur een vriend een privébericht, end-to-end versleuteld. Alleen jullie toestellen kunnen het lezen, NEXUS zelf niet.',
      'Een nieuw bericht geeft een melding zolang NEXUS openstaat; je ziet ook wanneer je bericht gelezen is.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Vrienden',
    items: [
      'Nieuwe app Vrienden: je krijgt een eigen vriendencode en link. Wie hem opent, stuurt je een verzoek dat jij aanvaardt of weigert.',
      'Je vrienden zien alleen de naam die je kiest, nooit je e-mailadres. Met Nieuwe code maak je je oude code en link ongeldig.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Opmerkingen en @vermeldingen',
    items: [
      'Onder elke taak van een teamproject en elke groepsdeadline staat 💬: schrijf er een opmerking bij, live voor het hele team.',
      'Typ @ om iemand van het team te vermelden. Die krijgt een melding en een item in de Universal Inbox.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Teamchat',
    items: [
      'Elk team heeft nu een tabblad Chat: praat met je team, live op al je toestellen. Op het tabblad staat hoeveel berichten je nog niet las.',
      'Een nieuw bericht geeft een melding zolang NEXUS openstaat, en komt in de Universal Inbox. Je verwijdert je eigen berichten; de eigenaar en beheerders kunnen elk bericht weghalen.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'NEXUS OS installeren vanuit NEXUS',
    items: [
      'Op de usb-stick van NEXUS OS staat in Start de knop NEXUS OS installeren. Die opent een eigen installatieprogramma in het Nederlands, met het uitzicht van NEXUS: taal, toetsenbord, schijf en je account in een paar stappen.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Systeemupdates van Debian',
    items: [
      'NEXUS OS installeert de beveiligingsupdates van Debian nu elke dag vanzelf.',
      'In Systeem › Updates zie je welke andere updates klaarstaan en installeer je ze allemaal met één wachtwoord. Is een herstart nodig, dan zegt NEXUS het, met een knop om meteen opnieuw op te starten.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Apps installeren uit Flathub',
    items: [
      'Linux-apps heeft een tabblad Apps installeren: zoek in Flathub, installeer of verwijder apps zoals Spotify, VLC en Discord, en werk ze allemaal in één keer bij. Zonder terminal en zonder wachtwoord.',
    ],
  },
  {
    date: '2026-11-13',
    title: 'Systeeminstellingen in NEXUS OS',
    items: [
      'Nieuwe app Systeem in de Linux-app: verbind met wifi, regel het volume van luidspreker en microfoon, kies resolutie, grootte en helderheid van je scherm, en koppel Bluetooth-apparaten. Allemaal zonder terminal.',
    ],
  },
  {
    date: '2026-11-12',
    title: 'NEXUS OS in een virtuele machine blijft goed in beeld',
    items: [
      'In VirtualBox en andere virtuele machines bleven er resten van vorige schermen staan, of werd NEXUS na een tijdje donker of zwart. NEXUS tekent daar nu op een eenvoudigere manier, zodat het scherm blijft kloppen.',
    ],
  },
  {
    date: '2026-11-12',
    title: 'Bijwerken op Linux eindigt niet meer met een foutmelding',
    items: [
      'Na "Zoeken naar updates" op Linux (en NEXUS OS) werd de nieuwe versie wel geïnstalleerd, maar meldde NEXUS "NEXUS opnieuw starten mislukt". NEXUS start nu gewoon opnieuw in de nieuwe versie.',
    ],
  },
  {
    date: '2026-11-12',
    title: 'NEXUS OS start ook zonder grafische versnelling',
    items: [
      'Kan de grafische kaart niet tekenen (VirtualBox zonder 3D-versnelling, sommige oudere pc\'s), dan start de NEXUS-sessie opnieuw met tekenen door de processor, in plaats van te stoppen met "Failed to initialize EGL context".',
    ],
  },
  {
    date: '2026-11-12',
    title: 'NEXUS OS werkt zichzelf bij',
    items: [
      'NEXUS OS heeft een eigen pakketbron. Een nieuwe versie van NEXUS komt vanzelf binnen, zonder nieuwe ISO en zonder wachtwoord: kort na het opstarten en daarna om de zes uur.',
      'Ook op een andere Debian, Ubuntu of Mint kun je die bron toevoegen, zodat NEXUS meekomt met sudo apt upgrade.',
    ],
  },
  {
    date: '2026-11-12',
    title: 'NEXUS OS met een eigen gezicht',
    items: [
      'NEXUS OS heet nu overal zo, ook in de systeeminformatie, en draagt de versie van de ISO.',
      'Het opstartmenu van de usb-stick, het laadscherm en het installatieprogramma tonen het NEXUS-logo.',
      'Op een geïnstalleerde NEXUS OS is het opstartmenu verborgen (houd Shift of Esc ingedrukt om het te zien).',
    ],
  },
  {
    date: '2026-11-11',
    title: 'Aanmeldscherm van NEXUS OS flasht niet meer',
    items: [
      'Het aanmeldscherm van NEXUS OS flashte en verloor wat je typte: het vocht met een tekstaanmelding om hetzelfde scherm. Het staat nu op een eigen scherm. Wie NEXUS OS al installeerde, installeert opnieuw met de nieuwe ISO.',
      'Kan NEXUS op een computer niet starten, dan toont de live-usb na drie pogingen het aanmeldscherm met de foutmelding in plaats van te blijven flashen.',
    ],
  },
  {
    date: '2026-11-10',
    title: 'NEXUS-sessie start betrouwbaarder',
    items: ['Vlak na het opstarten wacht de NEXUS-sessie tot het scherm klaar is, zodat je niet op het aanmeldscherm terechtkomt in plaats van in NEXUS.'],
  },
  {
    date: '2026-11-09',
    title: 'NEXUS OS als eigen besturingssysteem (ISO)',
    items: [
      'Er komt een ISO-bestand van NEXUS OS bij de releases op GitHub: Debian 13 met NEXUS als bureaublad, om uit te proberen in VirtualBox of van een usb-stick, en te installeren.',
      'In een virtuele machine is de muisaanwijzer nu zichtbaar in de NEXUS-sessie.',
      'De NEXUS-sessie start een wachtwoordvenster mee, zodat een update van de Linux-app je wachtwoord kan vragen.',
    ],
  },
  {
    date: '2026-11-09',
    title: 'NEXUS als hele desktop op Linux',
    items: [
      'Kies op het aanmeldscherm van Linux "NEXUS OS": NEXUS vult dan het scherm als bureaublad en andere programma\'s openen als vensters erboven.',
      'De nieuwe app Linux-apps toont de programma\'s op je computer; in Start vind je ze ook door te typen.',
      'In die sessie staan afmelden, slaapstand, opnieuw opstarten en uitschakelen onderaan in Start.',
    ],
  },
  {
    date: '2026-11-09',
    title: 'NEXUS voor Linux',
    items: [
      'NEXUS bestaat nu ook als Linux-app: een .deb voor Debian, Ubuntu en Mint, en een AppImage voor andere distributies. Je vindt ze op /download.',
      'De Linux-app werkt zichzelf bij zoals de Windows-app; met de .deb vraagt een update je wachtwoord.',
      '"Toon in map" bij een download opent je bestandsbeheer op Linux.',
    ],
  },
  {
    date: '2026-11-09',
    title: 'Browser: geschiedenis, downloads en zoomen',
    items: [
      'De Browser-app toont in de Windows-app je geschiedenis, te doorzoeken en te wissen; die blijft op je pc.',
      'Downloads komen in je map Downloads en staan in de werkbalk met "Toon in map".',
      'In- en uitzoomen per tabblad met − en +, of Ctrl + / Ctrl − / Ctrl 0.',
    ],
  },
  {
    date: '2026-11-09',
    title: 'Melding na een update',
    items: ['Na een update toont NEXUS één keer kort wat er nieuw is, met een knop naar Over NEXUS.'],
  },
  {
    date: '2026-11-09',
    title: 'Updates zoeken op gsm en horloge zonder GitHub-limiet',
    items: ['De gsm-app en het horloge zoeken updates eerst in de releaselijst van GitHub, zoals de Windows-app, zodat een gedeeld netwerk geen "GitHub gaf 403" meer geeft.'],
  },
  {
    date: '2026-11-07',
    title: 'Browser in de Windows-app bleef wit',
    items: ['Het NEXUS-browservenster laadt nu de site in plaats van een wit scherm te tonen.'],
  },
  {
    date: '2026-11-07',
    title: 'Wat is er nieuw op Over NEXUS',
    items: ['Over NEXUS toont nu na elke update wat er veranderd is.'],
  },
  {
    date: '2026-11-07',
    title: 'Updates zoeken zonder GitHub-limiet',
    items: [
      'De Windows-app zoekt updates eerst in de releaselijst van GitHub, zodat een gedeeld netwerk (school, thuis) geen "403 rate limit" meer geeft.',
    ],
  },
  {
    date: '2026-11-07',
    title: 'Browser in de Windows-app',
    items: [
      'Sites uit de Browser-app openen in een eigen NEXUS-venster met tabbladen, een adresbalk, terug/vooruit en een bladwijzerbalk.',
      'Met de ster bewaar je de pagina als bladwijzer; die synchroniseert met je andere apparaten.',
    ],
  },
  {
    date: '2026-11-06',
    title: 'Browser-app: startpagina en bladwijzers',
    items: [
      'Zoek of typ een adres, kies je zoekmachine (Google, DuckDuckGo, Bing of Ecosia).',
      'Bladwijzers in mappen, te ordenen en te bewerken, gesynchroniseerd tussen je apparaten.',
    ],
  },
  {
    date: '2026-11-06',
    title: 'Darts: wedstrijdvormen en koppels',
    items: [
      'Spelen vanaf 170, 301, 501, 701, 1001 of een eigen score.',
      'Legs en sets als best of 3, 5, …, en koppelwedstrijden waarin de spelers per leg wisselen.',
    ],
  },
  {
    date: '2026-11-06',
    title: 'Darts: bijnamen en meer trainingen',
    items: [
      'Spelers met bijnaam, bewaard in je spelerslijst.',
      "Nieuwe trainingen: Bob's 27, scoren en uitgooien, met statistieken per speler.",
    ],
  },
  {
    date: '2026-11-06',
    title: 'Verjaardagen en weer op je horloge',
    items: ['Verjaardagen van je contacten in de Agenda en de Dagstart.', 'Het weer op je horloge.'],
  },
  {
    date: '2026-11-06',
    title: 'Over jou, Klok, Rekenmachine, Weer en Contacten',
    items: [
      'Over jou in Account: kies je "Ik werk", dan wordt het School-profiel Werk.',
      'Nieuwe apps: Klok met wekkers, Rekenmachine, Weer en Contacten.',
    ],
  },
]
