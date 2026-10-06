# @vdegenne/voicevox

Snar reactive controller TS helper to interact with a VOICEVOX TTS server.

## Install

```bash
npm i -D @vdegenne/voicevox
```

## Usage

First install and run <a href="https://chatgpt.com/?prompt=What%27s%20the%20easiest%20way%20to%20install%20VoiceVox%20server%20on%20my%20computer?" target=_blank>VOICEVOX</a> on your machine.

Then in your web app

```ts
import {VoicevoxClient} from '@vdegenne/voicevox';

const voicevox = new VoicevoxClient();

try {
	await voicevox.connect();
	voicevox.play('こんにちは');
} catch (err) {
	console.error(`Server not reachable. (${err})`);
}
```

### Arguments

```ts
voicevox.play(
	'こんにちは', // text
	'af_sky', // voice (ts suggestions support)
	1, // speed
	1, // volume
);
```

### Controller

`voicevox` is a controller, you can bind it to a `LitElement` custom element.

```ts
import {VoicevoxClient} from '@vdegenne/voicevox';
import {LitElement, customElement} from 'lit';
import {withController} from '@snar/lit';

const voicevox = new VoicevoxClient();

@customElement('settings-dialog')
@withController(voicevox)
class SettingsDialog extends LitElement {
	// ...
}
```
