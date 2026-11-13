/* NEXUS OS installeren: wat Calamares toont terwijl het installeert. */
import QtQuick 2.0;
import calamares.slideshow 1.0;

Presentation
{
    id: presentation

    Timer {
        interval: 15000
        repeat: true
        onTriggered: presentation.goToNextSlide()
    }

    Slide {
        Image {
            id: logo1
            source: "welcome.png"
            width: 600; height: 300
            fillMode: Image.PreserveAspectFit
            anchors.centerIn: parent
        }
        Text {
            anchors.horizontalCenter: logo1.horizontalCenter
            anchors.top: logo1.bottom
            text: "NEXUS OS wordt geïnstalleerd. Dat duurt enkele minuten.<br/>Daarna start je opnieuw op, zonder de usb-stick."
            wrapMode: Text.WordWrap
            width: 600
            horizontalAlignment: Text.Center
        }
    }

    Slide {
        Text {
            anchors.centerIn: parent
            text: "Na het opstarten kies je op het aanmeldscherm NEXUS OS.<br/>Wifi, geluid en Bluetooth regel je in de app Systeem,<br/>nieuwe apps installeer je in Linux-apps."
            wrapMode: Text.WordWrap
            width: 600
            horizontalAlignment: Text.Center
        }
    }
}
