# Compatibility and limitations

- Jellyfin 10.11 and 12 are supported; the automated tests run against 10.11. Jellyfin 10.9 and 10.10
  are expected to work, with a few features unavailable: storage statistics need 10.11 and Skip
  Intro needs 10.10 or newer. Seek-bar previews only appear for videos with trickplay images.
- Server-side plugins work as usual. Plugins that modify the Jellyfin web UI have no effect in
  Jellyfied, and plugin settings pages open in the Jellyfin web UI.
- Live TV covers watching channels and recordings. The programme guide grid, and scheduling or
  cancelling recordings (DVR), are not implemented; use the regular Jellyfin web UI for those.
- Every account signed in on a device can be switched to from that device without a password,
  like in other apps with an account switcher, unless it has a PIN. With a PIN, the account's
  sign-in is stored encrypted while someone else uses the browser. Two limits: the account that
  is in use at the moment is not protected by its PIN, and a short PIN can be found by a program
  that tries every combination against the stored data (each try is slowed down, most of all on
  https and localhost, where the browser's own cryptography is used; every extra digit makes it
  ten times as long). On a shared device with people you don't trust, sign out
  instead. Signing in with the password again removes the PIN, and an account whose PIN is
  forgotten can only be removed from the device, not signed out on the server from there.
- The login disclaimer is shown as plain text; HTML in it is not rendered.
- "Play on another device" works with apps that are signed in to your Jellyfin server and accept
  remote control.
- Chromecast uses Jellyfin's own receiver app, which fetches the media from your server itself.
  The Chromecast therefore has to be able to open the address you use for Jellyfied: it does not
  work when you browse on `localhost`, and a server behind HTTPS needs a certificate the Chromecast
  trusts. The Cast software is loaded from Google (`www.gstatic.com`) the first time you pick
  Chromecast, and not before. A show or season continues at the next episode to watch, as it
  does in the browser; albums and playlists start from their beginning.
- AirPlay shows the video and plays its sound on the other device. It only carries the picture,
  so while it is in use the server burns the subtitles into the video, which means a transcode.
  The address you use for Jellyfied has to be reachable from the AirPlay device.
- HEVC and AV1 transcoding has to be switched on in the server: *Dashboard → Playback →
  Transcoding → Allow encoding in HEVC format / AV1 format*. Without it the server transcodes to
  H.264 as before. Files that are already HEVC or AV1 are passed through either way.
- SyncPlay covers video. Music played while in a group stays on your own device.
- Invite-only SyncPlay groups are a Jellyfied feature: Jellyfin itself lists every group for
  everyone. Jellyfied keeps who is invited in the group's name, in characters that take up no
  space, and hides the group from other Jellyfied users; other Jellyfin apps still show it, under
  its plain name, to anyone. Invitations are noticed within about 15 seconds.
- The SyncPlay picker is Jellyfied's too. Its state lives in the container's memory and is gone
  when the container restarts. It only works with the server the container proxies
  (`JELLYFIN_URL`), since that is the server it checks callers against. Members using other
  Jellyfin apps can't suggest, vote or say they're ready, so with them in the group the creator
  spins the wheel by hand. A show that wins starts where the member starting it left off.
- Jellyfin has no way to end a SyncPlay group for everyone, so deleting one goes through the
  picker's state too (and needs the container): Jellyfied members leave within a few seconds, and
  the group ends once nobody is left. Members on other Jellyfin apps stay in it until they leave.
- Subtitle appearance applies to plain text subtitles. Styled (ASS/SSA) subtitles keep the look
  their author gave them unless you switch that off under Account settings, and PGS and VobSub
  subtitles are pictures.
- VobSub (DVD) subtitles are read out of the video file itself, because the server has no way to
  hand them out. That works for Matroska (MKV) files whose index covers the subtitle track, which
  MKVToolNix and ffmpeg write. For other files, and for VobSub in a file of its own (.idx/.sub),
  the server burns them into the video as before and they can't be shifted.
- A picture-in-picture window only shows the picture. While it is open, the server burns image
  subtitles into the video, and in Chromium browsers styled subtitles too; Safari shows styled
  subtitles as plain text there. This restarts the stream when the window opens and closes.
- Audio delay can only make the sound later, not earlier: a browser can't play sound ahead of the
  picture. It is not available in Safari on iPhone and iPad.
- Streaming quality, poster size, grid or list view and volume are stored per browser. The other
  preferences are saved with your Jellyfin account, where only Jellyfied reads them.
- SyncPlay and remote control use a WebSocket connection. If you put another reverse proxy in front
  of Jellyfied, make sure it forwards WebSocket upgrades.
- Which formats play directly depends on the browser. Jellyfied tells the server exactly what the
  current browser can decode, and the server transcodes everything else.
