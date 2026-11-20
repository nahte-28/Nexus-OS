/**
 * Everything NEXUS keeps running in the background: syncing, reminders, notices and automations.
 * main.tsx loads this right after the first screen is drawn, so the desktop shows sooner; none
 * of it is needed to draw that first screen.
 */
import { transferTitle } from '@nexus/core'
import { defaultEngine } from './connect/ConnectContext'
import { startFlowRunner } from './flows/runner'
import { startFlowsSync } from './flows/sync'
import { startFilesSync } from './files/sync'
import { startAutoBackup } from './backup/auto'
import { startAppointmentInvites } from './agenda/invitesApi'
import { startNoteShares } from './notes/shares'
import { startDartsForWatch } from './darts/watch'
import { startTogetherForWatch } from './study/watch'
import { startFreeBusy } from './friends/freeBusy'
import { startBirthdays } from './friends/birthdaysApi'
import { startCardDuels } from './flashcards/duel'
import { startFocusTicker } from './study/timer'
import { startDeadlineAlerts } from './life/alerts'
import { startDagstart } from './life/dagstart'
import { startGradesSync } from './grades/store'
import { startHabitAlerts } from './habits/alerts'
import { startWeekReview } from './review/week'
import { startHabitsSync } from './habits/store'
import { startFlashcardsSync } from './flashcards/store'
import { startExamsSync } from './study/exams'
import { startClassAgenda } from './study/classAgenda'
import { startGroupSync } from './study/group'
import { startJournalSync } from './journal/store'
import { startSpacesSync } from './spaces/store'
import { setInboxDeviceName, startInboxRulesSync, startInboxSync } from './inbox/store'
import { startCapturesSync } from './capture/hub'
import { startBriefingSync } from './briefing/store'
import { startProjectHubSync } from './projecthub/store'
import { startKnowledgeSync } from './knowledge/store'
import { startStudyLabSync } from './studylab/store'
import { startGamingSync } from './gaming/store'
import { startDartsSync } from './darts/store'
import { startGoalsSync } from './goals/store'
import { startContactsSync } from './contacts/store'
import { startBirthdayAlerts } from './contacts/alerts'
import { startWeatherRefresh } from './weather/store'
import { startBrowserBookmarks } from './browser/bridge'
import { startVault } from './vault/store'
import { startSleepGuard } from './gaming/timer'
import { startFriendsSharing } from './gaming/friends'
import { startTeamChatNotices } from './teams/chat'
import { startMentionNotices } from './teams/comments'
import { startTaskOutbox } from './teams/taskQueue'
import { startAssignedNotices } from './teams/assignedNotices'
import { startFriendNotices } from './friends/friends'
import { startDmNotices } from './friends/dm'
import { startOutbox } from './offline/outbox'
import { startPresence } from './presence/presence'
import { startAdminCheck } from './admin/admin'
import { startOwnKeyGuard } from './ai/ownKey'
import { startSentinel } from './sentinel/store'
import { startNotificationLinks } from './integration/notificationLinks'
import { startTimeMachine } from './timemachine/store'
import { startBridge } from './bridge/store'
import { startIntelligence } from './intelligence/store'
import { showSystemNotification } from './connect/engine'
import { isFeatureOn, onFeaturesChange } from './features/store'
import { startFinanceAlerts, startFinanceSync } from './finance/store'
import { startLifeSync } from './life/sync'
import { startCalendarSync } from './profiles/calendar'
import { startProfilesSync } from './profiles/sync'
import { reminderDelivery } from './reminders/deliver'
import { startWebPush } from './push/subscribe'
import { startSafetyNet } from './safety/plan'
import { startReminderScheduler } from './reminders/store'
import { startUpdateChecks } from './platform/update'
import { supabase } from './sync/supabase'


