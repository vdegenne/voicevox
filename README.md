# @vdegenne/voicevox

Lightweight TypeScript client for interacting with a local VOICEVOX TTS engine.

## Install

```bash
npm install @vdegenne/voicevox
```

## Requirements

Install and run [VOICEVOX](https://voicevox.hiroshiba.jp/) on your machine.

The client connects to `http://127.0.0.1:50021` by default.

## Usage

```ts
import {VoicevoxProxyClient} from '@vdegenne/voicevox';

const voicevox = new VoicevoxProxyClient();

const options = {
	input: 'こんにちは',
	speaker: 0,
	speed: 1,
};

try {
	const audio = await voicevox.getAudio(options);

	// Use the returned Blob with your audio player.
} catch (error) {
	console.error('VOICEVOX request failed:', error);
}
```

### Configuration

You can specify a custom VOICEVOX server endpoint:

```ts
const voicevox = new VoicevoxProxyClient('http://127.0.0.1:50021');
```

### Speech options

```ts
{
	input: 'こんにちは',
	speaker: 0,
	speed: 1,
}
```

| Property  | Type     | Default  | Description             |
| --------- | -------- | -------- | ----------------------- |
| `input`   | `string` | Required | Text to synthesize      |
| `speaker` | `number` | Required | VOICEVOX style ID       |
| `speed`   | `number` | `1`      | Speech speed multiplier |

## Audio requests

`createAudioRequest()` returns an audio request descriptor containing a cache key and a function that resolves to the audio Blob.

```ts
const request = await voicevox.createAudioRequest({
	input: 'こんにちは',
	speaker: 0,
});

console.log(request.key);

const audio = await request.audio();
```

Both `getAudio()` and `createAudioRequest()` use an in-memory cache to avoid generating the same audio multiple times.

## Voices

The client provides methods to retrieve and search available VOICEVOX speakers and styles.

### Get speakers

```ts
const speakers = await voicevox.getSpeakers();
```

Speakers are fetched lazily on the first request and cached in memory for subsequent calls. Concurrent requests share the same pending fetch.

### Get available voices

`getVoices()` returns a flattened list of available styles.

```ts
const voices = await voicevox.getVoices();

// Example result:
// {
//   id: 2,
//   name: '四国めたん (ノーマル)',
//   speakerName: '四国めたん',
//   styleName: 'ノーマル'
// }
```

### Find a voice by ID

```ts
const voice = await voicevox.getVoiceById(2);

console.log(voice?.name);
```

### Find a voice ID by name

```ts
const voiceId = await voicevox.getVoiceIdByName('四国めたん (ノーマル)');
```

Both lookup methods return `undefined` if no matching voice is found.

## Error handling

The client throws standard JavaScript `Error` instances when a request fails.

```ts
try {
	const speakers = await voicevox.getSpeakers();
} catch (error) {
	console.error(error);
}
```

HTTP error responses are inspected for a descriptive error message. The client also supports the VOICEVOX engine's native `detail` error field.

Failed speaker requests are not cached, allowing subsequent calls to retry.

## Exports

The package exposes the client from its root entry point:

```ts
import {VoicevoxProxyClient} from '@vdegenne/voicevox';
```

Core types and utilities are available through the `/core` subpath:

```ts
import type {VoicevoxSpeechOptions} from '@vdegenne/voicevox/core';
```
