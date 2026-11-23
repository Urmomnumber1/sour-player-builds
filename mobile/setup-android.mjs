// Run after `npx cap add android`: adds Sour Player's own Android code (media notification, Android
// Auto, updates), its permissions, icon, version and release signing to the generated project.
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const android = path.join(here, 'android');
const app = path.join(android, 'app');
const main = path.join(app, 'src', 'main');

const edit = (file, change) => {
    const before = fs.readFileSync(file, 'utf8');
    const after = change(before);
    if (after === before) throw new Error(`Nothing changed in ${file}`);
    fs.writeFileSync(file, after);
};

// Citrus Player (SOUR_CITRUS=1): the lighter build, with its own application id, name and icons. The code
// keeps its Java package (com.anjalo.sourplayer); only the id people see and install changes.
const CITRUS = process.env.SOUR_CITRUS === '1';

// Java code and resources
const javaDir = path.join(main, 'java', 'com', 'anjalo', 'sourplayer');
fs.mkdirSync(javaDir, { recursive: true });
for (const f of fs.readdirSync(path.join(here, 'native', 'java'))) {
    fs.copyFileSync(path.join(here, 'native', 'java', f), path.join(javaDir, f));
}
for (const dir of fs.readdirSync(path.join(here, 'native', 'res'))) {
    fs.mkdirSync(path.join(main, 'res', dir), { recursive: true });
    for (const f of fs.readdirSync(path.join(here, 'native', 'res', dir))) {
        fs.copyFileSync(path.join(here, 'native', 'res', dir, f), path.join(main, 'res', dir, f));
    }
}

// Citrus: its own icon packs (the same pack names) over Sour Player's
if (CITRUS) {
    const packs = path.join(here, 'native', 'res-citrus', 'mipmap-xxxhdpi');
    for (const f of fs.readdirSync(packs)) {
        fs.copyFileSync(path.join(packs, f), path.join(main, 'res', 'mipmap-xxxhdpi', f));
    }
}

// (0.16) the other mode's icon packs too, as ic_xpack_*: Citrus Player's in Sour Player (Citrus mode), Sour
// Player's in Citrus Player (switched to Sour Player's look)
{
    const other = path.join(here, 'native', CITRUS ? 'res' : 'res-citrus', 'mipmap-xxxhdpi');
    for (const f of fs.readdirSync(other)) {
        if (!f.startsWith('ic_pack_')) continue;
        fs.copyFileSync(path.join(other, f), path.join(main, 'res', 'mipmap-xxxhdpi', f.replace('ic_pack_', 'ic_xpack_')));
    }
}

// icon packs (Sour Studio): one launcher entry per pack, only the chosen one switched on. Two families: this
// app's own (.Icon*, as before 0.16, so the entry people already have stays) and the other mode's
// (.OtherIcon*, with the other app's name under it)
const PACKS = ['classic', 'lime', 'grapefruit', 'blueberry', 'grape', 'gold', 'mono', 'negative', 'pixel'];
const aliasName = (family, pack) => `.${family}${pack[0].toUpperCase()}${pack.slice(1)}`;
const alias = (family, pack, enabled, image, label) =>
    [
        '    <activity-alias',
        `            android:name="${aliasName(family, pack)}"`,
        '            android:targetActivity=".MainActivity"',
        `            android:enabled="${enabled}"`,
        '            android:exported="true"',
        `            android:icon="@mipmap/${image}"`,
        `            android:roundIcon="@mipmap/${image}"`,
        `            android:label="${label}">`,
        '            <intent-filter>',
        '                <action android:name="android.intent.action.MAIN" />',
        '                <category android:name="android.intent.category.LAUNCHER" />',
        '            </intent-filter>',
        '        </activity-alias>',
    ].join('\n        ');
const aliases = [
    ...PACKS.map((pack) => alias('Icon', pack, pack === 'classic', `ic_pack_${pack}`, '@string/app_name')),
    ...PACKS.map((pack) => alias('OtherIcon', pack, false, `ic_xpack_${pack}`, CITRUS ? 'Sour Player' : 'Citrus Player')),
];

// the app icon (the same one as the desktop app)
const icon = path.join(here, '..', 'assets', CITRUS ? 'citrus' : 'icons', '512x512.png');
for (const dir of fs.readdirSync(path.join(main, 'res'))) {
    if (dir.startsWith('mipmap-anydpi')) {
        fs.rmSync(path.join(main, 'res', dir), { force: true, recursive: true });
    } else if (dir.startsWith('mipmap-')) {
        for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
            fs.copyFileSync(icon, path.join(main, 'res', dir, name));
        }
    }
}

