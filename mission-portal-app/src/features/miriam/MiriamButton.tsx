import { useRouter } from 'expo-router'
import { FloatingLayer } from '@/components/ui/FloatingLayer'
import { VideoPlayerModal } from '@/components/ui/VideoPlayerModal'
import { ChordSheetViewer } from '@/features/worship/ChordSheetViewer'
import { useRemindersStore } from '@/stores/remindersStore'
import { useTasksStore } from '@/stores/tasksStore'
import { BriefingScreen } from './BriefingScreen'
import { MiriamHeaderButton, MiriamPanel, MorningOffer } from './MiriamPanel'
import { useBriefing } from './useBriefing'
import { useListening } from './useListening'
import { useMiriamConversation } from './useMiriamConversation'
import { useAppActive, usePanelState } from './usePanelState'

/**
 * Miriam's button, in the header, and what opens from it.
 *
 * Tap it, or — where switched on — say "Hey Miriam", and say what to do:
 * "Create an event on 9/25 called Revival in the Heartland, starting at 9 PM
 * in Coralville, Iowa; assign everyone in All except Jacob." What was said
 * goes to Miriam (lib/miriam, ./askMiriam), and what she fills in opens where
 * it belongs, to be checked and saved: nothing is saved without that. It can
 * be typed instead, and is where the browser has no speech recognition.
 *
 * "Hey Miriam" is listened for by a wake word engine on the device itself
 * (lib/wakeEngine: sherpa-onnx's keyword spotter), which hears that phrase and
 * nothing else — so nothing said near the device is sent anywhere, and it is
 * light enough to leave running. Only while the app is open and on screen,
 * and only on a device where it has been switched on (off unless it is). It
 * gives the microphone up the moment anything else wants it (lib/speechOwner)
 * and comes back when that is done.
 *
 * When it hears her name it stops, there is a chime, and speech recognition
 * takes the request, as when the button is tapped. Said in one breath, the
 * first word or so of the request can fall in the moment between the two:
 * "Hey Miriam" — chime — "create an event…" is surer.
 *
 * On a phone the microphone is set up as for a call — the phone's own
 * processing for a voice close by, which holds up better in a noisy room
 * than the raw microphone the song finder uses to hear music. Over a live
 * band it will still mostly not hear her name; the button is for then.
 *
 * Shown only to people Miriam can do something for (canUseMiriam).
 *
 * The parts, each in its own file:
 *  - ./usePanelState: what her bar shows, shared by the rest.
 *  - ./useListening: the microphone — a request heard, and "Hey Miriam".
 *  - ./useBriefing: the daily briefing, offered, shown and read out.
 *  - ./useMiriamConversation: what she does with a request.
 *  - ./MiriamPanel: what is drawn.
 */
export function MiriamButton() {
  const router = useRouter()
  const panel = usePanelState()
  const appActive = useAppActive()
  // Each part calls on the others; those defined further down are reached
  // through these, which are only called once everything is in place.
  const listening = useListening(panel, {
    appActive,
    send: (text) => conversation.send(text),
  })
  const briefing = useBriefing(panel, {
    appActive,
    stopWake: listening.stopWake,
    talkFor: (typing) => conversation.talkFor(typing),
    hereNow: () => conversation.hereNow(),
  })
  const conversation = useMiriamConversation(panel, listening, briefing)
  const { open, briefing: shown, video, setVideo, song, setSong, sheetQueue } = panel

  return (
    <>
      <MiriamHeaderButton
        open={open}
        waiting={listening.waiting}
        onPress={() => listening.listen()}
      />

      <FloatingLayer visible={open} onRequestClose={conversation.close}>
        <MiriamPanel panel={panel} listening={listening} conversation={conversation} />

        {/* The briefing on a screen of its own, over her bar, read a part at a time. */}
        {shown && briefing.briefScreen ? (
          <BriefingScreen
            briefing={shown}
            saying={briefing.saying}
            speaking={briefing.reading}
            onStop={briefing.stopBriefing}
            onReplay={() => briefing.readBriefing(shown)}
            onClose={() => {
              briefing.stopBriefing()
              briefing.setBriefScreen(false)
              panel.setBriefing(null)
              conversation.close()
            }}
            onOpen={(href) => {
              conversation.close()
              router.push(href as never)
            }}
            onTaskDone={(id) => useTasksStore.getState().setStatus(id, 'done')}
            onReminderDone={(r) => useRemindersStore.getState().setDone(r, true)}
            onBringFood={briefing.bringFood}
            onRemind={briefing.remind}
          />
        ) : null}
      </FloatingLayer>
      <FloatingLayer
        visible={briefing.offerBriefing && !open}
        onRequestClose={briefing.dismissOffer}
      >
        <MorningOffer onShow={briefing.openBriefing} onDismiss={briefing.dismissOffer} />
      </FloatingLayer>
      <VideoPlayerModal
        url={video?.youtubeUrl ?? null}
        title={video?.title}
        subtitle={video?.album ?? video?.preacher ?? video?.host}
        onClose={() => setVideo(null)}
      />
      {song ? (
        <ChordSheetViewer
          sheet={song.sheet}
          openInKey={song.key}
          queue={sheetQueue}
          onOpenSheet={(sheet, key) => setSong({ sheet, key })}
          onClose={() => {
            setSong(null)
            sheetQueue.reset()
          }}
        />
      ) : null}
    </>
  )
}
