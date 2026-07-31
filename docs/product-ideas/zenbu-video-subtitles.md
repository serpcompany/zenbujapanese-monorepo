## 1 video subtitle overlay, translation, word lookup, etc. and more

- Reference: /Users/devin/dev/repos/github@zenbujapanese/prototypes/zenbu-video-subtitles
- Reference: /Users/devin/dev/repos/github@zenbujapanese/prototypes/sokutan-subtitle-reader-extension-clone-BAK
- Reference: /Users/devin/dev/repos/github@zenbujapanese/prototypes/migaku-extension-clone

## 2 captions for videos without supplied caption/subtitle information


- A: Generate captions/subtitles from local video files (so the user can have the primary/secondary captions on any local video files they may have)
- B: Generate captions/subtitles in real time on video players on websites whose video media does NOT have captions/subtitles (so the user can have the primary/secondary captions area even on websites not officially supported, and videos where the captions were never created and attached)

Issues:

1. bug: where does the 'Downloading Whisper model' model download to? its downloading again. i already downlaoded it once. this is poor design if the extension is the storage context.
2. bug: the UI/UX of the sidebar is bad. it gets infinitely long, extending the page while the video is not sticky. 
3. bug: the resume geeneration button isnt clickable. its just always disabled. 
4. feat: the /local_player.html page shoudl have a dropzone so the user can drag/drop files onto it as an alternative to using the upload button
5. feat: previous processed media/videos in this tool should be easily re-loadable. ex: there could be a 'recents' or 'list' of all previously done things, and a one-click on it would load that item into the player (assuming the users local file has not been moved or corrupted)
6. feat: the generation captions must be saveable/downloadable from the player or extension UI as an SRT/captions type file with timestamps and other necessary data
7. bug: continually log/monitor/pull any errors in the 'chrome://extensions/?errors=nhmadmfnpfmdkbkfacefgpclhdnihkbf' page, console, and service worker console until all errors have been fixed $tdd style to prevent regressions, etc.
8. feat: can an SRT file be like 'added back' to the original video media file as part of its 'pacakged data' after its generated to make this newly "captioned" video transportable to otehr machines while preserving this work? if so, that feature needs to be added
9. feat: this entire "feature/functionality' needs to be built together in a way its 'contained' and 'reusable' and 'transportable' to other projects, etc. as if its its own exportable/callable module/interface/etc. type thing.... self contained, etc.