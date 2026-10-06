import {ReactiveController, state} from '@snar/lit';

interface VoicevoxStyle {
	id: number;
	name: string;
}

interface VoicevoxSpeaker {
	name: string;
	speaker_uuid: string;
	styles: VoicevoxStyle[];
}

interface PlayOptions {
	voiceId?: number;
	speed?: number;
	volume?: number;
}

type CachedAudio = Blob | Promise<Blob>;

export class VoicevoxClient extends ReactiveController {
	@state() state:
		'disconnected' | 'connecting' | 'connection_error' | 'connected' =
		'disconnected';

	@state() speakers: VoicevoxSpeaker[] = [];
	@state() host: string;
	@state() port: number;

	constructor({
		host = '127.0.0.1',
		port = 50021,
	}: {
		host?: string;
		port?: number;
	} = {}) {
		super();

		this.host = host;
		this.port = port;
	}

	protected updated(_changedProperties: any): Promise<void> | void {
		console.log(_changedProperties);
	}

	private get endpoint() {
		return `http://${this.host}:${this.port}`;
	}

	private cache = new Map<string, CachedAudio>();

	private currentAudios = new Map<
		string,
		{
			audio: HTMLAudioElement;
			resolve: () => void;
		}
	>();

	private pendingPlays = new Set<string>();

	async connect({reconnect = false}: {reconnect?: boolean} = {}) {
		if (this.state === 'connected' && !reconnect) {
			return;
		}

		this.state = 'connecting';

		try {
			const response = await fetch(`${this.endpoint}/speakers`);

			if (!response.ok) {
				throw new Error(`VOICEVOX returned HTTP ${response.status}`);
			}

			this.speakers = await response.json();
			this.state = 'connected';
		} catch (error) {
			this.speakers = [];
			this.state = 'connection_error';
			throw error;
		}
	}

	disconnect() {
		this.stop();

		this.speakers = [];
		this.state = 'disconnected';
	}

	async play(
		sentence: string,
		{voiceId = 0, speed = 1, volume = 1}: PlayOptions = {},
	) {
		if (this.state !== 'connected') {
			throw new Error('VOICEVOX is not connected');
		}

		const key = this.getCacheKey(sentence, voiceId, speed);

		if (this.pendingPlays.has(key)) {
			return;
		}

		const current = this.currentAudios.get(key);

		if (current) {
			current.audio.currentTime = 0;
			current.audio.volume = Math.max(0, Math.min(1, volume));
			await current.audio.play();
			return;
		}

		this.pendingPlays.add(key);

		try {
			let cached = this.cache.get(key);

			if (!cached) {
				const promise = this.fetchAudio(sentence, voiceId, speed);

				this.cache.set(key, promise);

				try {
					const audio = await promise;
					this.cache.set(key, audio);
					cached = audio;
				} catch (error) {
					this.cache.delete(key);
					throw error;
				}
			}

			const audio = cached instanceof Promise ? await cached : cached;

			this.pendingPlays.delete(key);

			await this.playBlob(audio, key, volume);
		} catch (error) {
			this.pendingPlays.delete(key);
			throw error;
		}
	}

	async togglePlay(sentence: string, options: PlayOptions = {}) {
		if (this.currentAudios.size > 0) {
			this.stop();
			return;
		}

		return this.play(sentence, options);
	}

	private async fetchAudio(sentence: string, voiceId: number, speed: number) {
		const queryResponse = await fetch(
			`${this.endpoint}/audio_query?text=${encodeURIComponent(sentence)}&speaker=${voiceId}`,
			{
				method: 'POST',
			},
		);

		if (!queryResponse.ok) {
			throw new Error(
				`VOICEVOX audio_query failed: HTTP ${queryResponse.status}`,
			);
		}

		const query = await queryResponse.json();

		query.speedScale = speed;

		const synthesisResponse = await fetch(
			`${this.endpoint}/synthesis?speaker=${voiceId}`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(query),
			},
		);

		if (!synthesisResponse.ok) {
			throw new Error(
				`VOICEVOX synthesis failed: HTTP ${synthesisResponse.status}`,
			);
		}

		return synthesisResponse.blob();
	}

	private async playBlob(blob: Blob, key: string, volume: number) {
		const url = URL.createObjectURL(blob);
		const audio = new Audio(url);

		audio.volume = Math.max(0, Math.min(1, volume));

		this.currentAudios.set(key, {
			audio,
			resolve: () => {},
		});

		try {
			await audio.play();

			await new Promise<void>((resolve, reject) => {
				const current = this.currentAudios.get(key);

				if (current?.audio === audio) {
					current.resolve = resolve;
				}

				audio.addEventListener(
					'ended',
					() => {
						if (this.currentAudios.get(key)?.audio === audio) {
							this.currentAudios.delete(key);
						}

						URL.revokeObjectURL(url);
						resolve();
					},
					{once: true},
				);

				audio.addEventListener(
					'error',
					() => {
						if (this.currentAudios.get(key)?.audio === audio) {
							this.currentAudios.delete(key);
						}

						URL.revokeObjectURL(url);
						reject(new Error('Audio playback failed'));
					},
					{once: true},
				);
			});
		} catch (error) {
			if (this.currentAudios.get(key)?.audio === audio) {
				this.currentAudios.delete(key);
			}

			URL.revokeObjectURL(url);
			throw error;
		}
	}

	private stop(key?: string) {
		if (key) {
			const current = this.currentAudios.get(key);

			if (!current) {
				return;
			}

			current.audio.pause();
			current.audio.currentTime = 0;

			this.currentAudios.delete(key);
			current.resolve();

			return;
		}

		for (const current of this.currentAudios.values()) {
			current.audio.pause();
			current.audio.currentTime = 0;
			current.resolve();
		}

		this.currentAudios.clear();
	}

	private getCacheKey(
		sentence: string,
		voiceId: number | undefined,
		speed: number,
	) {
		return `${voiceId}:${speed}:${sentence}`;
	}

	getRandomVoiceId() {
		const styles = this.speakers.flatMap((speaker) => speaker.styles);

		if (styles.length === 0) {
			throw new Error('VOICEVOX has no available voices');
		}

		return styles[Math.floor(Math.random() * styles.length)]!.id;
	}

	getVoiceTitles() {
		const titles: string[] = [];

		for (const speaker of this.speakers) {
			for (const style of speaker.styles) {
				titles[style.id] = `${speaker.name} - ${style.name}`;
			}
		}

		return titles;
	}

	getVoiceTitleFromId(voiceId: number) {
		return this.getVoiceTitles()[voiceId];
	}
}

// export const voicevox = new VoicevoxClient();
