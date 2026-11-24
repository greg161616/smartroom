#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <ArduinoJson.h>
#include <time.h>
#include "config.h"
#include "trust_roots.h"

bool relayState[2] = {false,false};
const uint8_t relayPins[2] = {RELAY1_GPIO,RELAY2_GPIO};
struct Settings { bool enabled; uint8_t mode; uint16_t distance; uint16_t hold; };
Settings remote = {true,0,15,3000};
const Settings defaultFallback = {true,0,15,3000};
Settings active = defaultFallback;
#include "offline_store.h"
Settings offlineSettings();
void selectSettings(const Settings& s);
Settings offlineSettings(){return {true,0,remote.distance,3000};}
BearSSL::X509List* roots = nullptr;
char ack[2][37] = {};
bool synced = false, resetPending = true, clockStarted = false;
uint32_t lastSuccess = 0, lastAttempt = 0, lastWifi = 0, lastSample = 0;
uint32_t retryDelay = SYNC_INTERVAL_MS;
bool firstAttempt = true, nearStable = false, candidate = false, consumed = false;
uint8_t candidateCount = 0, waves = 0;
uint32_t nearSince = 0, lastWave = 0, absentSince = 0;

void setRelay(uint8_t ch,bool on) {
  if (ch>1) return;
  digitalWrite(relayPins[ch],on == RELAY_ACTIVE_LOW ? LOW : HIGH);
  if (relayState[ch]!=on) { relayState[ch]=on; Serial.printf("Relay %u -> %s\n",ch+1,on?"ON":"OFF"); if(!synced)bufferEvent(ch+1,on); }
}
void both(bool on) { setRelay(0,on); setRelay(1,on); }
void toggleBoth() { both(!(relayState[0]&&relayState[1])); }
void resetGesture() { nearStable=false;candidate=false;candidateCount=0;consumed=false;waves=0;nearSince=0;lastWave=0;absentSince=millis(); }
void selectSettings(const Settings& s) {
  if (active.enabled!=s.enabled||active.mode!=s.mode||active.distance!=s.distance||active.hold!=s.hold) {active=s;resetGesture();}
}
void markOffline() { if(synced) Serial.println("Cloud offline: local wave mode"); synced=false;resetPending=true;selectSettings(offlineSettings()); }
void syncFailed(){markOffline();retryDelay=retryDelay>=30000?60000:retryDelay*2;}
float distanceCm() {
  digitalWrite(TRIG_GPIO,LOW);delayMicroseconds(2);digitalWrite(TRIG_GPIO,HIGH);delayMicroseconds(10);digitalWrite(TRIG_GPIO,LOW);
  unsigned long us=pulseIn(ECHO_GPIO,HIGH,15000UL);
  return us ? us*0.0343f/2.0f : -1.0f;
}
void finishWaves() { if(waves==1)setRelay(0,!relayState[0]);else if(waves==2)setRelay(1,!relayState[1]);waves=0; }
void gestures() {
  uint32_t now=millis();
  if (!active.enabled) return;
  if (now-lastSample>=SENSOR_INTERVAL_MS) {
    lastSample=now; float d=distanceCm();
    bool n=d>=2 && d<=active.distance+(nearStable?3:0);
    if (n!=candidate) {candidate=n;candidateCount=1;} else if(candidateCount<2) ++candidateCount;
    if(candidateCount>=2 && candidate!=nearStable) {
      nearStable=candidate;
      if(nearStable) {
        nearSince=now;consumed=false;
        if(active.mode==0 && waves && now-lastWave>WAVE_WINDOW_MS) finishWaves();
        if(active.mode==2) {toggleBoth();consumed=true;}
        if(active.mode==1) both(true);
      } else {
        absentSince=now;
        if(active.mode==0 && !consumed && now-nearSince>=80) {if(waves<3)++waves;lastWave=now;}
      }
    }
  }
  if(active.mode==0) {
    if(nearStable && !consumed && now-nearSince>=active.hold) {toggleBoth();waves=0;consumed=true;}
    if(!nearStable && waves && now-lastWave>=WAVE_WINDOW_MS) finishWaves();
  } else if(active.mode==1) {
    if(nearStable && (!relayState[0]||!relayState[1])) both(true);
    if(!nearStable && now-absentSince>=PRESENCE_OFF_MS && (relayState[0]||relayState[1])) both(false);
  }
}
void serialTest() {
  if(!ENABLE_SERIAL_TEST) return;
  while(Serial.available()) {char c=Serial.read();if(c=='1')setRelay(0,!relayState[0]);else if(c=='2')setRelay(1,!relayState[1]);else if(c=='a')both(true);else if(c=='o')both(false);else if(c=='q')Serial.printf("Queue: %u/%u, storage: %s, cloud: %s\n",queueCount,QUEUE_CAPACITY,fsReady?"flash":"RAM",synced?"online":"offline");else if(c=='F')formatUninitializedStorage();}
}
void wifiTick() {
  uint32_t now=millis();
  if(WiFi.status()!=WL_CONNECTED) {
    if(synced)markOffline();
    if(now-lastWifi>=15000) {lastWifi=now;WiFi.reconnect();}
    return;
  }
  if(!clockStarted) {configTime(0,0,"pool.ntp.org","time.google.com");clockStarted=true;}
}
void syncCloud() {
  if(WiFi.status()!=WL_CONNECTED || time(nullptr)<1700000000 || !roots) return;
  // Do not interrupt a wave/hold; bound deferral to avoid starving heartbeats.
  uint32_t now=millis();
  if(!firstAttempt && now-lastAttempt<retryDelay) return;
  if(active.mode==0 && ((nearStable&&!consumed)||waves) && !firstAttempt && now-lastAttempt<retryDelay+10000) return;
  firstAttempt=false;lastAttempt=now;
  JsonDocument request; request["device_id"]=DEVICE_ID;request["state1"]=relayState[0];request["state2"]=relayState[1];request["reset"]=resetPending;
  JsonArray a=request["ack"].to<JsonArray>();for(uint8_t i=0;i<2;i++)if(ack[i][0])a.add(ack[i]);
  addEvents(request);
  String body;serializeJson(request,body);
  BearSSL::WiFiClientSecure client;client.setTrustAnchors(roots);client.setTimeout(3500);
  HTTPClient http;http.setTimeout(3500);http.setReuse(false);
  if(!http.begin(client,SYNC_URL)){syncFailed();return;}
  http.addHeader("Content-Type","application/json");http.addHeader("x-device-token",DEVICE_TOKEN);
  uint32_t started=millis();int status=http.POST(body);
  if(status!=200) {Serial.printf("Sync failed: HTTP %d\n",status);http.end();syncFailed();return;}
  // Response is small and generated only by the trusted backend.
  String response=http.getString();http.end();
  uint32_t elapsed=millis()-started;
  JsonDocument doc;auto e=deserializeJson(doc,response);
  if(e || elapsed>MAX_RESPONSE_MS || !doc["settings"].is<JsonObject>() || !doc["commands"].is<JsonArray>() || doc["commands"].size()>2) {Serial.println("Invalid or slow sync response");syncFailed();return;}
  JsonObject s=doc["settings"].as<JsonObject>();
  const char* mode=s["mode"]|"";int d=s["distance_cm"]|0;int h=s["hold_ms"]|0;
  uint8_t m=strcmp(mode,"wave")==0?0:strcmp(mode,"presence")==0?1:strcmp(mode,"toggle")==0?2:255;
  if(m==255 || d<2||d>100||h<500||h>10000||!s["gesture_enabled"].is<bool>()) {syncFailed();return;}
  // Prior acknowledgements reached database. Store new acknowledgements until next successful sync.
  memset(ack,0,sizeof(ack));
  bool wasReset=resetPending;
  Settings next={s["gesture_enabled"].as<bool>(),m,(uint16_t)d,(uint16_t)h};
  if(!hasSavedSettings||remote.enabled!=next.enabled||remote.mode!=next.mode||remote.distance!=next.distance||remote.hold!=next.hold){remote=next;hasSavedSettings=true;storageDirty=true;}
  // A Phase 3 server has no event_acks; retain events until Phase 4 is deployed.
  if(doc["event_acks"].is<JsonArray>())acceptEventAcks(doc["event_acks"].as<JsonArrayConst>());
  saveStorage();retryDelay=SYNC_INTERVAL_MS;
  synced=true;resetPending=false;lastSuccess=millis();selectSettings(remote);
  if(wasReset) Serial.println("Cloud online: controller synchronized");
  for(JsonObject cmd:doc["commands"].as<JsonArray>()) {
    const char* id=cmd["id"]|"";int ch=cmd["channel"]|0;long ttl=cmd["ttl_ms"]|0L;
    // Deduct full request duration conservatively to avoid executing expired commands.
    if(ch<1||ch>2||strlen(id)!=36||!cmd["state"].is<bool>()||ttl<=(long)elapsed||wasReset)continue;
    setRelay(ch-1,cmd["state"].as<bool>());strncpy(ack[ch-1],id,36);ack[ch-1][36]='\0';
  }
}
void setup() {
  // Set OFF latch before enabling outputs. Hardware pull-ups / suitable driver still required for boot safety.
  for(uint8_t i=0;i<2;i++){digitalWrite(relayPins[i],RELAY_ACTIVE_LOW?HIGH:LOW);pinMode(relayPins[i],OUTPUT);}
  both(false);pinMode(TRIG_GPIO,OUTPUT);digitalWrite(TRIG_GPIO,LOW);pinMode(ECHO_GPIO,INPUT);
  Serial.begin(115200);Serial.println("\nSmartRoom Phase 4 starting (outputs OFF)");
  mountStorage();active=offlineSettings();resetGesture();roots=new BearSSL::X509List(TRUST_ROOTS);
  WiFi.persistent(false);WiFi.mode(WIFI_STA);WiFi.setAutoReconnect(true);WiFi.begin(WIFI_SSID,WIFI_PASSWORD);
}
void loop() {
  wifiTick();if(synced && millis()-lastSuccess>=OFFLINE_MS)markOffline();
  gestures();serialTest();storageTick();syncCloud();yield();
}
