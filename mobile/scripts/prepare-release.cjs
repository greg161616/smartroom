// Merge release branding into the existing SDK-compatible Expo project.
// Run from mobile, or pass an existing mobile directory as the first argument.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = name => JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const pluginName = p => Array.isArray(p) ? p[0] : p;
const packageId = process.env.SMARTROOM_ANDROID_PACKAGE || 'com.smartroom.iot';
const version = process.env.SMARTROOM_VERSION || '1.0.0';
if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageId)) throw Error('Invalid Android application ID');
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Use a numeric version, e.g. 1.0.0');
const pkg = read('package.json');
if (pkg.main !== 'expo-router/entry') throw Error('Expected package.json main = expo-router/entry. No changes made.');
if (!pkg.dependencies?.expo) throw Error('An existing Expo project is required.');
if (['app.config.js','app.config.ts','app.config.mjs','app.config.cjs'].some(f=>fs.existsSync(path.join(root,f)))) throw Error('Dynamic Expo config detected. Merge the release example manually; no changes made.');
const doc = read('app.json');
if (!doc.expo || typeof doc.expo !== 'object') throw Error('Expected app.json with an expo object.');
const app = doc.expo;
const current = app.android?.package;
if (current && current !== packageId && process.env.SMARTROOM_ALLOW_PACKAGE_CHANGE !== '1') throw Error(`Existing application ID ${current} differs from ${packageId}. To keep it, set SMARTROOM_ANDROID_PACKAGE. To deliberately change it, set SMARTROOM_ALLOW_PACKAGE_CHANGE=1. No changes made.`);
const oldCode = app.android?.versionCode ?? 1;
const versionCode = Number(process.env.SMARTROOM_VERSION_CODE || oldCode);
if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode < oldCode || versionCode > 2100000000) throw Error('Android versionCode must be a positive integer and not decrease.');
for (const f of ['icon.png','adaptive-foreground.png','adaptive-monochrome.png','splash-light.png','splash-dark.png']) if (!fs.existsSync(path.join(root,'assets','smartroom',f))) throw Error('Missing release asset: '+f);
const asset = './assets/smartroom/';
const oldPlugins=app.plugins || [];
const splash=['expo-splash-screen',{image:asset+'splash-light.png',imageWidth:180,resizeMode:'contain',backgroundColor:'#F1F5F9',dark:{image:asset+'splash-dark.png',backgroundColor:'#0B1220'}}];
const plugins=oldPlugins.filter(p=>pluginName(p)!=='expo-splash-screen');
if(!plugins.some(p=>pluginName(p)==='expo-router')) plugins.push('expo-router');
plugins.push(splash);
// Clear the obsolete legacy splash configuration to avoid two competing definitions.
const {splash:legacySplash,version:legacyVersion,...oldAndroid}=app.android||{};
delete app.splash;
app.name='SmartRoom'; app.slug=app.extra?.eas?.projectId ? app.slug : 'smartroom-iot';
app.scheme=app.scheme||'smartroom';app.version=version;app.orientation='portrait';
app.userInterfaceStyle='automatic';app.icon=asset+'icon.png';app.plugins=plugins;
app.android={...oldAndroid,package:packageId,versionCode,allowBackup:false,adaptiveIcon:{foregroundImage:asset+'adaptive-foreground.png',backgroundColor:'#0B1220',monochromeImage:asset+'adaptive-monochrome.png'}};
// Preserve existing EAS linkage and build profiles; use unique release profile names.
const easPath=path.join(root,'eas.json');const eas=fs.existsSync(easPath)?read('eas.json'):{};
const b=eas.build||{};
// Explicitly set developmentClient false and do not extend an unknown profile.
eas.build={...b, 'smartroom-apk':{distribution:'internal',developmentClient:false,environment:'production',android:{buildType:'apk'}}, 'smartroom-play':{distribution:'store',developmentClient:false,environment:'production',android:{buildType:'app-bundle'}}};
eas.cli={...eas.cli,appVersionSource:eas.cli?.appVersionSource||'local'};
function save(name,value){const file=path.join(root,name);if(fs.existsSync(file)){const backup=file+'.phase6.bak';if(!fs.existsSync(backup))fs.copyFileSync(file,backup);}fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');}
save('app.json',doc);save('eas.json',eas);
// Ignore private credentials, build output and backups without replacing existing rules.
const ignore=path.join(root,'.gitignore');const marker='# SmartRoom release protection';
const existing=fs.existsSync(ignore)?fs.readFileSync(ignore,'utf8'):'';
if(!existing.includes(marker))fs.appendFileSync(ignore,'\n'+marker+'\n.env\n.env.*\n!.env.example\n*.jks\n*.keystore\ncredentials.json\n*.phase6.bak\n*.apk\n*.aab\n.expo/\ndist/\ndist-release/\nnode_modules/\n');
console.log(`Prepared ${packageId} ${version} (${versionCode}). Existing Expo dependencies and project ID preserved.`);
console.log('Review app.json/eas.json, install the SDK-compatible packages, then run expo-doctor and tsc.');