// permissions, the media service, the media button receiver and Android Auto
edit(path.join(main, 'AndroidManifest.xml'), (s) =>
    s
        .replace(
            '<uses-permission android:name="android.permission.INTERNET" />',
            [
                '<uses-permission android:name="android.permission.INTERNET" />',
                '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />',
                '    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />',
                '    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
                '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />',
                '    <uses-permission android:name="android.permission.WAKE_LOCK" />',
                '    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />',
            ].join('\n'),
        )
        .replace('<application', '<application\n        android:usesCleartextTraffic="true"')
        // links shared from other apps (Spotify, YouTube...) come to Sour Player
        .replace(
            '</activity>',
            [
                '    <intent-filter>',
                '                <action android:name="android.intent.action.SEND" />',
                '                <category android:name="android.intent.category.DEFAULT" />',
                '                <data android:mimeType="text/plain" />',
                '            </intent-filter>',
                '        </activity>',
            ].join('\n        '),
        )
        // the launcher entries are the icon pack aliases below
        .replace(
            /\s*<intent-filter>\s*<action android:name="android\.intent\.action\.MAIN" \/>\s*<category android:name="android\.intent\.category\.LAUNCHER" \/>\s*<\/intent-filter>/,
            '',
        )
        .replace(
            '</application>',
            [
                ...aliases,
                '        <receiver',
                '            android:name=".SourWidget"',
                '            android:exported="true"',
                '            android:label="Sour Player">',
                '            <intent-filter>',
                '                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />',
                '            </intent-filter>',
                '            <meta-data android:name="android.appwidget.provider" android:resource="@xml/sour_widget_info" />',
                '        </receiver>',
                '        <service',
                '            android:name=".SourPlayTile"',
                '            android:exported="true"',
                '            android:icon="@android:drawable/ic_media_play"',
                '            android:label="Sour Player"',
                '            android:permission="android.permission.BIND_QUICK_SETTINGS_TILE">',
                '            <intent-filter>',
                '                <action android:name="android.service.quicksettings.action.QS_TILE" />',
                '            </intent-filter>',
                '        </service>',
                '        <service',
                '            android:name=".SourRequestTile"',
                '            android:exported="true"',
                '            android:icon="@android:drawable/stat_sys_download"',
                '            android:label="Request a song"',
                '            android:permission="android.permission.BIND_QUICK_SETTINGS_TILE">',
                '            <intent-filter>',
                '                <action android:name="android.service.quicksettings.action.QS_TILE" />',
                '            </intent-filter>',
                '        </service>',
                '    <service',
                '            android:name=".SourMediaService"',
                '            android:exported="true"',
                '            android:foregroundServiceType="mediaPlayback">',
                '            <intent-filter>',
                '                <action android:name="android.media.browse.MediaBrowserService" />',
                '                <action android:name="android.intent.action.MEDIA_BUTTON" />',
                '            </intent-filter>',
                '        </service>',
                '        <receiver',
                '            android:name="androidx.media.session.MediaButtonReceiver"',
                '            android:exported="true">',
                '            <intent-filter>',
                '                <action android:name="android.intent.action.MEDIA_BUTTON" />',
                '            </intent-filter>',
                '        </receiver>',
                '        <meta-data',
                '            android:name="com.google.android.gms.car.application"',
                '            android:resource="@xml/automotive_app_desc" />',
                '    </application>',
            ].join('\n'),
        ),
);

// version, the media library and release signing (the keystore comes from the build's secrets)
const version = process.env.SOUR_VERSION || '0.1.0b';
const code = process.env.SOUR_VERSION_CODE || '1';
edit(path.join(app, 'build.gradle'), (s) =>
    s
        .replace(/applicationId "[^"]*"/, (m) => (CITRUS ? 'applicationId "com.anjalo.citrusplayer"' : m))
        .replace(/versionCode \d+/, `versionCode ${code}`)
        .replace(/versionName "[^"]*"/, `versionName "${version}"`)
        .replace(
            /buildTypes \{\s*release \{/,
            [
                'signingConfigs {',
                '        release {',
                '            storeFile file(System.getenv("SOUR_KEYSTORE") ?: "missing.p12")',
                '            storePassword System.getenv("SOUR_KEYSTORE_PASSWORD")',
                '            keyAlias System.getenv("SOUR_KEY_ALIAS") ?: "sour"',
                '            keyPassword System.getenv("SOUR_KEYSTORE_PASSWORD")',
                '            storeType "pkcs12"',
                '        }',
                '    }',
                '    buildTypes {',
                '        release {',
                '            signingConfig signingConfigs.release',
            ].join('\n'),
        )
        .replace(
            /dependencies \{/,
            [
                'dependencies {',
                '    implementation "androidx.media:media:1.7.0"',
                '    implementation "com.google.android.gms:play-services-code-scanner:16.1.0"',
                '    implementation "com.google.zxing:core:3.5.3"',
            ].join('\n'),
        ),
);

console.log(`Sour Player ${version} (${code}) is set up for Android`);

// Citrus: the name on the home screen and in the app switcher
if (CITRUS) {
    const strings = path.join(main, 'res', 'values', 'strings.xml');
    fs.writeFileSync(strings, fs.readFileSync(strings, 'utf8').split('Sour Player').join('Citrus Player'));
}
