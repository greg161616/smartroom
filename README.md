# SmartRoom Phase 4 — offline operation

Upgrade from Phase 3. Existing Expo Router application, database accounts, rooms, RLS and device credentials are retained. No new paid service, phone library or mobile files are required. This adds durable controller-side storage, not phone-to-controller LAN control or automatic schedules (Phase 5).

## Before installing
- Confirm Phase 3 remote relay control works; keep a backup of working firmware/config.h outside the source directory. Preserve your actual Wi-Fi, device UUID/token, URL, relay polarity and GPIO assignments. If you used a token previously disclosed in chat/logs, rotate it via the Phase 3 SQL function before use.
- Keep mains loads disconnected for all testing. Verify relay logic voltage and level-shift the 5 V HC-SR04 ECHO to 3.3 V. Never rely on software for safe mains switching. Relay outputs start OFF on every reboot; hardware must also hold relays OFF during boot.

## 1. Database
In the SAME Supabase project, run the entire `supabase/004.sql` in SQL Editor. Do not rerun 001–003. Adds an optional offline event ID, a unique per-device index and a service-role-only v4 RPC. The original authenticated sync RPC is called within the same transaction, so ownership, expiration, current state reporting, stale-command rejection and token validation are retained. Duplicate event IDs are acknowledged without a second log row. Existing Phase 2/3 app reads the same activity log table.

## 2. Backend
Open a terminal in this extracted package root (the directory containing `supabase`). If not logged in, run `npx supabase login`. Then run:

