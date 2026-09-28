# Capturing texts from your Mac

Kith can suggest log entries from your text conversations. A small script on your Mac runs every night at 23:00. It reads the Messages database, keeps only one-to-one conversations with the friends you list, and writes an **encrypted** file to your iCloud Drive. On your iPhone, you import that file into Kith's **Inbox**. You review each conversation there, and nothing is logged until you tap to add it.

## What it reads, and what it doesn't

| Reads | Doesn't read or keep |
|---|---|
| `~/Library/Messages/chat.db`, opened **read-only** | Group chats (off by default, see below) |
| Only 1:1 conversations with the friends in `~/.kith/capture.json` | Anyone not on your list |
| Their messages to you, plus your replies in those conversations so Kith can tell who got in touch first (you can turn this off) | Reactions/tapbacks, system notices, empty messages |
| Contacts (`~/Library/Application Support/AddressBook`), read-only, only to look up a listed friend's phone numbers and emails | Photos and files: an attachment is shown as `[attachment]` |

Privacy properties:

- **Nothing is sent anywhere** except your own iCloud Drive folder. There's no server, no account and no AI step. The script makes no network requests.
- The file is **encrypted** with your *capture passphrase* using the same scheme as Kith backups: AES-GCM-256, with the key derived by PBKDF2-SHA-256 over 600,000 iterations. iCloud stores only ciphertext. The passphrase is kept in your macOS login Keychain, not in a file.
- On the Mac, the script keeps only its config, its progress marker (the last message number it handled) and a log. The log records **counts only** and never message text.
- In Kith, **message text is deleted once you've reviewed a conversation**. Only the entries you confirm are kept.
- Kith never measures how quickly anyone replies. Message times are used only to put messages in order and split them into conversations. Kith shows dates, not clock times.
- Old bundle files are deleted from iCloud Drive after `retentionDays` (14 by default). Only files this script wrote are touched.

## 1. Set up (once)

You need Node 23 or later (`node --version`) in this repository folder.

```bash
npm run capture -- setup
```

This creates `~/.kith/` (readable only by you) and a starter `~/.kith/capture.json`. It then asks twice for a **capture passphrase** of at least 8 characters, with the input hidden, and saves it to the login Keychain as the item `kith-capture`. It is separate from your Kith vault passphrase, and you'll type it on your iPhone the first time you import. The passphrase is passed to the Keychain tool over stdin, so it never appears in the process list.

## 2. Grant Full Disk Access

macOS protects Messages and Contacts. The nightly job runs as the Node binary, so that binary needs Full Disk Access:

1. Run `npm run capture -- status`. It prints the exact path to grant, for example `/opt/homebrew/Cellar/node/23.3.0/bin/node`. This is the real file behind Homebrew's `/opt/homebrew/bin/node` link.
2. Open **System Settings → Privacy & Security → Full Disk Access**.
3. Click **+**, press **Cmd-Shift-G**, paste that path, press Return, then click **Open**.
4. Make sure its switch is **on**.

When you run commands yourself in a terminal (`friends`, `run --dry-run`, `status`), macOS checks the **terminal app** (Terminal, iTerm, VS Code…) rather than Node. To use those commands with real data, grant the terminal app too. You can switch that off again afterwards; the nightly job only needs the Node binary.

After `brew upgrade node`, the path changes. Grant the new path and run `npm run capture -- install` again (`status` warns you when they differ).

## 3. Choose friends

Use the **same name the person has in Kith**, because that's how the Inbox matches conversations to people.

```bash
npm run capture -- friends add "Sarah"                                # looks up "Sarah" in Contacts
npm run capture -- friends add "Sarah" --contact "Sarah Whitfield"    # Kith name differs from Contacts name
npm run capture -- friends add "Sam" --handle +15551234567 --handle sam@example.com   # no Contacts lookup
npm run capture -- friends                                            # list, with the numbers/emails each resolves to
npm run capture -- friends remove "Sam"
```

- Without `--handle`, the numbers and emails come from Contacts. The lookup prefers an exact full name, then a nickname, then a unique first name. If several people match, or nobody does, the command lists the candidates so you can pass `--contact` or `--handle`.
- Phone numbers match on their last 10 digits, so `+1 (555) 123-4567`, `555.123.4567` and `15551234567` are the same number. Emails match regardless of case.
- If an iMessage and an SMS thread with the same person are separate, both are captured.

