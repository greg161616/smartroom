#pragma once
#include <LittleFS.h>

// Included after Settings and remote are declared. No credentials stored here.
constexpr uint8_t QUEUE_CAPACITY = 32;
constexpr uint8_t BATCH_SIZE = 8;
struct OfflineEvent { char id[33]; uint8_t channel; bool state; uint32_t epoch; };
OfflineEvent queue[QUEUE_CAPACITY] = {};
uint8_t queueCount = 0;
bool fsReady = false, storageDirty = false, hasSavedSettings = false;
uint32_t lastStoreAttempt = 0;
const char* STORE_PATH = "/smartroom-v4.json";
const char* TEMP_PATH = "/smartroom-v4.tmp";

bool validEventId(const char* id) {
  if (strlen(id) != 32) return false;
  for (uint8_t i=0;i<32;i++) if (!((id[i]>='0'&&id[i]<='9')||(id[i]>='a'&&id[i]<='f'))) return false;
  return true;
}
void putEvent(JsonObject o, const OfflineEvent& e) {
  o["id"]=e.id; o["channel"]=e.channel; o["state"]=e.state; o["epoch"]=e.epoch;
}
bool readEvent(JsonObjectConst o, OfflineEvent& e) {
  const char* id=o["id"]|""; int ch=o["channel"]|0;
  if (!validEventId(id)||ch<1||ch>2||!o["state"].is<bool>()||!o["epoch"].is<uint32_t>()) return false;
  memcpy(e.id,id,33); e.channel=ch; e.state=o["state"].as<bool>(); e.epoch=o["epoch"].as<uint32_t>(); return true;
}
void saveStorage() {
  if (!fsReady || !storageDirty) return;
  lastStoreAttempt=millis();
  JsonDocument doc; doc["version"]=1;doc["device"]=DEVICE_ID;doc["has_settings"]=hasSavedSettings;
  JsonObject s=doc["settings"].to<JsonObject>();s["enabled"]=remote.enabled;s["mode"]=remote.mode;s["distance"]=remote.distance;s["hold"]=remote.hold;
  JsonArray a=doc["events"].to<JsonArray>(); for(uint8_t i=0;i<queueCount;i++)putEvent(a.add<JsonObject>(),queue[i]);
  File f=LittleFS.open(TEMP_PATH,"w");
  if(!f){Serial.println("Storage write failed; RAM queue retained");return;}
  size_t expected=measureJson(doc);size_t written=serializeJson(doc,f);f.flush();f.close();
  if(written!=expected || !LittleFS.rename(TEMP_PATH,STORE_PATH)) {Serial.println("Storage commit failed; RAM queue retained");return;}
  storageDirty=false;
}
void mountStorage() {
  LittleFSConfig cfg;cfg.setAutoFormat(false);LittleFS.setConfig(cfg);
  fsReady=LittleFS.begin();
  if(!fsReady){Serial.println("LittleFS unavailable. RAM-only queue. See README before formatting.");return;}
  Serial.println("LittleFS mounted");
  if(!LittleFS.exists(STORE_PATH)) return;
  File f=LittleFS.open(STORE_PATH,"r");JsonDocument doc;
  if(!f || f.size()>8192 || deserializeJson(doc,f)) {Serial.println("Storage snapshot unreadable; using defaults");return;}
  f.close();
  if((doc["version"]|0)!=1 || strcmp(doc["device"]|"",DEVICE_ID)!=0){Serial.println("Ignoring snapshot for another device/version");return;}
  JsonObjectConst s=doc["settings"].as<JsonObjectConst>();int m=s["mode"]|255,d=s["distance"]|0,h=s["hold"]|0;
  if((doc["has_settings"]|false)&&s["enabled"].is<bool>()&&m>=0&&m<=2&&d>=2&&d<=100&&h>=500&&h<=10000){remote={s["enabled"].as<bool>(),(uint8_t)m,(uint16_t)d,(uint16_t)h};hasSavedSettings=true;}
  for(JsonObjectConst o:doc["events"].as<JsonArrayConst>()) {OfflineEvent e={};if(queueCount<QUEUE_CAPACITY&&readEvent(o,e))queue[queueCount++]=e;}
  Serial.printf("Restored settings: %s; queued events: %u\n",hasSavedSettings?"yes":"no",queueCount);
}
void bufferEvent(uint8_t channel,bool state) {
  if(queueCount>=QUEUE_CAPACITY){Serial.println("Offline queue full: new event dropped; relay still works");return;}
  OfflineEvent& e=queue[queueCount++];
  snprintf(e.id,sizeof(e.id),"%08lx%08lx%08lx%08lx",(unsigned long)ESP.random(),(unsigned long)ESP.random(),(unsigned long)ESP.random(),(unsigned long)ESP.random());
  e.channel=channel;e.state=state;time_t t=time(nullptr);e.epoch=(t>=1700000000 && (uint64_t)t<=4102444800ULL)?(uint32_t)t:0;
  storageDirty=true;saveStorage();Serial.printf("Offline event buffered: %u/%u\n",queueCount,QUEUE_CAPACITY);
}
void addEvents(JsonDocument& request) {
  JsonArray a=request["events"].to<JsonArray>();for(uint8_t i=0;i<queueCount&&i<BATCH_SIZE;i++)putEvent(a.add<JsonObject>(),queue[i]);
}
void acceptEventAcks(JsonArrayConst a) {
  bool changed=false;
  // Acknowledge only the IDs returned by the authenticated server.
  for(uint8_t i=0;i<queueCount;) {
    bool matched=false;for(JsonVariantConst v:a){const char* id=v|"";if(strcmp(id,queue[i].id)==0){matched=true;break;}}
    if(matched){for(uint8_t j=i+1;j<queueCount;j++)queue[j-1]=queue[j];--queueCount;changed=true;}else ++i;
  }
  if(changed){storageDirty=true;Serial.printf("Offline events uploaded; remaining: %u\n",queueCount);}
}
void storageTick(){if(storageDirty&&fsReady&&millis()-lastStoreAttempt>=5000)saveStorage();}
void formatUninitializedStorage() {
  if(fsReady){Serial.println("Storage already mounted; refusing format");return;}
  if(!LittleFS.format() || !LittleFS.begin()){Serial.println("LittleFS format/mount failed");return;}
  fsReady=true;storageDirty=true;saveStorage();Serial.println("LittleFS initialized");
}