```
npx supabase functions deploy device-sync --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

Use the same project ref and URL as Phase 3. This endpoint authenticates the private device token via the RPC; never expose a service-role key or turn off TLS checks. The new function accepts legacy firmware (no events array) and v4 batches. Run the migration BEFORE deploying. If needed, roll back the function using your Phase 3 source; the additive migration does not need to be removed. Offline events stay queued until acknowledged by a v4 backend.

## 3. Firmware
Copy `SmartRoom.ino`, `offline_store.h` and `trust_roots.h` from `firmware/SmartRoom/` into your existing working Arduino sketch folder. Keep your corrected `config.h` rather than overwriting with the placeholder. The included config.h is a complete reference only. All four files must be in the same sketch folder. Prior fixes are included: no setHandshakeTimeout call; credential strings must be on one line.

Arduino IDE: ESP8266 board package (3.1.x recommended), ArduinoJson 7.x, your same board and COM port. LittleFS is built into the ESP8266 package. Under Tools select a flash layout with a filesystem (e.g. FS:1MB if offered and appropriate to your board); choose an upload erase option that preserves filesystem data (Only Sketch, if offered). Do not change a working flash partition layout blindly or erase all flash: data may be lost. No extra filesystem uploader is necessary. Compile, upload and open Serial Monitor at 115200.

First boot should say `SmartRoom Phase 4 starting (outputs OFF)` and `LittleFS mounted`. An unformatted filesystem may not mount. Auto-format is disabled to avoid destroying data. Only if you know that filesystem contains nothing you need, enter uppercase `F` in Serial Monitor to initialize it. This erases the filesystem; it is refused if already mounted. If storage contains needed data, recover it instead. `ENABLE_SERIAL_TEST` must be true for these serial commands; disable after setup if not needed. Send `q` to show queue count, flash/RAM storage and cloud state. If mount fails, gestures still operate but unsent history and settings may be lost on reboot.

## 4. Offline behavior
- Wi-Fi loss triggers fallback; cloud failure or 25 seconds without successful sync also triggers fallback. Both relay outputs stay as they are during internet loss (not during a power restart).
- Offline gesture mode always enabled, wave mode regardless of saved online mode or disabled setting. One wave toggles relay 1, two waves within 550 ms toggle relay 2, hold for 3 seconds toggles both ON if either off, otherwise OFF. Release before another hold. Last downloaded detection distance is restored from flash (15 cm initially); online hold duration, mode and enabled flag are restored when online. No echo is not a valid near detection. The original online presence and toggle modes are unchanged.
- Local output changes made while firmware considers itself offline are saved in a FIFO queue up to 32 events (each relay transition is one event, including each changed relay in a both-relays action). Queue full: new events are dropped with a serial warning; local relay control continues. A transition before the outage is detected may not be captured as an offline event. No full audit trail is promised.
- LittleFS snapshot writes on changes or acknowledged uploads, not on every poll. Writes use a temp file and rename, reducing risk of partial writes; flash failure or sudden interruption may still cause lost events. Unknown event times (cold boot without NTP) are explicitly marked; when the controller has a valid clock, the actual timestamp is stored. Device IDs isolate saved snapshots. Queue does not include credentials. Flash is finite, avoid high-frequency switching.
- On reconnect, the v3 RPC expires stale commands and first reports current outputs; the v4 RPC logs up to 8 events per request. Events are removed only after acknowledged IDs are received. If the response is lost, duplicate retry is safe. Once online, normal remote switching and settings resume. Snapshot and offline event logs may both describe the final transition; event-ID deduplication applies specifically to offline event uploads.
- Normal sync 10 seconds, failed attempts back off to 20/40/60 seconds, then reset after success. Gesture sampling is preferentially performed before sync and active wave groups defer sync briefly. HTTPS is synchronous on this single-core ESP8266: a hand gesture during a network request can still be missed, especially if Wi-Fi remains connected but internet fails. No hard real-time latency guarantee. Cloud reappearance may take about a minute or longer depending on Wi-Fi, NTP, TLS and app refresh.

## 5. Tests (all with mains disconnected)
1. Confirm `LittleFS mounted` (or initialize intentionally as described). While online, set sensor distance to e.g. 20 cm in app, wait for a successful sync, then disconnect router WAN.
2. After failure or offline timeout, use the gestures. Send `q`: queue should increase for changed outputs. Test `1`, `2`, `a`, `o` if required. Check physical relay indicator only.
3. While offline and queued, reset controller. Both relays should start OFF. Serial should show saved settings and restored queue count. Confirm 20 cm threshold and 3-second offline hold still work. Power interruption at an arbitrary instant is not guaranteed lossless.
4. Reconnect internet. Check serial for `Cloud online: controller synchronized` and `Offline events uploaded; remaining: ...`. Refresh app; check controller online, current relay outputs and Activity page for `Offline relay ...` entries. The final current state may differ from older queued history.
5. In Supabase SQL Editor run:

```sql
select channel,actual_state,updated_at from public.relays order by channel;
select message,created_at,offline_event_id from public.activity_logs where offline_event_id is not null order by created_at desc limit 50;
select device_id,offline_event_id,count(*) from public.activity_logs where offline_event_id is not null group by device_id,offline_event_id having count(*)>1;
```

Last query should return zero rows (unique index enforces this). If no log appears: check serial queue, confirm 004.sql was imported, redeploy device-sync, check Edge Function logs. HTTP 401 means UUID/token mismatch or JWT config; 502 means DB issue; negative status means network/TLS. `q` reports actual storage mode. Don't share token or Wi-Fi password in error logs.

## 6. Scope / validation
The original app uses 15-second foreground cloud refresh; no phone control is possible without internet. Phase 4 does not introduce local Wi-Fi phone access, mobile offline cache, scheduling or physical load sensing. Existing app displays confirmed GPIO outputs, not proof a bulb is lit. API mock tests included (`tests/test-api.cjs`, requires Node 22+ and TypeScript); they validate request routing, backward compatibility, error handling and simulated duplicates. Actual SQL execution, LittleFS power-loss recovery, Arduino compilation and hardware tests are not performed in this environment. Verify before use. For documentation: https://arduino-esp8266.readthedocs.io/en/stable/filesystem.html