## 4. Check before scheduling

```bash
npm run capture -- run --dry-run
```

The dry run prints, for each friend, how many messages were received and sent and the date range. It shows **no message text** and writes nothing. A first run without saved progress looks at the last 24 hours. To look further back:

```bash
npm run capture -- run --since 2026-09-01 --dry-run
npm run capture -- run --since 2026-09-01     # writes a bundle covering that range
```

## 5. Schedule it

```bash
npm run capture -- install
```

This writes `~/Library/LaunchAgents/com.kith.capture.plist` and loads it. The job runs daily at **23:00**. If the Mac is asleep at 23:00, macOS runs it when the Mac next wakes. If the Mac is shut down at 23:00, that night is skipped, and the next run catches up, because each run starts after the last message it processed. The Mac must be logged in for the Keychain to be available.

Each run:

1. Reads messages newer than the saved progress marker.
2. Writes `kith-capture-YYYY-MM-DD-xxxxxx.json` to `iCloud Drive/Kith/`.
3. Saves the new progress marker, but only after the file is written. If nothing matched, no file is written and the marker still moves forward.
4. Deletes its own bundles older than `retentionDays`.
5. Appends one line of counts to `~/.kith/capture.log`.

## 6. Import on iPhone

1. Open Kith and go to **Inbox → Import**.
2. In the file picker, choose **iCloud Drive → Kith** and pick the newest `kith-capture-…` file. Importing an older or overlapping file is harmless, because messages are de-duplicated.
3. Enter the capture passphrase. You can let Kith remember it inside your encrypted vault.
4. Review each conversation: add, edit or dismiss the suggested entries. When you finish a conversation, its message text is deleted.

## Config reference (`~/.kith/capture.json`)

```json
{
  "friends": [
    { "name": "Sarah", "contact": "Sarah Whitfield" },
    { "name": "Sam", "handles": ["+15551234567", "sam@example.com"] }
  ],
  "includeSent": true,
  "includeGroupChats": false,
  "outputDir": "~/Library/Mobile Documents/com~apple~CloudDocs/Kith",
  "retentionDays": 14
}
```

| Key | Meaning |
|---|---|
| `friends[].name` | The person's name in Kith. |
| `friends[].contact` | Their name in Contacts, if it differs. |
| `friends[].handles` | Phone numbers or emails to use instead of a Contacts lookup. |
| `includeSent` | Include your own messages in those conversations. If you turn this off, Kith can't tell who got in touch first, which skews reciprocity. |
| `includeGroupChats` | Include group chats that contain a listed friend. Only messages *from* listed friends are taken, because your own group messages aren't addressed to one person. This brings in other people's context, so it's off by default. |
| `outputDir` | Where bundles go. |
| `retentionDays` | Delete this script's bundles older than this many days. Set it to `0` to keep them all. |

## Troubleshooting

`npm run capture -- status` shows the config, whether a passphrase is in the Keychain, the last run, whether Messages and Contacts are readable, and whether the nightly job is loaded.

| Symptom | Fix |
|---|---|
| `authorization denied` / "NOT READABLE (no Full Disk Access)" | Complete step 2. For commands you type yourself, grant your terminal app. |
| "matches several contacts" / "No contact named" | Use `--contact "<exact Contacts name>"` or `--handle`. |
| "No capture passphrase in the Keychain" | Run `setup` again. |
| Job installed but not running after a Node upgrade | Grant Full Disk Access to the new path shown by `status`, then run `install` again. |
| Nothing in the Inbox | Check `~/.kith/capture.log`. "no bundle needed" means none of your listed friends texted since the last run. Make sure iCloud Drive has finished syncing the `Kith` folder on both devices. |
| iPhone says the passphrase is wrong | The bundle was sealed with the passphrase in the Mac's Keychain at that time. If you changed it with `setup`, older bundles need the old passphrase. |

## Uninstall and clean up

```bash
npm run capture -- uninstall                                  # stop and remove the nightly job
security delete-generic-password -s kith-capture              # remove the Keychain item
rm -rf ~/.kith                                                # config, progress marker, log
rm ~/Library/Mobile\ Documents/com~apple~CloudDocs/Kith/kith-capture-*.json   # remaining bundles
```

Then remove the Node binary (and your terminal, if you added it) from **Full Disk Access**. Entries you already confirmed in Kith are unaffected.