// Automations run as long as NEXUS is open somewhere on this device.
startReminderScheduler(reminderDelivery(defaultEngine))
// Flow Studio's automations, under the same rule: only while NEXUS is open on this device.
startFlowRunner(defaultEngine)
// The phone gets the notifications of the coming days ahead, so it can show them itself when the pc is off.
startSafetyNet(defaultEngine)
// A phone with NEXUS in Chrome and push on keeps the server's push address up to date.
startWebPush(defaultEngine)
// The Windows app looks for a newer version itself; the browser version updates through its service worker.
startUpdateChecks()
startCalendarSync()
// With an account, profiles and the calendar link follow you to every device.
startProfilesSync(supabase)
// Flows, their settings and run history too; each event still runs on one device only.
startFlowsSync(supabase)
// NEXUS Life: deadlines and projects, on every device, with notifications before a deadline.
startLifeSync(supabase)
startDeadlineAlerts(defaultEngine)
// Dagstart: every morning the day ahead, on this device and (through the plan above) the phone.
startDagstart(defaultEngine)
// Cijfers: your marks per course, on every device with an account.
startGradesSync(supabase)
// Gewoontes: ticked off on every device, with a reminder when one is still open.
startHabitsSync(supabase)
startFlashcardsSync(supabase)
startExamsSync(supabase)
startGroupSync(supabase)
// Klasagenda: group deadlines of your class teams go to your own Agenda by themselves.
startClassAgenda(supabase, () => isFeatureOn('teams'), onFeaturesChange)
startJournalSync(supabase)
startSpacesSync(supabase, () => isFeatureOn('spaces'), onFeaturesChange)
startInboxSync(supabase, () => isFeatureOn('inbox'), onFeaturesChange)
// Inbox 2.0: the rules per source on every device, and this device's name in the delivery status.
startInboxRulesSync(supabase, () => isFeatureOn('inbox'), onFeaturesChange)
setInboxDeviceName(() => {
  const state = defaultEngine.getSnapshot()
  return state.status === 'ready' ? state.devices.find((d) => d.isThisDevice)?.name : undefined
})
// Snel vastleggen 2.0: Te sorteren, sjablonen and history of Snelle notitie.
startCapturesSync(supabase, () => isFeatureOn('capture'), onFeaturesChange)
// Dagbriefing: the history of sent Dagstarts.
startBriefingSync(supabase, () => isFeatureOn('briefing'), onFeaturesChange)
// Project Hub: board, milestones and activity of the Agenda projects.
startProjectHubSync(supabase, () => isFeatureOn('projectHub'), onFeaturesChange)
// Kennis: collections, tags and versions of Notities.
startKnowledgeSync(supabase, () => isFeatureOn('knowledge'), onFeaturesChange)
// Study Lab and Gaming Companion: own documents, synced once switched on.
startStudyLabSync(supabase, () => isFeatureOn('studyLab'), onFeaturesChange)
startGamingSync(supabase, () => isFeatureOn('gaming'), onFeaturesChange)
startDartsSync(supabase, () => isFeatureOn('darts'), onFeaturesChange)
startGoalsSync(supabase, () => isFeatureOn('goals'), onFeaturesChange)
// Contacten: the address book, and a notice on someone's birthday.
startContactsSync(supabase, () => isFeatureOn('contacts'), onFeaturesChange)
startBirthdayAlerts(defaultEngine, () => isFeatureOn('contacts'))
// Weer: keeps the first place's forecast fresh for the Dagstart.
startWeatherRefresh(() => isFeatureOn('weather'))
startBrowserBookmarks()
// Vault: tags, collections, versions and the trash of your files; empties the trash after 30 days.
startVault(supabase, () => isFeatureOn('vault'), onFeaturesChange)
// Slaapbewaker: on an evening before a lesson day, a notice to stop gaming in time.
startSleepGuard(defaultEngine)
// Gamevrienden: your "speelt nu" in the teams you chose, from the Gaming timer.
startFriendsSharing(supabase, () => isFeatureOn('gaming'))
// Berichten die wachten op internet: privéberichten and teamchat written offline.
startOutbox()
// Teamchat: a notice for new messages in your teams while NEXUS runs.
startTeamChatNotices(supabase, () => isFeatureOn('teams'))
// Opmerkingen: a notice when a teammate mentions you with @ on a task.
startMentionNotices(supabase, () => isFeatureOn('teams'))
// Teamtaken: changes made without internet go out once the connection is back.
startTaskOutbox(supabase)
// Teamtaken: a notice when a teammate puts a task on your name (phones get it by web push).
startAssignedNotices(supabase, () => isFeatureOn('teams'))
// Vrienden: a notice for a new friend request, or when someone accepts yours.
startFriendNotices(supabase, () => isFeatureOn('friends'))
// Privéberichten: a notice for a new message, opened with this device's Connect key.
startDmNotices(supabase, defaultEngine, () => isFeatureOn('friends'))
// Afspraak met vrienden: invites to your appointments, and your copies of the ones you accepted.
startAppointmentInvites(supabase, () => isFeatureOn('friends'))
// Samen vrij moment zoeken: friends see when you are busy (never what), to find a moment together.
startFreeBusy(supabase, () => isFeatureOn('friends'))
startBirthdays(supabase, () => isFeatureOn('friends'))
// Leerkaarten-duel: challenges from friends and their results.
startCardDuels(supabase, () => isFeatureOn('friends'))
// Notities delen: notes you share with friends or teams, and the ones shared with you.
startNoteShares(supabase, () => isFeatureOn('friends') || isFeatureOn('teams'))
// Darts online op je horloge: your matches against friends go to the watch with the plan.
startDartsForWatch(supabase, () => isFeatureOn('darts'))
// Samen studeren on the watch: the open sessions of friends and teammates go with the plan.
startTogetherForWatch(supabase, () => isFeatureOn('friends') || isFeatureOn('teams'))
// Wie is er online: friends and teammates see that NEXUS is open here.
startPresence(supabase, () => isFeatureOn('friends') || isFeatureOn('teams'))
// Beheer: shows in the sidebar for an admin of this NEXUS.
startAdminCheck(supabase)
// NEXUS AI: your own AI key leaves this device when you sign out.
startOwnKeyGuard(supabase)
// Sentinel: new devices and sign-ins go in the activity log on this device.
startSentinel(supabase, defaultEngine)
startNotificationLinks(() => isFeatureOn('integration'))
// Time Machine: restore points of profiles, flows and Spaces, on this device.
startTimeMachine(() => isFeatureOn('timeMachine'), onFeaturesChange)
// Intelligence: rules that propose flows; nothing happens until you approve one.
startIntelligence(() => isFeatureOn('intelligence'), onFeaturesChange)
// Bridge: text and links from your other devices, through Connect. A phone with web push already
// showed the push, so only devices without it get a notification here.
startBridge(defaultEngine, () => isFeatureOn('bridge'), (t) => {
  if (defaultEngine.getSnapshot().devices.some((d) => d.isThisDevice && d.push)) return
  showSystemNotification({ v: 1, kind: 'notification', app: 'nexus', appName: 'NEXUS Bridge', title: `${transferTitle(t)} van ${t.deviceName}`, text: t.type === 'file' ? 'Open Bridge om het op te slaan.' : t.content.slice(0, 200), postedAt: t.sentAt, id: `bridge:${t.id}`, fromDeviceId: t.deviceId, receivedAt: Date.now(), read: false })
})
startFinanceSync(supabase)
// Financiën: budget notices at their threshold and 100%, and subscription reminders, here and on the phone.
startFinanceAlerts(defaultEngine)
startHabitAlerts(defaultEngine)
// Weekoverzicht: on Sunday evening NEXUS AI reviews the week and plans the next one.
startWeekReview(defaultEngine)
// Bestanden: your own files, also in your private storage when signed in.
startFilesSync(supabase)
// Automatische back-up: now and then everything in one file in Bestanden, so it is in your account too.
startAutoBackup(supabase)
// The focus timer's notifications, also with the Studie window closed.
startFocusTicker(defaultEngine)
