# The voice packs Hiltwright offers

The Fett263 controls speak their menus from a voice pack in the card's `common` folder, and need version 2
(`voicepack.ini` with `voice_pack_version=2`, plus the menu sounds). Fonts & SD offers the packs listed in
`catalogue.json` and puts the chosen one on the card.

They are Brian Conner's (NoSloppy) packs from https://crucible.hubbe.net/t/additional-voicepacks/4227, offered with
his permission (2026-11-21) and credited to him in the app and in `THIRD-PARTY-NOTICES.md`.

- `catalogue.json` (committed): every pack's name, group, credit, sizes, SHA-256 and a small picture.
- `english-a.zip` (not committed): the one pack that ships inside the app. `npm run dist` fetches it from the release
  and checks its hash when it is missing.
- Every other pack is a zip on the GitHub release named in the catalogue (`voicepacks-1`). The app downloads one when
  the owner picks it, checks its size and SHA-256, and keeps it in the data folder (`voice-packs`).

To rebuild after NoSloppy adds or updates packs: download each Dropbox folder from the thread's first post as a zip
(`&dl=1`) into one folder, then run

    node scripts/voicepacks.ts build <that folder> --out ../../packs/voicepacks-release

It splits zips holding several packs, leaves out packs below version 2 and the ones listed in `LEAVE_OUT`, writes one
zip per pack and the catalogue, and copies the bundled pack here. Upload every zip in the output folder to a new
release and change `RELEASE` in the script to its tag first, so existing installs keep the files their catalogue names.
